import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

function apiBase(location, override) {
  const source = readFileSync(new URL('../src/js/api-base.js', import.meta.url), 'utf8');
  const context = { window: { SCC10_API_BASE: override }, location };
  runInNewContext(source, context);
  return context.window.SCC10_API_BASE;
}

test('acesso remoto usa API no mesmo domínio HTTPS; desenvolvimento mantém porta 3001', () => {
  assert.equal(apiBase({ hostname: 'scc10.interno', port: '', origin: 'https://scc10.interno' }), 'https://scc10.interno');
  assert.equal(apiBase({ hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' }), 'http://localhost:3001');
  assert.equal(apiBase({ hostname: '127.0.0.1', port: '3000', origin: 'http://127.0.0.1:3000' }), 'http://127.0.0.1:3001');
  assert.equal(apiBase({ hostname: 'scc10.interno', port: '', origin: 'https://scc10.interno' }, 'https://api.interno'), 'https://api.interno');
});

test('origem pública exata é aceita; valores inválidos ou outras origens são rejeitados', async () => {
  const { createAllowedOrigins } = await import('../server/services/allowed-origins.js');
  const origins = createAllowedOrigins('https://scc10.interno');
  assert.equal(origins.has('https://scc10.interno'), true);
  assert.equal(origins.has('https://outro.interno'), false);
  assert.equal(origins.has('http://localhost:3000'), true);
  assert.throws(() => createAllowedOrigins('https://scc10.interno/rota'), /origem/i);
  assert.throws(() => createAllowedOrigins('https://scc10.interno@outro.interno'), /origem/i);
});

test('build estático publica somente recursos permitidos', () => {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'scc10-static-test-'));
  const files = [
    'index.html', 'dashboard.html', 'configuracao.html', 'ranking-teste.html', 'ranking.html', 'materia.html',
    'src/css/app.css', 'src/js/api-base.js', 'src/js/app.js', 'src/js/config-app.js',
    'src/js/materia.js', 'src/js/ranking-test.js', 'src/js/ranking-app.js', 'src/js/dashboard/ranking.js', 'src/js/state.js',
    'src/js/services/analytics-api.js', 'src/js/services/auth.js', 'src/js/services/storage.js',
    'src/js/utils/formatters.js', 'assets/images/scc10-logo.png', 'assets/images/scc10-mark.jpg',
    'node_modules/chart.js/dist/chart.umd.js', 'node_modules/d3/dist/d3.min.js',
    'node_modules/d3-sankey/dist/d3-sankey.min.js',
    '.env', 'server/db.js', 'data/scc10.sqlite', '.git/config',
    'src/js/.secret.js', 'assets/images/unlisted-credential.json'
  ];
  try {
    for (const file of files) {
      const dest = join(root, file);
      mkdirSync(dirname(dest), { recursive: true });
      const content = file.startsWith('src/js/') && file !== 'src/js/.secret.js'
        ? readFileSync(new URL(`../${file}`, import.meta.url)) : file;
      writeFileSync(dest, content);
    }
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/build-static.mjs', import.meta.url)), root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(root, 'dist', 'index.html')));
    assert.ok(existsSync(join(root, 'dist', 'src/js/app.js')));
    assert.ok(existsSync(join(root, 'dist', 'ranking.html')));
    assert.ok(existsSync(join(root, 'dist', 'src/js/ranking-app.js')));
    assert.ok(existsSync(join(root, 'dist', 'src/js/dashboard/ranking.js')));
    assert.match(readFileSync(join(root, 'dist', 'src/js/ranking-app.js'), 'utf8'), /from '\.\/dashboard\/ranking\.js'/);
    const pending = [join(root, 'dist', 'src/js/ranking-app.js')];
    const visited = new Set();
    while (pending.length) {
      const moduleFile = pending.pop();
      if (visited.has(moduleFile)) continue;
      visited.add(moduleFile);
      const source = readFileSync(moduleFile, 'utf8');
      for (const [, relative] of source.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const imported = join(dirname(moduleFile), relative);
        assert.ok(existsSync(imported), `Import não publicado: ${relative}`);
        pending.push(imported);
      }
    }
    assert.ok(visited.size >= 3, 'a árvore de módulos reais do ranking deve ser verificada');
    assert.ok(existsSync(join(root, 'dist', 'node_modules/chart.js/dist/chart.umd.js')));
    for (const file of ['.env', 'server/db.js', 'data/scc10.sqlite', '.git/config', 'src/js/.secret.js', 'assets/images/unlisted-credential.json']) {
      assert.equal(existsSync(join(root, 'dist', file)), false, file);
    }
    const source = join(root, 'src/js/app.js');
    rmSync(source);
    try {
      symlinkSync(join(root, '.env'), source);
    } catch (error) {
      if (['EPERM', 'EACCES'].includes(error.code)) return; // Windows sem permissão de symlink.
      throw error;
    }
    const unsafe = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/build-static.mjs', import.meta.url)), root], { encoding: 'utf8' });
    assert.notEqual(unsafe.status, 0, 'o build deve rejeitar symlink em arquivo permitido');
    assert.equal(lstatSync(join(root, 'dist/src/js/app.js')).isSymbolicLink(), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ranking publicado resolve a API na mesma origem do container', () => {
  const html = readFileSync(new URL('../ranking.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="src\/js\/api-base\.js"><\/script>/);
  assert.doesNotMatch(html, /SCC10_API_BASE\s*=.*127\.0\.0\.1/);
  assert.match(html, /recorte de até 60 páginas/);
});
