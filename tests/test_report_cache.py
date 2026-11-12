import threading
import time

import pytest

from flask_app.services.report_cache import ReportCache
from flask_app.services import ga4_service
from flask_app.services import realtime_collector
from flask_app.services import article_sync


def test_reuses_valid_report_until_ttl_and_isolates_keys():
    clock = [100.0]
    cache = ReportCache(ttl_seconds=300, now=lambda: clock[0])
    calls = []

    def loader():
        calls.append(True)
        return {'value': len(calls)}

    assert cache.get({'propertyId': '123', 'path': '/a'}, loader)['value'] == 1
    assert cache.get({'propertyId': '123', 'path': '/a'}, loader)['value'] == 1
    assert cache.get({'propertyId': '456', 'path': '/a'}, loader)['value'] == 2
    assert cache.stats()['hits'] == 1
    clock[0] += 301
    assert cache.get({'propertyId': '123', 'path': '/a'}, loader)['value'] == 3


def test_coalesces_concurrent_loaders():
    cache = ReportCache(ttl_seconds=300)
    calls = []
    started = threading.Event()
    release = threading.Event()

    def loader():
        calls.append(True)
        started.set()
        release.wait(timeout=2)
        return {'value': 1}

    results = []
    threads = [threading.Thread(target=lambda: results.append(cache.get({'key': 'same'}, loader))) for _ in range(2)]
    threads[0].start()
    assert started.wait(timeout=2)
    threads[1].start()
    time.sleep(0.05)
    release.set()
    for thread in threads:
        thread.join(timeout=3)

    assert results == [{'value': 1}, {'value': 1}]
    assert len(calls) == 1
    assert cache.stats()['coalesced'] == 1


def test_does_not_cache_loader_errors():
    cache = ReportCache(ttl_seconds=300)
    calls = []

    def loader():
        calls.append(True)
        if len(calls) == 1:
            raise RuntimeError('GA4 indisponível')
        return {'value': 2}

    with pytest.raises(RuntimeError, match='GA4 indisponível'):
        cache.get({'key': 'error'}, loader)
    assert cache.get({'key': 'error'}, loader)['value'] == 2
    assert len(calls) == 2


def test_article_traffic_uses_property_path_and_period_cache(monkeypatch):
    cache = ReportCache(ttl_seconds=300)
    calls = []

    def loader(property_id, page_path, start_date):
        calls.append((property_id, page_path, start_date))
        return {'rows': [], 'totalViews': len(calls)}

    monkeypatch.setattr(ga4_service, '_article_traffic_cache', cache)
    monkeypatch.setattr(ga4_service, '_run_article_traffic_uncached', loader)

    assert ga4_service.run_article_traffic('123', '/a/', '30daysAgo')['totalViews'] == 1
    assert ga4_service.run_article_traffic('123', '/a/', '30daysAgo')['totalViews'] == 1
    assert ga4_service.run_article_traffic('123', '/b/', '30daysAgo')['totalViews'] == 2
    assert calls == [('123', '/a/', '30daysAgo'), ('123', '/b/', '30daysAgo')]


def test_historical_report_uses_property_and_complete_payload_cache(monkeypatch):
    cache = ReportCache(ttl_seconds=300)
    calls = []

    def loader(property_id, payload):
        calls.append((property_id, payload))
        return {'rowCount': len(calls), 'rows': []}

    monkeypatch.setattr(ga4_service, '_historical_report_cache', cache)
    monkeypatch.setattr(ga4_service, '_run_historical_report_uncached', loader)
    payload = {
        'dateRanges': [{'startDate': '30daysAgo', 'endDate': 'today'}],
        'dimensions': [{'name': 'date'}],
        'metrics': [{'name': 'screenPageViews'}],
        'limit': 500,
    }

    assert ga4_service.run_historical_report('123', payload)['rowCount'] == 1
    assert ga4_service.run_historical_report('123', dict(payload))['rowCount'] == 1
    changed_payload = {**payload, 'limit': 100}
    assert ga4_service.run_historical_report('123', changed_payload)['rowCount'] == 2
    assert calls == [('123', payload), ('123', changed_payload)]


def test_standard_historical_report_payloads_match_dashboard_queries():
    reports = ga4_service.standard_historical_report_payloads('2026-11-01', '2026-11-10')

    assert reports['overview']['dimensions'] == [{'name': 'date'}]
    assert reports['overview']['metrics'] == [
        {'name': 'sessions'},
        {'name': 'activeUsers'},
        {'name': 'screenPageViews'},
        {'name': 'bounceRate'},
        {'name': 'averageSessionDuration'},
        {'name': 'engagedSessions'},
        {'name': 'newUsers'},
    ]
    assert reports['channels']['dimensions'] == [{'name': 'sessionDefaultChannelGroup'}]
    assert reports['geo']['dimensions'] == [{'name': 'country'}, {'name': 'region'}]
    assert reports['devices']['dimensions'] == [
        {'name': 'deviceCategory'},
        {'name': 'operatingSystem'},
        {'name': 'browser'},
    ]
    assert reports['pages']['dimensions'] == [{'name': 'pagePath'}]
    assert reports['events']['dimensions'] == [{'name': 'eventName'}]
    assert reports['conversions']['metrics'] == [{'name': 'conversions'}, {'name': 'sessions'}]
    assert all(report['dateRanges'] == [{'startDate': '2026-11-01', 'endDate': '2026-11-10'}] for report in reports.values())


def test_run_standard_historical_reports_executes_named_reports(monkeypatch):
    calls = []

    def fake_report(property_id, payload, force_refresh=False):
        name = next(name for name, candidate in ga4_service.standard_historical_report_payloads('2026-11-01', '2026-11-10').items() if candidate == payload)
        calls.append((property_id, name, force_refresh))
        return {'report': name, 'rows': []}

    monkeypatch.setattr(ga4_service, 'run_historical_report', fake_report)

    result = ga4_service.run_standard_historical_reports('123', '2026-11-01', '2026-11-10', force_refresh=True)

    assert set(result) == {'overview', 'channels', 'channelDaily', 'sources', 'geo', 'devices', 'pages', 'events', 'conversions'}
    assert all(result[name]['report'] == name for name in result)
    assert calls == [
        ('123', 'overview', True),
        ('123', 'channels', True),
        ('123', 'channelDaily', True),
        ('123', 'sources', True),
        ('123', 'geo', True),
        ('123', 'devices', True),
        ('123', 'pages', True),
        ('123', 'events', True),
        ('123', 'conversions', True),
    ]


def test_request_budget_limits_real_ga4_calls_and_resets_window():
    clock = [100.0]
    budget = ga4_service.RequestBudget(limit=2, window_seconds=60, now=lambda: clock[0])

    budget.consume()
    budget.consume()
    with pytest.raises(ga4_service.Ga4QuotaError):
        budget.consume()
    clock[0] = 161.0
    budget.consume()
    assert budget.stats() == {'limit': 2, 'used': 1, 'remaining': 1}


def test_realtime_payloads_and_snapshot_parser_match_node_collector():
    payloads = ga4_service.realtime_report_payloads()
    assert payloads['total']['minuteRanges'] == [
        {'name': 'last30m', 'startMinutesAgo': 29, 'endMinutesAgo': 0},
        {'name': 'last5m', 'startMinutesAgo': 4, 'endMinutesAgo': 0},
    ]
    assert payloads['pages']['dimensions'] == [{'name': 'unifiedScreenName'}]
    assert payloads['minutes']['dimensions'] == [{'name': 'minutesAgo'}]

    snapshot = ga4_service.parse_realtime_snapshot(
        {
            'total': {'rows': [
                {'dimensionValues': [{'value': 'last30m'}], 'metricValues': [{'value': '30'}, {'value': '45'}]},
                {'dimensionValues': [{'value': 'last5m'}], 'metricValues': [{'value': '8'}, {'value': '12'}]},
            ]},
            'pages': {'rows': [
                {'dimensionValues': [{'value': 'Notícia'}], 'metricValues': [{'value': '4'}, {'value': '7'}]},
            ]},
            'minutes': {'rows': [
                {'dimensionValues': [{'value': '2'}], 'metricValues': [{'value': '3'}, {'value': '5'}]},
            ]},
        },
        [{'channel': 'Organic', 'sessions': 4, 'pct': '100.0'}],
        '2026-11-11T12:00:00+00:00',
    )

    assert snapshot['active_users_5m'] == 8
    assert snapshot['active_users_30m'] == 30
    assert snapshot['page_views_30m'] == 45
    assert snapshot['active_articles_count'] == 1
    assert snapshot['payload']['topPages'][0]['views'] == 7
    assert snapshot['payload']['channelsToday'][0]['channel'] == 'Organic'


def test_realtime_snapshot_parser_uses_fallback_for_empty_page_title():
    snapshot = ga4_service.parse_realtime_snapshot(
        {'total': {'rows': []}, 'pages': {'rows': [{'dimensionValues': [{'value': ''}], 'metricValues': []}]}, 'minutes': {'rows': []}},
        [],
        '2026-11-11T12:00:00+00:00',
    )

    assert snapshot['payload']['topPages'][0]['title'] == 'SCC10 Notícia'


def test_realtime_collector_saves_snapshot_and_marks_run_success():
    class Repository:
        def __init__(self):
            self.calls = []

        def start_collector_run(self, property_id, started_at):
            self.calls.append(('start', property_id, started_at))
            return 7

        def save_snapshot(self, snapshot):
            self.calls.append(('snapshot', snapshot))
            return 11

        def finish_collector_run(self, *args):
            self.calls.append(('finish', args))

    reports = {
        'total': {'rows': [
            {'dimensionValues': [{'value': 'last30m'}], 'metricValues': [{'value': '30'}, {'value': '45'}]},
            {'dimensionValues': [{'value': 'last5m'}], 'metricValues': [{'value': '8'}, {'value': '12'}]},
        ]},
        'pages': {'rows': [{'dimensionValues': [{'value': 'Notícia'}], 'metricValues': [{'value': '4'}, {'value': '7'}]}]},
        'minutes': {'rows': []},
    }
    repository = Repository()
    result = realtime_collector.collect_realtime_snapshot(
        '123', repository, report_runner=lambda _property_id, name, _payload: reports.get(name, {'rows': []}),
        channels_runner=lambda *_args: [{'channel': 'Organic', 'sessions': 4, 'pct': '100.0'}],
        now=lambda: 100.0,
    )

    assert result == {'snapshotId': 11, 'rowsCount': 1}
    assert repository.calls[1][1]['active_users_30m'] == 30
    assert repository.calls[2][0] == 'finish'
    assert repository.calls[2][1][2] == 'success'


def test_realtime_collector_loop_runs_bounded_cycles_without_overlap(monkeypatch):
    calls = []

    def fake_collect(property_id, repository):
        calls.append((property_id, repository))
        return {'snapshotId': len(calls), 'rowsCount': 1}

    sleeps = []
    monkeypatch.setattr(realtime_collector, 'collect_realtime_snapshot', fake_collect)
    monkeypatch.setattr(realtime_collector.time, 'sleep', lambda seconds: sleeps.append(seconds))

    results = realtime_collector.run_collector_loop('123', 'repository', interval_seconds=30, max_cycles=3)

    assert [item['snapshotId'] for item in results] == [1, 2, 3]
    assert calls == [('123', 'repository')] * 3
    assert sleeps == [30, 30]


def test_realtime_collector_loop_records_error_and_continues(monkeypatch):
    calls = []
    events = []

    def fake_collect(_property_id, _repository):
        calls.append(len(calls) + 1)
        if len(calls) == 1:
            raise realtime_collector.ga4_service.Ga4QuotaError('quota')
        return {'snapshotId': 2, 'rowsCount': 1}

    monkeypatch.setattr(realtime_collector, 'collect_realtime_snapshot', fake_collect)
    monkeypatch.setattr(realtime_collector.time, 'sleep', lambda _seconds: None)

    results = realtime_collector.run_collector_loop(
        '123',
        'repository',
        interval_seconds=30,
        max_cycles=2,
        on_cycle=lambda cycle, result: events.append((cycle, result)),
    )

    assert results == [{'snapshotId': 2, 'rowsCount': 1}]
    assert events[0][1]['error'] == 'quota'
    assert events[1][1]['snapshotId'] == 2


def test_storage_maintenance_requires_explicit_options():
    class Repository:
        def __init__(self):
            self.calls = []

        def prune_snapshots(self, property_id, before):
            self.calls.append(('prune', property_id, before))
            return 3

        def backup_database(self, destination):
            self.calls.append(('backup', destination))
            return destination

    repository = Repository()
    assert realtime_collector.maintain_storage(repository, '123') == {}
    result = realtime_collector.maintain_storage(repository, '123', retention_days=7, backup_path='backup.sqlite')

    assert result['removedSnapshots'] == 3
    assert result['backupPath'] == 'backup.sqlite'
    assert [call[0] for call in repository.calls] == ['prune', 'backup']


def test_article_sync_builds_payload_and_skips_empty_or_other_rows():
    payload = article_sync.build_article_sync_payload('30daysAgo')
    assert payload['dimensions'][0]['name'] == 'pageTitle'
    assert payload['dimensions'][1]['name'] == 'pagePath'
    assert payload['limit'] == 100000

    rows = [
        {'dimensionValues': [
            {'value': 'Título da Matéria'}, {'value': '/materia/'},
            {'value': 'Cotidiano'}, {'value': 'Autora'}, {'value': '2026-11-11'},
        ], 'metricValues': [{'value': '42'}]},
        {'dimensionValues': [{'value': ''}], 'metricValues': [{'value': '10'}]},
        {'dimensionValues': [{'value': '(other)'}], 'metricValues': [{'value': '10'}]},
    ]
    parsed = article_sync.parse_article_rows(rows, '123')
    assert parsed == [{
        'property_id': '123', 'title': 'Título da Matéria',
        'normalized_title': 'titulo da materia', 'page_path': '/materia/',
        'category': 'Cotidiano', 'author': 'Autora',
        'published_at': '2026-11-11', 'historical_views': 42,
    }]


def test_article_sync_persists_parsed_rows():
    class Repository:
        def __init__(self):
            self.articles = []

        def upsert_article(self, article):
            self.articles.append(article)

    repository = Repository()
    result = article_sync.sync_article_metadata(
        'properties/123', repository,
        report_runner=lambda property_id, payload: {
            'rows': [{'dimensionValues': [{'value': 'Notícia'}], 'metricValues': [{'value': '7'}]}]
        },
    )
    assert result == {'fetched': 1, 'saved': 1}
    assert repository.articles[0]['property_id'] == '123'


def test_collector_lock_blocks_second_owner_and_releases_after_context(tmp_path):
    lock_path = tmp_path / 'collector.lock'

    with realtime_collector.CollectorLock(lock_path):
        with pytest.raises(realtime_collector.CollectorAlreadyRunning):
            with realtime_collector.CollectorLock(lock_path):
                pass

    with realtime_collector.CollectorLock(lock_path):
        pass
