# Decisões técnicas

## Frontend incremental

A aplicação não será recriada do zero. A interface e os relatórios existentes serão preservados enquanto o código é reorganizado.

## Dependências locais

Chart.js, D3.js e D3 Sankey são instalados pelo npm e servidos localmente para reduzir dependência de CDN.

## Backend posterior

A autenticação direta no navegador será substituída gradualmente por um backend Node.js. Isso evita expor tokens, reduz chamadas duplicadas e permite cache e armazenamento histórico.

## SQLite inicial

SQLite será o primeiro banco de dados porque não exige servidor separado e é suficiente para snapshots e relatórios locais. A decisão poderá ser revista se o volume ou a concorrência crescer.

## Dados em tempo real e históricos

O sistema deve identificar explicitamente se um valor vem de:

- Realtime API: janela recente de até 30 minutos;
- relatório intraday: dados do dia atual;
- relatório histórico: intervalo escolhido pelo usuário;
- snapshot local: dados coletados pelo backend.
