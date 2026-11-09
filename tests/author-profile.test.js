import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthorProfileHtml } from '../server/services/author-profile.js';

test('extrai perfil e foto do autor a partir do HTML público', () => {
  const html = `
    <a class="author-link" href="https://scc10.com.br/author/olgahelena/">Olga Helena de Paula</a>
    <img class="author-avatar" alt="Olga Helena de Paula" src="/wp-content/uploads/olga.webp">
  `;
  assert.deepEqual(parseAuthorProfileHtml(html, 'Olga Helena de Paula'), {
    profileUrl: 'https://scc10.com.br/author/olgahelena/',
    imageUrl: 'https://scc10.com.br/wp-content/uploads/olga.webp'
  });
});

test('retorna fallback vazio quando o HTML não tem perfil', () => {
  assert.deepEqual(parseAuthorProfileHtml('<main><img src="/hero.webp"></main>', 'Autor'), {
    profileUrl: null,
    imageUrl: null
  });
});
