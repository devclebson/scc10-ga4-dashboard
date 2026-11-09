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

    def save_settings(self, values):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute('''
                CREATE TABLE IF NOT EXISTS app_settings (
                    setting_key TEXT PRIMARY KEY,
                    setting_value TEXT NOT NULL
                )
            ''')
            columns = {
                row['name'] for row in connection.execute('PRAGMA table_info(app_settings)')
            }
            has_updated_at = 'updated_at' in columns
            timestamp = datetime.now(timezone.utc).isoformat()
            if has_updated_at:
                statement = '''
                    INSERT INTO app_settings (setting_key, setting_value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(setting_key) DO UPDATE SET
                        setting_value = excluded.setting_value,
                        updated_at = excluded.updated_at
                '''
            else:
                statement = '''
                    INSERT INTO app_settings (setting_key, setting_value)
                    VALUES (?, ?)
                    ON CONFLICT(setting_key) DO UPDATE SET
                        setting_value = excluded.setting_value
                '''
            for key, value in values.items():
                parameters = (key, str(value), timestamp) if has_updated_at else (key, str(value))
                connection.execute(statement, parameters)
            connection.commit()

    def article_count(self, property_id: str | None):
        if not self.database_path.exists():
            return 0
        with self.connect() as connection:
            return connection.execute(
                'SELECT COUNT(*) FROM articles WHERE (? IS NULL OR property_id = ?)',
                (property_id, property_id),
            ).fetchone()[0]

    def diagnostics(self, property_id: str | None):
        database_exists = self.database_path.exists()
        latest = self.latest_snapshots(property_id, limit=1)
        article_count = self.article_count(property_id) if database_exists else 0
        tables = set()
        if database_exists:
            with self.connect() as connection:
                tables = {
                    row['name'] for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                }
        return {
            'database': {
                'fileName': self.database_path.name,
                'exists': database_exists,
                'sizeBytes': self.database_path.stat().st_size if database_exists else 0,
                'hasSnapshotsTable': 'realtime_snapshots' in tables,
                'hasArticlesTable': 'articles' in tables,
            },
            'articlesCached': article_count,
            'latestSnapshot': latest[0] if latest else None,
        }

    def collector_diagnostics(self, property_id: str | None, interval_seconds: int = 30):
        latest = self.latest_snapshots(property_id, limit=1)
        snapshot_count = 0
        collector_table_exists = False
        latest_run = None
        latest_success = None
        if self.database_path.exists():
            with self.connect() as connection:
                snapshot_count = connection.execute(
                    '''SELECT COUNT(*) FROM realtime_snapshots
                       WHERE (? IS NULL OR property_id = ?)''',
                    (property_id, property_id),
                ).fetchone()[0]
                collector_table_exists = connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'collector_runs'"
                ).fetchone() is not None
                if collector_table_exists:
                    latest_run = connection.execute(
                        '''SELECT * FROM collector_runs
                           WHERE property_id = ?
                           ORDER BY started_at DESC, id DESC LIMIT 1''',
                        (property_id,),
                    ).fetchone()
                    latest_success = connection.execute(
                        '''SELECT * FROM collector_runs
                           WHERE property_id = ? AND status = 'success'
                           ORDER BY finished_at DESC, id DESC LIMIT 1''',
                        (property_id,),
                    ).fetchone()
        latest_snapshot = latest[0] if latest else None
        latest_at = latest_snapshot['captured_at'] if latest_snapshot else None
        age_seconds = None
        if latest_at:
            try:
                captured = datetime.fromisoformat(latest_at.replace('Z', '+00:00'))
                if captured.tzinfo is None:
                    captured = captured.replace(tzinfo=timezone.utc)
                age_seconds = max(0, int((datetime.now(timezone.utc) - captured).total_seconds()))
            except ValueError:
                age_seconds = None
        freshness = 'no-data'
        if age_seconds is not None:
            freshness = 'fresh' if age_seconds <= max(interval_seconds * 3, 90) else 'stale'
        return {
            'status': freshness,
            'intervalSeconds': interval_seconds,
            'snapshotCount': snapshot_count,
            'latestSnapshotAt': latest_at,
            'ageSeconds': age_seconds,
            'activeArticlesCount': latest_snapshot['active_articles_count'] if latest_snapshot else 0,
            'activeUsers30m': latest_snapshot['active_users_30m'] if latest_snapshot else 0,
            'pageViews30m': latest_snapshot['page_views_30m'] if latest_snapshot else 0,
            'lastStatus': latest_run['status'] if latest_run else None,
            'lastDurationMs': latest_run['duration_ms'] if latest_run else None,
            'lastSuccessAt': latest_success['finished_at'] if latest_success else None,
            'lastSuccessRowsCount': latest_success['rows_count'] if latest_success else None,
            'lastError': latest_run['error_message'] if latest_run else None,
            'lastErrorStatus': 'recorded' if collector_table_exists else 'not-recorded',
        }

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

    def article_detail(self, article_id: int):
        if not self.database_path.exists():
            return None
        with self.connect() as connection:
            article = connection.execute(
                '''SELECT id, property_id, title, page_path, category, author,
                          published_at, historical_views
                   FROM articles WHERE id = ? LIMIT 1''',
                (article_id,),
            ).fetchone()
        if not article:
            return None
        latest = self.latest_snapshots(article['property_id'], limit=1)
        realtime = None
        if latest:
            with self.connect() as connection:
                payload_json = connection.execute(
                    'SELECT payload_json FROM realtime_snapshots WHERE id = ?', (latest[0]['id'],)
                ).fetchone()[0]
            try:
                import json
                payload = json.loads(payload_json or '{}')
                realtime_row = next(
                    (row for row in payload.get('topPages', []) if row.get('title') == article['title']),
                    None,
                )
                if realtime_row:
                    realtime = {
                        'capturedAt': latest[0]['captured_at'],
                        'users': int(realtime_row.get('users', 0)),
                        'views': int(realtime_row.get('views', 0)),
                    }
            except (TypeError, ValueError):
                realtime = None
        return {
            'article': dict(article),
            'realtime': realtime,
            'traffic': [],
            'trafficStatus': 'pending-flask-ga4-service',
        }

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
