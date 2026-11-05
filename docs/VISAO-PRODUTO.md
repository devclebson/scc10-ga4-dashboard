# Visão do produto — Dashboard Editorial SCC10

## Objetivo

Transformar o projeto existente em uma central operacional para portais de notícias.

O dashboard não deve ser apenas um relatório de GA4. Ele deve ajudar a equipe a responder, rapidamente:

- O que está acontecendo agora?
- Quais matérias estão crescendo?
- De onde está vindo a audiência?
- Qual conteúdo precisa de atenção editorial?
- Como o desempenho mudou em relação ao período anterior?
- O sistema está coletando e funcionando corretamente?

## Princípios do produto

1. Realtime e histórico devem permanecer claramente separados.
2. Todo número deve informar sua origem e seu período.
3. Metadado desconhecido deve aparecer como indisponível, nunca ser inventado.
4. A tela principal deve priorizar decisão editorial, não quantidade de gráficos.
5. O dashboard precisa funcionar para leitura rápida em desktop e TV.
6. A equipe deve conseguir investigar uma matéria sem sair do contexto.
7. Operação, segurança e qualidade de dados fazem parte do produto.
8. Toda evolução deve preservar o fluxo funcional antes de ampliar o escopo.

## Perfis de uso

### Redação

Precisa acompanhar o movimento atual do portal:

- leitores ativos;
- matérias em alta;
- visualizações;
- canais de entrada;
- alertas de crescimento ou queda;
- modo TV para acompanhamento contínuo.

### Editoria e coordenação

Precisa comparar desempenho e tomar decisões:

- desempenho por período;
- categorias e autores;
- matérias com maior alcance;
- distribuição de canais;
- histórico de audiência;
- comparação com período anterior.

### Gestão

Precisa de visão consolidada:

- evolução de sessões e usuários;
- aquisição;
- dispositivos e regiões;
- conversões ou eventos importantes;
- relatórios confiáveis para decisão.

### Administração técnica

Precisa operar o sistema com segurança:

- login administrativo;
- status do backend;
- status da Service Account;
- última coleta;
- erros do coletor;
- sincronização do cache;
- retenção e backup;
- configuração da propriedade e intervalos.

## Painéis planejados

### 1. Central editorial — principal

A tela inicial após o preflight deve mostrar:

- leitores ativos nos últimos 5 e 30 minutos;
- visualizações nos últimos 30 minutos;
- matérias ativas;
- ranking Top 10/20/50;
- tendência por matéria;
- categoria, autor, publicação e URL quando disponíveis;
- canais do dia;
- curva minuto a minuto;
- indicação clara da última atualização.

### 2. Ranking de matérias

Deve permitir:

- selecionar Top-N;
- ordenar por leitores, visualizações ou crescimento;
- filtrar categoria;
- identificar matéria sem metadado;
- abrir o detalhe de uma matéria;
- manter páginas institucionais e não editoriais fora do ranking quando identificadas.

### 3. Detalhe da matéria

Deve concentrar:

- título;
- URL;
- categoria;
- autor;
- data de publicação;
- visualizações históricas;
- leitores atuais;
- sessões;
- usuários;
- canais de aquisição;
- participação percentual;
- evolução por período.

### 4. Histórico local

Deve mostrar os snapshots coletados pelo backend:

- gráfico temporal;
- tabela de snapshots;
- filtros por período;
- última coleta;
- origem do dado: snapshot local;
- estado vazio quando ainda não houver coleta;
- erro de coleta separado de ausência de dados.

### 5. Relatórios históricos

Abas organizadas por decisão:

- Visão geral;
- Aquisição;
- Público e dispositivos;
- Engajamento e páginas;
- Eventos e conversões;
- Fluxo de leitores.

Cada relatório deve exibir:

- período consultado;
- comparação, quando ativa;
- unidade do valor;
- fonte do dado;
- estado de carregamento;
- erro com ação de retry.

### 6. Administração

Fluxo proposto:

```text
Login administrativo
        ↓
Painel de configuração
        ├── propriedade GA4
        ├── período padrão
        ├── intervalo do coletor
        ├── status da autenticação
        ├── última coleta
        ├── sincronização de matérias
        ├── retenção
        └── backup
```

## Arquitetura-alvo

```text
Google Analytics 4
        │
        ▼
Service Account no backend
        │
        ├── Relatórios históricos
        ├── Relatórios realtime
        ├── Metadados
        └── Detalhes de matérias
        │
        ▼
Serviços de domínio
        ├── Collector
        ├── Article metadata
        ├── Snapshot history
        ├── Authentication
        └── Configuration
        │
        ▼
SQLite
        ├── app_settings
        ├── articles
        ├── realtime_snapshots
        ├── admin_users
        └── admin_sessions
        │
        ▼
API própria
        │
        ▼
Frontend modular
        ├── Bootstrap
        ├── Editorial realtime
        ├── Reports
        ├── Ranking
        ├── Article detail
        ├── Local history
        └── Admin panel
```

## Modelo de dados mínimo

### `app_settings`

Configurações não secretas do sistema.

### `articles`

Cache de metadados editoriais:

- propriedade;
- título;
- título normalizado;
- caminho;
- categoria;
- autor;
- publicação;
- visualizações históricas;
- atualização.

### `realtime_snapshots`

Histórico operacional:

- propriedade;
- data de captura;
- usuários em 5 minutos;
- usuários em 30 minutos;
- visualizações;
- matérias ativas;
- payload editorial.

### `admin_users`

Acesso administrativo:

- usuário;
- hash da senha;
- perfil;
- ativo;
- criado em;
- último acesso.

### `admin_sessions`

Sessões revogáveis:

- identificador hash da sessão;
- usuário;
- expiração;
- criação;
- último uso;
- encerramento.

## Roadmap de produto

### Fase 1 — Base funcional

Status: concluída.

- backend GA4;
- Service Account;
- dashboard realtime;
- ranking enriquecido;
- detalhe de matéria;
- snapshots locais;
- configuração operacional.

### Fase 2 — Organização e segurança

Próxima fase.

- login administrativo;
- status detalhado do coletor;
- painel de configuração renovado;
- separação do `app.js`;
- testes automatizados;
- remoção do token manual.

### Fase 3 — Operação confiável

- retenção do SQLite;
- backup e restauração;
- inicialização automática;
- CORS por ambiente;
- logs operacionais;
- alertas de falha.

### Fase 4 — Inteligência editorial

- alertas de crescimento;
- comparação de matérias semelhantes;
- desempenho por editoria;
- autor e categoria;
- identificação de matérias com potencial de crescimento;
- relatórios de pico e queda;
- recomendações operacionais sem substituir a decisão editorial.

### Fase 5 — Produto multiportal

Somente depois da estabilidade do SCC10:

- múltiplas propriedades GA4;
- múltiplos portais;
- perfis por equipe;
- configurações por portal;
- isolamento de dados;
- administração centralizada.

## Critérios de qualidade do produto

O dashboard será considerado pronto para uma equipe editorial quando:

- carregar dados reais de forma previsível;
- mostrar claramente quando os dados estão atrasados;
- não misturar realtime, intraday, histórico e snapshot;
- permitir investigar uma matéria em poucos cliques;
- funcionar em tela de trabalho e modo TV;
- sobreviver a falhas temporárias da API;
- não expor credenciais no navegador;
- ter login administrativo seguro;
- registrar e exibir o estado do coletor;
- possuir backup e restauração testados;
- ter documentação atualizada;
- permitir evolução por módulos sem depender de um único arquivo gigante.
