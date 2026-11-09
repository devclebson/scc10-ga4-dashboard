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

## Service Account no backend

A autenticação principal passou a usar uma Service Account no backend. O navegador não precisa mais enviar access token para consultar o GA4. O OAuth permanece somente como fallback temporário para compatibilidade.

## Entradas separadas

`index.html` verifica a disponibilidade do backend e dos dados GA4 antes de abrir `dashboard.html`. Em caso de falha, encaminha o operador para `configuracao.html`. O dashboard não deve conter tela de login.

## Teste isolado do ranking enriquecido

Categoria, autor e data de publicação serão validados em `ranking-teste.html` antes de alterar o ranking realtime existente. A tela consulta os metadados técnicos da propriedade e executa um relatório histórico independente.

## Configuração persistida

Propriedade, período padrão, comparação e intervalo do coletor são persistidos na tabela SQLite `app_settings`. Credenciais e chaves privadas permanecem fora do banco e fora do frontend.

## Versionamento exibido

O dashboard usa versionamento semântico no `package.json` e exibe a versão atual nas telas principais. Toda atualização publicada no container deve alterar o número da versão, executar os testes e registrar o commit implantado.

## HTTPS no container de homologação

O container privado usa HTTPS mesmo por IP. O certificado autoassinado foi confiado nas estações de homologação; antes de ampliar o acesso, deve ser substituído por certificado emitido por uma CA interna ou por DNS confiável.

## Agrupamento `(other)` do GA4

`(other)` é uma linha agregada do GA4, não uma matéria. A correção será feita no renderer do ranking: a linha não será exibida como notícia, mas suas visualizações permanecerão no denominador explicitamente identificado como total do portal.
