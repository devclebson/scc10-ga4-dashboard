import argparse
import os
from pathlib import Path

from flask_app.repositories.sqlite_repository import SQLiteRepository
from flask_app.services.article_sync import sync_article_metadata
from flask_app.services.ga4_service import configured


def main(argv=None):
    parser = argparse.ArgumentParser(description='Sincroniza metadados de matérias do GA4 no SQLite Flask.')
    parser.add_argument('--start-date', default='1daysAgo', help='Data inicial relativa ou ISO aceita pelo GA4.')
    parser.add_argument('--database-path', default=None, help='Caminho do SQLite; sobrescreve SCC10_DB_PATH.')
    args = parser.parse_args(argv)

    property_id = os.environ.get('SCC10_PROPERTY_ID')
    if not property_id:
        raise SystemExit('SCC10_PROPERTY_ID não configurada.')
    if not configured():
        raise SystemExit('GOOGLE_SERVICE_ACCOUNT_FILE ou GOOGLE_SERVICE_ACCOUNT_JSON não configurada.')

    database_path = Path(args.database_path or os.environ.get('SCC10_DB_PATH', 'data/scc10-flask-collector.sqlite'))
    repository = SQLiteRepository(database_path)
    result = sync_article_metadata(property_id, repository, args.start_date)
    print({
        'propertyId': property_id,
        'database': str(database_path),
        'startDate': args.start_date,
        **result,
        'articleCount': repository.article_count(property_id),
    })


if __name__ == '__main__':
    main()
