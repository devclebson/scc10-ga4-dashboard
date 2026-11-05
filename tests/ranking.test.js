import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankingArticles, buildRankingRowsHtml, canOpenRanking, readRankingSnapshot, shouldRefreshRanking } from '../src/js/dashboard/ranking.js';

test('ranking preserva somente matérias e calcula tendência entre coletas', () => {
  const pages = [
    { title: 'Página Inicial', users: 100, views: 110 },
    { title: 'Notícia importante', users: 12, views: 20 },
    { title: 'Rádio Clube', users: 9, views: 10 },
    { title: 'Outra notícia', users: 3, views: 5 }
  ];
  const first = buildRankingArticles(pages, new Map());
  assert.deepEqual(first.articles.map(article => [article.title, article.trend]), [
    ['Notícia importante', 'stable'],
    ['Outra notícia', 'stable']
  ]);
  const second = buildRankingArticles([
    { title: 'Notícia importante', users: 18, views: 25 },
    { title: 'Outra notícia', users: 2, views: 6 }
  ], first.rankings);
  assert.deepEqual(second.articles.map(article => article.trend), ['hot', 'down']);
  assert.equal(second.rankings.get('Notícia importante'), 18);
  assert.equal(first.rankings.get('Notícia importante'), 12);
});

test('ranking lê os dados do snapshot local sem consultar GA4', () => {
  const snapshot = {
    captured_at: '2026-11-05T14:00:00.000Z',
    payload_json: JSON.stringify({ topPages: [
      { title: 'Página Inicial', users: 30, views: 32 },
      { title: 'Notícia importante', users: 8, views: 11 }
    ] })
  };
  const result = readRankingSnapshot(snapshot);
  assert.equal(result.capturedAt, snapshot.captured_at);
  assert.deepEqual(result.articles.map(article => article.title), ['Notícia importante']);
  assert.equal(result.articles[0].trend, 'stable');
  assert.throws(() => readRankingSnapshot({ payload_json: '{}' }), /ranking/i);
});

test('ranking cria link de análise e protege o título no HTML', () => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createTextNode: text => ({ text }),
    createElement: () => ({
      appendChild(node) {
        this.innerHTML = node.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
      }
    })
  };
  try {
    const html = buildRankingRowsHtml([
      { title: '<Notícia>', users: 12, views: 20, url: '/noticia', trend: 'hot' }
    ], 40, '309943616');
    assert.match(html, /&lt;Notícia&gt;/);
    assert.doesNotMatch(html, /<Notícia>/);
    assert.match(html, /materia\.html#propertyId=309943616/);
    assert.match(html, /50\.0%/);
    assert.match(html, /Em Alta/);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('ranking completo só abre para a propriedade coletada pelo backend', () => {
  assert.equal(canOpenRanking('properties/309943616', '309943616', false), true);
  assert.equal(canOpenRanking('properties/123', '309943616', false), false);
  assert.equal(canOpenRanking('properties/309943616', null, false), false);
  assert.equal(canOpenRanking('properties/309943616', '309943616', true), false);
});

test('ranking busca a primeira coleta mesmo quando a aba inicia oculta', () => {
  assert.equal(shouldRefreshRanking({ loading: false, hidden: true, capturedAt: '', propertyId: '309943616' }), true);
  assert.equal(shouldRefreshRanking({ loading: false, hidden: true, capturedAt: '2026-11-05T14:00:00Z', propertyId: '309943616' }), false);
  assert.equal(shouldRefreshRanking({ loading: true, hidden: false, capturedAt: '', propertyId: '309943616' }), false);
  assert.equal(shouldRefreshRanking({ loading: false, hidden: false, capturedAt: '', propertyId: '' }), false);
});
