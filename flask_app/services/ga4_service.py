import json
import os
from urllib.request import Request, urlopen

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import service_account

DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties'
SCOPES = ['https://www.googleapis.com/auth/analytics.readonly']
_credentials = None


def _credentials():
    global _credentials
    if _credentials and _credentials.valid:
        return _credentials
    raw_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    file_path = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
    if raw_json:
        info = json.loads(raw_json)
        _credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    elif file_path:
        _credentials = service_account.Credentials.from_service_account_file(file_path, scopes=SCOPES)
    else:
        return None
    if not _credentials.valid:
        _credentials.refresh(GoogleRequest())
    return _credentials


def configured():
    return bool(os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON') or os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE'))


def run_article_traffic(property_id, page_path, start_date='30daysAgo'):
    credentials = _credentials()
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
