# Testes locais

## 1. Iniciar o backend

PowerShell:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_FILE="C:\ProgramData\SCC10\secrets\ga4-dashboard-portal.json"
$env:SCC10_PROPERTY_ID="309943616"
$env:SCC10_ADMIN_TOKEN="defina-um-token-forte"
npm run backend
```

A Service Account deve ter permissão de leitura na propriedade GA4.

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
- alteração e salvamento com o token administrativo.

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

## 6. Testar o dashboard

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

## 7. Verificar erros

```powershell
npx --yes agent-browser console
npx --yes agent-browser errors
```

## 8. Verificar sintaxe e alterações

```powershell
npm run test:syntax
node --check src/js/config-app.js
node --check src/js/ranking-test.js
git diff --check
```

## 9. Encerrar o navegador

```powershell
npx --yes agent-browser close --all
```
