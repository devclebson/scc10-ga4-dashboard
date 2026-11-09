import sqlite3

from flask_app import create_app


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
        CREATE TABLE articles (id INTEGER PRIMARY KEY, property_id TEXT);
        INSERT INTO realtime_snapshots VALUES (1, '123', '2026-11-09T12:00:00Z', 4, 9, 20, 3, '{"topPages": [{"title": "Teste", "users": 2, "views": 4}], "channelsToday": [], "minuteSeries": []}');
        INSERT INTO app_settings VALUES ('propertyId', '123');
        INSERT INTO articles VALUES (1, '123');
    ''')
    connection.commit()
    connection.close()

    class TestConfig:
        TESTING = True
        DATABASE_PATH = database
        PROPERTY_ID = '123'

    client = create_app(TestConfig).test_client()
    assert client.get('/dashboard').status_code == 200
    assert client.get('/ranking').status_code == 200
    assert client.get('/autores').status_code == 200
    assert client.get('/materias/1').status_code == 200
    assert client.get('/configuracao').status_code == 200
    payload = client.get('/api/dashboard/summary').get_json()
    assert payload['latest']['active_users_30m'] == 9
    assert payload['articlesCached'] == 1
    ranking = client.get('/api/ranking?limit=1').get_json()
    assert ranking['articles'][0]['title'] == 'Teste'
    assert ranking['totalViews'] == 4
