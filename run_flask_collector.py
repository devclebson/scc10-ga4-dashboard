import argparse
import os
from pathlib import Path

from flask_app.config import BASE_DIR, _load_dotenv

_load_dotenv(BASE_DIR / '.env')

from flask_app.repositories.sqlite_repository import SQLiteRepository
from flask_app.services.ga4_service import configured
from flask_app.services.realtime_collector import CollectorLock, collect_realtime_snapshot, maintain_storage, run_collector_loop


def main(argv=None):
    parser = argparse.ArgumentParser(description='Executa o coletor realtime Flask.')
    parser.add_argument('--once', action='store_true', help='Executa somente um ciclo (padrão).')
    parser.add_argument('--loop', action='store_true', help='Mantém o coletor em execução.')
    parser.add_argument('--interval', type=int, default=int(os.environ.get('COLLECTOR_INTERVAL', '30')), help='Intervalo entre ciclos, em segundos.')
    parser.add_argument('--cycles', type=int, default=None, help='Limita a quantidade de ciclos no modo loop.')
    parser.add_argument('--retention-days', type=int, default=None, help='Remove snapshots anteriores a este número de dias.')
    parser.add_argument('--backup-path', default=None, help='Cria backup SQLite neste caminho após a coleta.')
    args = parser.parse_args(argv)

    property_id = os.environ.get('SCC10_PROPERTY_ID')
    if not property_id:
        raise SystemExit('SCC10_PROPERTY_ID não configurada.')
    if not configured():
        raise SystemExit('GOOGLE_SERVICE_ACCOUNT_FILE ou GOOGLE_SERVICE_ACCOUNT_JSON não configurada.')

    database_path = Path(os.environ.get('SCC10_DB_PATH', 'data/scc10-flask-collector.sqlite'))
    lock_path = Path(os.environ.get('SCC10_COLLECTOR_LOCK_PATH', f'{database_path}.lock'))
    repository = SQLiteRepository(database_path)
    with CollectorLock(lock_path):
        if args.loop:
            results = run_collector_loop(
                property_id,
                repository,
                args.interval,
                args.cycles,
                on_cycle=lambda cycle, result: print(
                    {'cycle': cycle, **result}, flush=True
                ),
            )
        else:
            results = [collect_realtime_snapshot(property_id, repository)]
        maintenance = maintain_storage(repository, property_id, args.retention_days, args.backup_path)
    print({'propertyId': property_id, 'database': str(database_path), 'cycles': len(results), 'results': results, 'maintenance': maintenance})


if __name__ == '__main__':
    main()
