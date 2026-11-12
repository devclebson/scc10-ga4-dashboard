from pathlib import Path
import json
import sqlite3
from datetime import datetime, timezone

from ..services.author_profile import resolve_author_profile


class SQLiteRepository:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)
        if not self.database_path.exists():
            self._ensure_collector_tables()
        self._ensure_author_profiles_table()
        self._ensure_articles_table()
        self._ensure_settings_table()

    def connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_collector_tables(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript('''
                CREATE TABLE IF NOT EXISTS realtime_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    property_id TEXT NOT NULL,
                    captured_at TEXT NOT NULL,
                    active_users_5m INTEGER NOT NULL DEFAULT 0,
                    active_users_30m INTEGER NOT NULL DEFAULT 0,
                    page_views_30m INTEGER NOT NULL DEFAULT 0,
                    active_articles_count INTEGER NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_property_time
                    ON realtime_snapshots(property_id, captured_at);
                CREATE TABLE IF NOT EXISTS collector_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    property_id TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    status TEXT NOT NULL,
                    duration_ms INTEGER,
                    snapshot_id INTEGER,
                    rows_count INTEGER,
                    error_message TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_collector_runs_property_time
                    ON collector_runs(property_id, started_at);
            ''')
            connection.commit()

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

    def _ensure_articles_table(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            existing = {
                row['name'] for row in connection.execute('PRAGMA table_info(articles)')
            }
            if not existing:
                connection.executescript('''
                    CREATE TABLE articles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        property_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        normalized_title TEXT NOT NULL,
                        page_path TEXT,
                        category TEXT,
                        author TEXT,
                        published_at TEXT,
                        historical_views INTEGER NOT NULL DEFAULT 0,
                        updated_at TEXT NOT NULL,
                        UNIQUE(property_id, normalized_title)
                    );
                ''')
            else:
                if 'normalized_title' not in existing:
                    connection.execute('ALTER TABLE articles ADD COLUMN normalized_title TEXT')
                    connection.execute('UPDATE articles SET normalized_title = title WHERE normalized_title IS NULL')
                if 'updated_at' not in existing:
                    connection.execute('ALTER TABLE articles ADD COLUMN updated_at TEXT')
            connection.execute(
                'CREATE INDEX IF NOT EXISTS idx_articles_property_title ON articles(property_id, normalized_title)'
            )
            connection.commit()

    def _ensure_settings_table(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute('''
                CREATE TABLE IF NOT EXISTS app_settings (
                    setting_key TEXT PRIMARY KEY,
                    setting_value TEXT NOT NULL
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

    def save_snapshot(self, snapshot):
        with self.connect() as connection:
            cursor = connection.execute(
                '''INSERT INTO realtime_snapshots (
                       property_id, captured_at, active_users_5m,
                       active_users_30m, page_views_30m, active_articles_count,
                       payload_json
                   ) VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (
                    snapshot['property_id'],
                    snapshot['captured_at'],
                    int(snapshot.get('active_users_5m') or 0),
                    int(snapshot.get('active_users_30m') or 0),
                    int(snapshot.get('page_views_30m') or 0),
                    int(snapshot.get('active_articles_count') or 0),
                    json.dumps(snapshot.get('payload', {}), ensure_ascii=False),
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def start_collector_run(self, property_id, started_at):
        with self.connect() as connection:
            cursor = connection.execute(
                'INSERT INTO collector_runs (property_id, started_at, status) VALUES (?, ?, ?)',
                (property_id, started_at, 'running'),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def finish_collector_run(self, run_id, finished_at, status, duration_ms=None, snapshot_id=None, rows_count=None, error_message=None):
        with self.connect() as connection:
            connection.execute(
                '''UPDATE collector_runs
                   SET finished_at = ?, status = ?, duration_ms = ?, snapshot_id = ?,
                       rows_count = ?, error_message = ?
                   WHERE id = ?''',
                (finished_at, status, duration_ms, snapshot_id, rows_count, error_message, run_id),
            )
            connection.commit()

    def prune_snapshots(self, property_id, before_captured_at):
        with self.connect() as connection:
            cursor = connection.execute(
                'DELETE FROM realtime_snapshots WHERE property_id = ? AND captured_at < ?',
                (property_id, before_captured_at),
            )
            connection.commit()
            return cursor.rowcount

    def backup_database(self, destination):
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as source, sqlite3.connect(destination) as target:
            source.backup(target)
        return destination

    def upsert_article(self, article):
        timestamp = datetime.now(timezone.utc).isoformat()
        values = (
            article['property_id'], article['title'], article['normalized_title'],
            article.get('page_path'), article.get('category'), article.get('author'),
            article.get('published_at'), int(article.get('historical_views') or 0), timestamp,
        )
        with self.connect() as connection:
            try:
                connection.execute(
                    '''INSERT INTO articles (
                           property_id, title, normalized_title, page_path, category,
                           author, published_at, historical_views, updated_at
                       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(property_id, normalized_title) DO UPDATE SET
                           title = excluded.title, page_path = excluded.page_path,
                           category = excluded.category, author = excluded.author,
                           published_at = excluded.published_at,
                           historical_views = excluded.historical_views,
                           updated_at = excluded.updated_at''', values)
            except sqlite3.OperationalError:
                existing = connection.execute(
                    'SELECT id FROM articles WHERE property_id = ? AND normalized_title = ?',
                    values[:3:2],
                ).fetchone()
                if existing:
                    connection.execute(
                        '''UPDATE articles SET title = ?, page_path = ?, category = ?, author = ?,
                           published_at = ?, historical_views = ?, updated_at = ? WHERE id = ?''',
                        (values[1], values[3], values[4], values[5], values[6], values[7], values[8], existing['id']),
                    )
                else:
                    connection.execute(
                        '''INSERT INTO articles (
                           property_id, title, normalized_title, page_path, category, author,
                           published_at, historical_views, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', values)
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
            return {'period': period, 'startDate': start.isoformat(), 'endDate': today.isoformat(), 'latestPublicationDate': None, 'authors': []}
        with self.connect() as connection:
            rows = connection.execute(
                '''SELECT id, author, title, category, historical_views, published_at, page_path
                   FROM articles
                   WHERE (? IS NULL OR property_id = ?)
                     AND author IS NOT NULL AND TRIM(author) != ''
                     AND published_at >= ? AND published_at <= ?''',
                (property_id, property_id, start.isoformat(), today.isoformat()),
            ).fetchall()
            latest_publication = connection.execute(
                """SELECT MAX(published_at) FROM articles
                   WHERE (? IS NULL OR property_id = ?)
                     AND published_at IS NOT NULL AND TRIM(published_at) != ''""",
                (property_id, property_id),
            ).fetchone()[0]
        grouped = {}
        for row in rows:
            author = row['author'].strip()
            item = grouped.setdefault(author, {'author': author, 'views': 0, 'titles': {}, 'topArticle': None, 'articles': []})
            views = int(row['historical_views'] or 0)
            title = row['title']
            item['views'] += views
            item['titles'][title] = item['titles'].get(title, 0) + views
            item['articles'].append({
                'id': row['id'],
                'title': title,
                'category': row['category'],
                'views': views,
                'publishedAt': row['published_at'],
                'pagePath': row['page_path'],
            })
            if not item['topArticle'] or views > item['topArticle']['views']:
                item['topArticle'] = {'title': title, 'views': views, 'pagePath': row['page_path']}
        authors = []
        for item in grouped.values():
            authors.append({
                'author': item['author'],
                'views': item['views'],
                'publications': len(item['titles']),
                'topArticle': item['topArticle'],
                'articles': sorted(item['articles'], key=lambda article: (-article['views'], article['title']))[:8],
            })
        authors.sort(key=lambda item: (-item['views'], -item['publications'], item['author']))
        profiles = self._author_profiles(authors)
        for author in authors:
            author['profile'] = profiles.get(author['author'], {'profileUrl': None, 'imageUrl': None, 'status': 'not-requested'})
        return {
            'period': period,
            'startDate': start.isoformat(),
            'endDate': today.isoformat(),
            'latestPublicationDate': latest_publication,
            'authors': authors,
        }

    def content_data(self, property_id: str | None, period: str = '30', category: str = '', author: str = '', query_text: str = '', limit: int = 50):
        from datetime import date, timedelta

        days = int(period)
        today = date.today()
        start = today - timedelta(days=days - 1)
        filters = [
            'property_id = ?',
            'published_at >= ?',
            'published_at <= ?',
        ]
        parameters = [property_id, start.isoformat(), today.isoformat()]
        if category:
            filters.append('category = ?')
            parameters.append(category)
        if author:
            filters.append('author = ?')
            parameters.append(author)
        if query_text:
            filters.append('title LIKE ?')
            parameters.append(f'%{query_text}%')
        where = ' AND '.join(filters)
        if not self.database_path.exists():
            return {'period': period, 'startDate': start.isoformat(), 'endDate': today.isoformat(), 'total': 0, 'articles': [], 'categories': [], 'authors': [], 'categorySummary': []}
        with self.connect() as connection:
            rows = connection.execute(
                f'''SELECT id, title, page_path, category, author, published_at, historical_views
                    FROM articles WHERE {where}
                    ORDER BY historical_views DESC, published_at DESC, title ASC
                    LIMIT ?''',
                (*parameters, limit),
            ).fetchall()
            total = connection.execute(
                f'SELECT COUNT(*) FROM articles WHERE {where}', parameters
            ).fetchone()[0]
            facets = connection.execute(
                f'''SELECT DISTINCT category, author FROM articles
                    WHERE {where} ORDER BY category, author LIMIT 500''',
                parameters,
            ).fetchall()
            category_summary = connection.execute(
                f'''SELECT COALESCE(NULLIF(TRIM(category), ''), 'Sem categoria') AS category,
                           COUNT(*) AS publications,
                           COALESCE(SUM(historical_views), 0) AS views
                    FROM articles WHERE {where}
                    GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Sem categoria')
                    ORDER BY views DESC, publications DESC, category ASC''',
                parameters,
            ).fetchall()
        return {
            'period': period,
            'startDate': start.isoformat(),
            'endDate': today.isoformat(),
            'total': total,
            'articles': [dict(row) for row in rows],
            'categories': sorted({row['category'] for row in facets if row['category']}),
            'authors': sorted({row['author'] for row in facets if row['author']}),
            'categorySummary': [dict(row) for row in category_summary],
        }

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
