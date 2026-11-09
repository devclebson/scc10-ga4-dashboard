const API_BASE = window.SCC10_API_BASE || 'http://localhost:3001';
import { aggregateAuthorRows } from './authors-data.js';
const statusEl = document.querySelector('#authors-status');
const contentEl = document.querySelector('#authors-content');
const rangeEl = document.querySelector('#authors-range');
const refreshEl = document.querySelector('#authors-refresh');
const podiumEl = document.querySelector('#authors-podium');
const bodyEl = document.querySelector('#authors-body');

function dateRange(value) {
  const today = new Date();
  const publishedTo = localDate(today);
  if (value === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { report: { startDate: localDate(start), endDate: 'today' }, publishedFrom: localDate(start), publishedTo };
  }
  if (value === 'today') return { report: { startDate: 'today', endDate: 'today' }, publishedFrom: publishedTo, publishedTo };
  const days = value === '7daysAgo' ? 7 : 90;
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  return { report: { startDate: value, endDate: 'today' }, publishedFrom: localDate(start), publishedTo };
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function number(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function render(authors) {
  podiumEl.innerHTML = authors.slice(0, 3).map((author, index) => `<article class="author-podium-card podium-${index + 1}"><span class="author-medal">${['🥇', '🥈', '🥉'][index]}</span><strong>${escapeHtml(author.author)}</strong><span>${number(author.views)} visualizações</span><small>${author.publications} publicaç${author.publications === 1 ? 'ão' : 'ões'}</small></article>`).join('');
  bodyEl.innerHTML = authors.map((author, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(author.author)}</strong></td><td>${author.publications}</td><td style="text-align:right;font-weight:700">${number(author.views)}</td><td>${author.topArticle ? `<a href="materia.html#propertyId=${encodeURIComponent(window.__propertyId)}&title=${encodeURIComponent(author.topArticle.title)}&path=${encodeURIComponent(author.topArticle.pagePath || '')}">${escapeHtml(author.topArticle.title)}</a>` : '--'}</td></tr>`).join('');
}

async function loadRanking() {
  statusEl.textContent = 'Consultando o ranking de autores...';
  statusEl.className = 'article-detail-status';
  refreshEl.disabled = true;
  try {
    const config = await fetch(`${API_BASE}/api/config`).then(response => response.json());
    if (!config.configured || !config.propertyId) throw new Error('Configure uma propriedade GA4 no backend.');
    window.__propertyId = String(config.propertyId).replace(/^properties\//, '');
    const period = dateRange(rangeEl.value);
    const response = await fetch(`${API_BASE}/api/ga4/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: window.__propertyId,
        reportType: 'standard',
        payload: {
          dateRanges: [period.report],
          dimensions: [{ name: 'customEvent:author' }, { name: 'pageTitle' }, { name: 'pagePath' }, { name: 'customEvent:published_date' }],
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 100000
        }
      })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || 'Não foi possível carregar o ranking de autores.');
    const authors = aggregateAuthorRows(data.rows, { publishedFrom: period.publishedFrom, publishedTo: period.publishedTo });
    render(authors);
    statusEl.textContent = `${authors.length} autores encontrados · ${data.rowCount || 0} linhas do relatório · período: ${rangeEl.options[rangeEl.selectedIndex].text}`;
    statusEl.className = 'article-detail-status';
    contentEl.classList.remove('hidden');
  } catch (error) {
    contentEl.classList.add('hidden');
    statusEl.textContent = error.message;
    statusEl.className = 'article-detail-status error';
  } finally {
    refreshEl.disabled = false;
  }
}

rangeEl.addEventListener('change', loadRanking);
refreshEl.addEventListener('click', loadRanking);
loadRanking();
