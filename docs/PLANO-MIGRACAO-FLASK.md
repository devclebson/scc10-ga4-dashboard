# Plano de migração e evolução do SCC10 Analytics

Atualizado em 9 de novembro de 2026.

## Objetivo

Consolidar o projeto no Flask sem perder o coletor GA4, os snapshots SQLite, o dashboard realtime, o ranking editorial e os fluxos já validados no backend Node.js.

A migração será incremental. O Node.js continua sendo o runtime de transição até que cada responsabilidade tenha paridade funcional, testes e validação visual no Flask.

## Estado atual

### Flask já validado

- Application factory em `flask_app/__init__.py`.
- Configuração de ambiente em `flask_app/config.py`.
- Templates compartilhados com `base.html`.
- Rotas de dashboard, ranking, autores, matéria e configuração.
- Repository SQLite com leitura de snapshots, artigos, autores e configurações.
- Diagnóstico somente leitura em `/api/config/diagnostics`.
- Login administrativo Flask com hash em `FLASK_ADMIN_PASSWORD_HASH`.
- Sessão administrativa Flask usando cookie de sessão.
- Logout e bloqueio de `/configuracao/admin` sem sessão.
- Login validado visualmente em `http://localhost:5000/configuracao/admin`.

### Node.js ainda ativo na transição

- Coletor realtime e gravação de snapshots.
- Sincronização de metadados de matérias.
- Integração completa com GA4 Service Account.
- Cache de relatórios históricos.
- Tela administrativa antiga e API administrativa antiga.
- Fallback OAuth do frontend.

## Princípios

1. Não apagar código apenas porque ele parece antigo; primeiro localizar referências, testar e registrar a decisão.
2. Não migrar autenticação Node para Flask: o Flask já possui o modelo administrativo validado.
3. Não expor credenciais, tokens, hashes ou chaves no frontend, banco, Git ou documentação.
4. Não permitir que uma configuração Flask altere um processo Node sem confirmar que o Node lê a mesma configuração.
5. Migrar uma responsabilidade por vez e comparar Node e Flask usando o mesmo SQLite e a mesma propriedade GA4.
6. Arquivar arquivos somente depois de uma janela de validação sem referências ativas.

## Fases de implementação

### Fase 1 — Configuração administrativa Flask

Status: FEITO na branch `migration/flask-structure`.

Migrar para `/configuracao/admin`:

- propriedade GA4;
- período padrão;
- comparação com período anterior;
- leitura e gravação em `app_settings`;
- validação de entrada;
- mensagens de sucesso e erro;
- teste de persistência após reiniciar o Flask.

Implementado sem expor o intervalo do coletor. O coletor continua sendo executado pelo Node e esse valor só deve aparecer quando o processo que o consome estiver definido.

Arquivos previstos:

- `flask_app/repositories/sqlite_repository.py`;
- `flask_app/routes.py`;
- `flask_app/templates/configuracao_admin.html`;
- `flask_app/static/css/app.css`;
- `tests/test_flask_app.py`.

Validação concluída: leitura protegida, gravação, persistência, rejeição de `propertyId` inválido e manutenção dos testes existentes.

### Fase 2 — Segurança da administração

Status: FEITO na camada Flask local.

- proteção CSRF adicionada aos formulários e à API administrativa;
- expiração por idade da sessão adicionada com `FLASK_ADMIN_SESSION_LIFETIME_SECONDS`;
- logout e sessão expirada removem o acesso administrativo;
- `HttpOnly`, `SameSite` e `Secure` configurados por ambiente;
- restringir ações administrativas à sessão Flask;
- remover o fallback `SCC10_ADMIN_TOKEN` somente após a paridade do fluxo Node/Flask.

### Fase 3 — Diagnóstico operacional

Status: FEITO na transição Node/Flask.

Implementado no Flask, sem expor segredos:

- última coleta;
- última coleta bem-sucedida;
- duração;
- quantidade de linhas;
- último erro;
- idade do snapshot;
- quantidade de snapshots;
- estado da Service Account.

O Node agora persiste eventos de execução em `collector_runs`, incluindo status, duração, snapshot gerado, quantidade de linhas e erro. O Flask lê esses eventos sem expor credenciais. Bancos antigos sem essa tabela continuam sendo tratados como `not-recorded`.

### Fase 4 — Migração dos serviços GA4

Status: EM ANDAMENTO.

- criar cliente GA4 Python com Service Account;
- migrar relatório histórico de matéria;
- comparar respostas Node e Flask;
- preservar fallback realtime quando o relatório histórico estiver vazio;
- manter cache e limites de quota explícitos.

O relatório histórico de tráfego por matéria já está validado com dados reais. O cache em memória por propriedade, caminho e período foi adicionado ao serviço Flask; a migração de quota e dos demais relatórios ainda está pendente.

### Fase 5 — Migração do worker/coletor

- migrar coleta realtime;
- migrar sincronização de matérias;
- migrar retenção e backup do SQLite;
- executar Flask e worker com responsabilidades separadas;
- validar múltiplos ciclos e ausência de duplicação.

### Fase 6 — Corte para Flask

Somente depois de todos os gates:

- Flask servir as telas oficiais;
- worker Flask salvar snapshots reais;
- relatórios históricos comparados;
- login e administração validados via HTTPS;
- Node mantido apenas em branch/tag de contingência;
- arquivos legados arquivados em uma etapa separada.

## Critérios de aceite por fatia

Uma fatia só é concluída quando:

- testes automatizados passam;
- `npm run test:syntax` passa quando houver impacto no Node;
- `git diff --check` passa;
- fluxo visual é verificado em Chromium headed;
- API é lida de volta após qualquer gravação;
- nenhuma credencial aparece no diff;
- documentação e inventário são atualizados.

## Próxima execução

Implementar a Fase 1 em uma alteração isolada. Depois validar:

1. login;
2. carregamento dos valores atuais;
3. alteração válida;
4. rejeição de valores inválidos;
5. logout;
6. reinício do Flask;
7. leitura dos valores persistidos.
