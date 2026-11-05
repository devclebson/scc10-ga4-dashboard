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
- Service Account validada com relatório GA4 real sem token no navegador.
- Coletor realtime independente validado com snapshots gravados no SQLite.
- Dashboard validado visualmente com métricas e ranking reais.

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

## Estado da evolução editorial

- `ranking-teste.html` criado para validar dimensões e metadados sem regressão.
- Cache de matérias integrado ao ranking realtime.
- Ranking com filtro de páginas não editoriais e seleção Top-N em dropdown.
- `materia.html` criada com origens de tráfego e detalhes históricos.
- Dimensões técnicas identificadas:
  - `customEvent:categories` → Categorias;
  - `customEvent:author` → Autor;
  - `customEvent:published_date` → Data Publicação;
  - `customEvent:published_hour` → Hora Publicação.

## Próxima etapa imediata

- Validar `ranking-teste.html` com os nomes técnicos atuais da propriedade.
- Validar a aba `Histórico Local` após múltiplos ciclos do coletor.
- Remover código morto do fluxo OAuth legado depois da homologação.

## Backend e coleta

- Coletor independente do navegador implementado no backend.
- Coleta realtime agendada a cada 30 segundos quando a Service Account e a propriedade estão configuradas.
- Salvar snapshots mesmo sem o dashboard aberto.
- Registrar duração, erro e última execução.
- Implementar limpeza e retenção do SQLite.

## Segurança e operação

- Validar login administrativo em produção com `NODE_ENV=production` e remover o fallback `SCC10_ADMIN_TOKEN` após a migração.
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
