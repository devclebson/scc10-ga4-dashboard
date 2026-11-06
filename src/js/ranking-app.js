import { createAnalyticsApi } from './services/analytics-api.js';
import { buildRankingRowsHtml, readRankingSnapshot, shouldRefreshRanking } from './dashboard/ranking.js';

const { getBackendConfig, getSnapshots, enrichArticles } = createAnalyticsApi({
  getAccessToken: () => null,
  getDateRange: () => '30',
  isTokenExpired: () => false,
  onTokenExpired: () => {}
});

const tbody = document.getElementById('ranking-tbody');
const status = document.getElementById('ranking-status');
const limitSelect = document.getElementById('ranking-limit');
let propertyId = '';
let articles = [];
let previousRankings = new Map();
let capturedAt = '';
let loading = false;
let totalViews = 0;

function render() {
  const limit = Number(limitSelect.value);
  tbody.innerHTML = buildRankingRowsHtml(articles.slice(0, limit), totalViews, propertyId);
}

function updateStatus() {
  const time = new Date(capturedAt).toLocaleTimeString('pt-BR');
  const ageMs = Date.now() - Date.parse(capturedAt);
  const freshness = ageMs >= 0 && ageMs <= 90000 ? 'Atualizado' : 'Dados desatualizados';
  status.textContent = `${freshness} às ${time} · ${articles.length} notícias · fonte: coleta do servidor (sem nova consulta ao GA4)`;
}

async function refresh() {
  if (!shouldRefreshRanking({ loading, hidden: document.hidden, capturedAt, propertyId })) return;
  loading = true;
  try {
    const [snapshot] = await getSnapshots({ propertyId, limit: 1 });
    if (!snapshot) throw new Error('Aguardando a primeira coleta do servidor.');
    if (snapshot.captured_at !== capturedAt) {
      const next = readRankingSnapshot(snapshot, previousRankings);
      try {
        const metadata = await enrichArticles(propertyId, next.articles.map(article => article.title));
        next.articles.forEach(article => {
          if (metadata[article.title]) Object.assign(article, metadata[article.title], { url: metadata[article.title].pagePath || '' });
        });
      } catch (error) {
        console.warn('Metadados históricos não disponíveis:', error.message);
      }
      articles = next.articles;
      totalViews = next.totalViews;
      previousRankings = next.rankings;
      capturedAt = next.capturedAt;
      render();
    }
    updateStatus();
  } catch (error) {
    status.textContent = `Ranking indisponível: ${error.message}`;
  } finally {
    loading = false;
  }
}

limitSelect.addEventListener('change', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

try {
  const config = await getBackendConfig();
  if (!config.configured || !config.propertyId) throw new Error('Configure uma propriedade GA4 no backend.');
  propertyId = String(config.propertyId).replace(/^properties\//, '');
  await refresh();
  setInterval(refresh, 30000);
} catch (error) {
  status.textContent = `Ranking indisponível: ${error.message}`;
}
