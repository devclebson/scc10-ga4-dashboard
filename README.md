# SCC10 — Monitor Editorial & Analytics GA4

<p align="center">
  <img src="https://img.shields.io/badge/Google%20Analytics-4-orange?style=for-the-badge&logo=google-analytics" alt="GA4">
  <img src="https://img.shields.io/badge/Status-Produção%20Editorial-green?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Modo%20TV-Full%20HD-blue?style=for-the-badge" alt="Modo TV">
  <img src="https://img.shields.io/badge/Single%20File-HTML%2BJS-red?style=for-the-badge" alt="Single File">
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

# 2. Inicie o servidor local (porta 3000)
npx serve .

# 3. Abra no navegador
# http://localhost:3000
```

---

## 🔧 Configuração no Google Cloud

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Analytics Data API** e a **Google Analytics Admin API**.
2. Na tela de consentimento OAuth, adicione o escopo `https://www.googleapis.com/auth/analytics.readonly`.
3. Crie uma credencial de **ID do cliente OAuth 2.0 (Aplicativo da Web)**.
4. Adicione como **Origens JavaScript autorizadas**:
   - `http://localhost:3000`
5. Cole o **Client ID** na tela inicial do dashboard e clique em **Conectar com o Google**.
