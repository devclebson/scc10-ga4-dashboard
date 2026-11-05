import { escapeHtml } from '../utils/formatters.js';

const NON_ARTICLE_TITLES = new Set(['(not set)', 'página inicial', 'página não encontrada']);

export function canOpenRanking(selectedPropertyId, backendPropertyId, isDemo) {
  return !isDemo && Boolean(backendPropertyId)
    && String(selectedPropertyId || '').replace(/^properties\//, '') === String(backendPropertyId).replace(/^properties\//, '');
}

export function shouldRefreshRanking({ loading, hidden, capturedAt, propertyId }) {
  return !loading && Boolean(propertyId) && (!hidden || !capturedAt);
}

export function buildRankingArticles(pages, previousRankings = new Map()) {
  const rankings = new Map();
  const articles = [];
  for (const page of pages) {
    const title = page.title || 'SCC10 Notícia';
    const normalizedTitle = title.toLocaleLowerCase('pt-BR').trim();
    if (NON_ARTICLE_TITLES.has(normalizedTitle)
      || normalizedTitle.startsWith('ao vivo —')
      || normalizedTitle.includes('rádio clube')) continue;

    const users = Number(page.users) || 0;
    const views = Number(page.views) || 0;
    const prevUsers = previousRankings.get(title) ?? users;
    const trend = users > prevUsers + 4 ? 'hot'
      : users > prevUsers ? 'up'
      : users < prevUsers ? 'down' : 'stable';
    rankings.set(title, users);
    articles.push({ url: '', title, users, views, trend });
  }
  return { articles, rankings };
}

export function readRankingSnapshot(snapshot, previousRankings = new Map()) {
  const payload = JSON.parse(snapshot?.payload_json || '{}');
  if (!Array.isArray(payload.topPages)) throw new Error('Snapshot de ranking indisponível.');
  return { ...buildRankingArticles(payload.topPages, previousRankings), capturedAt: snapshot.captured_at };
}

export function buildRankingRowsHtml(articles, totalViews, propertyId) {
  if (!articles.length) {
    return '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma notícia ativa detectada nesta janela de 30 minutos.</td></tr>';
  }

  return articles.map((p, idx) => {
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    const pct = ((p.views / (totalViews || 1)) * 100).toFixed(1);

    let trendHtml = '<span class="article-trend trend-stable">Estável</span>';
    if (p.trend === 'hot') trendHtml = '<span class="article-trend trend-hot">🔥 Em Alta</span>';
    else if (p.trend === 'up') trendHtml = '<span class="article-trend trend-up">↑ Subindo</span>';
    else if (p.trend === 'down') trendHtml = '<span class="article-trend trend-down">↓ Caindo</span>';

    const fullUrl = p.url?.startsWith('https://') || p.url?.startsWith('http://')
      ? p.url : p.url?.startsWith('/') ? `https://scc10.com.br${p.url}` : null;
    const titleHtml = fullUrl
      ? `<a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" class="article-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</a>`
      : `<span class="article-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span>`;
    const urlHtml = p.url
      ? `<div class="article-url">${escapeHtml(p.url)}</div>`
      : '<div class="article-url">URL não disponível no relatório realtime</div>';
    const metadataParts = [
      p.category ? `<span class="article-meta-item"><strong>Categoria</strong> ${escapeHtml(p.category)}</span>` : null,
      p.author ? `<span class="article-meta-item"><strong>Autor</strong> ${escapeHtml(p.author)}</span>` : null,
      p.publishedAt ? `<span class="article-meta-item"><strong>Publicado</strong> ${escapeHtml(p.publishedAt)}</span>` : null
    ].filter(Boolean);
    const metadataHtml = metadataParts.length
      ? `<div class="article-meta">${metadataParts.join('')}</div>`
      : '<div class="article-meta article-meta-empty">Metadados históricos indisponíveis</div>';
    const detailUrl = p.url
      ? `materia.html#propertyId=${encodeURIComponent(propertyId || '')}&title=${encodeURIComponent(p.title)}&path=${encodeURIComponent(p.url)}`
      : null;
    const detailActionHtml = detailUrl
      ? `<a class="article-detail-action" href="${detailUrl}">Ver análise da matéria</a>`
      : '';

    return `
      <tr>
        <td><span class="rank-num ${rankClass}">${rank}</span></td>
        <td class="article-title-cell">
          ${titleHtml}
          ${metadataHtml}
          ${urlHtml}
          ${detailActionHtml}
        </td>
        <td style="text-align:right; font-weight:700; color:var(--success); font-size:16px;">
          ${p.users.toLocaleString('pt-BR')}
        </td>
        <td style="text-align:right; font-weight:600;">
          ${p.views.toLocaleString('pt-BR')}
        </td>
        <td style="text-align:right;">
          <span class="share-bar-container"><span class="share-bar-fill" style="width:${Math.min(Number(pct) * 3, 100)}%;"></span></span>
          <span style="font-size:12px; font-weight:600;">${pct}%</span>
        </td>
        <td style="text-align:center;">
          ${trendHtml}
        </td>
      </tr>
    `;
  }).join('');
}
