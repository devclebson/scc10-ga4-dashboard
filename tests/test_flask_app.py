import sqlite3

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
    assert client.post('/configuracao/logout').status_code == 302
    diagnostics = client.get('/api/config/diagnostics').get_json()
    assert diagnostics['database']['exists'] is True
    assert diagnostics['database']['hasSnapshotsTable'] is True
    assert diagnostics['database']['hasArticlesTable'] is True
    assert diagnostics['articlesCached'] == 1
    assert diagnostics['latestSnapshot']['active_users_30m'] == 9
    assert diagnostics['propertyId'] == '123'
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
