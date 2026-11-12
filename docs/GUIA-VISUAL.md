# Guia visual global — SCC10 Analytics

## Objetivo

A interface usa uma paleta semântica compartilhada para que cores tenham o mesmo significado em todas as telas. Novos componentes devem reutilizar as variáveis do `:root` em `flask_app/static/css/app.css` em vez de criar cores isoladas.

## Tokens principais

| Token | Uso | Cor atual |
|---|---|---|
| `--color-primary` | marca, navegação e destaque principal | azul-marinho |
| `--color-primary-light` | navegação ativa e variações da marca | azul médio |
| `--color-accent` | foco editorial, linhas de destaque e seleção | verde-azulado |
| `--color-accent-strong` | texto do destaque editorial | verde-azulado escuro |
| `--color-info` | ações, links e informação neutra | azul |
| `--color-success` | coleta saudável, concluído e disponível | verde |
| `--color-warning` | atraso, dados parciais e atenção | âmbar |
| `--color-danger` | erro, falha e indisponibilidade | vermelho |
| `--color-violet` | segunda categoria visual, comparação e análise | violeta |
| `--color-cyan` | séries, progresso e distribuição | ciano |
| `--color-text` | títulos e números principais | azul escuro |
| `--color-muted` | textos auxiliares e rótulos | azul acinzentado |
| `--color-border` | bordas de cards e controles | azul muito claro |
| `--color-row-border` | divisórias de tabelas e listas | cinza azulado claro |
| `--color-surface` | cards, painéis e campos | branco |
| `--color-background` | fundo geral das páginas | azul acinzentado muito claro |

## Regras de aplicação

- Azul-marinho identifica a marca e o KPI principal.
- Verde-azulado identifica seleção editorial, atualização e foco de conteúdo.
- Azul identifica ações, links e dados informativos.
- Verde identifica estado saudável ou concluído.
- Âmbar identifica atraso, processamento parcial ou necessidade de atenção.
- Vermelho fica reservado para erro ou indisponibilidade.
- Violeta e ciano diferenciam séries, categorias e métricas secundárias; não representam erro.
- Cores não devem ser o único indicador: estados também precisam de texto, rótulo ou ícone.
- Texto sobre fundos coloridos deve respeitar contraste; cards principais usam texto branco apenas sobre fundos escuros.

## Componentes reutilizáveis

### Badges semânticos

```html
<span class="semantic-badge semantic-badge--info">Informação</span>
<span class="semantic-badge semantic-badge--success">Atualizado</span>
<span class="semantic-badge semantic-badge--warning">Processando</span>
<span class="semantic-badge semantic-badge--danger">Erro</span>
<span class="semantic-badge semantic-badge--violet">Comparação</span>
<span class="semantic-badge semantic-badge--cyan">Realtime</span>
```

### KPI cards

O primeiro card de cada grade pode usar `overview-kpi-primary`. Os cards seguintes recebem variações suaves por posição apenas quando representam métricas diferentes. Se uma tela precisar de significado específico, deve adicionar uma classe semântica explícita em vez de depender da posição.

### Estados

- `diagnostic-status is-ok`: verde, operação saudável;
- `diagnostic-status is-pending`: âmbar, aguardando ou incompleto;
- `.error`: vermelho, falha de carregamento ou operação;
- `.data-freshness-notice`: âmbar, dados atuais sujeitos a atraso do GA4.

### Ícones

- Ícones comuns da interface usam SVGs locais do Lucide em `flask_app/static/icons/lucide/`.
- Ícones de marcas e redes sociais usam SVGs locais do Simple Icons em `flask_app/static/icons/brands/`.
- `ui-icon` é usado em ações de interface, como atualizar e consultar.
- `brand-icon` é usado dentro dos cards de redes sociais.
- Ícones devem complementar o texto; não devem ser o único indicador de uma ação ou estado.

## Padrão para novas telas

1. Usar os tokens globais para toda cor nova.
2. Definir a origem dos dados no texto auxiliar do componente.
3. Usar um destaque principal e no máximo dois acentos secundários por bloco.
4. Não transformar cada métrica em uma cor diferente sem significado.
5. Validar desktop e viewport aproximado de 390 px.
6. Verificar contraste e estados de carregamento, vazio e erro.
