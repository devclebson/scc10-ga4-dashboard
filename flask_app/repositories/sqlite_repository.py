from pathlib import Path
import sqlite3


class SQLiteRepository:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)

    def connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

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
