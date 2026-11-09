import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const directory = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'scc10-collector-status-'));
process.env.SCC10_DB_PATH = join(directory, 'test.sqlite');
const database = await import(`../server/db.js?collector-status=${Date.now()}`);

test('registra sucesso e erro do coletor por propriedade', () => {
  try {
    const successId = database.startCollectorRun({
      propertyId: '123',
      startedAt: '2026-11-09T12:00:00.000Z'
    });
    database.finishCollectorRun(successId, {
      finishedAt: '2026-11-09T12:00:01.250Z',
      status: 'success',
      durationMs: 1250,
      snapshotId: 7,
      rowsCount: 4
    });

    const errorId = database.startCollectorRun({
      propertyId: '123',
      startedAt: '2026-11-09T12:01:00.000Z'
    });
    database.finishCollectorRun(errorId, {
      finishedAt: '2026-11-09T12:01:02.000Z',
      status: 'error',
      durationMs: 2000,
      errorMessage: 'GA4 indisponível'
    });

    const status = database.getCollectorStatus('123');
    assert.equal(status.lastStatus, 'error');
    assert.equal(status.lastError, 'GA4 indisponível');
    assert.equal(status.lastDurationMs, 2000);
    assert.equal(status.lastSuccessAt, '2026-11-09T12:00:01.250Z');
    assert.equal(status.lastSuccessRowsCount, 4);
    assert.equal(status.lastSuccessSnapshotId, 7);
  } finally {
    database.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
