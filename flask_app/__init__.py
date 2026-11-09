from flask import Flask

from .config import Config
from .repositories.sqlite_repository import SQLiteRepository
from .routes import api, pages


def create_app(config_object=Config):
    app = Flask(__name__, template_folder='templates', static_folder='static')
    app.config.from_object(config_object)
    app.extensions['repository'] = SQLiteRepository(app.config['DATABASE_PATH'])
    app.register_blueprint(pages)
    app.register_blueprint(api)
    return app
