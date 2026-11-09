from pathlib import Path
import sqlite3
from datetime import datetime, timezone

from ..services.author_profile import resolve_author_profile


class SQLiteRepository:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)
        self._ensure_author_profiles_table()

    def connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_author_profiles_table(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute('''
                CREATE TABLE IF NOT EXISTS author_profiles (
                    author_name TEXT PRIMARY KEY,
                    profile_url TEXT,
                    image_url TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    checked_at TEXT NOT NULL
                )
            ''')
            connection.commit()

    def latest_snapshots(self, property_id: str | None, limit: int = 30):
        if not self.database_path.exists():
            return []
        query = '''
            SELECT id, property_id, captured_at, active_users_5m,
                   active_users_30m, page_views_30m, active_articles_count
            FROM realtime_snapshots
            WHERE (? IS NULL OR property_id = ?)
            ORDER BY captured_at DESC
            LIMIT ?
        '''
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(query, (property_id, property_id, limit))]

    def settings(self):
        if not self.database_path.exists():
            return {}
        with self.connect() as connection:
            rows = connection.execute(
                'SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key'
            ).fetchall()
        return {row['setting_key']: row['setting_value'] for row in rows}

    def article_count(self, property_id: str | None):
        if not self.database_path.exists():
            return 0
        with self.connect() as connection:
            return connection.execute(
                'SELECT COUNT(*) FROM articles WHERE (? IS NULL OR property_id = ?)',
                (property_id, property_id),
            ).fetchone()[0]

    def dashboard_data(self, property_id: str | None):
        snapshots = self.latest_snapshots(property_id, limit=1)
        if not snapshots:
            return {'latest': None, 'topPages': [], 'channelsToday': [], 'minuteSeries': [], 'articlesCached': 0}
        latest = snapshots[0]
        with self.connect() as connection:
            payload_json = connection.execute(
                'SELECT payload_json FROM realtime_snapshots WHERE id = ?', (latest['id'],)
            ).fetchone()[0]
        try:
            payload = __import__('json').loads(payload_json)
        except (TypeError, ValueError):
            payload = {}
        top_pages = [
            row for row in payload.get('topPages', [])
            if row.get('title') not in {'(other)', '(not set)', 'SCC10 Notícia'}
        ]
        top_pages.sort(key=lambda row: int(row.get('views', 0)), reverse=True)
        return {
            'latest': latest,
            'topPages': top_pages[:20],
            'channelsToday': payload.get('channelsToday', []),
            'minuteSeries': payload.get('minuteSeries', []),
            'articlesCached': self.article_count(property_id),
        }

    def ranking_data(self, property_id: str | None, limit: int = 20):
        data = self.dashboard_data(property_id)
        articles = data['topPages'][:max(1, min(int(limit), 100))]
        total_views = sum(int(article.get('views', 0)) for article in articles)
        return {
            'capturedAt': data['latest']['captured_at'] if data['latest'] else None,
            'totalViews': total_views,
            'articles': articles,
        }

    def authors_data(self, property_id: str | None, period: str = 'month'):
        from datetime import date, timedelta

        today = date.today()
        if period == 'today':
            start = today
        elif period == '7days':
            start = today - timedelta(days=6)
        elif period == '90days':
            start = today - timedelta(days=89)
        else:
            start = today.replace(day=1)
        if not self.database_path.exists():
            return {'period': period, 'startDate': start.isoformat(), 'endDate': today.isoformat(), 'authors': []}
        with self.connect() as connection:
            rows = connection.execute(
                '''SELECT author, title, historical_views, published_at, page_path
                   FROM articles
                   WHERE (? IS NULL OR property_id = ?)
                     AND author IS NOT NULL AND TRIM(author) != ''
                     AND published_at >= ? AND published_at <= ?''',
                (property_id, property_id, start.isoformat(), today.isoformat()),
            ).fetchall()
        grouped = {}
        for row in rows:
            author = row['author'].strip()
            item = grouped.setdefault(author, {'author': author, 'views': 0, 'titles': {}, 'topArticle': None})
            views = int(row['historical_views'] or 0)
            title = row['title']
            item['views'] += views
            item['titles'][title] = item['titles'].get(title, 0) + views
            if not item['topArticle'] or views > item['topArticle']['views']:
                item['topArticle'] = {'title': title, 'views': views, 'pagePath': row['page_path']}
        authors = []
        for item in grouped.values():
            authors.append({
                'author': item['author'],
                'views': item['views'],
                'publications': len(item['titles']),
                'topArticle': item['topArticle'],
            })
        authors.sort(key=lambda item: (-item['views'], -item['publications'], item['author']))
        profiles = self._author_profiles(authors[:3])
        for author in authors:
            author['profile'] = profiles.get(author['author'], {'profileUrl': None, 'imageUrl': None, 'status': 'not-requested'})
        return {'period': period, 'startDate': start.isoformat(), 'endDate': today.isoformat(), 'authors': authors}

    def _author_profiles(self, authors):
        profiles = {}
        now = datetime.now(timezone.utc)
        with self.connect() as connection:
            for author in authors:
                name = author['author']
                cached = connection.execute(
                    'SELECT profile_url, image_url, status, checked_at FROM author_profiles WHERE author_name = ?',
                    (name,),
                ).fetchone()
                fresh = False
                if cached:
                    try:
                        checked_at = datetime.fromisoformat(cached['checked_at'].replace('Z', '+00:00'))
                        fresh = (now - checked_at).total_seconds() < 86400
                    except ValueError:
                        fresh = False
                if fresh:
                    profiles[name] = {'profileUrl': cached['profile_url'], 'imageUrl': cached['image_url'], 'status': cached['status']}
                    continue
                profile = resolve_author_profile(name, author.get('topArticle', {}).get('pagePath'))
                connection.execute(
                    '''INSERT INTO author_profiles (author_name, profile_url, image_url, status, checked_at)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(author_name) DO UPDATE SET profile_url=excluded.profile_url,
                       image_url=excluded.image_url, status=excluded.status, checked_at=excluded.checked_at''',
                    (name, profile['profileUrl'], profile['imageUrl'], profile['status'], now.isoformat().replace('+00:00', 'Z')),
                )
                profiles[name] = profile
            connection.commit()
        return profiles
