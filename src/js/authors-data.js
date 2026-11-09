function valueAt(row, index) {
  return row?.dimensionValues?.[index]?.value || '';
}

function metricAt(row, index) {
  return Number(row?.metricValues?.[index]?.value || 0);
}

export function aggregateAuthorRows(rows, { publishedFrom = '', publishedTo = '' } = {}) {
  const authors = new Map();
  for (const row of rows || []) {
    const author = valueAt(row, 0).trim();
    const title = valueAt(row, 1).trim();
    const publishedAt = valueAt(row, 3).trim();
    if (!author || author === '(not set)' || !title || title === '(not set)') continue;
    if (!publishedAt || (publishedFrom && publishedAt < publishedFrom) || (publishedTo && publishedAt > publishedTo)) continue;
    const views = metricAt(row, 1);
    const readers = metricAt(row, 0);
    const current = authors.get(author) || { author, views: 0, readers: 0, articleMap: new Map() };
    current.views += views;
    current.readers += readers;
    const article = current.articleMap.get(title) || { title, pagePath: valueAt(row, 2), views: 0 };
    article.views += views;
    if (!article.pagePath) article.pagePath = valueAt(row, 2);
    current.articleMap.set(title, article);
    authors.set(author, current);
  }
  return [...authors.values()]
    .map(author => {
      const articles = [...author.articleMap.values()].sort((a, b) => b.views - a.views);
      return {
        author: author.author,
        publications: articles.length,
        views: author.views,
        readers: author.readers,
        articles,
        topArticle: articles[0] || null
      };
    })
    .sort((a, b) => b.views - a.views);
}
