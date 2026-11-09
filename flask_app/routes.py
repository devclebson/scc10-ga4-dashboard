from datetime import datetime, timezone
from functools import wraps
import hmac
import re
import secrets

from flask import Blueprint, abort, current_app, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from .services.ga4_service import configured as ga4_configured, run_article_traffic

pages = Blueprint('pages', __name__)
api = Blueprint('api', __name__, url_prefix='/api')


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not _admin_session_valid():
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Autenticação administrativa necessária.'}), 401
            return redirect(url_for('pages.configuracao_login', next=request.path))
        return view(*args, **kwargs)
    return wrapped


def _admin_session_valid():
    if not session.get('admin_authenticated'):
        return False
    authenticated_at = session.get('admin_authenticated_at')
    if authenticated_at is None:
        session.clear()
        return False
    try:
        lifetime = int(current_app.config.get('ADMIN_SESSION_LIFETIME_SECONDS', 3600))
        age = datetime.now(timezone.utc).timestamp() - float(str(authenticated_at))
    except (TypeError, ValueError):
        session.clear()
        return False
    if age < 0 or age > max(1, lifetime):
        session.clear()
        return False
    return True


def csrf_protected(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        expected = session.get('csrf_token')
        supplied = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token')
        valid = expected and supplied and hmac.compare_digest(str(supplied), str(expected))
        if not valid:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Token CSRF inválido ou ausente.'}), 403
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def _configuration_payload(repository):
    settings = repository.settings()
    return {
        'propertyId': settings.get('propertyId') or current_app.config.get('PROPERTY_ID'),
        'defaultDateRange': settings.get('defaultDateRange', '30'),
        'compareEnabled': settings.get('compareEnabled', 'true') == 'true',
    }


def _validate_configuration(payload):
    payload = payload or {}
    property_id = str(payload.get('propertyId', '')).strip()
    if not re.fullmatch(r'\d+', property_id):
        raise ValueError('Propriedade GA4 inválida.')
    date_range = str(payload.get('defaultDateRange', '')).strip()
    if date_range not in {'7', 'today', '30', '90', '365'}:
        raise ValueError('Período padrão inválido.')
    compare_enabled = payload.get('compareEnabled')
    if not isinstance(compare_enabled, bool):
        raise ValueError('Comparação deve ser booleana.')
    return {
        'propertyId': property_id,
        'defaultDateRange': date_range,
        'compareEnabled': compare_enabled,
    }


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


@pages.route('/configuracao/login', methods=['GET', 'POST'])
def configuracao_login():
    error = None
    if request.method == 'POST':
        password_hash = current_app.config.get('ADMIN_PASSWORD_HASH')
        password = request.form.get('password', '')
        if password_hash and check_password_hash(password_hash, password):
            session.clear()
            session.permanent = True
            session['admin_authenticated'] = True
            session['admin_authenticated_at'] = datetime.now(timezone.utc).timestamp()
            session['csrf_token'] = secrets.token_urlsafe(32)
            next_url = request.form.get('next') or url_for('pages.configuracao_admin')
            if not next_url.startswith('/') or next_url.startswith('//'):
                next_url = url_for('pages.configuracao_admin')
            return redirect(next_url)
        error = 'Senha inválida ou autenticação administrativa não configurada.'
    return render_template('configuracao_login.html', error=error, next=request.args.get('next', ''))


@pages.get('/configuracao/admin')
@admin_required
def configuracao_admin():
    repository = current_app.extensions['repository']
    return render_template(
        'configuracao_admin.html',
        active_page='configuracao',
        configuration=_configuration_payload(repository),
        csrf_token=session['csrf_token'],
    )


@pages.post('/configuracao/logout')
@admin_required
@csrf_protected
def configuracao_logout():
    session.clear()
    return redirect(url_for('pages.configuracao'))


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
    return jsonify(_configuration_payload(repository))


@api.get('/config/admin')
@admin_required
def admin_config():
    repository = current_app.extensions['repository']
    return jsonify(_configuration_payload(repository))


@api.post('/config/admin')
@admin_required
@csrf_protected
def save_admin_config():
    repository = current_app.extensions['repository']
    try:
        values = _validate_configuration(request.get_json(silent=True))
        repository.save_settings(values)
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    return jsonify({**_configuration_payload(repository), 'saved': True})


@api.get('/config/diagnostics')
def config_diagnostics():
    repository = current_app.extensions['repository']
    settings = repository.settings()
    property_id = settings.get('propertyId') or current_app.config.get('PROPERTY_ID')
    try:
        interval_seconds = int(settings.get('collectorIntervalSeconds', 30))
    except (TypeError, ValueError):
        interval_seconds = 30
    diagnostics = repository.diagnostics(property_id)
    diagnostics.update({
        'propertyId': property_id,
        'ga4Configured': ga4_configured(),
        'service': 'scc10-flask',
        'collector': repository.collector_diagnostics(property_id, interval_seconds),
    })
    return jsonify(diagnostics)
