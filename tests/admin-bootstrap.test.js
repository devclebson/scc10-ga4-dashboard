import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const directory = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'scc10-bootstrap-test-'));
process.env.SCC10_DB_PATH = join(directory, 'test.sqlite');
const auth = await import('../server/services/admin-auth.js');
const database = await import('../server/db.js');

test('criação interativa aceita senha forte uma vez e não substitui usuário existente', () => {
  try {
    assert.throws(() => auth.bootstrapAdminUser('admin', 'curta'), /16/);
    assert.equal(auth.bootstrapAdminUser('admin', 'senha-sintetica-com-mais-de-16'), true);
    assert.ok(auth.login('admin', 'senha-sintetica-com-mais-de-16'));
    assert.throws(() => auth.bootstrapAdminUser('outro', 'senha-sintetica-com-mais-de-16'), /já existe/i);
  } finally {
    database.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
