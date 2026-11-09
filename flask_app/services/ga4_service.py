import json
import os
from urllib.request import Request, urlopen

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import service_account

from .report_cache import ReportCache

DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties'
SCOPES = ['https://www.googleapis.com/auth/analytics.readonly']
_cached_credentials = None
_article_traffic_cache = ReportCache(ttl_seconds=300, max_entries=128)


def _get_credentials():
    global _cached_credentials
    if _cached_credentials and _cached_credentials.valid:
        return _cached_credentials
    raw_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    file_path = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
    if raw_json:
        info = json.loads(raw_json)
        _cached_credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    elif file_path:
        _cached_credentials = service_account.Credentials.from_service_account_file(file_path, scopes=SCOPES)
    else:
        return None
    if not _cached_credentials.valid:
        _cached_credentials.refresh(GoogleRequest())
    return _cached_credentials


def configured():
    return bool(os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON') or os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE'))


def _run_article_traffic_uncached(property_id, page_path, start_date='30daysAgo'):
    credentials = _get_credentials()
    if not credentials:
        raise RuntimeError('Service Account não configurada no Flask.')
    payload = {
        'dateRanges': [{'startDate': start_date, 'endDate': 'today'}],
        'dimensions': [{'name': 'sessionDefaultChannelGroup'}],
        'metrics': [{'name': 'screenPageViews'}, {'name': 'sessions'}, {'name': 'activeUsers'}],
        'dimensionFilter': {'filter': {'fieldName': 'pagePath', 'stringFilter': {'matchType': 'EXACT', 'value': page_path}}},
        'orderBys': [{'metric': {'metricName': 'screenPageViews'}, 'desc': True}],
        'limit': 20,
    }
    request = Request(
        f'{DATA_API_BASE}/{str(property_id).removeprefix("properties/")}:runReport',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {credentials.token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    with urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode('utf-8'))
    rows = []
    total_views = 0
    for row in data.get('rows', []):
        views = int(row.get('metricValues', [{}])[0].get('value', 0))
        sessions = int(row.get('metricValues', [{}])[1].get('value', 0))
        users = int(row.get('metricValues', [{}])[2].get('value', 0))
        total_views += views
        rows.append({'channel': row.get('dimensionValues', [{}])[0].get('value', '(not set)'), 'views': views, 'sessions': sessions, 'users': users})
    for row in rows:
        row['pct'] = round((row['views'] / total_views) * 100, 1) if total_views else 0
    return {'rows': rows, 'totalViews': total_views, 'startDate': start_date, 'endDate': 'today'}


def run_article_traffic(property_id, page_path, start_date='30daysAgo', force_refresh=False):
    key = {
        'report': 'article-traffic',
        'propertyId': str(property_id),
        'pagePath': page_path,
        'startDate': start_date,
    }
    return _article_traffic_cache.get(
        key,
        lambda: _run_article_traffic_uncached(property_id, page_path, start_date),
        force_refresh=force_refresh,
    )


def article_traffic_cache_stats():
    return _article_traffic_cache.stats()
