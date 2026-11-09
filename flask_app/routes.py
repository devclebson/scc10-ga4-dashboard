from flask import Blueprint, current_app, jsonify, render_template

pages = Blueprint('pages', __name__)
api = Blueprint('api', __name__, url_prefix='/api')


@pages.get('/')
def home():
    return render_template('dashboard.html', active_page='dashboard')


@pages.get('/dashboard')
def dashboard():
    return render_template('dashboard.html', active_page='dashboard')


@pages.get('/ranking')
def ranking():
    return render_template('ranking.html', active_page='ranking')


@pages.get('/autores')
def autores():
    return render_template('autores.html', active_page='autores')


@pages.get('/materias/<int:article_id>')
def materia(article_id):
    return render_template('materia.html', active_page='materia', article_id=article_id)


@pages.get('/configuracao')
def configuracao():
    return render_template('configuracao.html', active_page='configuracao')


@api.get('/health')
def health():
    repository = current_app.extensions['repository']
    return jsonify({
        'ok': True,
        'service': 'scc10-flask',
        'database': str(repository.database_path),
    })


@api.get('/dashboard/summary')
def dashboard_summary():
    repository = current_app.extensions['repository']
    property_id = current_app.config.get('PROPERTY_ID')
    snapshots = repository.latest_snapshots(property_id, limit=30)
    latest = snapshots[0] if snapshots else None
    return jsonify({
        'propertyId': property_id,
        'latest': latest,
        'snapshots': snapshots,
        'articlesCached': repository.article_count(property_id),
    })


@api.get('/config')
def config():
    repository = current_app.extensions['repository']
    settings = repository.settings()
    return jsonify({
        'propertyId': settings.get('propertyId') or current_app.config.get('PROPERTY_ID'),
        'defaultDateRange': settings.get('defaultDateRange', '30'),
        'compareEnabled': settings.get('compareEnabled', 'true') == 'true',
    })
