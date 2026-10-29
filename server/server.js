import { createServer } from 'node:http';
import { getSetting, getSnapshots, saveSnapshot, setSetting } from './db.js';
import { isServiceAccountConfigured } from './services/google-auth.js';
import { requestGa4Report, getGa4Metadata } from './services/ga4-client.js';
import { enrichArticle, getArticleDetail, syncArticleMetadata } from './services/article-metadata.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const ARTICLE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
let articleSyncRunning = false;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
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

function applicationConfig() {
  const propertyId = getSetting('propertyId') || process.env.SCC10_PROPERTY_ID || null;
  return {
    propertyId,
    defaultDateRange: getSetting('defaultDateRange') || '30',
    compareEnabled: getSetting('compareEnabled') !== 'false',
    collectorIntervalSeconds: Number(getSetting('collectorIntervalSeconds') || 30),
    authMode: isServiceAccountConfigured() ? 'service-account' : 'browser-oauth',
    configured: Boolean(propertyId && isServiceAccountConfigured())
  };
}

function isAdminAuthorized(req) {
  const expected = process.env.SCC10_ADMIN_TOKEN;
  if (!expected) return req.headers.host?.startsWith('127.0.0.1') || req.headers.host?.startsWith('localhost');
  return req.headers['x-admin-token'] === expected;
}

function validateConfig(body) {
  const propertyId = propertyIdFrom(body.propertyId);
  const allowedRanges = new Set(['7', 'today', '30', '90', '365']);
  if (!allowedRanges.has(String(body.defaultDateRange))) throw new Error('Período padrão inválido.');
  const interval = Number(body.collectorIntervalSeconds);
  if (!Number.isInteger(interval) || interval < 15 || interval > 3600) throw new Error('Intervalo do coletor deve estar entre 15 e 3600 segundos.');
  return { propertyId, defaultDateRange: String(body.defaultDateRange), compareEnabled: Boolean(body.compareEnabled), collectorIntervalSeconds: interval };
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
        adminAuthConfigured: Boolean(process.env.SCC10_ADMIN_TOKEN),
        time: new Date().toISOString()
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      const config = applicationConfig();
      sendJson(res, 200, { configured: config.configured, propertyId: config.propertyId, authMode: config.authMode });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/config') {
      if (!isAdminAuthorized(req)) throw new Error('Acesso administrativo não autorizado.');
      sendJson(res, 200, { ...applicationConfig(), adminAuthConfigured: Boolean(process.env.SCC10_ADMIN_TOKEN) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/config') {
      if (!isAdminAuthorized(req)) throw new Error('Acesso administrativo não autorizado.');
      const config = validateConfig(await readJson(req));
      setSetting('propertyId', config.propertyId);
      setSetting('defaultDateRange', config.defaultDateRange);
      setSetting('compareEnabled', config.compareEnabled);
      setSetting('collectorIntervalSeconds', config.collectorIntervalSeconds);
      sendJson(res, 200, { ...applicationConfig(), saved: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ga4/report') {
      const result = await proxyAnalyticsRequest(req, await readJson(req));
      sendJson(res, result.status, result.data);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/ga4/metadata') {
      if (!isServiceAccountConfigured()) throw new Error('Service Account não configurada.');
      const result = await getGa4Metadata(url.searchParams.get('propertyId'));
      sendJson(res, result.status, result.data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/articles/sync') {
      if (!isServiceAccountConfigured()) throw new Error('Service Account não configurada.');
      const body = await readJson(req);
      const propertyId = propertyIdFrom(body.propertyId || applicationConfig().propertyId);
      const result = await syncArticleMetadata(propertyId, body.startDate || '30daysAgo');
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/articles/enrich') {
      const body = await readJson(req);
      const propertyId = propertyIdFrom(body.propertyId || applicationConfig().propertyId);
      const titles = Array.isArray(body.titles) ? body.titles.slice(0, 100) : [];
      const articles = Object.fromEntries(titles.map(title => [title, enrichArticle(propertyId, title)]));
      sendJson(res, 200, { articles });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/articles/detail') {
      if (!isServiceAccountConfigured()) throw new Error('Service Account não configurada.');
      const body = await readJson(req);
      const propertyId = propertyIdFrom(body.propertyId || applicationConfig().propertyId);
      const detail = await getArticleDetail(propertyId, body);
      sendJson(res, 200, detail);
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

async function runScheduledArticleSync() {
  if (articleSyncRunning || !isServiceAccountConfigured()) return;
  const propertyId = applicationConfig().propertyId;
  if (!propertyId) return;
  articleSyncRunning = true;
  try {
    const result = await syncArticleMetadata(propertyId, '30daysAgo');
    console.log(`Article metadata sync: ${result.saved}/${result.fetched} rows saved`);
  } catch (error) {
    console.warn(`Article metadata sync failed: ${error.message}`);
  } finally {
    articleSyncRunning = false;
  }
}

server.listen(PORT, HOST, () => {
  console.log(`SCC10 backend listening at http://${HOST}:${PORT}`);
  setTimeout(runScheduledArticleSync, 10000);
  setInterval(runScheduledArticleSync, ARTICLE_SYNC_INTERVAL_MS);
});
