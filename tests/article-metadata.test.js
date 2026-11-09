import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArticlePathLookupPayload } from '../server/services/article-metadata.js';

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
