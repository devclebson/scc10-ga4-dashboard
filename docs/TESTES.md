# Testes locais

## 1. Iniciar o backend

PowerShell:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_FILE="$env:LOCALAPPDATA\SCC10\secrets\ga4-service-account.json"
$env:SCC10_PROPERTY_ID="309943616"
$env:SCC10_ADMIN_USERNAME="admin"
$env:SCC10_ADMIN_PASSWORD="defina-uma-senha-forte"
npm run backend
```

A Service Account deve ter permissão de leitura na propriedade GA4.

Verifique também:

```powershell
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/config
```

O resultado esperado é `authMode: service-account` e `configured: true`.

## Homologação do container

Em 6 de novembro de 2026, o container `192.168.0.71` foi validado com o commit
`34543ec0252e864557b3cd095eb1f53cad4b2103` e a versão `v1.0.1`.

Validações concluídas:

- serviço `scc10-api` ativo;
- `/api/health` e `/api/config` respondendo via HTTPS;
- HTTP redirecionando para HTTPS;
- dashboard e `ranking.html` carregando com HTTP 200;
- coleta realtime e snapshots funcionando;
- certificado para `192.168.0.71` confiado no Edge e no Chrome;
- login administrativo funcionando via HTTPS.

Fingerprint SHA-256 do certificado homologado:

```text
47:0F:83:34:57:E5:E1:37:38:81:E5:82:63:1B:33:28:3D:80:30:A7:8D:ED:CA:B5:F2:52:E6:54:AB:EC:B5:D8
```

## Validação local atual

A branch `fix/remover-other-ranking` foi validada localmente com Service Account em
`http://localhost:3000/dashboard` e backend em `http://127.0.0.1:3001`.

- 23 testes passaram;
- `npm run test:syntax` passou;
- relatório GA4 real respondeu HTTP 200;
- dashboard carregou dados realtime reais;
- `(other)` não apareceu no ranking;
- a credencial foi lida de `C:\Users\<usuario>\AppData\Local\SCC10\secrets\ga4-service-account.json`, fora do Git.

## Validação visual e histórica — 9 de novembro de 2026

- `ranking-teste.html` carregou 392 dimensões da propriedade;
- relatório histórico retornou 114.506 registros;
- `customEvent:categories`, `customEvent:author` e `customEvent:published_date` retornaram valores;
- dashboard carregou 300 leitores em 30 minutos, 446 visualizações e 57 matérias ativas;
- dashboard exibiu status `Online (30s)`;
- endpoint de snapshots retornou 500 coletas armazenadas;
- Histórico Local confirmado após múltiplos ciclos, sem duplicação visual dos snapshots;
- fallback de URL retornou `/page/3445/` para o título `Página Inicial`;
- título sem correspondência histórica permaneceu sem URL, sem fabricação de caminho.

### Investigação de títulos recentes sem URL

O título `Fim da idade mínima para aposentadoria especial: veja quem tem direito e como pedir ao INSS` apareceu no realtime, mas não apareceu no relatório histórico executado em `ranking-teste.html` nem na consulta exata do fallback. O comportamento atual é esperado: o sistema mantém a matéria visível e informa que os metadados históricos estão indisponíveis, em vez de fabricar um caminho. A sincronização automática do cache a cada 15 minutos poderá preencher o caminho quando o relatório histórico do GA4 processar ou retornar o título.

Para testar o login administrativo, configure temporariamente no processo do backend:

```powershell
$env:SCC10_ADMIN_USERNAME="admin"
$env:SCC10_ADMIN_PASSWORD="defina-uma-senha-local"
```

O backend cria o primeiro usuário somente se ainda não existir. A senha é armazenada
como hash no SQLite. O navegador recebe apenas um cookie de sessão `HttpOnly`.

## 2. Iniciar o frontend

Na raiz do projeto:

```powershell
npx serve . -l 3000
```

## 3. Testar a entrada principal

```powershell
npx --yes agent-browser --headed open http://localhost:3000
npx --yes agent-browser wait 10000
npx --yes agent-browser snapshot -i
```

Com o backend e o GA4 disponíveis, a entrada deve validar os dados e abrir `/dashboard`.

Com o backend desligado ou sem configuração, deve permanecer na inicialização e mostrar acesso a `/configuracao`.

## 4. Testar a área administrativa

Abra:

```text
http://localhost:3000/configuracao.html
```

Verifique:

- backend Online;
- autenticação Service Account;
- propriedade GA4;
- carregamento dos valores salvos;
- login com usuário e senha, alteração e leitura dos valores persistidos, logout e bloqueio sem sessão.

## 5. Testar o ranking enriquecido

Abra:

```text
http://localhost:3000/ranking-teste.html
```

Verifique:

- carregamento dos metadados GA4;
- dimensões técnicas para categoria, autor e publicação;
- seleção dos campos;
- execução do relatório histórico;
- título, categoria, autor, data e visualizações.

Esse teste não altera o ranking realtime existente.

### Ranking operacional

Abra `http://localhost:3000/ranking.html` ou use “Ver ranking completo” no Monitor Editorial.
Verifique a prévia Top 5 no Monitor, a seleção Top 10/20/50 na página exclusiva, o link para análise da matéria e o horário da última coleta.
No painel de rede do navegador, a nova página deve consultar `/api/config`, `/api/snapshots` e `/api/articles/enrich`, mas não `/api/ga4/report`.
Se o coletor parar, o status deve indicar “Dados desatualizados” após 90 segundos, sem consultar o GA4 por conta própria.

## 6. Sincronizar o cache de matérias

O backend pode sincronizar os metadados históricos manualmente após login administrativo:

```powershell
$cookieFile = Join-Path $env:TEMP 'scc10-admin-cookie.txt'
curl.exe -c $cookieFile -X POST http://127.0.0.1:3001/api/auth/login `
  -H 'Content-Type: application/json' `
  -d '{"username":"admin","password":"SENHA_ADMIN_LOCAL"}'
curl.exe -b $cookieFile -X POST http://127.0.0.1:3001/api/articles/sync `
  -H 'Content-Type: application/json' `
  -d '{"propertyId":"309943616","startDate":"30daysAgo"}'
Remove-Item $cookieFile
```

Resultado esperado: quantidade de linhas buscadas e salvas na tabela `articles`.
O backend também executa essa sincronização automaticamente a cada 15 minutos.

Com a Service Account configurada e a propriedade definida, o backend também coleta
um snapshot realtime automaticamente a cada 30 segundos, mesmo sem o dashboard aberto.
O processo não salva snapshot quando qualquer uma das consultas realtime retorna erro; após erro de quota, pausa por 15 minutos.
Os canais intraday são atualizados em cache e não devem gerar uma consulta GA4 a cada ciclo realtime.
Com snapshot recente, o frontend utiliza o SQLite em vez de repetir as três consultas realtime; sem snapshot recente, consulta o GA4 diretamente.
O contador de 5 minutos deve vir da faixa realtime `last5m`, sem somar os mesmos usuários de minutos distintos.

Para validar o cruzamento do realtime com o cache:

```powershell
curl -X POST http://127.0.0.1:3001/api/articles/enrich `
  -H "Content-Type: application/json" `
  -d '{"propertyId":"309943616","titles":["título de teste"]}'
```

## 7. Verificar imagens

As imagens devem existir em:

```text
assets/images/scc10-logo.png
assets/images/scc10-mark.jpg
```

Todas as telas principais devem carregar as imagens sem referência aos nomes antigos na raiz.

## 8. Testar o dashboard

```powershell
npx --yes agent-browser --headed open http://localhost:3000/dashboard.html
npx --yes agent-browser wait 1000
npx --yes agent-browser snapshot -i
npx --yes agent-browser wait 12000
npx --yes agent-browser snapshot -i
```

Durante o carregamento deve aparecer:

```text
Carregando dados do Analytics
```

Depois devem aparecer as abas do dashboard.

## 9. Verificar erros

```powershell
npx --yes agent-browser console
npx --yes agent-browser errors
```

## 10. Verificar sintaxe e alterações

```powershell
npm run test:syntax
node --check src/js/config-app.js
node --check src/js/ranking-test.js
git diff --check
```

## 11. Encerrar o navegador

```powershell
npx --yes agent-browser close --all
```
