import sqlite3
from datetime import datetime, timezone

from flask_app import create_app
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
