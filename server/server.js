import { createServer } from 'node:http';
import { getSetting, getSnapshots, saveSnapshot, setSetting } from './db.js';
import { isServiceAccountConfigured } from './services/google-auth.js';
import { clearSessionCookie, ensureBootstrapAdmin, getSessionUser, isAdminAuthConfigured, isPasswordLoginConfigured, login, logout, sessionCookie } from './services/admin-auth.js';
import { requestGa4Report, getGa4Metadata } from './services/ga4-client.js';
import { enrichArticle, getArticleDetail, syncArticleMetadata } from './services/article-metadata.js';
import { createAllowedOrigins } from './services/allowed-origins.js';
import { createReportCache } from './services/report-cache.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const ARTICLE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_COLLECTOR_INTERVAL_SECONDS = 30;
const CHANNELS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const QUOTA_BACKOFF_MS = 15 * 60 * 1000;
const ALLOWED_ORIGINS = createAllowedOrigins(process.env.SCC10_PUBLIC_ORIGIN);
const PUBLIC_GA4_REQUESTS_PER_MINUTE = 60;
let publicGa4WindowStart = Date.now();
let publicGa4RequestCount = 0;
let articleSyncRunning = false;
let realtimeSnapshotRunning = false;
let realtimeCollectorTimer = null;
let realtimeBackoffUntil = 0;
let channelsCache = [];
let channelsCacheUpdatedAt = 0;
let channelsCachePropertyId = null;
let channelsCacheDay = null;
const historicalReportCache = createReportCache();

function sendJson(res, status, payload, extraHeaders = {}) {
  const origin = res.req?.headers.origin;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'http://localhost:3000',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...extraHeaders
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

function configuredPropertyIdFrom(value) {
  const propertyId = propertyIdFrom(value);
  const configuredPropertyId = propertyIdFrom(applicationConfig().propertyId);
  if (propertyId !== configuredPropertyId) throw new Error('Propriedade GA4 diferente da configurada.');
  return propertyId;
}

function assertPublicGa4Budget() {
  if (Date.now() - publicGa4WindowStart >= 60000) {
    publicGa4WindowStart = Date.now();
    publicGa4RequestCount = 0;
  }
  if (++publicGa4RequestCount > PUBLIC_GA4_REQUESTS_PER_MINUTE) {
    const error = new Error('Limite temporário de consultas GA4 atingido.');
    error.status = 429;
    throw error;
  }
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
  if (getSessionUser(req)) return true;
  const expected = process.env.SCC10_ADMIN_TOKEN;
  if (!expected) return false;
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
    assertPublicGa4Budget();
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
  const propertyId = configuredPropertyIdFrom(body.propertyId);
  const request = () => {
    assertPublicGa4Budget();
    return requestGa4Report({ ...body, propertyId });
  };
  if (body.reportType === 'realtime' || body.payload?.returnPropertyQuota) return request();
  return historicalReportCache.get({ propertyId, reportType: 'standard', payload: body.payload || {} }, request, { forceRefresh: body.forceRefresh === true });
}

const server = createServer(async (req, res) => {
  if (req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) {
    sendJson(res, 403, { error: 'Origem não autorizada.' });
    return;
  }
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
        adminAuthConfigured: isAdminAuthConfigured(),
        passwordLoginConfigured: isPasswordLoginConfigured(),
        historicalReportCache: historicalReportCache.stats(),
        time: new Date().toISOString()
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      const config = applicationConfig();
      sendJson(res, 200, { configured: config.configured, propertyId: config.propertyId, authMode: config.authMode });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      const result = login(body.username, body.password);
      if (!result) {
        sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
        return;
      }
      sendJson(res, 200, { authenticated: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.token, result.expiresAt) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      logout(req);
      sendJson(res, 200, { authenticated: false }, { 'Set-Cookie': clearSessionCookie() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const user = getSessionUser(req);
      sendJson(res, 200, { authenticated: Boolean(user), user });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/config') {
      if (!isAdminAuthorized(req)) throw new Error('Acesso administrativo não autorizado.');
      sendJson(res, 200, { ...applicationConfig(), adminAuthConfigured: isAdminAuthConfigured() });
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
      assertPublicGa4Budget();
      if (!isServiceAccountConfigured()) throw new Error('Service Account não configurada.');
      const result = await getGa4Metadata(configuredPropertyIdFrom(url.searchParams.get('propertyId')));
      sendJson(res, result.status, result.data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/articles/sync') {
      if (!isAdminAuthorized(req)) throw new Error('Acesso administrativo não autorizado.');
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
      assertPublicGa4Budget();
      if (!isServiceAccountConfigured()) throw new Error('Service Account não configurada.');
      const body = await readJson(req);
      const propertyId = configuredPropertyIdFrom(body.propertyId || applicationConfig().propertyId);
      const detail = await getArticleDetail(propertyId, body);
      sendJson(res, 200, detail);
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
    sendJson(res, error.status || 400, { error: error.message || 'Erro interno.' });
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

function rowsToArticles(report) {
  return (report?.rows || []).map(row => ({
    title: row.dimensionValues?.[0]?.value || 'SCC10 Notícia',
    users: Number(row.metricValues?.[0]?.value || 0),
    views: Number(row.metricValues?.[1]?.value || 0)
  }));
}

function assertGa4Success(result) {
  if (result.status >= 400) {
    const error = new Error(result.data?.error?.message || `GA4 retornou HTTP ${result.status}.`);
    error.status = result.status;
    throw error;
  }
  return result.data;
}

function pauseCollectorForQuota(error) {
  if (error.status !== 429 && !/quota|exhausted property tokens/i.test(error.message)) return;
  realtimeBackoffUntil = Date.now() + QUOTA_BACKOFF_MS;
  console.warn('Realtime collector paused for 15 minutes after GA4 quota exhaustion.');
}

function rowsToChannels(report) {
  const rows = report?.rows || [];
  const totalSessions = rows.reduce((sum, row) => sum + Number(row.metricValues?.[0]?.value || 0), 0) || 1;
  return rows.map(row => {
    const sessions = Number(row.metricValues?.[0]?.value || 0);
    return {
      channel: row.dimensionValues?.[0]?.value || '(not set)',
      sessions,
      pct: ((sessions / totalSessions) * 100).toFixed(1)
    };
  });
}

async function getChannelsToday(propertyId) {
  const today = new Date().toISOString().slice(0, 10);
  if (channelsCachePropertyId !== propertyId || channelsCacheDay !== today) {
    channelsCachePropertyId = propertyId;
    channelsCacheDay = today;
    channelsCache = [];
    channelsCacheUpdatedAt = 0;
  }
  if (Date.now() - channelsCacheUpdatedAt < CHANNELS_REFRESH_INTERVAL_MS) return channelsCache;
  try {
    const result = await requestGa4Report({
      propertyId,
      reportType: 'standard',
      payload: {
        dateRanges: [{ startDate: 'today', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10
      }
    });
    if (channelsCachePropertyId === propertyId) {
      channelsCache = rowsToChannels(assertGa4Success(result));
      channelsCacheUpdatedAt = Date.now();
    }
  } catch (error) {
    if (channelsCachePropertyId === propertyId) channelsCacheUpdatedAt = Date.now();
    pauseCollectorForQuota(error);
    console.warn(`Channels refresh failed: ${error.message}`);
  }
  return channelsCachePropertyId === propertyId ? channelsCache : [];
}

async function runScheduledRealtimeSnapshot() {
  if (realtimeSnapshotRunning || Date.now() < realtimeBackoffUntil || !isServiceAccountConfigured()) return;
  const propertyId = applicationConfig().propertyId;
  if (!propertyId) return;

  realtimeSnapshotRunning = true;
  try {
    const [totalReport, pagesReport, minuteReport] = await Promise.all([
      requestGa4Report({
        propertyId,
        reportType: 'realtime',
        payload: {
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          minuteRanges: [
            { name: 'last30m', startMinutesAgo: 29, endMinutesAgo: 0 },
            { name: 'last5m', startMinutesAgo: 4, endMinutesAgo: 0 }
          ]
        }
      }),
      requestGa4Report({
        propertyId,
        reportType: 'realtime',
        payload: {
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 60
        }
      }),
      requestGa4Report({
        propertyId,
        reportType: 'realtime',
        payload: {
          dimensions: [{ name: 'minutesAgo' }],
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ dimension: { dimensionName: 'minutesAgo' }, desc: true }]
        }
      })
    ]);

    const totalData = assertGa4Success(totalReport);
    const pagesData = assertGa4Success(pagesReport);
    const minuteData = assertGa4Success(minuteReport);
    const channelsToday = await getChannelsToday(propertyId);
    const totalRow = totalData?.rows?.find(row => row.dimensionValues?.[0]?.value === 'last30m');
    const fiveMinuteRow = totalData?.rows?.find(row => row.dimensionValues?.[0]?.value === 'last5m');
    const minuteSeries = (minuteData?.rows || []).map(row => ({
      minute: `${row.dimensionValues?.[0]?.value || 0}m atrás`,
      users: Number(row.metricValues?.[0]?.value || 0),
      views: Number(row.metricValues?.[1]?.value || 0)
    }));
    saveSnapshot({
      propertyId,
      capturedAt: new Date().toISOString(),
      activeUsers5m: Number(fiveMinuteRow?.metricValues?.[0]?.value || 0),
      activeUsers30m: Number(totalRow?.metricValues?.[0]?.value || 0),
      pageViews30m: Number(totalRow?.metricValues?.[1]?.value || 0),
      activeArticlesCount: pagesData?.rows?.length || 0,
      payload: {
        topPages: rowsToArticles(pagesData),
        channelsToday,
        minuteSeries
      }
    });
    console.log('Realtime snapshot saved');
  } catch (error) {
    pauseCollectorForQuota(error);
    console.warn(`Realtime snapshot failed: ${error.message}`);
  } finally {
    realtimeSnapshotRunning = false;
  }
}

function scheduleRealtimeSnapshot(delayMs = 10000) {
  if (realtimeCollectorTimer) clearTimeout(realtimeCollectorTimer);
  realtimeCollectorTimer = setTimeout(async () => {
    await runScheduledRealtimeSnapshot();
    const intervalSeconds = Number(getSetting('collectorIntervalSeconds')) || DEFAULT_COLLECTOR_INTERVAL_SECONDS;
    const configuredDelay = Math.max(15, Math.min(intervalSeconds, 3600)) * 1000;
    scheduleRealtimeSnapshot(Math.max(configuredDelay, realtimeBackoffUntil - Date.now()));
  }, delayMs);
}

server.listen(PORT, HOST, () => {
  ensureBootstrapAdmin();
  console.log(`SCC10 backend listening at http://${HOST}:${PORT}`);
  setTimeout(runScheduledArticleSync, 10000);
  setInterval(runScheduledArticleSync, ARTICLE_SYNC_INTERVAL_MS);
  scheduleRealtimeSnapshot();
});
