const BACKEND_API_BASE = window.SCC10_API_BASE || 'http://localhost:3001';

export function createAnalyticsApi({ getAccessToken, getDateRange, isTokenExpired, onTokenExpired }) {
  async function runReport(propId, dims, metrics, limit = 500, startDate = null, endDate = null) {
    if (isTokenExpired()) {
      onTokenExpired();
      throw new Error('Token expirado.');
    }

    const start = startDate || `${getDateRange()}daysAgo`;
    const end = endDate || 'today';
    const payload = {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: dims.map(name => ({ name })),
      metrics: metrics.map(name => ({ name })),
      metricAggregations: ['TOTAL'],
      limit
    };

    if (dims[0] === 'date') {
      payload.orderBys = [{ dimension: { dimensionName: 'date' }, desc: false }];
    } else if (metrics.length > 0) {
      payload.orderBys = [{ metric: { metricName: metrics[0] }, desc: true }];
    }

    const res = await fetch(`${BACKEND_API_BASE}/api/ga4/report`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + getAccessToken(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ propertyId: propId, reportType: 'standard', payload })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data;
  }

  async function runRealtimeReport(propId, body) {
    if (isTokenExpired()) {
      onTokenExpired();
      return null;
    }

    try {
      const res = await fetch(`${BACKEND_API_BASE}/api/ga4/report`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + getAccessToken(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ propertyId: propId, reportType: 'realtime', payload: body })
      });
      const data = await res.json();
      if (data.error) {
        console.warn('Realtime API error:', data.error.message);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Erro em runRealtimeReport:', error);
      return null;
    }
  }

  async function saveSnapshot(snapshot) {
    const res = await fetch(`${BACKEND_API_BASE}/api/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao salvar snapshot.');
    return data;
  }

  async function getSnapshots({ propertyId, from, to, limit = 100 } = {}) {
    const params = new URLSearchParams({
      propertyId: String(propertyId || '').replace(/^properties\//, ''),
      limit: String(limit)
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`${BACKEND_API_BASE}/api/snapshots?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao consultar snapshots.');
    return data.snapshots || [];
  }

  return { runReport, runRealtimeReport, saveSnapshot, getSnapshots };
}
