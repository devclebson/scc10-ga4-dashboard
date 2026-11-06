import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

async function availablePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  probe.close();
  await once(probe, 'close');
  return port;
}

async function withBackend(origin, verify) {
  const directory = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'scc10-admin-http-'));
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production',
      SCC10_PUBLIC_ORIGIN: origin, SCC10_DB_PATH: join(directory, 'test.sqlite'),
      GOOGLE_SERVICE_ACCOUNT_FILE: '', SCC10_ADMIN_TOKEN: '', SCC10_ADMIN_USERNAME: '', SCC10_ADMIN_PASSWORD: ''
    },
    stdio: 'ignore'
  });
  try {
    const url = `http://127.0.0.1:${port}`;
    let started = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (child.exitCode !== null) throw new Error(`Backend encerrou: ${child.exitCode}`);
      try {
        const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(300) });
        started = response.ok;
        if (started) break;
      } catch { /* aguarda o servidor isolado */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(started, 'backend de teste não iniciou');
    await verify(url);
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    rmSync(directory, { recursive: true, force: true });
  }
}

test('produção por HTTP rejeita login antes de ler credenciais, mesmo com cabeçalho forjado', async () => {
  await withBackend('http://192.168.0.71', async url => {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, body: '{}'
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /HTTPS/);
    const admin = await fetch(`${url}/api/admin/config`);
    assert.equal(admin.status, 403);
    const session = await fetch(`${url}/api/auth/session`);
    assert.equal(session.status, 403);
    const sync = await fetch(`${url}/api/articles/sync`, { method: 'POST', body: '{}' });
    assert.equal(sync.status, 403);
  });
});

test('produção com proxy HTTPS confiável alcança validação normal do login', async () => {
  await withBackend('https://scc10.interno', async url => {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, body: '{}'
    });
    assert.equal(response.status, 401);
  });
});

test('formulário administrativo começa oculto até validar a origem', () => {
  const html = readFileSync(new URL('../configuracao.html', import.meta.url), 'utf8');
  assert.match(html, /id="admin-login" class="admin-form hidden"/);
});
