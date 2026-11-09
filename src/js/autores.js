const API_BASE = window.SCC10_API_BASE || 'http://localhost:3001';
import { aggregateAuthorRows } from './authors-data.js';
const statusEl = document.querySelector('#authors-status');
const contentEl = document.querySelector('#authors-content');
const rangeEl = document.querySelector('#authors-range');
const refreshEl = document.querySelector('#authors-refresh');
const podiumEl = document.querySelector('#authors-podium');
const bodyEl = document.querySelector('#authors-body');

function dateRange(value) {
  if (value === 'month') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start.toISOString().slice(0, 10), endDate: 'today' };
  }
  return { startDate: value, endDate: 'today' };
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
    const response = await fetch(`${API_BASE}/api/ga4/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: window.__propertyId,
        reportType: 'standard',
        payload: {
          dateRanges: [dateRange(rangeEl.value)],
          dimensions: [{ name: 'customEvent:author' }, { name: 'pageTitle' }, { name: 'pagePath' }],
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 100000
        }
      })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || 'Não foi possível carregar o ranking de autores.');
    const authors = aggregateAuthorRows(data.rows);
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
