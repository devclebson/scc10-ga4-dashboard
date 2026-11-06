# Plano de evolução e organização

## Objetivo

Manter o dashboard SCC10 funcional enquanto reduzimos código legado, melhoramos segurança, organizamos a arquitetura e criamos uma rotina previsível de evolução.

## Prioridade operacional atual

Antes de separar outras páginas, reduzir o tempo de retorno ao dashboard e o consumo de quota GA4. Diagnóstico, sequência de implementação e critérios de aceite: [Plano de desempenho e quota do GA4](PLANO-PERFORMANCE-QUOTA-GA4.md). A página de ranking em branch de trabalho ainda não está homologada; não misturar seu lançamento com a correção do carregamento inicial.

## Método de trabalho

Cada melhoria deve ser executada como uma fatia pequena e verificável:

1. Registrar o problema e o resultado esperado.
2. Identificar os arquivos e rotas afetados.
3. Fazer uma única mudança de responsabilidade por vez.
4. Executar validação de sintaxe e `git diff --check`.
5. Validar o fluxo real no Chromium headed.
6. Verificar console, erros de página e resposta da API.
7. Atualizar esta lista e a documentação técnica.
8. Só então iniciar a próxima fatia.

### Status utilizados

- `FEITO` — implementado e verificado.
- `EM ANDAMENTO` — alteração iniciada, ainda sem aceite completo.
- `PRÓXIMO` — próxima fatia recomendada.
- `PENDENTE` — necessário, mas não bloqueia o uso atual.
- `BLOQUEADO` — depende de decisão, credencial ou ambiente externo.

### Critério de conclusão

Uma tarefa só passa para `FEITO` quando possui:

- arquivos alterados identificados;
- teste técnico executado;
- comportamento visual ou API verificado;
- documentação atualizada;
- nenhuma credencial adicionada ao repositório.

## Estado atual

### Autenticação administrativa — EM ANDAMENTO

- Schema `admin_users` e `admin_sessions` criado no SQLite.
- Login, logout e consulta de sessão criados no backend.
- Sessão baseada em cookie `HttpOnly`.
- Tela de configuração preparada para usuário e senha.
- Token administrativo mantido apenas como fallback temporário.
- Falta validar a troca de credenciais no ambiente de produção e remover o fallback.

### Base operacional — FEITO

- Service Account configurada no backend.
- Relatório GA4 real funcionando sem token no navegador.
- Dashboard carregando métricas reais.
- Coletor independente salvando snapshots realtime.
- Histórico local lendo o SQLite.
- Ranking enriquecido com categoria, autor, data e URL.
- Tela de detalhes e origens por matéria.
- Ranking de teste retornando dimensões reais.
- Snapshots centralizados no backend; o frontend não grava mais snapshots.
- Rota pública de `POST /api/snapshots` removida.
- Intervalo do coletor lido da configuração persistida.
- Documentação inicial revisada.

## Limpeza e organização

### 1. Separar o dashboard monolítico — PRÓXIMO

`src/js/app.js` ainda concentra aproximadamente 1.700 linhas e várias responsabilidades.

Separar gradualmente em:

```text
src/js/dashboard/
├── bootstrap.js
├── realtime.js
├── historical-reports.js
├── ranking.js
├── tabs.js
├── local-history.js
├── charts.js
└── tv-mode.js
```

Regra: extrair uma responsabilidade por vez, sem alterar o comportamento visual.

### 2. Remover código OAuth legado — PENDENTE

- Retirar a tela antiga de Client ID e login Google.
- Remover chamadas diretas do frontend para `analyticsadmin.googleapis.com`.
- Remover `src/js/services/auth.js` quando não houver dependência ativa.
- Remover campos e seletores antigos do `app.js`.
- Manter somente Service Account no backend.

Pré-requisito: homologar o login administrativo e confirmar que o dashboard não depende do OAuth em nenhum fluxo.

### 3. Revisar arquivos e dependências — PRÓXIMO

- Procurar funções exportadas sem uso.
- Procurar arquivos sem importação ou referência HTML.
- Remover comentários que descrevem arquitetura antiga.
- Confirmar se Chart.js, D3 e D3 Sankey são usados nas telas atuais.
- Separar código de demonstração do código de produção.
- Manter imagens e SQLite fora do fluxo de versionamento.

Nenhum arquivo deve ser apagado sem busca de referências e validação no navegador.

## Segurança e acesso administrativo

### Login de usuário e senha — IMPLEMENTADO, validação final pendente

A tela usa login de usuário e senha, com hash no SQLite e cookie de sessão `HttpOnly`. O token administrativo antigo permanece apenas como fallback temporário na API até a migração estar validada em produção.

A proposta é criar:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
```

### Regras da implementação

- Usuário e senha nunca ficam no frontend.
- Senha armazenada somente como hash forte, nunca em texto puro.
- Sessão em cookie `HttpOnly`, `Secure` em produção e `SameSite` apropriado.
- Nenhum token de sessão em `localStorage`.
- Endpoints administrativos exigem sessão válida.
- Service Account continua sendo uma credencial do servidor, separada do usuário administrativo.
- O primeiro usuário deve ser criado por configuração segura do servidor ou comando de inicialização, sem credencial padrão fixa.
- Registrar data de criação, último acesso e encerramento da sessão.
- Preparar perfis futuros: `admin` e `viewer`.

### Escopo protegido

O login deve proteger pelo menos:

- leitura e gravação de `/api/admin/config`;
- sincronização manual de matérias;
- execução de operações administrativas;
- status operacional detalhado;
- futuras ações de retenção e backup.

A consulta normal do dashboard pode continuar sem login se o painel ficar restrito à rede interna. Se for publicado fora da rede, o dashboard inteiro também deverá exigir sessão.

## Backend e operação

### Status do coletor — PRÓXIMO

Criar status operacional com:

- última execução;
- última execução bem-sucedida;
- duração;
- quantidade de linhas recebidas;
- último erro;
- próximo horário previsto;
- quantidade de snapshots salvos.

Expor em uma rota administrativa, sem dados sensíveis.

### Retenção do SQLite — PENDENTE

- Definir prazo de retenção dos snapshots.
- Criar limpeza automática por data.
- Manter índices para consultas por propriedade e horário.
- Registrar quantas linhas foram removidas.

### Backup — PENDENTE

- Criar rotina de backup do SQLite.
- Não copiar arquivos `.db-shm` e `.db-wal` isoladamente.
- Validar restauração em uma cópia temporária.
- Documentar local e política de retenção.

### Inicialização automática — PENDENTE

Configurar o backend para iniciar automaticamente no ambiente de produção e reiniciar após falha.

## API e qualidade

### Validação de entrada — PRÓXIMO

Revisar todas as rotas para garantir:

- `propertyId` validado;
- datas validadas;
- limites de linhas aplicados;
- corpos JSON inválidos tratados;
- mensagens de erro sem detalhes secretos;
- métodos HTTP não utilizados rejeitados.

### CORS — PENDENTE

Substituir a origem fixa `http://localhost:3000` por configuração explícita por ambiente.

### Testes automatizados — PENDENTE

Criar testes para:

- normalização de títulos;
- validação de configuração;
- autenticação administrativa;
- conversão de linhas GA4;
- salvamento e leitura de snapshots;
- filtros de histórico;
- respostas de erro das rotas.

## Interface

### Tela de configuração — PRÓXIMO

Evoluir para:

- tela de login;
- status do backend;
- status da Service Account;
- propriedade ativa;
- último snapshot;
- último erro do coletor;
- intervalo configurado;
- ações de sincronização e backup somente para administradores.

### Histórico local — PENDENTE

- Confirmar que os snapshots não aparecem duplicados após a centralização no backend.
- Exibir o horário da última coleta.
- Exibir estado vazio e estado de erro distintos.
- Diferenciar dados realtime, intraday, histórico GA4 e snapshot local.

## Ordem recomendada das próximas fatias

1. Validar autenticação administrativa em produção e remover o fallback de token.
2. Criar status detalhado do coletor.
3. Separar `app.js` em módulos de realtime, ranking e histórico.
4. Implementar retenção do SQLite.
5. Implementar backup e restauração testada.
6. Remover OAuth legado.
7. Criar testes automatizados.
8. Configurar CORS por ambiente.
9. Configurar inicialização automática em produção.

## Regra de manutenção

Não fazer uma grande reescrita. Cada etapa deve preservar:

- abertura por `index.html`;
- dashboard realtime;
- ranking enriquecido;
- tela de matéria;
- histórico local;
- modo TV;
- execução sem credenciais expostas no navegador.
