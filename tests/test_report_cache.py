import threading
import time

import pytest

from flask_app.services.report_cache import ReportCache
from flask_app.services import ga4_service


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
