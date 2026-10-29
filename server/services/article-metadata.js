import { upsertArticle, findArticle } from '../db.js';
import { requestGa4Report } from './ga4-client.js';

const ARTICLE_DIMENSIONS = [
  'pageTitle',
  'pagePath',
  'customEvent:categories',
  'customEvent:author',
  'customEvent:published_date'
];

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function valueAt(row, index) {
  return row.dimensionValues?.[index]?.value || '';
}

export async function syncArticleMetadata(propertyId, startDate = '30daysAgo') {
  const result = await requestGa4Report({
    propertyId,
    reportType: 'standard',
    payload: {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: ARTICLE_DIMENSIONS.map(name => ({ name })),
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 100000
    }
  });
  if (result.status >= 400 || result.data.error) {
    throw new Error(result.data.error?.message || 'Falha ao sincronizar metadados das matérias.');
  }

  let saved = 0;
  for (const row of result.data.rows || []) {
    const title = valueAt(row, 0);
    const normalizedTitle = normalizeTitle(title);
    if (!title || !normalizedTitle || normalizedTitle === '(not set)') continue;
    upsertArticle({
      propertyId: String(propertyId).replace(/^properties\//, ''),
      title,
      normalizedTitle,
      pagePath: valueAt(row, 1),
      category: valueAt(row, 2),
      author: valueAt(row, 3),
      publishedAt: valueAt(row, 4),
      historicalViews: row.metricValues?.[0]?.value || 0
    });
    saved += 1;
  }
  return { fetched: result.data.rows?.length || 0, saved };
}

export function enrichArticle(propertyId, title) {
  const article = findArticle(String(propertyId).replace(/^properties\//, ''), normalizeTitle(title));
  if (!article) return null;
  return {
    category: article.category || null,
    author: article.author || null,
    publishedAt: article.published_at || null,
    pagePath: article.page_path || null,
    historicalViews: article.historical_views || 0
  };
}
