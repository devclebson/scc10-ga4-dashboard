# SCC10 Monitor Editorial — Roadmap

## Concluído

- Auditoria inicial do projeto.
- Interface em português brasileiro preservada.
- Modo TV preservado.
- CSS e JavaScript extraídos do HTML principal.
- Chart.js, D3.js e D3 Sankey instalados localmente.
- Estado, formatadores, storage, autenticação e API separados em módulos.
- Access token removido do `localStorage`.
- Backend Node.js criado.
- SQLite criado para snapshots realtime.
- Histórico local com gráfico, tabela e filtros predefinidos/personalizados.
- Menu de abas substituído por menu hambúrguer.
- Filtros globais com Hoje e Personalizado.
- Logo SCC10 adicionada ao dashboard.
- Service Account integrada ao backend.
- Consultas GA4 funcionando sem token do navegador.
- Entrada principal valida backend, configuração e dados GA4 antes da transição.
- Dashboard separado em `dashboard.html`.
- Área administrativa separada em `configuracao.html`.
- Configurações administrativas persistidas em `app_settings`.
- Estado visual de carregamento e erro adicionado ao dashboard.
- Tela isolada `ranking-teste.html` criada para testar metadados e dimensões de matérias.

## Estado atual

O fluxo de produção local é:

```text
index.html
   ↓ verifica backend e GA4
configuracao.html  ← se houver erro de configuração
   ou
 dashboard.html     ← se a consulta GA4 for validada
```

O ranking realtime existente não foi alterado. O teste enriquecido é executado separadamente para evitar regressões.

## Próxima etapa imediata

- Executar `ranking-teste.html` com a Service Account.
- Dimensões técnicas identificadas:
  - `customEvent:categories` → Categorias;
  - `customEvent:author` → Autor;
  - `customEvent:published_date` → Data Publicação;
  - `customEvent:published_hour` → Hora Publicação.
- Relatório histórico validado com `pageTitle`, as três dimensões personalizadas e `screenPageViews`.
- Próximo desenho: definir a junção desses metadados com o ranking realtime sem alterar a tela atual.

## Backend e coleta

- Criar coletor independente do navegador.
- Agendar coleta realtime a cada 30 segundos.
- Salvar snapshots mesmo sem o dashboard aberto.
- Registrar duração, erro e última execução.
- Implementar limpeza e retenção do SQLite.

## Segurança e operação

- Configurar `SCC10_ADMIN_TOKEN` em produção.
- Remover gradualmente o OAuth legado do frontend.
- Restringir CORS e endpoints administrativos.
- Criar backup automático do SQLite.
- Configurar inicialização automática do backend.

## Dados por matéria

- Criar tabela `articles`.
- Sincronizar metadados do CMS ou relatório GA4.
- Criar histórico de audiência por matéria.
- Exibir categoria, autor, data, URL, pico e crescimento.

## Validação

Cada etapa deve ser validada com:

- `npm run test:syntax`;
- `git diff --check`;
- teste visual em Chromium com `--headed`;
- teste do modo demonstração;
- verificação do console;
- teste sem o backend;
- teste com Service Account;
- verificação de regressões nas abas existentes.
