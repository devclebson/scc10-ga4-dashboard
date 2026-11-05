const API_BASE = window.SCC10_API_BASE || 'http://localhost:3001';
const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
const propertyId = params.get('propertyId') || '309943616';
const title = params.get('title') || '';
const pagePath = params.get('path') || '';
const startDate = params.get('startDate') || '30daysAgo';

const titleEl = document.querySelector('#article-detail-title');
const pathEl = document.querySelector('#article-detail-path');
const statusEl = document.querySelector('#article-detail-status');
const contentEl = document.querySelector('#article-detail-content');
const metaEl = document.querySelector('#article-detail-meta');
const bodyEl = document.querySelector('#article-traffic-body');
const chartEl = document.querySelector('#article-traffic-chart');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function number(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function rowValue(row, index) {
  return row?.dimensionValues?.[index]?.value || '(not set)';
}

function metricValue(row, index) {
  return Number(row?.metricValues?.[index]?.value || 0);
}

async function loadDetail() {
  titleEl.textContent = title || 'Detalhes da matéria';
  pathEl.textContent = pagePath || 'URL não informada';
  const response = await fetch(`${API_BASE}/api/articles/detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId, title, pagePath, startDate })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os detalhes.');

  const article = data.article || {};
  const rows = data.traffic || [];
  const totalViews = rows.reduce((sum, row) => sum + metricValue(row, 0), 0);
  titleEl.textContent = article.title || title || 'Detalhes da matéria';
  pathEl.textContent = article.pagePath || pagePath || 'URL não informada';
  metaEl.innerHTML = [
    ['Categoria', article.category],
    ['Autor', article.author],
    ['Publicado', article.publishedAt],
    ['Visualizações históricas', number(article.historicalViews)]
  ].filter(([, value]) => value).map(([label, value]) => `<span><strong>${label}</strong>${escapeHtml(value)}</span>`).join('');

  bodyEl.innerHTML = rows.length ? rows.map(row => {
    const views = metricValue(row, 0);
    const sessions = metricValue(row, 1);
    const share = totalViews ? (views / totalViews) * 100 : 0;
    return `<tr><td>${escapeHtml(rowValue(row, 0))}</td><td style="text-align:right;font-weight:700">${number(views)}</td><td style="text-align:right">${number(sessions)}</td><td style="text-align:right">${share.toFixed(1)}%</td></tr>`;
  }).join('') : '<tr><td colspan="4">Nenhuma origem encontrada para o período.</td></tr>';

  chartEl.innerHTML = rows.length ? rows.map(row => {
    const views = metricValue(row, 0);
    const share = totalViews ? (views / totalViews) * 100 : 0;
    return `<div class="article-traffic-bar-row"><div class="article-traffic-bar-label"><span>${escapeHtml(rowValue(row, 0))}</span><strong>${share.toFixed(1)}%</strong></div><div class="article-traffic-bar"><span style="width:${Math.max(share, 2)}%"></span></div><small>${number(views)} visualizações</small></div>`;
  }).join('') : '<p class="panel-description">Nenhuma origem encontrada para o período.</p>';

  statusEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
}

loadDetail().catch(error => {
  statusEl.className = 'article-detail-status error';
  statusEl.textContent = error.message;
});
