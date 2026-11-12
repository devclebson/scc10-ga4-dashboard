"""Compara publicações do portal com linhas editoriais retornadas pelo GA4."""
from __future__ import annotations

import html
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flask_app.services.ga4_service import run_historical_report


def normalize(value):
    text = html.unescape(str(value or '')).strip().lower()
    text = unicodedata.normalize('NFD', text)
    return ''.join(char for char in text if unicodedata.category(char) != 'Mn')


def normalize_path(value):
    raw = html.unescape(str(value or '')).strip()
    parsed = urllib.parse.urlparse(raw)
    path = parsed.path or raw.split('?', 1)[0]
    return path.rstrip('/') or '/'


def portal_posts(day):
    start = f'{day}T00:00:00'
    end = f'{day}T23:59:59'
    query = urllib.parse.urlencode({
        'after': start,
        'before': end,
        'per_page': 100,
        '_fields': 'id,date,link,title',
    })
    url = f'https://scc10.com.br/wp-json/wp/v2/posts?{query}'
    request = urllib.request.Request(url, headers={'User-Agent': 'SCC10-Analytics-Day-Compare/1.0'})
    with urllib.request.urlopen(request, timeout=20) as response:
        posts = json.loads(response.read().decode('utf-8'))
        return posts, response.headers.get('X-WP-Total')


def ga4_report(property_id, day):
    payload = {
        'dateRanges': [{'startDate': day, 'endDate': day}],
        'dimensions': [
            {'name': 'pageTitle'},
            {'name': 'pagePath'},
            {'name': 'customEvent:categories'},
            {'name': 'customEvent:author'},
            {'name': 'customEvent:published_date'},
        ],
        'metrics': [{'name': 'screenPageViews'}],
        'limit': 100000,
    }
    return run_historical_report(property_id, payload, force_refresh=True)


def values(row):
    return [item.get('value', '') for item in row.get('dimensionValues', [])]


def main():
    target = os.environ.get('GA4_COMPARE_DATE') or (date.today() - timedelta(days=1)).isoformat()
    property_id = os.environ.get('SCC10_PROPERTY_ID')
    if not property_id or not str(property_id).isdigit():
        raise SystemExit('SCC10_PROPERTY_ID não configurada ou inválida.')
    posts, portal_header_total = portal_posts(target)
    report = ga4_report(str(property_id), target)
    rows = report.get('rows', [])
    ga4_paths = {normalize_path(values(row)[1]) for row in rows if len(values(row)) > 1 and values(row)[1] not in {'', '(not set)', '(other)'}}
    ga4_titles = {normalize(values(row)[0]) for row in rows if values(row) and normalize(values(row)[0]) not in {'', '(not set)', '(other)'}}
    ga4_published_date = {values(row)[4] for row in rows if len(values(row)) > 4 and values(row)[4] not in {'', '(not set)', '(other)'}}
    ga4_editorial_rows = [row for row in rows if len(values(row)) > 4 and values(row)[4] == target]
    portal_paths = {normalize_path(post.get('link', '')) for post in posts if post.get('link')}
    portal_titles = {normalize(post.get('title', {}).get('rendered', '')) for post in posts}
    print(json.dumps({
        'date': target,
        'portal': {
            'httpTotalHeader': int(portal_header_total) if portal_header_total else None,
            'postsReturned': len(posts),
            'portalUniquePaths': len(portal_paths),
            'portalUniqueTitles': len(portal_titles),
        },
        'ga4': {
            'rowCount': report.get('rowCount', len(rows)),
            'rowsReturned': len(rows),
            'ga4UniquePaths': len(ga4_paths),
            'ga4UniqueTitles': len(ga4_titles),
            'rowsWithPublishedDateEqualToDay': len(ga4_editorial_rows),
            'distinctPublishedDatesInRows': sorted(ga4_published_date),
        },
        'comparison': {
            'portalPathsFoundInGa4': len(portal_paths & ga4_paths),
            'portalTitlesFoundInGa4': len(portal_titles & ga4_titles),
            'portalPathsMissingInGa4': len(portal_paths - ga4_paths),
            'portalTitlesMissingInGa4': len(portal_titles - ga4_titles),
        },
        'generatedAt': datetime.now().astimezone().isoformat(),
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
