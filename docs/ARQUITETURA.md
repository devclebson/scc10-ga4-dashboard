# SCC10 Monitor Editorial — Arquitetura

## Objetivo

Dashboard editorial para acompanhamento de audiência do portal SCC10 usando Google Analytics 4.

## Estado atual

A aplicação ainda é um frontend estático, mas sua estrutura inicial foi separada:

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

O backend Node.js em `server/` já fornece a base para:

- centralizar as chamadas à API GA4;
- registrar snapshots no SQLite;
- fornecer endpoints próprios para o frontend.

Nesta primeira versão, o frontend envia o access token em memória ao backend, que o utiliza apenas para encaminhar a requisição à Google. A próxima evolução substituirá esse fluxo por credenciais mantidas exclusivamente no servidor.

## Regras de segurança

- Não salvar access tokens no `localStorage` na arquitetura final.
- Não versionar `.env` ou credenciais.
- Usar apenas permissões de leitura do GA4.
- Não colocar credenciais de Service Account no frontend.
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
