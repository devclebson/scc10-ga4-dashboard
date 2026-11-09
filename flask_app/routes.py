from flask import Blueprint, current_app, jsonify, render_template, request

from .services.ga4_service import configured as ga4_configured, run_article_traffic

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
    return jsonify(repository.dashboard_data(current_app.config.get('PROPERTY_ID')))


@api.get('/ranking')
def ranking_data():
    repository = current_app.extensions['repository']
    try:
        limit = int(request.args.get('limit', 20))
    except (AttributeError, ValueError):
        limit = 20
    return jsonify(repository.ranking_data(current_app.config.get('PROPERTY_ID'), limit))


@api.get('/autores')
def authors_data():
    repository = current_app.extensions['repository']
    period = request.args.get('period', 'month')
    if period not in {'today', '7days', 'month', '90days'}:
        period = 'month'
    return jsonify(repository.authors_data(current_app.config.get('PROPERTY_ID'), period))


@api.get('/materias/<int:article_id>')
def article_detail(article_id):
    repository = current_app.extensions['repository']
    detail = repository.article_detail(article_id)
    if not detail:
        return jsonify({'error': 'Matéria não encontrada.'}), 404
    article = detail['article']
    if article.get('page_path') and ga4_configured():
        try:
            detail['traffic'] = run_article_traffic(article['property_id'], article['page_path'])['rows']
            detail['trafficStatus'] = 'loaded'
        except Exception as error:
            detail['trafficStatus'] = 'ga4-error'
            detail['trafficError'] = str(error)
    return jsonify(detail)


@api.get('/config')
def config():
    repository = current_app.extensions['repository']
    settings = repository.settings()
    return jsonify({
        'propertyId': settings.get('propertyId') or current_app.config.get('PROPERTY_ID'),
        'defaultDateRange': settings.get('defaultDateRange', '30'),
        'compareEnabled': settings.get('compareEnabled', 'true') == 'true',
    })
