export function createReportCache({ ttlMs = 5 * 60 * 1000, maxEntries = 128, now = Date.now } = {}) {
  const entries = new Map();
  const inFlight = new Map();
  const counters = { hits: 0, misses: 0, coalesced: 0 };

  return {
    async get(key, loader, { forceRefresh = false } = {}) {
      const id = JSON.stringify(key);
      const cached = entries.get(id);
      if (!forceRefresh && cached && cached.expiresAt > now()) {
        entries.delete(id);
        entries.set(id, cached);
        counters.hits += 1;
        return cached.result;
      }
      if (!forceRefresh) entries.delete(id);
      if (inFlight.has(id)) {
        counters.coalesced += 1;
        return inFlight.get(id);
      }

      counters.misses += 1;
      const request = Promise.resolve().then(loader)
        .then(result => {
          if (result.status >= 200 && result.status < 300 && !result.data?.error) {
            entries.set(id, { result, expiresAt: now() + ttlMs });
            while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
          }
          return result;
        }).finally(() => inFlight.delete(id));
      inFlight.set(id, request);
      return request;
    },
    stats() {
      return { ...counters, entries: entries.size, inFlight: inFlight.size };
    }
  };
}
