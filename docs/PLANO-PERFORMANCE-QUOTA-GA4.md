# Plano de desempenho e quota do GA4

## Objetivo

Ao voltar para `/dashboard`, mostrar imediatamente os últimos dados editoriais disponíveis, identificar sua idade e carregar relatórios sob demanda. Navegar entre telas ou abrir várias abas não deve repetir consultas ao GA4 para a mesma propriedade e período. Preservar o Monitor Editorial e o fluxo administrativo existentes.

## Evidências de 5 de novembro de 2026

- `src/js/app.js`, em `loadAllAnalytics()`, aguarda **seis** relatórios históricos em paralelo, depois **um** de conversões, depois **dois** comparativos (quando habilitados) e por fim `fetchRealtimeCycle()` antes de renderizar o dashboard: **nove requisições GA4 por entrada** com comparação ativa, mesmo se o usuário quer apenas o Monitor Editorial. A chamada realtime aproveita o snapshot somente se tiver até 90 segundos; se estiver velho ou ausente, faz até **três** novas consultas realtime e possivelmente uma histórica de canais. Trocar de aba depois desse carregamento não elimina o custo inicial.
- `index.html` faz mais um relatório GA4 como preflight a cada entrada pela página inicial. O backend fornece `/api/health` e `/api/config`, mas não um endpoint que valide cache/coletor e permita entrada sem nova chamada GA4.
- O coletor backend consulta três relatórios realtime por ciclo de cerca de 30–31 segundos, mesmo sem navegador aberto; projeção de aproximadamente **360 chamadas realtime por hora** enquanto saudável. A sincronização de metadados é agendada a cada 15 minutos e a última execução observada processou cerca de 17 mil linhas. Não atribuir a ela o erro realtime sem medir as categorias de quota separadamente.
- O processo respondeu `ok: true` em `/api/health`, apesar de o coletor ter pausado por quota. Às 15:11 (Brasília), o último snapshot era de 15:04:35; `ok` não significa dados atualizados.
- O erro real no processo foi `Exhausted property tokens for a project per hour`; o coletor já aplica backoff de 15 minutos, mas o dashboard continua tentando GA4 quando o snapshot passa de 90 segundos. Reiniciar o processo apaga o backoff em memória e pode provocar nova tentativa prematura.
- Os limites da Data API são separados por categoria **Core** e **Realtime**. O custo depende da consulta; é preciso medir `returnPropertyQuota` e registrar consumo/saldo por categoria, não inferir quota apenas pelo número de requisições. Referência: https://developers.google.com/analytics/devguides/reporting/data/v1/quotas

## Implementação por fatias — uma PR para `develop` por etapa

### 1. Medição e estado operacional — prioridade imediata

Instrumentar, sem registrar credenciais ou payloads com dados pessoais:

- tempo de navegação → primeiro dado visível e → todos os relatórios carregados;
- contagem, duração, origem (coletor, preflight, dashboard, detalhe ou sincronização), propriedade e categoria de cada chamada GA4;
- `returnPropertyQuota: true` nos relatórios medidos e logs/estado sanitizados de tokens consumidos/restantes por categoria;
- horário da última coleta bem-sucedida, idade do snapshot, erro, início do backoff e próxima tentativa; separar `backend online` de `coletor saudável`;
- métricas agregadas de carregamento e cache hit/miss no backend, sem valores de tokens de autenticação.

Critério: reproduzir uma volta ao dashboard em Chromium e registrar o tempo e a quantidade de consultas antes de alterar o fluxo. Simular quota esgotada em teste automatizado: a tela não deve chamar GA4 novamente só porque o snapshot ficou velho.

### 2. Monitor Editorial rápido e resiliente

- No modo Service Account, mostrar imediatamente o último snapshot SQLite da **mesma propriedade**, mesmo se estiver desatualizado; exibir horário e aviso de defasagem, sem apresentá-lo como audiência ao vivo.
- Não cair para `runRealtimeReport()` no navegador quando a coleta centralizada falhar ou estiver em backoff. O coletor backend continua sendo o único responsável pelo realtime. Preservar o fallback OAuth legado como fluxo separado até sua retirada planejada.
- Não esperar relatórios históricos para mostrar leitores, curva e prévia do ranking. Relatórios não essenciais carregam depois, cada seção com seu próprio estado de carregamento/erro.
- Evitar execução concorrente duplicada do ciclo realtime na mesma aba.

Critério: ao retornar ao Monitor com cache disponível, os KPIs aparecem a partir do snapshot sem esperar os relatórios históricos; durante quota esgotada, nenhum POST novo a `/api/ga4/report` para realtime nasce dessa navegação e o status mostra a idade real dos dados.

### 3. Consultas históricas sob demanda, compartilhadas entre usuários

- Tirar do carregamento inicial os relatórios de seções que não estão visíveis. Visão Geral, Aquisição, Público e demais seções buscam seus dados apenas quando abertas, com pré-busca opcional depois do primeiro conteúdo visível.
- Criar cache no backend por propriedade + tipo de relatório + período + comparação + filtros, com TTL explícito, última atualização, reutilização de resultados durante revalidação e deduplicação de solicitações concorrentes (`single flight`). Invalidar corretamente ao trocar propriedade/período ou no limite do dia da propriedade.
- Reutilizar resultados históricos entre abas, páginas e usuários; um F5 e um retorno à tela não devem gerar novamente toda a bateria de consultas se o cache estiver válido. O botão Atualizar solicita atualização apenas do conjunto relevante, respeitando quota/backoff.
- Substituir gradualmente o preflight GA4 de `index.html` por verificação de configuração + estado de coleta/cache, com mensagem específica quando a propriedade não tiver dados ou o coletor estiver em erro.

Critério: com cache aquecido, voltar a `/dashboard` não faz a bateria inicial de nove consultas ao GA4; períodos e propriedades diferentes não compartilham resultados; erro de uma seção não bloqueia as demais.

### 4. Política de quota e sincronização de matérias

- Medir separadamente Core e Realtime antes de decidir novos intervalos. O limitador atual de requisições públicas por minuto não controla tokens consumidos por consultas complexas nem os agendamentos internos.
- Implementar backoff central por propriedade/categoria, registrado fora da memória do processo, e resposta de status clara; durante 429, não insistir por meio do frontend, preflight ou detalhe de matéria.
- Analisar o custo da sincronização histórica de ~17 mil linhas/15 minutos; testar atualização incremental de matérias recentes e reconciliação completa menos frequente. Só mudar cadência após medir frescor de categoria, autor, data e visualizações hoje.
- Se necessário, comparar intervalos de coleta realtime (30, 60 ou 90 segundos) com os requisitos da redação e os tokens efetivamente consumidos. Não reduzir a cadência sem mostrar o impacto de frescor ao usuário.

Critério: teste com múltiplas abas e erro 429 não produz tempestade de consultas; o status permanece explícito e o coletor retoma após a disponibilidade da quota, sem reinício manual.

### 5. Ranking e detalhe por matéria

- `Agora`: ordenação por visualizações dos últimos 30 minutos a partir do snapshot, com leitores, tendência e idade da coleta. `Hoje`: visualizações do dia, atualizadas no cache histórico e rotuladas com horário próprio; não misturar as duas janelas no mesmo total.
- Metadados e URL vêm de cache validado por propriedade e preferencialmente caminho da página; sem URL confiável, não criar link fictício.
- A análise detalhada solicita apenas dados da matéria clicada, reutilizando resultados já disponíveis e exibindo separadamente realtime e histórico. Não consultar GA4 para todas as matérias ao abrir o ranking.
- Percentuais devem declarar o denominador correto; o snapshot atual contém um Top 60, não todas as páginas da propriedade.

Critério: abrir a página de ranking não adiciona consultas GA4; clicar numa matéria carrega apenas os dados dela ou cache existente; horários, período e propriedade são visíveis.

## Sequência de validação

1. Registrar baseline e contagem de consultas sem acionar novas chamadas desnecessárias durante o bloqueio atual de quota.
2. Criar teste de regressão que force snapshot velho/429 e confirme renderização com aviso de defasagem, sem fallback GA4 no modo backend.
3. Rodar `npm test`, `npm run test:syntax`, `git diff --check` e teste visual em Chromium headed com dados reais quando a quota estiver disponível.
4. Comparar após cada PR: tempo até o primeiro dado, tempo completo, cache hit, consultas GA4 por navegação, consumo de tokens Core/Realtime, idade dos snapshots e recuperação de 429.
5. Não promover para `master` antes de homologação em `develop`.

## Limite deste documento

Este é um plano e um diagnóstico do código atual, não uma correção já implementada. Os tempos de carregamento e tokens por chamada ainda precisam de instrumentação; não há meta numérica honesta de latência ou economia de tokens até obter o baseline.
