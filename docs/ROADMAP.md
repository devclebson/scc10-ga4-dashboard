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

- Validar visualmente a tela `autores.html` com o relatório histórico real.
- Remover código morto do fluxo OAuth legado depois da homologação.
- Restringir a regra sudo temporária criada para o usuário de deploy.

Validações concluídas em 9 de novembro de 2026: `ranking-teste.html` retornou 392 dimensões e 114.506 registros; as dimensões técnicas de categoria, autor e publicação retornaram dados; o dashboard carregou dados realtime reais; o coletor manteve 500 snapshots; o Histórico Local foi confirmado após múltiplos ciclos; e o fallback retornou `/page/3445/` para `Página Inicial`.

A investigação dos títulos recentes sem URL mostrou que o título exibido no realtime pode não aparecer com correspondência exata no relatório histórico de 30 dias. O sistema agora consulta os sitemaps recentes do SCC10, usa somente caminhos encontrados no sitemap e mantém o fallback histórico do GA4 para os demais metadados.

Ranking de autores iniciado em `autores.html`: período mês atual, pódio, ranking por visualizações, publicações distintas por título e matéria de maior alcance. A primeira versão não trata a soma de usuários por matéria como usuários únicos do período.

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
