# Status de continuidade — SCC10 Monitor Editorial

Atualizado em 6 de novembro de 2026.

## Ponto exato do projeto

- Branch de trabalho: `fix/remover-other-ranking`
- Commit atual: `30a53e0761966745f5faa25a33f63dde7f173cb8`
- Base da branch: `develop` no commit `34543ec0252e864557b3cd095eb1f53cad4b2103`
- Branch `master`: `34543ec0252e864557b3cd095eb1f53cad4b2103`
- Branch `develop`: `34543ec0252e864557b3cd095eb1f53cad4b2103`
- A branch de trabalho está publicada no GitHub.
- A branch de trabalho ainda não foi integrada em `develop`, `master` ou no container.

## O que foi feito nesta branch

- `(other)` do GA4 deixou de aparecer como notícia no ranking editorial.
- As visualizações de `(other)` continuam no denominador do portal.
- Fallback em lote implementado para consultar `pageTitle` e `pagePath` de títulos sem enriquecimento completo.
- Resultados negativos do fallback são armazenados para não repetir consulta a cada ciclo de 30 segundos.
- Teste automatizado criado para o payload do fallback.
- Documentação atualizada com o histórico, o estado do container e a validação local.

## Verificações realizadas

- 23 testes passaram.
- `npm run test:syntax` passou.
- `git diff --check` passou.
- Service Account local validada.
- Relatório GA4 real respondeu HTTP 200.
- Dashboard local carregou dados realtime.
- `(other)` não apareceu no ranking local.

## Executar em outro PC

Não copie credenciais para o Git. Coloque o JSON da Service Account em um caminho privado, por exemplo:

```text
C:\Users\<usuario>\AppData\Local\SCC10\secrets\ga4-service-account.json
```

Clone e selecione a branch:

```bash
git clone https://github.com/devclebson/scc10-ga4-dashboard.git
cd scc10-ga4-dashboard
git fetch origin
git switch --track origin/fix/remover-other-ranking
npm install
```

PowerShell, terminal do backend:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_FILE="$env:LOCALAPPDATA\SCC10\secrets\ga4-service-account.json"
$env:SCC10_PROPERTY_ID="309943616"
$env:SCC10_DB_PATH="data/scc10.sqlite"
$env:PORT="3001"
$env:HOST="127.0.0.1"
$env:NODE_ENV="development"
npm run backend
```

Segundo terminal, frontend:

```bash
npm run start
```

Abrir:

```text
http://localhost:3000/dashboard
```

O uso de `localhost` é importante no desenvolvimento porque a origem permitida do backend local é `http://localhost:3000`.

## Container

O container privado `192.168.0.71` está desligado para este ciclo de desenvolvimento. A última versão publicada nele é a `v1.0.1`, commit `34543ec`, na branch `master`, com HTTPS e login administrativo validados.

Não atualizar o container sem autorização explícita.

## Próximas etapas

1. Validar `ranking-teste.html` com os nomes técnicos atuais da propriedade.
2. Validar a aba `Histórico Local` após múltiplos ciclos.
3. Testar o fallback com um título que exista no relatório histórico, mas não no cache enriquecido.
4. Revisar o motivo pelo qual títulos muito recentes ainda não aparecem no relatório histórico do GA4.
5. Integrar a branch em `develop` somente após validação local.
6. Depois da homologação, promover `develop` para `master` e só então atualizar o container.
7. Remover código OAuth legado e restringir a regra sudo temporária do deploy.

## Regra de trabalho

Toda nova melhoria deve partir da `develop` atualizada, usar uma branch curta, passar por testes e registrar o resultado na documentação antes da integração.
