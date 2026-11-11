import json
import os
import threading
import time
from urllib.request import Request, urlopen

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import service_account

from .report_cache import ReportCache

DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties'
SCOPES = ['https://www.googleapis.com/auth/analytics.readonly']
_cached_credentials = None
_article_traffic_cache = ReportCache(ttl_seconds=300, max_entries=128)
_historical_report_cache = ReportCache(ttl_seconds=300, max_entries=128)


class Ga4QuotaError(RuntimeError):
    status = 429


class RequestBudget:
    def __init__(self, limit=60, window_seconds=60, now=None):
        self.limit = limit
        self.window_seconds = window_seconds
        self.now = now or time.monotonic
        self._started_at = self.now()
        self._used = 0
        self._lock = threading.Lock()

    def consume(self):
        with self._lock:
            current = self.now()
            if current - self._started_at >= self.window_seconds:
                self._started_at = current
                self._used = 0
            if self._used >= self.limit:
                raise Ga4QuotaError('Limite local de consultas GA4 atingido; tente novamente em instantes.')
            self._used += 1

    def stats(self):
        with self._lock:
            current = self.now()
            if current - self._started_at >= self.window_seconds:
                return {'limit': self.limit, 'used': 0, 'remaining': self.limit}
            return {'limit': self.limit, 'used': self._used, 'remaining': max(0, self.limit - self._used)}


_historical_request_budget = RequestBudget()


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


def _run_historical_report_uncached(property_id, payload):
    credentials = _get_credentials()
    if not credentials:
        raise RuntimeError('Service Account não configurada no Flask.')
    _historical_request_budget.consume()
    request = Request(
        f'{DATA_API_BASE}/{str(property_id).removeprefix("properties/")}:runReport',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {credentials.token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode('utf-8'))


def run_historical_report(property_id, payload, force_refresh=False):
    key = {
        'report': 'historical',
        'propertyId': str(property_id),
        'payload': payload,
    }
    return _historical_report_cache.get(
        key,
        lambda: _run_historical_report_uncached(property_id, payload),
        force_refresh=force_refresh,
    )


def run_realtime_report(property_id, payload):
    credentials = _get_credentials()
    if not credentials:
        raise RuntimeError('Service Account não configurada no Flask.')
    _historical_request_budget.consume()
    request = Request(
        f'{DATA_API_BASE}/{str(property_id).removeprefix("properties/")}:runRealtimeReport',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {credentials.token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode('utf-8'))


def standard_historical_report_payloads(start_date, end_date):
    date_ranges = [{'startDate': start_date, 'endDate': end_date}]
    return {
        'overview': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'date'}],
            'metrics': [
                {'name': 'sessions'},
                {'name': 'activeUsers'},
                {'name': 'screenPageViews'},
                {'name': 'bounceRate'},
                {'name': 'averageSessionDuration'},
                {'name': 'engagedSessions'},
                {'name': 'newUsers'},
            ],
            'limit': 500,
        },
        'channels': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'sessionDefaultChannelGroup'}],
            'metrics': [{'name': 'sessions'}, {'name': 'activeUsers'}],
            'limit': 15,
        },
        'geo': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'country'}],
            'metrics': [{'name': 'sessions'}, {'name': 'activeUsers'}],
            'limit': 10,
        },
        'devices': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'deviceCategory'}],
            'metrics': [{'name': 'sessions'}, {'name': 'activeUsers'}],
            'limit': 5,
        },
        'pages': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'pagePath'}],
            'metrics': [
                {'name': 'screenPageViews'},
                {'name': 'activeUsers'},
                {'name': 'averageSessionDuration'},
                {'name': 'bounceRate'},
            ],
            'limit': 25,
        },
        'events': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'eventName'}],
            'metrics': [{'name': 'eventCount'}, {'name': 'totalUsers'}],
            'limit': 15,
        },
        'conversions': {
            'dateRanges': date_ranges,
            'dimensions': [{'name': 'eventName'}],
            'metrics': [{'name': 'conversions'}, {'name': 'sessions'}],
            'limit': 10,
        },
    }


def run_standard_historical_reports(property_id, start_date, end_date, force_refresh=False):
    reports = standard_historical_report_payloads(start_date, end_date)
    return {
        name: run_historical_report(property_id, payload, force_refresh=force_refresh)
        for name, payload in reports.items()
    }


def realtime_report_payloads():
    return {
        'total': {
            'metrics': [{'name': 'activeUsers'}, {'name': 'screenPageViews'}],
            'minuteRanges': [
                {'name': 'last30m', 'startMinutesAgo': 29, 'endMinutesAgo': 0},
                {'name': 'last5m', 'startMinutesAgo': 4, 'endMinutesAgo': 0},
            ],
        },
        'pages': {
            'dimensions': [{'name': 'unifiedScreenName'}],
            'metrics': [{'name': 'activeUsers'}, {'name': 'screenPageViews'}],
            'orderBys': [{'metric': {'metricName': 'activeUsers'}, 'desc': True}],
            'limit': 60,
        },
        'minutes': {
            'dimensions': [{'name': 'minutesAgo'}],
            'metrics': [{'name': 'activeUsers'}, {'name': 'screenPageViews'}],
            'orderBys': [{'dimension': {'dimensionName': 'minutesAgo'}, 'desc': True}],
        },
    }


def _metric_value(row, index):
    try:
        return int(row.get('metricValues', [])[index].get('value', 0))
    except (IndexError, TypeError, ValueError):
        return 0


def parse_realtime_snapshot(reports, channels_today, captured_at):
    total_rows = reports.get('total', {}).get('rows', [])
    totals = {
        row.get('dimensionValues', [{}])[0].get('value'): row
        for row in total_rows
    }
    pages = reports.get('pages', {}).get('rows', [])
    minutes = reports.get('minutes', {}).get('rows', [])
    return {
        'captured_at': captured_at,
        'active_users_5m': _metric_value(totals.get('last5m', {}), 0),
        'active_users_30m': _metric_value(totals.get('last30m', {}), 0),
        'page_views_30m': _metric_value(totals.get('last30m', {}), 1),
        'active_articles_count': len(pages),
        'payload': {
            'topPages': [
                {
                    'title': row.get('dimensionValues', [{}])[0].get('value') or 'SCC10 Notícia',
                    'users': _metric_value(row, 0),
                    'views': _metric_value(row, 1),
                }
                for row in pages
            ],
            'channelsToday': channels_today or [],
            'minuteSeries': [
                {
                    'minute': f"{row.get('dimensionValues', [{}])[0].get('value', 0)}m atrás",
                    'users': _metric_value(row, 0),
                    'views': _metric_value(row, 1),
                }
                for row in minutes
            ],
        },
    }


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
