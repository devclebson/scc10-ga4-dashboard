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
- Versionamento visível implementado no dashboard, ranking e configuração (`v1.0.1`).
- Container LXC de homologação atualizado para o commit `34543ec` na branch `master`.
- HTTPS configurado no container `192.168.0.71` com certificado para o IP.
- Certificado confiado no Edge e Chrome, com acesso HTTPS validado.
- Login administrativo validado via HTTPS.
- `master` e `develop` sincronizadas no commit `34543ec`; branches temporárias removidas.

## Estado atual

O fluxo local validado em 12 de novembro de 2026 usa `run_project.py` para iniciar o Flask e o coletor manualmente. O acesso pela rede interna, login administrativo Flask, persistência das configurações e atualização realtime foram confirmados. A tarefa do Agendador de Tarefas foi desabilitada/removida; não há coleta automática pelo Windows neste modo.

O fluxo de produção local é:

```text
index.html
   ↓ verifica backend e GA4
configuracao.html  ← se houver erro de configuração
   ou
 dashboard.html     ← se a consulta GA4 for validada
```

O ranking realtime existente está funcionando com snapshots do backend. A branch atual contém a correção de `(other)` e o fallback de URL; ainda não foi integrada em `develop` nem publicada no container.

## Estado da evolução editorial

- `ranking-teste.html` criado para validar dimensões e metadados sem regressão.
- Cache de matérias integrado ao ranking realtime.
- Ranking com filtro de páginas não editoriais e seleção Top-N em dropdown.
- `materia.html` criada com origens de tráfego e detalhes históricos.
- `(other)` removido da lista editorial sem alterar o denominador do portal.
- Fallback em lote de `pageTitle`/`pagePath` implementado para títulos sem enriquecimento completo.
- Fallback de sitemap do SCC10 implementado para títulos recentes ainda ausentes no histórico do GA4.
- Dimensões técnicas identificadas:
  - `customEvent:categories` → Categorias;
  - `customEvent:author` → Autor;
  - `customEvent:published_date` → Data Publicação;
  - `customEvent:published_hour` → Hora Publicação.

## Próxima etapa imediata

- Comparar múltiplos ciclos Flask e Node no mesmo período e propriedade.
- Validar o wrapper/agendamento externo em SQLite isolado.
- Validar retenção e backup do SQLite em operação contínua.
- Fazer a validação visual completa das telas Flask antes do corte.
- Não migrar dados históricos do projeto Node para o novo projeto.
- Atualizar o inventário antes de arquivar qualquer arquivo do runtime Node.

Validações concluídas em 9 de novembro de 2026: `ranking-teste.html` retornou 392 dimensões e 114.506 registros; as dimensões técnicas de categoria, autor e publicação retornaram dados; o dashboard carregou dados realtime reais; o coletor manteve 500 snapshots; o Histórico Local foi confirmado após múltiplos ciclos; e o fallback retornou `/page/3445/` para `Página Inicial`.

A investigação dos títulos recentes sem URL mostrou que o título exibido no realtime pode não aparecer com correspondência exata no relatório histórico de 30 dias. O sistema agora consulta os sitemaps recentes do SCC10, usa somente caminhos encontrados no sitemap e mantém o fallback histórico do GA4 para os demais metadados.

Ranking de autores iniciado em `autores.html`: período mês atual, pódio, ranking por visualizações de matérias publicadas no período, publicações distintas por título e matéria de maior alcance. Autores antigos que apenas recebem tráfego de matérias antigas ficam fora do recorte. A primeira versão não trata a soma de usuários por matéria como usuários únicos do período.

## Migração Flask iniciada

- Branch `migration/flask-structure` criada a partir de `develop`.
- Flask 3.1 configurado em `requirements.txt`.
- `flask_app/` criado com application factory, rotas, templates base e repository SQLite.
- Menu compartilhado criado para Dashboard, Ranking, Autores e Configuração.
- Rotas `/dashboard`, `/ranking`, `/autores`, `/materias/<id>` e `/configuracao` validadas.
- `/api/dashboard/summary` já lê o snapshot mais recente e a quantidade real de matérias do SQLite existente.
- Dashboard realtime migrado para o template Flask: cards de leitores/visualizações, notícias mais lidas, canais do dia e série por minuto.
- Ranking editorial migrado para `/ranking`, com rota `/api/ranking`, limite Top-N e tabela baseada no snapshot mais recente.
- Ranking de autores migrado para `/autores`, com rota `/api/autores`, filtros Hoje/7 dias/Mês atual/90 dias e pódio visual.
- Análise individual migrada para `/materias/<id>`, com rota `/api/materias/<id>`, metadados da matéria e fallback realtime do snapshot local.
- A análise Flask informa explicitamente que as origens históricas ainda aguardam o serviço GA4 Python.
- O serviço Flask resolve o perfil e a foto dos três primeiros pelo HTML público de matéria/página de autor do SCC10, sem API WordPress, e grava cache em `author_profiles` por 24 horas.
- O pódio usa iniciais automaticamente quando a imagem externa falha ou o portal bloqueia o acesso.
- Atualização manual e automática a cada 30 segundos implementadas na tela Flask.
- Backend Node.js e coletor GA4 permanecem intactos durante a migração.
- Serviço de relatórios históricos GA4 Flask integrado ao dashboard com sete relatórios e cache.
- Controle local de quota histórica Flask implementado e exposto no diagnóstico.
- Serviço de coleta realtime Flask implementado com parser, snapshots e `collector_runs`.
- Comando `run_flask_collector.py` validado em ciclo único e dois ciclos sequenciais em SQLite isolado.
- Login administrativo Flask validado visualmente em `/configuracao/admin`.
- Configuração Flask editável criada para propriedade, período padrão e comparação.
- Rotas protegidas `/api/config/admin` implementadas com persistência em `app_settings`.
- Validação automatizada cobre leitura, gravação, persistência e entradas inválidas.
- Hash da senha e `FLASK_SECRET_KEY` configurados por ambiente, sem armazenamento no repositório.
- Inventário de arquivos transitórios e candidatos a arquivamento registrado em `docs/INVENTARIO-ARQUIVAMENTO.md`.

Próxima fatia: liberar a edição protegida de configurações no Flask, reutilizando a tabela `app_settings` sem duplicar o coletor.

## Backend e coleta

- Coletor independente do navegador implementado no backend.
- Coleta realtime agendada a cada 30 segundos quando a Service Account e a propriedade estão configuradas.
- Salvar snapshots mesmo sem o dashboard aberto.
- Registrar duração, erro e última execução.
- Implementar limpeza e retenção do SQLite.

## Segurança e operação

- Login administrativo validado via HTTPS em `NODE_ENV=production`; remover o fallback `SCC10_ADMIN_TOKEN` após a migração.
- Substituir o certificado autoassinado por certificado de CA interna ou DNS confiável antes de exposição ampliada.
- Remover gradualmente o OAuth legado do frontend.
- Restringir CORS e endpoints administrativos.
- Criar backup automático do SQLite.
- Configurar inicialização automática do backend.

## Dados por matéria

- Criar tabela `articles`.
- Sincronizar metadados do CMS ou relatório GA4.
- Criar histórico de audiência por matéria.
- Exibir categoria, autor, data, URL, pico e crescimento.

O fallback de URL foi implementado localmente. Os títulos muito recentes que ainda não aparecem no relatório histórico do GA4 continuam sem URL por limitação da fonte, não por associação aproximada; não devemos fabricar caminhos.

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

## Evolução visual e resiliência GA4 — 12 de novembro de 2026

- Gráficos de rosca adicionados em Redes sociais e Público para composição percentual com poucas categorias.
- Gráfico de barras empilhadas adicionado em Aquisição para mostrar a composição diária por canal.
- Barras horizontais permanecem como padrão para rankings e comparações detalhadas.
- Consulta `channelDaily` adicionada ao catálogo histórico para alimentar a composição temporal dos canais.
- Resposta HTTP 429 do GA4 passou a ser convertida em erro de quota explícito, sem traceback de baixo nível na aplicação.
- O loop do coletor registra a falha no `collector_runs`, informa o erro no ciclo e continua aguardando o próximo intervalo, preservando o processo Flask + coletor durante limites temporários de quota.
- A consulta da tela Aquisição foi validada novamente com 7 dias, 10 canais e HTTP 200.

Próxima etapa: observar o coletor por múltiplos ciclos após a recuperação da quota e, somente depois, considerar novos formatos como heatmap ou funil quando houver contrato de dados confiável.
