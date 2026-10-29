const DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties';

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

    const res = await fetch(`${DATA_API_BASE}/${propId}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + getAccessToken(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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
      const res = await fetch(`${DATA_API_BASE}/${propId}:runRealtimeReport`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + getAccessToken(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
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

  return { runReport, runRealtimeReport };
}
