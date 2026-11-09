from collections import OrderedDict
import json
import threading
import time


class ReportCache:
    def __init__(self, ttl_seconds=300, max_entries=128, now=None):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.now = now or time.monotonic
        self._entries = OrderedDict()
        self._in_flight = {}
        self._lock = threading.Lock()
        self._counters = {'hits': 0, 'misses': 0, 'coalesced': 0}

    def _key(self, key):
        return json.dumps(key, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

    def get(self, key, loader, force_refresh=False):
        cache_key = self._key(key)
        with self._lock:
            cached = self._entries.get(cache_key)
            if not force_refresh and cached and cached['expires_at'] > self.now():
                self._entries.move_to_end(cache_key)
                self._counters['hits'] += 1
                return cached['value']
            if cached:
                self._entries.pop(cache_key, None)
            pending = self._in_flight.get(cache_key)
            if pending:
                self._counters['coalesced'] += 1
                owner = False
            else:
                pending = {'event': threading.Event(), 'value': None, 'error': None}
                self._in_flight[cache_key] = pending
                self._counters['misses'] += 1
                owner = True

        if not owner:
            pending['event'].wait()
            if pending['error']:
                raise pending['error']
            return pending['value']

        try:
            value = loader()
            with self._lock:
                self._entries[cache_key] = {
                    'value': value,
                    'expires_at': self.now() + self.ttl_seconds,
                }
                self._entries.move_to_end(cache_key)
                while len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
                pending['value'] = value
            return value
        except Exception as error:
            with self._lock:
                pending['error'] = error
            raise
        finally:
            with self._lock:
                self._in_flight.pop(cache_key, None)
                pending['event'].set()

    def stats(self):
        with self._lock:
            return {
                **self._counters,
                'entries': len(self._entries),
                'inFlight': len(self._in_flight),
            }
