# SCC10 Monitor Editorial — Roadmap

## Concluído

- Auditoria inicial do projeto.
- Correções anteriores dos relatórios GA4 preservadas.
- Monitor Editorial em tempo real preservado.
- Interface em português brasileiro preservada.
- Modo TV preservado.
- CSS separado do HTML.
- JavaScript separado do HTML.
- Chart.js, D3.js e D3 Sankey instalados localmente.
- Teste visual com Chromium executado sem erros no console.

## Etapa atual — Modularização do frontend

- Separar estado global.
- Separar formatadores e utilitários.
- Separar exportação CSV.
- Separar serviços de autenticação e API.
- Manter o comportamento atual durante a reorganização.

## Próxima etapa — Correção de persistência

- Remover access token do `localStorage`.
- Manter apenas preferências não sensíveis no navegador.
- Preparar uma camada de autenticação substituível pelo backend.
- Criar estados claros para sessão expirada, carregamento e reconexão.

## Backend

- Criar servidor Node.js.
- Criar endpoints internos para o dashboard.
- Centralizar chamadas ao Google Analytics.
- Adicionar cache de respostas.
- Implementar renovação de credenciais no servidor.

## Banco de dados

- Adicionar SQLite.
- Registrar snapshots periódicos.
- Criar histórico de audiência por matéria.
- Criar consultas para ranking diário, horário e semanal.

## Validação

Cada etapa deve ser validada com:

- `node --check` ou validação equivalente;
- teste visual em Chromium com `--headed`;
- teste do modo demonstração;
- verificação de erros no console;
- verificação de regressões nas abas existentes.
