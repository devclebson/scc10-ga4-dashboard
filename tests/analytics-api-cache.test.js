import assert from 'node:assert/strict';
import { test } from 'node:test';

test('solicitação manual identifica a revalidação do relatório histórico', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.window = { SCC10_API_BASE: 'http://127.0.0.1:3001' };
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { json: async () => ({ rows: [] }) };
  };
  try {
    const { createAnalyticsApi } = await import('../src/js/services/analytics-api.js');
    const api = createAnalyticsApi({
      getAccessToken: () => null,
      getDateRange: () => '30',
      isTokenExpired: () => false,
      onTokenExpired: () => {}
    });
    await api.runReport('309943616', ['date'], ['activeUsers'], 1, 'today', 'today', true);
    await api.runReport('309943616', ['date'], ['activeUsers'], 1, 'today', 'today');
    assert.equal(requests[0].forceRefresh, true);
    assert.equal(requests[1].forceRefresh, false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
