import sqlite3
from datetime import datetime, timezone

from flask_app import create_app
from flask_app import routes
from flask_app.repositories.sqlite_repository import SQLiteRepository
from werkzeug.security import generate_password_hash


def test_routes_and_existing_sqlite(tmp_path):
    database = tmp_path / 'test.sqlite'
    connection = sqlite3.connect(database)
    connection.executescript('''
        CREATE TABLE realtime_snapshots (
          id INTEGER PRIMARY KEY, property_id TEXT, captured_at TEXT,
          active_users_5m INTEGER, active_users_30m INTEGER,
          page_views_30m INTEGER, active_articles_count INTEGER, payload_json TEXT
        );
        CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT);
        CREATE TABLE articles (
          id INTEGER PRIMARY KEY, property_id TEXT, title TEXT, category TEXT, author TEXT,
          historical_views INTEGER, published_at TEXT, page_path TEXT
        );
        INSERT INTO realtime_snapshots VALUES (1, '123', '2026-11-09T12:00:00Z', 4, 9, 20, 3, '{"topPages": [{"title": "Teste", "users": 2, "views": 4}], "channelsToday": [], "minuteSeries": []}');
        INSERT INTO app_settings VALUES ('propertyId', '123');
        INSERT INTO articles VALUES (1, '123', 'Teste', 'Categoria', 'Autora Teste', 7, '2026-11-09', '/teste/');
    ''')
    connection.commit()
    connection.close()

    class TestConfig:
        TESTING = True
        DATABASE_PATH = database
        PROPERTY_ID = '123'
        SECRET_KEY = 'test-secret'
        ADMIN_PASSWORD_HASH = generate_password_hash('test-password')
        ADMIN_SESSION_LIFETIME_SECONDS = 3600

    client = create_app(TestConfig).test_client()
    assert client.get('/dashboard').status_code == 200
    assert client.get('/ranking').status_code == 200
    assert client.get('/autores').status_code == 200
    assert client.get('/materias/1').status_code == 200
    assert client.get('/configuracao').status_code == 200
    assert client.get('/configuracao/admin').status_code == 302
    assert client.get('/configuracao/login').status_code == 200
    login = client.post('/configuracao/login', data={'password': 'test-password'}, follow_redirects=False)
    assert login.status_code == 302
    assert login.headers['Location'].endswith('/configuracao/admin')
    assert client.get('/configuracao/admin').status_code == 200
    with client.session_transaction() as browser_session:
        csrf_token = browser_session['csrf_token']
    assert client.post('/configuracao/logout', data={'csrf_token': csrf_token}).status_code == 302
    diagnostics = client.get('/api/config/diagnostics').get_json()
    assert diagnostics['database']['exists'] is True
    assert diagnostics['database']['hasSnapshotsTable'] is True
    assert diagnostics['database']['hasArticlesTable'] is True
    assert diagnostics['articlesCached'] == 1
    assert diagnostics['latestSnapshot']['active_users_30m'] == 9
    assert diagnostics['propertyId'] == '123'
    collector = diagnostics['collector']
    assert collector['snapshotCount'] == 1
    assert collector['latestSnapshotAt'] == '2026-11-09T12:00:00Z'
    assert collector['activeArticlesCount'] == 3
    assert collector['intervalSeconds'] == 30
    assert collector['lastErrorStatus'] == 'not-recorded'
    payload = client.get('/api/dashboard/summary').get_json()
    assert payload['latest']['active_users_30m'] == 9
    assert payload['articlesCached'] == 1
    ranking = client.get('/api/ranking?limit=1').get_json()
    assert ranking['articles'][0]['title'] == 'Teste'
    assert ranking['totalViews'] == 4
    authors = client.get('/api/autores?period=month').get_json()
    assert authors['authors'][0]['author'] == 'Autora Teste'
    assert authors['authors'][0]['publications'] == 1
    detail = client.get('/api/materias/1').get_json()
    assert detail['article']['title'] == 'Teste'
    assert detail['trafficStatus'] == 'pending-flask-ga4-service'

    admin_config = client.get('/api/config/admin')
    assert admin_config.status_code == 401

    login = client.post('/configuracao/login', data={'password': 'test-password'}, follow_redirects=False)
    assert login.status_code == 302
    with client.session_transaction() as browser_session:
        csrf_token = browser_session['csrf_token']
    current_config = client.get('/api/config/admin')
    assert current_config.status_code == 200
    assert current_config.get_json()['propertyId'] == '123'

    missing_csrf = client.post('/api/config/admin', json={
        'propertyId': '456',
        'defaultDateRange': '90',
        'compareEnabled': False,
    })
    assert missing_csrf.status_code == 403

    saved = client.post('/api/config/admin', json={
        'propertyId': '456',
        'defaultDateRange': '90',
        'compareEnabled': False,
    }, headers={'X-CSRF-Token': csrf_token})
    assert saved.status_code == 200
    assert saved.get_json()['saved'] is True
    assert saved.get_json()['propertyId'] == '456'

    persisted = client.get('/api/config/admin').get_json()
    assert persisted == {
        'propertyId': '456',
        'defaultDateRange': '90',
        'compareEnabled': False,
    }

    invalid = client.post('/api/config/admin', json={
        'propertyId': 'not-a-property',
        'defaultDateRange': '90',
        'compareEnabled': True,
    }, headers={'X-CSRF-Token': csrf_token})
    assert invalid.status_code == 400
    assert client.get('/api/config/admin').get_json()['propertyId'] == '456'

    with client.session_transaction() as browser_session:
        browser_session['admin_authenticated_at'] = datetime.now(timezone.utc).timestamp() - 3601
    assert client.get('/api/config/admin').status_code == 401
    assert client.get('/configuracao/admin').status_code == 302


def test_ga4_report_route_forwards_payload_and_property(monkeypatch, tmp_path):
    database = tmp_path / 'report.sqlite'
    connection = sqlite3.connect(database)
    connection.execute('CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT)')
    connection.commit()
    connection.close()

    class TestConfig:
        TESTING = True
        DATABASE_PATH = database
        PROPERTY_ID = '123'
        SECRET_KEY = 'test-secret'
        ADMIN_PASSWORD_HASH = None

    calls = []

    def fake_report(property_id, payload, force_refresh=False):
        calls.append((property_id, payload, force_refresh))
        return {'rowCount': 1, 'rows': []}

    monkeypatch.setattr(routes, 'ga4_configured', lambda: True)
    monkeypatch.setattr(routes, 'run_historical_report', fake_report)
    client = create_app(TestConfig).test_client()
    payload = {
        'propertyId': 'properties/123',
        'payload': {
            'dateRanges': [{'startDate': '30daysAgo', 'endDate': 'today'}],
            'dimensions': [{'name': 'date'}],
            'metrics': [{'name': 'screenPageViews'}],
            'limit': 500,
        },
        'forceRefresh': True,
    }

    response = client.post('/api/ga4/report', json=payload)

    assert response.status_code == 200
    assert response.get_json() == {'rowCount': 1, 'rows': []}
    assert calls == [('123', payload['payload'], True)]


def test_ga4_reports_route_executes_standard_bundle(monkeypatch, tmp_path):
    database = tmp_path / 'reports.sqlite'
    connection = sqlite3.connect(database)
    connection.execute('CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT)')
    connection.commit()
    connection.close()

    class TestConfig:
        TESTING = True
        DATABASE_PATH = database
        PROPERTY_ID = '123'
        SECRET_KEY = 'test-secret'
        ADMIN_PASSWORD_HASH = None

    calls = []

    def fake_reports(property_id, start_date, end_date, force_refresh=False):
        calls.append((property_id, start_date, end_date, force_refresh))
        return {'overview': {'rows': []}, 'channels': {'rows': []}}

    monkeypatch.setattr(routes, 'ga4_configured', lambda: True)
    monkeypatch.setattr(routes, 'run_standard_historical_reports', fake_reports)
    client = create_app(TestConfig).test_client()

    response = client.post('/api/ga4/reports', json={
        'propertyId': 'properties/123',
        'startDate': '2026-11-01',
        'endDate': '2026-11-10',
        'forceRefresh': True,
    })

    assert response.status_code == 200
    assert response.get_json()['overview']['rows'] == []
    assert calls == [('123', '2026-11-01', '2026-11-10', True)]


def test_ga4_reports_route_rejects_property_different_from_configuration(tmp_path):
    database = tmp_path / 'reports.sqlite'
    connection = sqlite3.connect(database)
    connection.execute('CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT)')
    connection.commit()
    connection.close()

    class TestConfig:
        TESTING = True
        DATABASE_PATH = database
        PROPERTY_ID = '123'
        SECRET_KEY = 'test-secret'
        ADMIN_PASSWORD_HASH = None

    client = create_app(TestConfig).test_client()

    response = client.post('/api/ga4/reports', json={
        'propertyId': '456',
        'startDate': '2026-11-01',
        'endDate': '2026-11-10',
    })

    assert response.status_code == 400
    assert 'diferente' in response.get_json()['error']


def test_repository_saves_realtime_snapshot_and_collector_run(tmp_path):
    database = tmp_path / 'collector.sqlite'
    connection = sqlite3.connect(database)
    connection.executescript('''
        CREATE TABLE realtime_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT, property_id TEXT NOT NULL,
          captured_at TEXT NOT NULL, active_users_5m INTEGER NOT NULL DEFAULT 0,
          active_users_30m INTEGER NOT NULL DEFAULT 0, page_views_30m INTEGER NOT NULL DEFAULT 0,
          active_articles_count INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL
        );
        CREATE TABLE collector_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, property_id TEXT NOT NULL,
          started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
          duration_ms INTEGER, snapshot_id INTEGER, rows_count INTEGER, error_message TEXT
        );
    ''')
    connection.commit()
    connection.close()

    repository = SQLiteRepository(database)
    run_id = repository.start_collector_run('123', '2026-11-11T12:00:00+00:00')
    snapshot_id = repository.save_snapshot({
        'property_id': '123',
        'captured_at': '2026-11-11T12:00:01+00:00',
        'active_users_5m': 8,
        'active_users_30m': 30,
        'page_views_30m': 45,
        'active_articles_count': 1,
        'payload': {'topPages': [{'title': 'Teste', 'users': 8, 'views': 12}]},
    })
    repository.finish_collector_run(run_id, '2026-11-11T12:00:02+00:00', 'success', 2000, snapshot_id, 1)

    latest = repository.latest_snapshots('123', limit=1)[0]
    diagnostics = repository.collector_diagnostics('123')
    assert snapshot_id == latest['id']
    assert latest['active_users_30m'] == 30
    assert diagnostics['lastStatus'] == 'success'
    assert diagnostics['lastSuccessRowsCount'] == 1


def test_repository_prunes_old_snapshots_and_creates_backup(tmp_path):
    database = tmp_path / 'retention.sqlite'
    repository = SQLiteRepository(database)
    repository.save_snapshot({
        'property_id': '123', 'captured_at': '2026-11-01T12:00:00+00:00',
        'payload': {'topPages': []},
    })
    repository.save_snapshot({
        'property_id': '123', 'captured_at': '2026-11-11T12:00:00+00:00',
        'payload': {'topPages': []},
    })
    repository.save_snapshot({
        'property_id': '456', 'captured_at': '2026-11-01T12:00:00+00:00',
        'payload': {'topPages': []},
    })

    removed = repository.prune_snapshots('123', '2026-11-10T00:00:00+00:00')
    backup = tmp_path / 'backups' / 'retention-copy.sqlite'
    repository.backup_database(backup)

    assert removed == 1
    assert len(repository.latest_snapshots('123', limit=10)) == 1
    assert len(repository.latest_snapshots('456', limit=10)) == 1
    backup_connection = sqlite3.connect(backup)
    assert backup_connection.execute('SELECT COUNT(*) FROM realtime_snapshots').fetchone()[0] == 2
    backup_connection.close()
