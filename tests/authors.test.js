import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateAuthorRows } from '../src/js/authors-data.js';

test('agrupa visualizações e publicações por autor', () => {
  const result = aggregateAuthorRows([
    { dimensionValues: [{ value: 'Ana' }, { value: 'Matéria A' }, { value: '/a/' }], metricValues: [{ value: '10' }, { value: '100' }] },
    { dimensionValues: [{ value: 'Ana' }, { value: 'Matéria A' }, { value: '/a/' }], metricValues: [{ value: '2' }, { value: '20' }] },
    { dimensionValues: [{ value: 'Ana' }, { value: 'Matéria B' }, { value: '/b/' }], metricValues: [{ value: '8' }, { value: '50' }] },
    { dimensionValues: [{ value: 'Bruno' }, { value: 'Matéria C' }, { value: '/c/' }], metricValues: [{ value: '20' }, { value: '120' }] },
    { dimensionValues: [{ value: '(not set)' }, { value: 'Sem autor' }], metricValues: [{ value: '99' }, { value: '999' }] }
  ]);

  assert.deepEqual(result.map(author => [author.author, author.publications, author.views]), [
    ['Ana', 2, 170],
    ['Bruno', 1, 120]
  ]);
  assert.equal(result[0].topArticle.title, 'Matéria A');
});
