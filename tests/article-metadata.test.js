import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArticlePathLookupPayload } from '../server/services/article-metadata.js';
import { parseSitemapEntries, parseSitemapIndexEntries, resolveSitemapPaths } from '../server/services/sitemap.js';

test('fallback de URLs consulta títulos distintos por filtro exato', () => {
  const payload = buildArticlePathLookupPayload([
    'Notícia A',
    'Notícia A',
    '  Notícia B  ',
    ''
  ]);

  assert.deepEqual(payload.dimensions, [{ name: 'pageTitle' }, { name: 'pagePath' }]);
  assert.equal(payload.metrics[0].name, 'screenPageViews');
  assert.deepEqual(
    payload.dimensionFilter.orGroup.expressions.map(expression => expression.filter.stringFilter.value),
    ['Notícia A', 'Notícia B']
  );
  assert.equal(payload.limit, 2);
});

test('sitemap resolve URL real sem fabricar caminho', () => {
  const index = '<sitemap><loc>https://scc10.com.br/post-sitemap107.xml</loc><lastmod>2026-11-09T13:57:06+00:00</lastmod></sitemap>';
  const xml = '<url><loc>https://scc10.com.br/cotidiano/educacao/estudante-de-16-anos-morre-apos-passar-mal-durante-o-primeiro-dia-de-prova-do-enem-2026/</loc></url>';
  const entries = parseSitemapIndexEntries(index);
  assert.equal(entries[0].loc, 'https://scc10.com.br/post-sitemap107.xml');
  const urls = parseSitemapEntries(xml);
  assert.deepEqual(resolveSitemapPaths([
    'Estudante de 16 anos morre após passar mal durante o primeiro dia de prova do Enem 2026'
  ], urls), {
    'Estudante de 16 anos morre após passar mal durante o primeiro dia de prova do Enem 2026': '/cotidiano/educacao/estudante-de-16-anos-morre-apos-passar-mal-durante-o-primeiro-dia-de-prova-do-enem-2026/'
  });
});
