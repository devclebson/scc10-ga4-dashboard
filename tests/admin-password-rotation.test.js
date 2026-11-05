import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const directory = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'scc10-admin-test-'));
process.env.SCC10_DB_PATH = join(directory, 'test.sqlite');
process.env.SCC10_ADMIN_USERNAME = 'rotation-fixture';
process.env.SCC10_ADMIN_PASSWORD = 'synthetic-initial-passphrase';

const auth = await import('../server/services/admin-auth.js');
const database = await import('../server/db.js');

test('rotation revokes sessions and rejects a login verified against the old hash', () => {
  try {
    assert.equal(auth.ensureBootstrapAdmin(), true);
    const user = database.findAdminUser('rotation-fixture');
    const session = auth.login('rotation-fixture', 'synthetic-initial-passphrase');
    assert.ok(session);

    auth.rotateAdminPassword('rotation-fixture', 'synthetic-rotated-passphrase');
    assert.equal(auth.getSessionUser({ headers: { cookie: `scc10_session=${session.token}` } }), null);

    const staleSession = database.createAdminSession({
      sessionHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      userId: user.id,
      passwordHash: user.password_hash,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    assert.equal(staleSession, false);
    assert.equal(auth.login('rotation-fixture', 'synthetic-initial-passphrase'), null);
    assert.ok(auth.login('rotation-fixture', 'synthetic-rotated-passphrase'));
  } finally {
    database.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
