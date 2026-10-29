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
```

```text
index.html
src/
├── css/
│   └── app.css
└── js/
    └── app.js
```

As bibliotecas visuais estão instaladas localmente pelo npm:

- Chart.js
- D3.js
- D3 Sankey

O Google Identity Services ainda é carregado externamente. Essa dependência será removida quando a autenticação for transferida para o backend.

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

O fluxo principal usa Service Account no backend. O OAuth do navegador permanece apenas como fallback legado no `app.js` durante a migração.

### Fluxo de inicialização

```text
index.html
   ├── backend indisponível/configuração inválida → configuracao.html
   └── consulta GA4 válida → dashboard.html
```

### Área administrativa

`configuracao.html` administra propriedade GA4, período padrão, comparação e intervalo do coletor. Os valores são persistidos na tabela `app_settings`. O token administrativo é recebido apenas em memória e nunca salvo no navegador.

### Ranking enriquecido

`ranking-teste.html` consulta os metadados da propriedade e permite testar a combinação de `pageTitle`, categoria, autor e data de publicação com `screenPageViews`, sem alterar o ranking realtime existente.

## Regras de segurança

- Não salvar access tokens no `localStorage` na arquitetura final.
- Não versionar `.env` ou credenciais.
- Usar apenas permissões de leitura do GA4.
- Não colocar credenciais de Service Account no frontend.
- Não versionar arquivos JSON de Service Account.
- Proteger endpoints administrativos com `SCC10_ADMIN_TOKEN` em produção.
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
