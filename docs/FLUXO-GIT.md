# Fluxo de branches e Pull Requests

- `master`: produção e branch padrão do GitHub. Recebe apenas PRs de promoção vindos de `develop` (ou correções urgentes revisadas).
- `develop`: integração e homologação. Recebe PRs das branches de trabalho.
- `feat/*`, `fix/*`, `docs/*`, `security/*`: branches curtas, sempre criadas a partir de `develop` atualizado.

## Nova melhoria

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feat/nome-da-melhoria
# editar, testar e commitar
git push -u origin HEAD
```

Abra uma PR com base `develop` (selecione a base explicitamente: o GitHub sugere a branch padrão `master`). Só faça merge após revisão e testes. Não faça commits diretos em `develop` ou `master`.

## Publicação

Depois de homologar `develop`, abra uma PR de `develop` para `master`. Se uma correção urgente partir de `master`, integre a mesma correção também em `develop` para evitar divergência.

## Migração inicial

`master` e `develop` foram criadas a partir do merge da PR #1; ambas começaram no mesmo commit. A branch antiga `main` deve permanecer até `master` ser definida como branch padrão no GitHub e as referências externas a `main` serem verificadas. Só depois considerar sua exclusão. Configure regras de proteção para exigir PRs em `master` e `develop`.
