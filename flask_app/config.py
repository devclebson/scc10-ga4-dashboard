from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parents[1]


class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-only-change-me')
    ADMIN_PASSWORD_HASH = os.environ.get('FLASK_ADMIN_PASSWORD_HASH')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.environ.get('FLASK_SECURE_COOKIE', 'false').lower() == 'true'
    DATABASE_PATH = Path(os.environ.get('SCC10_DB_PATH', BASE_DIR / 'data' / 'scc10.sqlite'))
    PROPERTY_ID = os.environ.get('SCC10_PROPERTY_ID')
