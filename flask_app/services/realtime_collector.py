from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import time

from . import ga4_service


class CollectorAlreadyRunning(RuntimeError):
    pass


class CollectorLock:
    def __init__(self, path):
        self.path = Path(path)
        self._fd = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(self._fd, f'pid={os.getpid()}\n'.encode())
        except FileExistsError as error:
            raise CollectorAlreadyRunning(f'Coletor já está em execução: {self.path}') from error
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass


def _rows_to_channels(report):
    rows = report.get('rows', []) if isinstance(report, dict) else []
    total_sessions = sum(ga4_service._metric_value(row, 0) for row in rows) or 1
    return [
        {
            'channel': row.get('dimensionValues', [{}])[0].get('value', '(not set)'),
            'sessions': ga4_service._metric_value(row, 0),
            'pct': f"{ga4_service._metric_value(row, 0) / total_sessions * 100:.1f}",
        }
        for row in rows
    ]


def _default_report_runner(property_id, name, payload):
    if name == 'total' or name == 'pages' or name == 'minutes':
        return ga4_service.run_realtime_report(property_id, payload)
    return ga4_service.run_historical_report(property_id, payload)


def _default_channels_runner(property_id, payload):
    return _rows_to_channels(ga4_service.run_historical_report(property_id, payload))


def collect_realtime_snapshot(property_id, repository, report_runner=None, channels_runner=None, now=None):
    report_runner = report_runner or _default_report_runner
    channels_runner = channels_runner or _default_channels_runner
    clock = now or time.monotonic
    started_monotonic = clock()
    started_at = datetime.now(timezone.utc).isoformat()
    run_id = repository.start_collector_run(property_id, started_at)
    try:
        payloads = ga4_service.realtime_report_payloads()
        reports = {
            name: report_runner(property_id, name, payload)
            for name, payload in payloads.items()
        }
        channels_payload = ga4_service.standard_historical_report_payloads('today', 'today')['channels']
        channels_today = channels_runner(property_id, channels_payload)
        captured_at = datetime.now(timezone.utc).isoformat()
        snapshot = ga4_service.parse_realtime_snapshot(reports, channels_today, captured_at)
        snapshot['property_id'] = property_id
        snapshot_id = repository.save_snapshot(snapshot)
        rows_count = snapshot['active_articles_count']
        repository.finish_collector_run(
            run_id,
            datetime.now(timezone.utc).isoformat(),
            'success',
            int((clock() - started_monotonic) * 1000),
            snapshot_id,
            rows_count,
        )
        return {'snapshotId': snapshot_id, 'rowsCount': rows_count}
    except Exception as error:
        repository.finish_collector_run(
            run_id,
            datetime.now(timezone.utc).isoformat(),
            'error',
            int((clock() - started_monotonic) * 1000),
            error_message=str(error),
        )
        raise


def run_collector_loop(property_id, repository, interval_seconds=30, max_cycles=None, stop_event=None, on_cycle=None):
    interval_seconds = max(15, min(int(interval_seconds), 3600))
    results = []
    while max_cycles is None or len(results) < max_cycles:
        if stop_event is not None and stop_event.is_set():
            break
        result = collect_realtime_snapshot(property_id, repository)
        results.append(result)
        if on_cycle is not None:
            on_cycle(len(results), result)
        if max_cycles is not None and len(results) >= max_cycles:
            break
        if stop_event is not None:
            stop_event.wait(interval_seconds)
        else:
            time.sleep(interval_seconds)
    return results


def maintain_storage(repository, property_id, retention_days=None, backup_path=None, now=None):
    result = {}
    if retention_days is not None:
        retention_days = int(retention_days)
        if retention_days < 1:
            raise ValueError('Retenção deve ser de pelo menos um dia.')
        current = now or datetime.now(timezone.utc)
        cutoff = (current - timedelta(days=retention_days)).isoformat()
        result['removedSnapshots'] = repository.prune_snapshots(property_id, cutoff)
    if backup_path:
        result['backupPath'] = str(repository.backup_database(backup_path))
    return result
