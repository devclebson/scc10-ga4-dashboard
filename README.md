# SCC10 — Monitor Editorial & Analytics GA4

<p align="center">
  <img src="https://img.shields.io/badge/Google%20Analytics-4-orange?style=for-the-badge&logo=google-analytics" alt="GA4">
  <img src="https://img.shields.io/badge/Status-Produção%20Editorial-green?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Modo%20TV-Full%20HD-blue?style=for-the-badge" alt="Modo TV">
  <img src="https://img.shields.io/badge/Arquitetura-Frontend%20%2B%20Backend-red?style=for-the-badge" alt="Frontend e Backend">
</p>

<p align="center">
  Dashboard de monitoramento de audiência editorial em tempo real e analytics GA4 desenvolvido para a redação do portal <strong>SCC10</strong>.
</p>

---

## ✨ Funcionalidades Principais

### 🚀 Monitor Editorial em Tempo Real (Ao Vivo)
- **Leitores Ativos Instantâneos:** Contagem de leitores nos últimos 5 e 30 minutos via API oficial do Google Analytics 4.
- **Visualizações (30 min):** Volume consolidado de visualizações de página na janela recente.
- **Ranking de Notícias em Tempo Real:** Tabela dinâmica com as matérias mais lidas agora (Top 10, Top 20 ou Top 50), combinando URL e título sem duplicações.
- **Indicador de Tendência:** Detecção de aceleração de audiência (`🔥 Em Alta`, `↑ Subindo`, `Estável`, `↓ Caindo`).
- **Curva Minuto a Minuto:** Gráfico de evolução da audiência nos últimos 30 minutos (`minutesAgo`).
- **Canais do Dia (Intraday):** Distribuição do tráfego de hoje (Google Busca, Google Discover, Direto, Redes Sociais, WhatsApp).

### 📺 Modo TV Redação (Fullscreen)
- Layout especial de alto contraste para exibição contínua em televisores e monitores de redação.
- Tipografia ampliada (38px+) legível a longa distância.
- Atualização automática em segundo plano a cada 30 segundos com indicador de status de conexão.
- Rotina de renovação silenciosa de sessão para manter a tela ativa sem interrupções.

### 📊 Relatórios Históricos Consolidados
- **Visão Geral:** Séries temporais de Sessões, Usuários Únicos reais, Pageviews e Taxa de Rejeição.
- **Aquisição de Tráfego:** Análise detalhada por canais de entrada.
- **Público & Dispositivos:** Distribuição de acessos por Mobile, Desktop e Tablet.
- **Engajamento:** Páginas mais lidas no período e eventos coletados.
- **Metas & Conversões:** Painel de eventos-chave configurados na propriedade.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** HTML5, Vanilla CSS3 (Design responsivo e Dark Mode TV), Vanilla JavaScript.
- **Bibliotecas Visuais:** [Chart.js](https://www.chartjs.org/) e [D3.js](https://d3js.org/).
- **APIs Oficiais Google:**
  - Google Analytics Data API v1beta (`runReport` e `runRealtimeReport`).
  - Google Analytics Admin API v1beta (`accountSummaries`).
  - Google Identity Services (OAuth 2.0).

---

## 🚀 Como Executar Localmente

```bash
# 1. Clone o repositório
git clone <URL_DO_SEU_REPOSITORIO>
cd GA4-Analytics-Dashboard

# 2. Instale as dependências
npm install

# 3. Configure o backend com uma Service Account fora do repositório
# PowerShell:
$env:GOOGLE_SERVICE_ACCOUNT_FILE="$env:LOCALAPPDATA\SCC10\secrets\ga4-service-account.json"
$env:SCC10_PROPERTY_ID="309943616"
$env:SCC10_ADMIN_USERNAME="admin"
$env:SCC10_ADMIN_PASSWORD="defina-uma-senha-forte"

# 4. Inicie o backend (terminal 1)
npm run backend

# 5. Inicie o frontend (terminal 2)
npm run start

# 6. Abra no navegador
# http://localhost:3000/
```

---

## 🔧 Configuração no Google Cloud

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Analytics Data API** e a **Google Analytics Admin API**.
2. Crie uma **Service Account** e gere uma chave JSON na aba `Chaves`.
3. Adicione o e-mail da Service Account ao gerenciamento de acesso da propriedade GA4 com permissão de leitura.
4. Configure `GOOGLE_SERVICE_ACCOUNT_FILE` apontando para o JSON fora deste repositório.
5. Configure o primeiro usuário administrativo com `SCC10_ADMIN_USERNAME` e `SCC10_ADMIN_PASSWORD`.
6. Use `/api/health` e `/api/config` para confirmar `authMode: service-account` e `configured: true`.

O OAuth do navegador permanece no código apenas como fallback legado durante a migração. O fluxo principal do projeto usa a Service Account no backend. `SCC10_ADMIN_TOKEN` permanece somente como fallback temporário na API. Instalações que usam apenas esse token devem configurar `SCC10_ADMIN_USERNAME` e `SCC10_ADMIN_PASSWORD` no backend e reiniciar o serviço para criar o primeiro usuário antes de administrar pela nova tela; o token sozinho não habilita o login visual.

Para trocar a senha depois da criação do usuário, execute `npm run admin:rotate-password -- admin` em um terminal interativo na raiz do projeto. A senha é solicitada sem aparecer na tela ou no histórico do shell; o comando revoga as sessões antigas. Alterar `SCC10_ADMIN_PASSWORD` sozinho não muda a senha de um usuário já criado. Remova essa variável do ambiente após a criação inicial. A troca da senha não desativa o fallback `SCC10_ADMIN_TOKEN`; remova essa variável do ambiente e reinicie o backend para revogar também o token legado.

## 🧭 Estrutura atual

```text
index.html              inicialização e preflight GA4
dashboard.html          dashboard principal
configuracao.html       configuração operacional
ranking-teste.html      experimento isolado de metadados
materia.html            detalhe e origens de uma matéria
src/js/                 estado, serviços, autenticação e renderização
src/css/                estilos do dashboard
server/                 API Node.js, autenticação, GA4 e SQLite
data/                   banco local (ignorado pelo Git)
docs/                   visão do produto, arquitetura, decisões, roadmap e testes
```

O plano de organização, limpeza e próximos upgrades está em `docs/PLANO-EVOLUCAO.md`.
O fluxo de branches e Pull Requests está em `docs/FLUXO-GIT.md`.

## ✅ Estado verificado

- Service Account autenticada no backend.
- Relatório GA4 real respondendo sem token no navegador.
- Coletor realtime independente salvando snapshots a cada 30 segundos.
- Dashboard carregando ranking, categorias, autores, URLs e métricas reais.
- Histórico local alimentado pelo SQLite.
