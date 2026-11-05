const API_BASE = window.SCC10_API_BASE || 'http://127.0.0.1:3001';
const statusEl = document.querySelector('#ranking-test-status');
const metaEl = document.querySelector('#ranking-test-meta');
const resultsEl = document.querySelector('#ranking-test-results');
const runButton = document.querySelector('#run-ranking-test');
const rangeSelect = document.querySelector('#ranking-test-range');
const selectors = {
  category: document.querySelector('#dimension-category'),
  author: document.querySelector('#dimension-author'),
  published: document.querySelector('#dimension-published')
};
let propertyId = null;
let metadata = [];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function candidatesFor(kind) {
  const terms = {
    category: ['categoria', 'categorias', 'category'],
    author: ['autor', 'author'],
    published: ['publicacao', 'publicado', 'published', 'data']
  }[kind];
  return metadata.filter(item => {
    const text = normalize(`${item.apiName} ${item.uiName} ${item.description}`);
    return terms.some(term => text.includes(term));
  });
}

function fillSelector(select, candidates) {
  select.innerHTML = '<option value="">Não selecionar</option>';
  candidates.forEach(item => {
    const option = document.createElement('option');
    option.value = item.apiName;
    option.textContent = `${item.uiName || item.apiName} — ${item.apiName}`;
    select.appendChild(option);
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function loadMetadata() {
  const configResponse = await fetch(`${API_BASE}/api/config`);
  const config = await configResponse.json();
  if (!config.configured || !config.propertyId) throw new Error('Backend ou propriedade GA4 não configurada.');
  propertyId = config.propertyId;

  const response = await fetch(`${API_BASE}/api/ga4/metadata?propertyId=${encodeURIComponent(propertyId)}`);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || 'Falha ao consultar os metadados.');

  metadata = (data.dimensions || []).map(item => ({
    apiName: item.apiName,
    uiName: item.uiName,
    description: item.description
  }));
  fillSelector(selectors.category, candidatesFor('category'));
  fillSelector(selectors.author, candidatesFor('author'));
  fillSelector(selectors.published, candidatesFor('published'));
  selectors.category.value = metadata.find(item => item.apiName === 'customEvent:categories')?.apiName || '';
  selectors.author.value = metadata.find(item => item.apiName === 'customEvent:author')?.apiName || '';
  selectors.published.value = metadata.find(item => item.apiName === 'customEvent:published_date')?.apiName || '';
  metaEl.textContent = `${metadata.length} dimensões carregadas. Selecione os campos encontrados e execute o relatório.`;
  statusEl.textContent = 'Metadados carregados';
  statusEl.className = 'config-status success';
  runButton.disabled = false;
}

async function runTest() {
  runButton.disabled = true;
  runButton.textContent = 'Consultando...';
  resultsEl.innerHTML = '<div class="dashboard-loading"><div class="loading-spinner"></div><p>Executando relatório histórico com os campos selecionados...</p></div>';
  try {
    const dimensions = ['pageTitle', ...Object.values(selectors).map(select => select.value).filter(Boolean)];
    const response = await fetch(`${API_BASE}/api/ga4/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        reportType: 'standard',
        payload: {
          dateRanges: [{ startDate: rangeSelect.value, endDate: 'today' }],
          dimensions: dimensions.map(name => ({ name })),
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 100
        }
      })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || 'Falha ao executar o relatório.');
    const headers = data.dimensionHeaders?.map(header => header.name) || dimensions;
    resultsEl.innerHTML = `<table class="ranking-table"><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}<th>Visualizações</th></tr></thead><tbody>${(data.rows || []).map(row => `<tr>${row.dimensionValues.map(value => `<td>${escapeHtml(value.value)}</td>`).join('')}<td>${escapeHtml(row.metricValues?.[0]?.value)}</td></tr>`).join('')}</tbody></table>`;
    statusEl.textContent = `${data.rowCount || 0} matérias retornadas no teste`;
    statusEl.className = 'config-status success';
  } catch (error) {
    resultsEl.innerHTML = `<div class="config-status error">${escapeHtml(error.message)}</div>`;
    statusEl.textContent = 'Teste não concluído';
    statusEl.className = 'config-status error';
  } finally {
    runButton.disabled = false;
    runButton.textContent = 'Executar teste';
  }
}

runButton.addEventListener('click', runTest);
loadMetadata().catch(error => {
  statusEl.textContent = error.message;
  statusEl.className = 'config-status error';
  metaEl.textContent = 'Não foi possível carregar os nomes técnicos das dimensões.';
});
