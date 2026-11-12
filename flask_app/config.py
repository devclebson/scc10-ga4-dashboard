from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parents[1]


def _load_dotenv(path):
    """Carrega configurações locais sem substituir variáveis já definidas."""
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


# Carrega o arquivo antes de avaliar os atributos da configuração Flask.
_load_dotenv(BASE_DIR / '.env')


class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-only-change-me')
    ADMIN_PASSWORD_HASH = os.environ.get('FLASK_ADMIN_PASSWORD_HASH')
    ADMIN_SESSION_LIFETIME_SECONDS = int(os.environ.get('FLASK_ADMIN_SESSION_LIFETIME_SECONDS', '3600'))
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.environ.get('FLASK_SECURE_COOKIE', 'false').lower() == 'true'
    SESSION_REFRESH_EACH_REQUEST = True
    DATABASE_PATH = Path(os.environ.get('SCC10_DB_PATH', BASE_DIR / 'data' / 'scc10.sqlite'))
    PROPERTY_ID = os.environ.get('SCC10_PROPERTY_ID')
