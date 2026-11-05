import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportCache } from '../server/services/report-cache.js';

test('reutiliza relatório histórico válido sem repetir a chamada externa', async () => {
  let now = 1000;
  const cache = createReportCache({ ttlMs: 300000, now: () => now });
  const key = { propertyId: '309943616', payload: { dateRanges: [{ startDate: 'today', endDate: 'today' }] } };
  let calls = 0;
  const loader = async () => { calls += 1; return { status: 200, data: { rows: [{ value: calls }] } }; };
  assert.equal((await cache.get(key, loader)).data.rows[0].value, 1);
  assert.equal((await cache.get(key, loader)).data.rows[0].value, 1);
  assert.equal(calls, 1);
  assert.equal(cache.stats().hits, 1);
  now += 300001;
  assert.equal((await cache.get(key, loader)).data.rows[0].value, 2);
  assert.equal(calls, 2);
});

test('isola propriedade e período e unifica requisições simultâneas', async () => {
  const cache = createReportCache({ ttlMs: 300000 });
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { status: 200, data: { rowCount: calls } };
  };
  const a = { propertyId: '309943616', payload: { date: 'today' } };
  const same = await Promise.all([cache.get(a, loader), cache.get(a, loader), cache.get(a, loader)]);
  assert.deepEqual(same.map(result => result.data.rowCount), [1, 1, 1]);
  assert.equal(calls, 1);
  assert.equal(cache.stats().coalesced, 2);
  await cache.get({ propertyId: '1', payload: a.payload }, loader);
  await cache.get({ propertyId: a.propertyId, payload: { date: 'yesterday' } }, loader);
  assert.equal(calls, 3);
});

test('não armazena erros de quota nem falhas de rede', async () => {
  const cache = createReportCache({ ttlMs: 300000 });
  let calls = 0;
  const key = { propertyId: '309943616', payload: {} };
  const loader = async () => {
    calls += 1;
    if (calls === 1) return { status: 429, data: { error: { message: 'Quota' } } };
    if (calls === 2) throw new Error('Falha de rede');
    return { status: 200, data: { rows: [] } };
  };
  assert.equal((await cache.get(key, loader)).status, 429);
  await assert.rejects(cache.get(key, loader), /Falha de rede/);
  assert.equal((await cache.get(key, loader)).status, 200);
  assert.equal((await cache.get(key, loader)).status, 200);
  assert.equal(calls, 3);
});

test('um 429 síncrono libera a chave para a próxima tentativa', async () => {
  const cache = createReportCache();
  const key = { propertyId: '309943616', payload: { date: 'today' } };
  await assert.rejects(cache.get(key, () => { throw new Error('429'); }), /429/);
  assert.equal(cache.stats().inFlight, 0);
  const result = await cache.get(key, () => ({ status: 200, data: { rowCount: 1 } }));
  assert.equal(result.data.rowCount, 1);
  assert.equal(cache.stats().misses, 2);
});

test('atualização manual revalida o relatório e substitui o cache', async () => {
  const cache = createReportCache({ ttlMs: 300000 });
  const key = { propertyId: '309943616', payload: { date: 'today' } };
  let calls = 0;
  const loader = async () => ({ status: 200, data: { value: ++calls } });
  assert.equal((await cache.get(key, loader)).data.value, 1);
  assert.equal((await cache.get(key, loader, { forceRefresh: true })).data.value, 2);
  assert.equal((await cache.get(key, loader)).data.value, 2);
  assert.equal(calls, 2);
});
