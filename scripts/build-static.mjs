import { copyFileSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const output = join(root, 'dist');
const pages = ['index.html', 'dashboard.html', 'configuracao.html', 'ranking-teste.html', 'materia.html'];
const assets = ['assets/images/scc10-mark.jpg', 'assets/images/scc10-logo.png'];
const sourceFiles = [
  'src/css/app.css', 'src/js/api-base.js', 'src/js/app.js', 'src/js/config-app.js',
  'src/js/materia.js', 'src/js/ranking-test.js', 'src/js/state.js',
  'src/js/services/analytics-api.js', 'src/js/services/auth.js', 'src/js/services/storage.js',
  'src/js/utils/formatters.js'
];
const vendor = [
  'node_modules/chart.js/dist/chart.umd.js',
  'node_modules/d3/dist/d3.min.js',
  'node_modules/d3-sankey/dist/d3-sankey.min.js'
];
const publicFiles = [...pages, ...assets, ...sourceFiles, ...vendor];

for (const file of publicFiles) {
  let source = root;
  for (const part of file.split('/')) {
    source = join(source, part);
    if (lstatSync(source).isSymbolicLink()) throw new Error(`Link simbólico proibido no build público: ${file}`);
  }
  if (!lstatSync(source).isFile()) throw new Error(`Recurso público inválido: ${file}`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of publicFiles) {
  const destination = join(output, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, file), destination);
}
console.log('Arquivos públicos criados em dist/; servidor, banco, ambiente e Git não foram incluídos.');
