# Inventário de arquivos e arquivamento legado

Atualizado em 9 de novembro de 2026.

## Regra de arquivamento

Nenhum arquivo deve ser movido ou removido somente por parecer antigo. Antes do arquivamento:

1. buscar referências no código, testes, scripts, deploy e documentação;
2. confirmar se o processo em produção ainda usa o arquivo;
3. validar a substituição no Flask;
4. executar testes e validação visual;
5. criar uma etapa isolada de arquivamento;
6. manter o histórico Git preservado.

A pasta de legado deve ficar fora do caminho de execução principal e não pode conter credenciais ou cópias de bancos SQLite ativos.

## Manter ativo agora

### Runtime Flask

- `run_flask.py`;
- `flask_app/`;
- `requirements.txt`;
- `tests/test_flask_app.py`;
- `tests/test_author_profile.py`;
- `data/` como banco de execução local, sem versionamento.

### Runtime Node de transição

- `server/`;
- `package.json` e `package-lock.json`;
- `scripts/build-static.mjs`;
- `tests/*.test.js`;
- `src/`;
- entradas HTML ainda usadas pelo Node ou pelo deploy atual;
- `deploy/` enquanto o container continuar executando o serviço Node.

Esses arquivos ainda participam do coletor, da integração GA4, dos testes e do deploy. Não devem ser arquivados nesta etapa.

## Manter temporariamente, mas revisar

- `index.html`;
- `dashboard.html`;
- `configuracao.html`;
- `ranking.html`;
- `ranking-teste.html`;
- `materia.html`;
- `autores.html`;
- `src/js/app.js`;
- `src/js/config-app.js`;
- `src/js/services/auth.js`;
- `src/js/services/storage.js`;
- `dist/`.

Motivo: ainda existem referências em outras páginas, scripts de build, testes, documentação ou processo de deploy. A remoção só deve ocorrer após o corte oficial para Flask.

## Candidatos futuros a arquivamento

Somente após a migração correspondente:

- tela administrativa Node `configuracao.html` e `src/js/config-app.js`;
- fallback OAuth `src/js/services/auth.js`;
- módulos de storage do frontend que não tiverem mais referências;
- artefatos `dist/` gerados pelo fluxo antigo;
- scripts de bootstrap e rotação de senha Node, quando a administração Flask for oficial;
- API administrativa Node, quando o worker e os serviços Flask substituírem suas funções.

## Não arquivar sem substituição confirmada

- `server/server.js`;
- `server/db.js`;
- `server/services/google-auth.js`;
- `server/services/ga4-client.js`;
- `server/services/article-metadata.js`;
- `deploy/scc10-api.service`;
- testes Node relacionados a autenticação, quota, cache, ranking e deploy.

Esses arquivos sustentam a operação de transição e são referência de comportamento para a migração Flask.

## Condição para a primeira limpeza

A primeira movimentação segura só poderá ocorrer quando:

- as telas Flask substituírem as entradas HTML correspondentes;
- o deploy apontar para Flask;
- o coletor continuar validado sem o frontend antigo;
- as referências forem removidas ou atualizadas;
- `npm test`, testes Flask e validação visual passarem;
- o commit de arquivamento puder ser revertido sem perda de dados.

Até lá, o diretório legado não deve ser criado com cópias dos arquivos ativos. O inventário é a etapa correta antes da movimentação.
