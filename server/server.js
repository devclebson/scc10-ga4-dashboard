import { createServer } from 'node:http';
import { getSnapshots, saveSnapshot } from './db.js';
import { isServiceAccountConfigured } from './services/google-auth.js';
import { requestGa4Report } from './services/ga4-client.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  return JSON.parse(body);
}

function propertyIdFrom(value) {
  const propertyId = String(value || '').replace(/^properties\//, '');
  if (!/^\d+$/.test(propertyId)) throw new Error('propertyId inválido.');
  return propertyId;
}

async function proxyAnalyticsRequest(req, body) {
  const token = req.headers.authorization;
  if (token?.startsWith('Bearer ')) {
    const propertyId = propertyIdFrom(body.propertyId);
    const reportType = body.reportType === 'realtime' ? 'runRealtimeReport' : 'runReport';
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${reportType}`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body.payload || {})
    });
    return { status: response.status, data: await response.json() };
  }

  if (!isServiceAccountConfigured()) {
    throw new Error('Authorization Bearer ausente e Service Account não configurada.');
  }
  return requestGa4Report(body);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'scc10-backend',
        authMode: isServiceAccountConfigured() ? 'service-account' : 'browser-oauth',
        time: new Date().toISOString()
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ga4/report') {
      const result = await proxyAnalyticsRequest(req, await readJson(req));
      sendJson(res, result.status, result.data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/snapshots') {
      const snapshot = await readJson(req);
      const result = saveSnapshot(snapshot);
      sendJson(res, 201, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/snapshots') {
      const propertyId = propertyIdFrom(url.searchParams.get('propertyId'));
      const snapshots = getSnapshots({
        propertyId,
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        limit: url.searchParams.get('limit')
      });
      sendJson(res, 200, { snapshots });
      return;
    }

    sendJson(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Erro interno.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SCC10 backend listening at http://${HOST}:${PORT}`);
});
