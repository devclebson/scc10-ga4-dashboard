# SCC10 Monitor Editorial — Arquitetura

## Objetivo

Dashboard editorial para acompanhamento de audiência do portal SCC10 usando Google Analytics 4.

## Estado atual

A aplicação possui quatro entradas separadas:

```text
index.html            → inicialização e verificação do backend/GA4
configuracao.html     → área administrativa
dashboard.html        → monitor e relatórios
ranking-teste.html    → teste isolado do ranking enriquecido
materia.html          → análise detalhada de uma matéria e suas origens
```

```text
.
├── index.html
├── dashboard.html
├── configuracao.html
├── ranking-teste.html
├── materia.html
├── src/
│   ├── css/app.css
│   └── js/
│       ├── app.js                 ← orquestração atual do dashboard
│       ├── state.js               ← estado compartilhado
│       ├── services/              ← API, storage e OAuth legado
│       └── utils/                 ← formatadores e escape HTML
├── server/
│   ├── server.js                  ← rotas HTTP e agendamentos
│   ├── db.js                      ← schema e acesso SQLite
│   └── services/                  ← GA4, autenticação e matérias
├── assets/images/                 ← identidade visual
├── data/                          ← SQLite local, ignorado pelo Git
└── docs/                          ← documentação operacional
```

As bibliotecas visuais estão instaladas localmente pelo npm:

- Chart.js
- D3.js
- D3 Sankey

O Google Identity Services ainda é carregado externamente apenas pelo fallback OAuth legado em `src/js/services/auth.js`. O fluxo principal não depende dele.

## Camadas planejadas

### Interface

Responsável por:

- layout;
- abas;
- modo TV;
- tabelas;
- gráficos;
- estados de carregamento e erro.

### Estado da aplicação

Responsável por:

- propriedade selecionada;
- período dos relatórios;
- dados históricos;
- dados realtime;
- modo demonstração;
- preferências da interface.

### Serviços

Responsáveis por:

- autenticação;
- Google Analytics Admin API;
- Google Analytics Data API;
- relatórios históricos;
- relatórios realtime.

### Utilitários

Responsáveis por:

- formatação de números e datas;
- normalização de URLs;
- exportação CSV;
- tratamento de erros;
- validações.

### Backend inicial

O backend Node.js em `server/` já fornece:

- centralizar as chamadas à API GA4;
- registrar snapshots no SQLite;
- fornecer endpoints próprios para o frontend;
- autenticar no GA4 por Service Account;
- armazenar configurações operacionais no SQLite;
- expor status, configuração administrativa e metadados do GA4.

O fluxo principal usa Service Account no backend. O OAuth do navegador permanece apenas como fallback legado no `app.js` durante a migração e deve ser removido após a confirmação de operação em produção.

### Fluxo de inicialização

```text
index.html
   ├── backend indisponível/configuração inválida → configuracao.html
   └── consulta GA4 válida → dashboard.html
```

### Área administrativa

`configuracao.html` administra propriedade GA4, período padrão, comparação e intervalo do coletor. Os valores são persistidos na tabela `app_settings`. O acesso administrativo usa usuário, senha com hash no SQLite e cookie de sessão `HttpOnly`; o token antigo permanece apenas como fallback temporário na API.

### Ranking enriquecido

`ranking-teste.html` consulta os metadados da propriedade e permite testar a combinação de `pageTitle`, categoria, autor e data de publicação com `screenPageViews`, sem alterar o ranking realtime existente.

O ranking operacional usa duas fontes:

```text
Realtime API
   └── leitores e visualizações atuais

Core Reporting API
   └── categoria, autor, publicação, URL e visualizações históricas

SQLite / articles
   └── cache local dos metadados das matérias
```

O cache é atualizado pelo endpoint administrativo `/api/articles/sync` e por uma rotina automática a cada 15 minutos. O coletor realtime do backend salva snapshots a cada 30 segundos. Os canais intraday são atualizados em cache por propriedade com intervalo maior para evitar consumo desnecessário da quota do GA4. O frontend usa o snapshot recente para evitar consultas realtime duplicadas e consulta diretamente o GA4 quando o snapshot estiver indisponível ou desatualizado. O frontend cruza os títulos do realtime com o cache por título normalizado; quando não existe correspondência, mantém o ranking e informa que os metadados históricos estão indisponíveis.

Os leitores ativos em 5 e 30 minutos vêm de duas `minuteRanges` na mesma consulta realtime, evitando somar usuários repetidos entre minutos. As rotas públicas de relatórios usam somente a propriedade configurada com um limite global de 60 consultas por minuto; o coletor recua por 15 minutos quando o GA4 informa esgotamento de quota.

Quando a matéria possui URL, o ranking apresenta o link `Ver análise da matéria`. A tela `materia.html` consulta `/api/articles/detail` e mostra a distribuição de visualizações por `sessionDefaultChannelGroup`, incluindo visualizações, sessões e participação percentual.

As imagens oficiais ficam em `assets/images/`, com nomes estáveis e sem depender de arquivos soltos na raiz.

## Regras de segurança

- Não salvar access tokens no `localStorage` na arquitetura final.
- Não versionar `.env` ou credenciais.
- Usar apenas permissões de leitura do GA4.
- Não colocar credenciais de Service Account no frontend.
- Não versionar arquivos JSON de Service Account.
- Proteger endpoints administrativos com login e sessão; o token antigo é apenas uma compatibilidade temporária a remover.
- Ativar `NODE_ENV=production` ao publicar para habilitar o atributo `Secure` do cookie.
- Diferenciar dados reais de dados de demonstração.

## Fluxo planejado

```text
Google Analytics
       │
       ▼
Backend Node.js
       │
       ├── Cache
       ├── SQLite
       └── API própria
              │
              ▼
Frontend do Monitor Editorial
```
