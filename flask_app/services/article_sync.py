import unicodedata

from .ga4_service import run_historical_report

ARTICLE_DIMENSIONS = [
    'pageTitle',
    'pagePath',
    'customEvent:categories',
    'customEvent:author',
    'customEvent:published_date',
]


def normalize_title(value):
    text = unicodedata.normalize('NFD', str(value or ''))
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    return ' '.join(text.lower().split())


def build_article_sync_payload(start_date='30daysAgo'):
    return {
        'dateRanges': [{'startDate': start_date, 'endDate': 'today'}],
        'dimensions': [{'name': name} for name in ARTICLE_DIMENSIONS],
        'metrics': [{'name': 'screenPageViews'}],
        'orderBys': [{'metric': {'metricName': 'screenPageViews'}, 'desc': True}],
        'limit': 100000,
    }


def _value(row, index):
    try:
        return row.get('dimensionValues', [])[index].get('value', '')
    except (IndexError, TypeError):
        return ''


def parse_article_rows(rows, property_id):
    articles = []
    for row in rows or []:
        title = _value(row, 0).strip()
        normalized_title = normalize_title(title)
        if not title or not normalized_title or normalized_title in {'(not set)', '(other)'}:
            continue
        try:
            historical_views = int(row.get('metricValues', [])[0].get('value', 0))
        except (IndexError, TypeError, ValueError):
            historical_views = 0
        articles.append({
            'property_id': str(property_id).removeprefix('properties/'),
            'title': title,
            'normalized_title': normalized_title,
            'page_path': _value(row, 1) or None,
            'category': _value(row, 2) or None,
            'author': _value(row, 3) or None,
            'published_at': _value(row, 4) or None,
            'historical_views': historical_views,
        })
    return articles


def sync_article_metadata(property_id, repository, start_date='30daysAgo', report_runner=None):
    runner = report_runner or run_historical_report
    report = runner(property_id, build_article_sync_payload(start_date))
    articles = parse_article_rows(report.get('rows', []), property_id)
    for article in articles:
        repository.upsert_article(article)
    return {'fetched': len(report.get('rows', [])), 'saved': len(articles)}
