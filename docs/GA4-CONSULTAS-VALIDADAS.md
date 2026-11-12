# Consultas GA4 validadas

Data da validação: 12 de novembro de 2026
Propriedade testada: `309943616`
Período usado: `30daysAgo` até `yesterday`
Script repetível: `scripts/probe_ga4_catalog.py`

## Objetivo

Este documento registra consultas `runReport` realmente executadas contra a propriedade GA4 configurada no projeto. O objetivo é separar:

- dimensões e métricas que retornam dados;
- consultas que retornam muitos registros e precisam de paginação/limite;
- campos personalizados disponíveis para matérias;
- combinações que precisam ser evitadas ou testadas de forma incremental;
- fonte correta para cada tela do dashboard.

O script imprime somente o contrato da resposta: cabeçalhos, quantidade de linhas e presença de valores. Ele não imprime credenciais nem linhas brutas da propriedade.

## Como repetir a sondagem

No PowerShell, com o ambiente virtual ativo:

```powershell
.venv\Scripts\python.exe scripts\probe_ga4_catalog.py
```

Para testar outro intervalo sem alterar o script:

```powershell
$env:GA4_PROBE_START = '7daysAgo'
$env:GA4_PROBE_END = 'yesterday'
.venv\Scripts\python.exe scripts\probe_ga4_catalog.py
```

A consulta usa a Service Account configurada no processo e o `SCC10_PROPERTY_ID` do `.env`. Os resultados abaixo são um registro da execução real de 12/11/2026; quantidades podem mudar conforme o período e o processamento do GA4.

## Resultado da sondagem real

Todas as consultas abaixo retornaram HTTP 200 na última execução validada.

| Consulta | Dimensão(ões) | Métrica(s) | `rowCount` observado | Linhas retornadas | Uso no projeto |
|---|---|---|---:|---:|---|
| `overview_daily` | `date` | `sessions`, `activeUsers`, `screenPageViews`, `bounceRate`, `averageSessionDuration`, `engagedSessions`, `newUsers` | 30 | 30 | Visão Geral e gráfico diário |
| `channels` | `sessionDefaultChannelGroup` | `sessions`, `activeUsers`, `screenPageViews`, `newUsers`, `engagedSessions`, `engagementRate` | 10 | 10 | Aquisição por canal |
| `session_source_medium` | `sessionSourceMedium` | `sessions`, `activeUsers`, `screenPageViews`, `newUsers` | 173 | 25 | Aquisição por origem/mídia |
| `source_medium_sessions` | `sourceMedium` | `sessions` | 1 | 1 | Não usar como primeira opção; resultado pouco útil nesta propriedade |
| `source_medium_sessions_users` | `sourceMedium` | `sessions`, `activeUsers` | 1 | 1 | Mesmo comportamento reduzido observado |
| `first_user_source_medium` | `firstUserSourceMedium` | `newUsers`, `activeUsers`, `sessions` | 170 | 25 | Aquisição do primeiro contato do usuário |
| `campaigns` | `sessionCampaignName` | `sessions`, `activeUsers`, `screenPageViews` | 105 | 25 | Campanhas |
| `geo` | `country`, `region` | `sessions`, `activeUsers`, `screenPageViews` | 335 | 25 | Público por localização |
| `devices` | `deviceCategory`, `operatingSystem`, `browser` | `sessions`, `activeUsers`, `screenPageViews` | 56 | 25 | Público e dispositivos |
| `pages` | `pagePath`, `pageTitle` | `screenPageViews`, `activeUsers`, `sessions`, `averageSessionDuration`, `bounceRate`, `engagedSessions` | 124.792 | 25 | Conteúdo e páginas |
| `events` | `eventName` | `eventCount`, `totalUsers`, `keyEvents` | 12 | 12 | Eventos e conversões |
| `content_metadata` | `pageTitle`, `pagePath`, `customEvent:categories`, `customEvent:author`, `customEvent:published_date`, `customEvent:published_hour` | `screenPageViews`, `activeUsers` | 126.405 | 25 | Metadados editoriais e matérias |

A resposta também retornou `currencyCode: BRL` e `timeZone: America/Sao_Paulo` nos relatórios validados.

## Campos personalizados editoriais

Os quatro campos personalizados usados pelo projeto foram aceitos na mesma consulta:

```text
customEvent:categories
customEvent:author
customEvent:published_date
customEvent:published_hour
```

Na primeira página retornada da consulta de metadados editoriais, os campos apresentaram valores não vazios em aproximadamente:

- `customEvent:categories`: 20 de 25 linhas;
- `customEvent:author`: 20 de 25 linhas;
- `customEvent:published_date`: 22 de 25 linhas;
- `customEvent:published_hour`: 22 de 25 linhas.

Esses números são apenas da página retornada, não da totalidade de 126.405 linhas. Para sincronizar matérias, o projeto deve manter filtro editorial, limite/paginação e exclusão explícita de `(not set)`.

## Lições para as telas

### Visão Geral

Usar uma consulta diária com `date` e os seguintes campos:

```text
sessions
activeUsers
screenPageViews
bounceRate
averageSessionDuration
engagedSessions
newUsers
```

A tela deve somar ou transformar os dados com cuidado. `activeUsers` diário não deve ser somado para representar usuários únicos do período; para o KPI do período, usar uma linha agregada sem dimensão `date` ou uma consulta específica.

### Aquisição

Priorizar:

```text
sessionDefaultChannelGroup
sessionSourceMedium
firstUserSourceMedium
sessionCampaignName
```

A primeira consulta validada com `sourceMedium` e quatro métricas falhou com HTTP 400. As versões reduzidas com `sessions` e com `sessions + activeUsers` passaram, mas retornaram somente uma linha nesta propriedade. Por isso, a tela usa `sessionSourceMedium` como dimensão principal e deixa `sourceMedium` como investigação secundária.

### Público

As consultas validadas permitem criar uma tela com:

```text
country
region
deviceCategory
operatingSystem
browser
```

A combinação `country + region` retornou 335 linhas no período testado. A combinação de dispositivo retornou 56 linhas.

### Conteúdo

A consulta de páginas oferece:

```text
pagePath
pageTitle
screenPageViews
activeUsers
sessions
averageSessionDuration
bounceRate
engagedSessions
```

Como o resultado teve 124.792 linhas e o limite usado foi 25, `rowCount` precisa ser comparado ao limite. Não se deve chamar a soma das linhas retornadas de total do portal sem paginação ou sem um denominador separado.

### Matérias e autores

A consulta `content_metadata` confirma que os campos personalizados editoriais estão disponíveis. Ela deve ser usada para sincronização/cache, não repetida a cada atualização realtime. O cache SQLite continua sendo a fonte da tela Conteúdo e do ranking enquanto a sincronização histórica não for executada novamente.

### Eventos e conversões

A consulta de eventos retornou 12 eventos com:

```text
eventName
eventCount
totalUsers
keyEvents
```

A lista de eventos precisa ser analisada antes de transformar qualquer evento em conversão editorial. `keyEvents` só deve ser apresentado como conversão quando o evento estiver configurado como evento-chave na propriedade.

## Limites e cuidados observados

- `rowCount` é o total encontrado; `rowsReturned` é o que veio nesta página. Quando os números diferem, a consulta precisa de paginação, limite maior ou filtro.
- A API retornou cabeçalhos de dimensão e métrica separados. O parser deve associar cada valor pela posição do cabeçalho.
- Datas relativas como `30daysAgo` e `yesterday` facilitam testes repetíveis, mas o documento deve registrar o intervalo usado.
- Consultas históricas devem continuar sob demanda e com cache. A sondagem executou várias chamadas reais e não deve ser ligada ao ciclo de 30 segundos do coletor realtime.
- `propertyQuota` não veio nas respostas porque o payload não solicitou `returnPropertyQuota`. Se a tela Operação precisar mostrar quota, isso deve ser ativado explicitamente em uma consulta controlada.
- A disponibilidade de uma dimensão não garante que a combinação com qualquer métrica seja aceita. Testar primeiro uma combinação mínima e adicionar métricas gradualmente.
- Dimensões e métricas personalizadas devem ser confirmadas pelo Metadata API antes de serem incorporadas a novas telas.

## Catálogo inicial recomendado

| Área | Dimensões principais | Métricas principais | Status |
|---|---|---|---|
| Realtime | `unifiedScreenName`, `minutesAgo` | `activeUsers`, `screenPageViews` | Já usado no coletor |
| Visão Geral | `date` | sessões, usuários, visualizações, engajamento, duração, novos usuários | Validado |
| Aquisição | canal, `sessionSourceMedium`, campanha | sessões, usuários, visualizações, novos usuários, sessões engajadas | Validado |
| Público | país, região, dispositivo, sistema, navegador | sessões, usuários, visualizações | Validado |
| Conteúdo | página, título, categorias, autor, data/hora de publicação | visualizações, usuários, sessões, duração, rejeição, sessões engajadas | Validado |
| Eventos | `eventName` | `eventCount`, `totalUsers`, `keyEvents` | Validado |
| Conversões | `eventName` | `conversions`, `sessions` | Payload já previsto; validar em próxima rodada |

## Fontes oficiais

- Google Analytics Data API — criar relatórios com `runReport`: https://developers.google.com/analytics/devguides/reporting/data/v1/basics
- Google Analytics Data API — visão geral, resposta, `batchRunReports` e Metadata API: https://developers.google.com/analytics/devguides/reporting/data/v1
- Google Analytics Data API — uso avançado e dimensões/métricas personalizadas: https://developers.google.com/analytics/devguides/reporting/data/v1/advanced
- Google Analytics Data API — Realtime: https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-basics
