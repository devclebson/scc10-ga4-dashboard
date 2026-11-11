# Status de continuidade — SCC10 Monitor Editorial

Atualizado em 9 de novembro de 2026.

## Ponto exato do projeto

- Branch local de continuidade: `develop`.
- `develop`: `d545bc7c8dccdc9affc982146eabd27f2d617219`.
- `master`: `1cc438505e19f08e7b77154852f98a43fdf9c0cd`.
- PR #6 (`migration/flask-structure`) integrada em `develop`.
- PR #7 (`feat/flask-report-cache`) integrada em `develop`.
- PR #8 (`develop`) integrada em `master`.
- Branches finalizadas `migration/flask-structure`, `feat/flask-report-cache` e `fix/remover-other-ranking` removidas.
- Branches remotas existentes: `develop` e `master`.
- O container não foi atualizado neste ciclo.
- O worktree principal está limpo e sincronizado com `origin/develop`.

## O que está validado

- `(other)` do GA4 não aparece como notícia no ranking editorial.
- As visualizações de `(other)` continuam no denominador do portal.
- Fallback em lote de `pageTitle` e `pagePath` validado.
- Login administrativo Flask, sessão, CSRF e expiração validados.
- Diagnóstico operacional validado com coletor Node real e SQLite compartilhado.
- Relatório histórico de matéria validado com dados reais do GA4.
- Cache histórico Flask validado: primeira consulta gera `miss`, segunda consulta gera `hit`.
- Relatórios históricos Flask integrados ao dashboard: visão geral, canais, países, dispositivos, páginas, eventos e conversões.
- Limite local de quota histórica validado: 60 chamadas reais por janela de 60 segundos, com diagnóstico e HTTP 429.
- Coletor realtime Flask validado em SQLite isolado: ciclo único e dois ciclos sequenciais, ambos `success`, sem alterar o banco do Node.
- Wrapper PowerShell validado novamente com `-Cycles 1`, retenção e backup: snapshot salvo, backup legível e lock removido.
- Comparação isolada Flask x Node realizada na propriedade `309943616`: o primeiro snapshot quase simultâneo teve 77/421 leitores e 60 matérias nos dois; visualizações 30m ficaram em 602 no Flask e 603 no Node.
- Três ciclos Flask sequenciais foram gravados com 60 matérias por ciclo; a diferença posterior dos números realtime foi tratada como avanço normal da janela.
- Sincronização de metadados executada no SQLite novo do dashboard com `1daysAgo`: 1.179 linhas retornadas, 1.169 válidas e 1.133 matérias únicas em cache; dashboard confirmou o novo total visualmente.
- Tarefa local `SCC10 Flask Collector` registrada e executada pelo Agendador de Tarefas a cada 1 minuto; última execução validada com resultado `0`, `collector_runs=success`, 60 linhas e lock removido.
- Corte local concluído: nenhum backend/coletor Node está ativo nas portas locais; Flask e o Agendador de Tarefas são os caminhos ativos. O runtime Node permanece versionado para rollback e o container `192.168.0.71` não foi alterado.
- Observação pós-corte concluída: três execuções agendadas consecutivas retornaram `success`, 60 linhas cada, sem execuções perdidas, com 53 snapshots acumulados e lock removido.
- Testes Flask, Node, sintaxe JavaScript e `git diff --check` passaram.

## Verificações realizadas

- 23 testes passaram.
- `npm run test:syntax` passou.
- `git diff --check` passou.
- Service Account local validada.
- Relatório GA4 real respondeu HTTP 200.
- `run_flask_collector.py --loop --interval 15 --cycles 2` gravou dois snapshots e duas execuções `success` em banco temporário.
- Dashboard local carregou dados realtime.
- `(other)` não apareceu no ranking local.

## Executar em outro PC

Clone e prepare a branch principal:

```bash
git clone https://github.com/devclebson/scc10-ga4-dashboard.git
cd scc10-ga4-dashboard
git fetch origin
git switch develop
git pull --ff-only origin develop
npm install
```

Crie o ambiente Python e instale as dependências:

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

Não copie credenciais para o Git. Coloque o JSON da Service Account em um caminho privado, por exemplo:

```text
C:\Users\<usuario>\AppData\Local\SCC10\secrets\ga4-service-account.json
```

PowerShell, terminal do backend Node/coletor:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_FILE="$env:LOCALAPPDATA\SCC10\secrets\ga4-service-account.json"
$env:SCC10_PROPERTY_ID="309943616"
$env:SCC10_DB_PATH="data/scc10.sqlite"
$env:PORT="3001"
$env:HOST="127.0.0.1"
$env:NODE_ENV="development"
npm run backend
```

Segundo terminal, Flask:

```powershell
$env:FLASK_HOST="127.0.0.1"
$env:FLASK_PORT="5000"
$env:FLASK_DEBUG="false"
.venv\Scripts\python.exe run_flask.py
```

Para executar os testes sem chamar o GA4 real:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_FILE=$null
$env:GOOGLE_SERVICE_ACCOUNT_JSON=$null
.venv\Scripts\python.exe -m pytest -q
npm test
npm run test:syntax
```

Abrir:

```text
http://localhost:5000/dashboard
http://localhost:5000/configuracao
```

O uso de `localhost` é importante no desenvolvimento porque a origem permitida do backend local é `http://localhost:3000` quando o frontend Node for usado.

## Container

O container privado `192.168.0.71` está desligado para este ciclo de desenvolvimento. A última versão publicada nele é a `v1.0.1`, commit `34543ec`, na branch `master`, com HTTPS e login administrativo validados.

Não atualizar o container sem autorização explícita.

## Próximas etapas

1. Comparar múltiplos ciclos do worker Flask com o coletor Node no mesmo período.
2. Validar o wrapper/agendamento externo com `-Cycles 1` em SQLite isolado.
3. Validar retenção e backup do SQLite em ciclos contínuos.
4. Fazer a validação visual completa do Dashboard, Ranking, Autores, Matéria e Configuração.
5. Não migrar dados históricos do projeto Node: o novo projeto inicia seu cache a partir das próximas coletas do GA4.
6. Observar o Flask agendado por alguns ciclos e concluir a homologação visual.
7. Arquivar o runtime Node somente após essa observação, mantendo rollback versionado.
8. Não atualizar o container sem autorização explícita e validação visual.

As validações de `ranking-teste.html`, do relatório histórico, do fallback de URL, do Histórico Local, do dashboard realtime, do login administrativo e do cache histórico foram concluídas em 9 de novembro de 2026.

## Regra de trabalho

Toda nova melhoria deve partir da `develop` atualizada, usar uma branch curta, passar por testes e registrar o resultado na documentação antes da integração.
