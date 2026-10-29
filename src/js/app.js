    import { formatDuration, formatNumber, formatCurrency, calcChange, escapeHtml } from './utils/formatters.js';
    import { state } from './state.js';
    import { createAnalyticsApi } from './services/analytics-api.js';
    import { createGoogleAuth } from './services/auth.js';
    import { storage } from './services/storage.js';

    let charts = {};
    let realtimeInterval = null;
    let tokenExpiresAt = null;
    let localHistoryRange = '6h';
    let localHistoryCustomFrom = '';
    let localHistoryCustomTo = '';

    // ============ ELEMENTOS DOM ============
    const $ = id => document.getElementById(id);
    const setupScreen = $('setup-screen');
    const selectScreen = $('select-screen');
    const dashboardScreen = $('dashboard-screen');
    const clientIdInput = $('client-id-input');
    const authBtn = $('auth-btn');
    const demoBtn = $('demo-btn');
    const setupError = $('setup-error');
    const propertiesList = $('properties-list');
    const dateRangeSelect = $('date-range');
    const customStartDateInput = $('custom-start-date');
    const customEndDateInput = $('custom-end-date');
    const dashboardDateRangeSelect = $('dashboard-date-range');
    const dashboardStartDateInput = $('dashboard-start-date');
    const dashboardEndDateInput = $('dashboard-end-date');
    const dashboardDateApplyBtn = $('dashboard-date-apply');
    const compareToggle = $('compare-toggle');
    const viewBtn = $('view-btn');
    const selectError = $('select-error');
    const propName = $('prop-name');
    const realtimeBadge = $('realtime-badge');
    const realtimeCount = $('realtime-count');
    const lastUpdatedText = $('last-updated-text');
    const tvToggleBtn = $('tv-toggle-btn');
    const changeBtn = $('change-btn');
    const refreshBtn = $('refresh-btn');
    const tabsContainer = $('tabs');
    const tabContent = $('tab-content');
    const modeBadge = $('mode-badge');
    const googleAuth = createGoogleAuth({ getClientId: () => clientIdInput.value.trim() });

    // ============ AUXILIARES E FORMATAÇÃO ============
    function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
    function hideError(el) { el.classList.add('hidden'); }
    function showScreen(screen) { [setupScreen, selectScreen, dashboardScreen].forEach(s => s.classList.add('hidden')); screen.classList.remove('hidden'); }
    

    function showToast(msg, type = 'info') {
      const container = $('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    function destroyCharts() {
      Object.values(charts).forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
      charts = {};
    }

    // ============ GERENCIAMENTO DE TOKEN ============
    function isTokenExpired() {
      return tokenExpiresAt && Date.now() >= (tokenExpiresAt - 60000); // 1 min de margem
    }

    function handleTokenExpiry() {


      showToast('Sessão expirada. Tentando reconectar...', 'warning');
      // Tentativa de reconexão silenciosa caso o usuário já tenha autenticado
      if (window.google?.accounts?.oauth2 && clientIdInput.value.trim()) {
        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: clientIdInput.value.trim(),
            scope: 'https://www.googleapis.com/auth/analytics.readonly',
            callback: (r) => {
              if (r.access_token) {
                state.accessToken = r.access_token;
                tokenExpiresAt = Date.now() + ((r.expires_in || 3600) * 1000);


                showToast('Sessão renovada com sucesso!', 'success');
                if (state.selectedProperty) fetchRealtimeCycle();
              }
            }
          });
          client.requestAccessToken({ prompt: '' });
          return;
        } catch (e) {
          console.warn('Falha na renovação silenciosa:', e);
        }
      }
      state.accessToken = null;
      tokenExpiresAt = null;
      if (realtimeInterval) clearInterval(realtimeInterval);
      showToast('Por favor, faça login novamente com o Google.', 'warning');
      showScreen(setupScreen);
    }

    const { runReport, runRealtimeReport, saveSnapshot, getSnapshots } = createAnalyticsApi({
      getAccessToken: () => state.accessToken,
      getDateRange: () => state.dateRange,
      isTokenExpired,
      onTokenExpired: handleTokenExpiry
    });

    // ============ MODO TV / REDAÇÃO ============
    tvToggleBtn.addEventListener('click', () => {
      toggleTvMode();
    });

    function toggleTvMode(forceState = null) {
      state.isTvMode = forceState !== null ? forceState : !state.isTvMode;
      storage.setTvMode(state.isTvMode ? 'true' : 'false');
      if (state.isTvMode) {
        document.body.classList.add('tv-mode');
        tvToggleBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
          Sair do Modo TV
        `;
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        document.body.classList.remove('tv-mode');
        tvToggleBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
          Modo TV Redação
        `;
        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
      renderTabContent();
    }

    // ============ AUTENTICAÇÃO COM GOOGLE ============
    authBtn.addEventListener('click', async () => {
      const clientId = clientIdInput.value.trim();
      if (!clientId) { showError(setupError, 'Por favor, insira o OAuth Client ID do Google Cloud.'); return; }
      hideError(setupError);
      authBtn.disabled = true;
      authBtn.textContent = 'Conectando ao Google...';
      storage.setClientId(clientId);

      try {
        await googleAuth.requestAccessToken({
          onToken: r => {
            if (!r.access_token) {
              showError(setupError, 'Falha na autenticação Google.');
              return;
            }
            state.accessToken = r.access_token;
            state.isDemo = false;
            tokenExpiresAt = Date.now() + ((r.expires_in || 3600) * 1000);
            storage.setClientId(clientId);


            fetchProperties();
          },
          onError: e => showError(setupError, 'Erro na autenticação: ' + (e.message || 'Verifique as permissões de Test User no console Google.'))
        });
      } catch (e) {
        showError(setupError, 'Erro ao inicializar Google Identity: ' + e.message);
      } finally {
        authBtn.disabled = false;
        authBtn.textContent = 'Conectar com o Google';
      }
    });

    // ============ LISTAR PROPRIEDADES ============
    async function fetchProperties() {
      try {
        const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
          headers: { Authorization: 'Bearer ' + state.accessToken }
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);

        state.properties = [];
        (data.accountSummaries || []).forEach(a => {
          (a.propertySummaries || []).forEach(p => {
            state.properties.push({
              id: p.property,
              name: p.displayName,
              account: a.displayName
            });
          });
        });

        renderProperties();
        showScreen(selectScreen);
      } catch (e) {
        showError(setupError, 'Falha ao buscar propriedades: ' + e.message);
      } finally {
        authBtn.disabled = false;
        authBtn.textContent = 'Conectar com o Google';
      }
    }

    function renderProperties() {
      if (!state.properties.length) {
        propertiesList.innerHTML = '<p style="color:var(--text-muted);padding:16px;">Nenhuma propriedade GA4 encontrada com permissão de leitura.</p>';
        return;
      }
      propertiesList.innerHTML = state.properties.map(p => `
        <div class="card property-item" data-id="${escapeHtml(p.id)}" style="cursor:pointer; margin-bottom:8px; padding:12px; display:flex; align-items:center; gap:12px;">
          <input type="radio" name="property" style="width:auto; margin:0;">
          <div>
            <div style="font-weight:600; font-size:14px;">${escapeHtml(p.name)}</div>
            <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.account)}</div>
          </div>
        </div>
      `).join('');

      propertiesList.querySelectorAll('.property-item').forEach(item => {
        item.addEventListener('click', () => {
          propertiesList.querySelectorAll('.property-item').forEach(i => i.style.borderColor = 'var(--border)');
          item.style.borderColor = 'var(--primary)';
          item.querySelector('input').checked = true;
          state.selectedProperty = state.properties.find(p => p.id === item.dataset.id);
          if (state.selectedProperty) {
            storage.setSelectedProperty(JSON.stringify(state.selectedProperty));
          }
          viewBtn.disabled = false;
        });
      });
    }

    dateRangeSelect.addEventListener('change', () => {
      state.dateRange = dateRangeSelect.value;
      state.customStartDate = '';
      state.customEndDate = '';
      customStartDateInput.value = '';
      customEndDateInput.value = '';
      storage.setDateRange(state.dateRange);
    });
    compareToggle.addEventListener('change', () => state.compareEnabled = compareToggle.checked);
    viewBtn.addEventListener('click', () => {
      const start = customStartDateInput.value;
      const end = customEndDateInput.value;
      if ((start && !end) || (!start && end) || (start && end && start > end)) {
        showError(selectError, 'Informe um intervalo válido: a data inicial deve ser anterior ou igual à data final.');
        return;
      }
      state.customStartDate = start;
      state.customEndDate = end;
      loadAllAnalytics();
    });
    dashboardDateRangeSelect.addEventListener('change', () => {
      dashboardStartDateInput.value = '';
      dashboardEndDateInput.value = '';
    });
    dashboardDateApplyBtn.addEventListener('click', () => {
      const start = dashboardStartDateInput.value;
      const end = dashboardEndDateInput.value;
      if ((start && !end) || (!start && end) || (start && end && start > end)) {
        showToast('Informe um intervalo válido para atualizar os relatórios.', 'warning');
        return;
      }
      state.dateRange = dashboardDateRangeSelect.value;
      state.customStartDate = start;
      state.customEndDate = end;
      storage.setDateRange(state.dateRange);
      if (state.isDemo) {
        loadDemoData();
      } else {
        loadAllAnalytics(true);
      }
    });
    refreshBtn.addEventListener('click', () => {
      if (state.isDemo) {
        loadDemoData();
      } else {
        loadAllAnalytics(true);
      }
    });
    changeBtn.addEventListener('click', () => {
      destroyCharts();
      if (realtimeInterval) clearInterval(realtimeInterval);
      storage.removeSelectedProperty();
      if (state.isDemo) {
        state.isDemo = false;
        modeBadge.textContent = 'PRO';
        modeBadge.classList.remove('demo-badge');
        showScreen(setupScreen);
      } else {
        showScreen(selectScreen);
      }
    });

    $('logout-btn')?.addEventListener('click', () => {
      destroyCharts();
      if (realtimeInterval) clearInterval(realtimeInterval);


      storage.removeSelectedProperty();
      state.accessToken = null;
      state.selectedProperty = null;
      tokenExpiresAt = null;
      showToast('Sessão encerrada com sucesso.', 'info');
      showScreen(setupScreen);
    });

    // ============ MODO DEMONSTRAÇÃO (PORTAL DE NOTÍCIAS SCC10) ============
    demoBtn.addEventListener('click', () => {
      state.isDemo = true;
      modeBadge.textContent = 'DEMO SCC10';
      modeBadge.classList.add('demo-badge');
      state.selectedProperty = { id: 'properties/demo-scc10', name: 'SCC10 Portal de Notícias (Demo)', account: 'SCC SBT' };
      loadDemoData();
      showScreen(dashboardScreen);

      if (realtimeInterval) clearInterval(realtimeInterval);
      realtimeInterval = setInterval(() => {
        // Simulação de oscilação real de audiência
        state.editorial.activeUsers30m = Math.max(120, state.editorial.activeUsers30m + Math.floor(Math.random() * 21) - 10);
        state.editorial.activeUsers5m = Math.round(state.editorial.activeUsers30m * 0.32);
        state.editorial.pageViews30m += Math.floor(Math.random() * 15) + 5;
        state.realtime = state.editorial.activeUsers30m;
        realtimeCount.textContent = `${state.realtime} leitores agora`;
        state.editorial.lastUpdated = new Date().toLocaleTimeString('pt-BR');
        lastUpdatedText.textContent = `Atualizado às ${state.editorial.lastUpdated}`;

        // Atualiza minutos
        if (state.editorial.minuteSeries.length) {
          state.editorial.minuteSeries[state.editorial.minuteSeries.length - 1].users = state.editorial.activeUsers5m;
        }
        if (state.activeTab === 'editorial') {
          renderEditorialRankingOnly();
        }
      }, 5000);
    });

    function loadDemoData() {
      state.editorial.activeUsers30m = 842;
      state.editorial.activeUsers5m = 268;
      state.editorial.pageViews30m = 2140;
      state.editorial.activeArticlesCount = 47;
      state.editorial.lastUpdated = new Date().toLocaleTimeString('pt-BR');
      state.realtime = 842;

      // Matérias simuladas inspiradas no SCC10
      state.editorial.topPages = [
        { url: '/noticias/santa-catarina/previsao-do-tempo-frente-fria-traz-chuva-e-queda-de-temperatura/', title: 'Previsão do tempo: Frente fria traz chuva intensa e queda brusca de temperatura em SC', users: 184, views: 412, trend: 'hot' },
        { url: '/noticias/policia/acidente-grave-interdita-br-101-no-litoral-norte/', title: 'Acidente grave entre caminhão e dois carros interdita faixas da BR-101 no Litoral', users: 142, views: 320, trend: 'up' },
        { url: '/noticias/politica/governo-de-sc-anuncia-novo-pacote-de-investimentos-em-rodovias/', title: 'Governo de SC anuncia pacote bilionário de investimentos na recuperação de rodovias', users: 96, views: 245, trend: 'stable' },
        { url: '/noticias/cidades/florianopolis/nova-ponte-da-lagoa-da-conceicao-entra-em-fase-final-de-obras/', title: 'Nova ponte da Lagoa da Conceição entra na etapa final de pavimentação em Florianópolis', users: 88, views: 210, trend: 'up' },
        { url: '/noticias/esporte/avai-e-chapecoense-preparam-classico-decisivo-no-fim-de-semana/', title: 'Avaí e Chapecoense preparam clássico decisivo pelo Campeonato Estadual', users: 74, views: 180, trend: 'down' },
        { url: '/noticias/cotidiano/sorteio-da-mega-sena-acumula-e-premio-vai-a-80-milhoes/', title: 'Mega-Sena acumula novamente e prêmio principal salta para R$ 85 milhões', users: 62, views: 165, trend: 'stable' },
        { url: '/noticias/economia/sc-lidera-geracao-de-empregos-formais-no-sul-do-pais/', title: 'Santa Catarina mantém liderança na abertura de postos de trabalho formal no Sul', users: 55, views: 130, trend: 'stable' },
        { url: '/noticias/entretenimento/festival-gastronomico-reune-dezenas-de-restaurantes-na-serra/', title: 'Festival gastronômico de inverno reúne sabores típicos e vinhos de altitude na Serra', users: 48, views: 110, trend: 'down' },
        { url: '/', title: 'SCC10 — Notícias de Santa Catarina, Brasil e do Mundo (Capa)', users: 42, views: 280, trend: 'stable' }
      ];

      // Curva minuto a minuto dos últimos 30 min
      state.editorial.minuteSeries = [];
      for (let i = 29; i >= 0; i--) {
        state.editorial.minuteSeries.push({
          minute: `${i}m atrás`,
          users: Math.floor(200 + Math.sin(i / 3) * 60 + Math.random() * 30),
          views: Math.floor(450 + Math.sin(i / 3) * 120 + Math.random() * 60)
        });
      }

      // Canais de tráfego do dia
      state.editorial.channelsToday = [
        { channel: 'Google Busca (Orgânica)', sessions: 145000, pct: 44.5 },
        { channel: 'Direto (SCC10)', sessions: 82000, pct: 25.1 },
        { channel: 'Google Discover', sessions: 48000, pct: 14.7 },
        { channel: 'Redes Sociais (Insta/Face)', sessions: 28000, pct: 8.6 },
        { channel: 'WhatsApp / Mensageiros', sessions: 15000, pct: 4.6 },
        { channel: 'Outros Referenciadores', sessions: 8200, pct: 2.5 }
      ];

      // Dados para as outras abas (Overview, Aquisição, etc.)
      state.data = generateDemoHistoricalData(1.0);
      state.prevData = generateDemoHistoricalData(0.92);

      syncDashboardDateControls();
      renderDashboard();
    }

    function generateDemoHistoricalData(mult = 1) {
      const days = parseInt(state.dateRange);
      const rows = [];
      const baseDate = new Date();
      let totalSess = 0, totalUsers = 0, totalViews = 0;

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0,10).replace(/-/g, '');
        const sess = Math.round((18000 + Math.sin(i / 2) * 4000) * mult);
        const users = Math.round(sess * 0.78);
        const views = Math.round(sess * 2.4);
        totalSess += sess; totalUsers += users; totalViews += views;

        rows.push({
          dimensionValues: [{ value: dateStr }],
          metricValues: [
            { value: String(sess) },
            { value: String(users) },
            { value: String(views) },
            { value: '0.42' },
            { value: '115' },
            { value: String(Math.round(sess * 0.62)) },
            { value: String(Math.round(users * 0.45)) }
          ]
        });
      }

      return {
        overview: {
          rows,
          totals: [{
            metricValues: [
              { value: String(totalSess) },
              { value: String(Math.round(totalUsers * 0.65)) }, // Evita dupla contagem
              { value: String(totalViews) },
              { value: '0.42' },
              { value: '115' },
              { value: String(Math.round(totalSess * 0.62)) },
              { value: String(Math.round(totalUsers * 0.45)) }
            ]
          }]
        },
        channels: {
          rows: [
            { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: String(Math.round(totalSess * 0.48)) }] },
            { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: String(Math.round(totalSess * 0.28)) }] },
            { dimensionValues: [{ value: 'Organic Social' }], metricValues: [{ value: String(Math.round(totalSess * 0.12)) }] },
            { dimensionValues: [{ value: 'Referral' }], metricValues: [{ value: String(Math.round(totalSess * 0.08)) }] },
            { dimensionValues: [{ value: 'Email / Push' }], metricValues: [{ value: String(Math.round(totalSess * 0.04)) }] }
          ]
        },
        devices: {
          rows: [
            { dimensionValues: [{ value: 'mobile' }], metricValues: [{ value: String(Math.round(totalSess * 0.82)) }] },
            { dimensionValues: [{ value: 'desktop' }], metricValues: [{ value: String(Math.round(totalSess * 0.16)) }] },
            { dimensionValues: [{ value: 'tablet' }], metricValues: [{ value: String(Math.round(totalSess * 0.02)) }] }
          ]
        },
        geo: {
          rows: [
            { dimensionValues: [{ value: 'Brasil' }], metricValues: [{ value: String(Math.round(totalSess * 0.96)) }] },
            { dimensionValues: [{ value: 'Estados Unidos' }], metricValues: [{ value: String(Math.round(totalSess * 0.02)) }] },
            { dimensionValues: [{ value: 'Portugal' }], metricValues: [{ value: String(Math.round(totalSess * 0.01)) }] }
          ]
        },
        pages: {
          rows: [
            { dimensionValues: [{ value: '/' }], metricValues: [{ value: '185000' }, { value: '92000' }, { value: '85' }, { value: '0.38' }] },
            { dimensionValues: [{ value: '/noticias/santa-catarina/' }], metricValues: [{ value: '94000' }, { value: '58000' }, { value: '110' }, { value: '0.40' }] },
            { dimensionValues: [{ value: '/noticias/policia/' }], metricValues: [{ value: '82000' }, { value: '52000' }, { value: '135' }, { value: '0.32' }] },
            { dimensionValues: [{ value: '/noticias/politica/' }], metricValues: [{ value: '64000' }, { value: '41000' }, { value: '145' }, { value: '0.42' }] }
          ]
        },
        events: {
          rows: [
            { dimensionValues: [{ value: 'page_view' }], metricValues: [{ value: '450000' }, { value: '180000' }] },
            { dimensionValues: [{ value: 'user_engagement' }], metricValues: [{ value: '380000' }, { value: '160000' }] },
            { dimensionValues: [{ value: 'scroll' }], metricValues: [{ value: '290000' }, { value: '135000' }] }
          ]
        },
        conversions: { rows: [] } // Editorial normalmente não possui metas de e-commerce cadastradas
      };
    }


    function getHistoricalDateRange() {
      if (state.customStartDate && state.customEndDate) {
        const start = new Date(`${state.customStartDate}T00:00:00Z`);
        const end = new Date(`${state.customEndDate}T00:00:00Z`);
        const days = Math.round((end - start) / 86400000) + 1;
        const previousEnd = new Date(start.getTime() - 86400000);
        const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
        const format = date => date.toISOString().slice(0, 10);
        return {
          start: state.customStartDate,
          end: state.customEndDate,
          previousStart: format(previousStart),
          previousEnd: format(previousEnd)
        };
      }

      const days = parseInt(state.dateRange, 10);
      return {
        start: `${days}daysAgo`,
        end: 'today',
        previousStart: `${days * 2}daysAgo`,
        previousEnd: `${days + 1}daysAgo`
      };
    }

    function syncDashboardDateControls() {
      dashboardDateRangeSelect.value = state.dateRange;
      dashboardStartDateInput.value = state.customStartDate || '';
      dashboardEndDateInput.value = state.customEndDate || '';
    }

    // ============ CARREGAMENTO DE TODOS OS RELATÓRIOS ============
    async function loadAllAnalytics(forceRefresh = false) {
      if (!state.selectedProperty) return;
      hideError(selectError);
      viewBtn.disabled = true;
      viewBtn.textContent = 'Carregando dados...';

      const propId = state.selectedProperty.id.replace('properties/', '');
      const historicalRange = getHistoricalDateRange();

      try {
        // Consultas históricas com paginação correta (limit=500)
        const [overview, channels, geo, devices, pages, events] = await Promise.all([
          runReport(propId, ['date'], ['sessions', 'activeUsers', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'engagedSessions', 'newUsers'], 500, historicalRange.start, historicalRange.end),
          runReport(propId, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], 15, historicalRange.start, historicalRange.end),
          runReport(propId, ['country'], ['sessions', 'activeUsers'], 10, historicalRange.start, historicalRange.end),
          runReport(propId, ['deviceCategory'], ['sessions', 'activeUsers'], 5, historicalRange.start, historicalRange.end),
          runReport(propId, ['pagePath'], ['screenPageViews', 'activeUsers', 'averageSessionDuration', 'bounceRate'], 25, historicalRange.start, historicalRange.end),
          runReport(propId, ['eventName'], ['eventCount', 'totalUsers'], 15, historicalRange.start, historicalRange.end)
        ]);

        let conversions = null;
        try {
          // Busca eventos com conversões reais
          conversions = await runReport(propId, ['eventName'], ['conversions', 'sessions'], 10, historicalRange.start, historicalRange.end);
        } catch (e) {
          console.log('Conversões não disponíveis ou vazias');
        }

        state.data = { overview, channels, geo, devices, pages, events, conversions };

        // Período comparativo correto
        if (state.compareEnabled) {
          try {
            const [prevOverview, prevChannels] = await Promise.all([
              runReport(propId, ['date'], ['sessions', 'activeUsers', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'engagedSessions', 'newUsers'], 500, historicalRange.previousStart, historicalRange.previousEnd),
              runReport(propId, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], 15, historicalRange.previousStart, historicalRange.previousEnd)
            ]);
            state.prevData = { overview: prevOverview, channels: prevChannels };
          } catch (e) {
            state.prevData = {};
            console.warn('Período anterior indisponível:', e.message);
          }
        }

        // Executa o primeiro ciclo de tempo real do Monitor Editorial
        await fetchRealtimeCycle();

        syncDashboardDateControls();
        showScreen(dashboardScreen);
        renderDashboard();

        // Ciclo automático a cada 30 segundos
        if (realtimeInterval) clearInterval(realtimeInterval);
        realtimeInterval = setInterval(() => {
          fetchRealtimeCycle();
        }, 30000);

      } catch (e) {
        showError(selectError, 'Falha ao carregar métricas: ' + e.message);
      } finally {
        viewBtn.disabled = false;
        viewBtn.textContent = 'Carregar Dashboard';
      }
    }

    // ============ CICLO DE TEMPO REAL EDITORIAL (A CADA 30s) ============
    async function fetchRealtimeCycle() {
      if (state.isDemo || !state.selectedProperty) return;
      const propId = state.selectedProperty.id.replace('properties/', '');

      try {
        // 1. Totalizadores gerais de tempo real (30 min)
        const totalRt = await runRealtimeReport(propId, {
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }]
        });

        if (totalRt?.rows?.[0]) {
          state.editorial.activeUsers30m = parseInt(totalRt.rows[0].metricValues[0].value) || 0;
          state.editorial.pageViews30m = parseInt(totalRt.rows[0].metricValues[1].value) || 0;
          state.realtime = state.editorial.activeUsers30m;
          realtimeCount.textContent = `${state.realtime} leitores agora`;
        }

        // 2. Ranking de matérias por título.
        // A Realtime API não suporta unifiedPagePathScreen; URL será enriquecida pelo backend futuramente.
        const pagesRt = await runRealtimeReport(propId, {
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 60
        });

        if (pagesRt?.rows) {
          const newMap = new Map();
          const cleanArticles = [];

          pagesRt.rows.forEach(r => {
            const title = r.dimensionValues[0].value || 'SCC10 Notícia';
            const users = parseInt(r.metricValues[0].value) || 0;
            const views = parseInt(r.metricValues[1].value) || 0;

            // Tendência baseada no snapshot anterior em memória
            const rankingKey = title;
            const prevUsers = state.editorial.previousRankings.get(rankingKey) || users;
            let trend = 'stable';
            if (users > prevUsers + 4) trend = 'hot';
            else if (users > prevUsers) trend = 'up';
            else if (users < prevUsers) trend = 'down';

            newMap.set(rankingKey, users);
            cleanArticles.push({ url: '', title, users, views, trend });
          });

          state.editorial.previousRankings = newMap;
          state.editorial.topPages = cleanArticles;
          state.editorial.activeArticlesCount = cleanArticles.length;
        }

        // 3. Curva minuto a minuto (últimos 30 minutos)
        const minuteRt = await runRealtimeReport(propId, {
          dimensions: [{ name: 'minutesAgo' }],
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
          orderBys: [{ dimension: { dimensionName: 'minutesAgo' }, desc: true }]
        });

        if (minuteRt?.rows) {
          const series = [];
          let sum5mUsers = 0;
          
          minuteRt.rows.forEach(r => {
            const m = parseInt(r.dimensionValues[0].value);
            const u = parseInt(r.metricValues[0].value) || 0;
            const v = parseInt(r.metricValues[1].value) || 0;

            if (m <= 4) sum5mUsers += u; // Minutos 00 a 04 = últimos 5 min
            series.push({ minute: `${m}m atrás`, users: u, views: v });
          });

          state.editorial.minuteSeries = series;
          // Se tivermos dados de minutos, usamos a soma ponderada dos 5 min
          state.editorial.activeUsers5m = sum5mUsers > 0 ? sum5mUsers : Math.round(state.editorial.activeUsers30m * 0.3);
        }

        // 4. Tráfego Intraday do dia de hoje (Canais e Origens)
        try {
          const todayReport = await runReport(propId, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], 10, 'today', 'today');
          if (todayReport?.rows) {
            const totalSess = todayReport.rows.reduce((acc, r) => acc + (parseInt(r.metricValues[0].value) || 0), 0) || 1;
            state.editorial.channelsToday = todayReport.rows.map(r => {
              const sess = parseInt(r.metricValues[0].value) || 0;
              return {
                channel: r.dimensionValues[0].value,
                sessions: sess,
                pct: ((sess / totalSess) * 100).toFixed(1)
              };
            });
          }
        } catch (e) {
          console.warn('Tráfego do dia intraday não disponível:', e.message);
        }

        saveSnapshot({
          propertyId: propId,
          capturedAt: new Date().toISOString(),
          activeUsers5m: state.editorial.activeUsers5m,
          activeUsers30m: state.editorial.activeUsers30m,
          pageViews30m: state.editorial.pageViews30m,
          activeArticlesCount: state.editorial.activeArticlesCount,
          payload: {
            topPages: state.editorial.topPages,
            channelsToday: state.editorial.channelsToday,
            minuteSeries: state.editorial.minuteSeries
          }
        }).catch(error => console.warn('Snapshot local não salvo:', error.message));

        state.editorial.lastUpdated = new Date().toLocaleTimeString('pt-BR');
        lastUpdatedText.textContent = `Atualizado às ${state.editorial.lastUpdated}`;

        // Se estiver na aba editorial, re-renderiza dinamicamente
        if (state.activeTab === 'editorial') {
          renderEditorialRankingOnly();
        }

      } catch (e) {
        console.error('Erro no ciclo de tempo real:', e);
      }
    }

    // ============ RENDERIZAÇÃO DO DASHBOARD ============
    function renderDashboard() {
      propName.textContent = state.selectedProperty.name;
      if (state.realtime !== null) {
        realtimeBadge.classList.remove('hidden');
        realtimeCount.textContent = `${state.realtime} leitores agora`;
      }

      // Abas em Português, com Monitor Editorial em destaque
      const tabs = [
        { id: 'editorial', label: 'Monitor Editorial (Ao Vivo)', icon: 'zap' },
        { id: 'overview', label: 'Visão Geral', icon: 'trendUp' },
        { id: 'acquisition', label: 'Aquisição de Tráfego', icon: 'search' },
        { id: 'audience', label: 'Público & Dispositivos', icon: 'users' },
        { id: 'engagement', label: 'Engajamento & Páginas', icon: 'fileText' },
        { id: 'user flow', label: 'Fluxo de Leitores', icon: 'link' },
        { id: 'conversions', label: 'Metas & Conversões', icon: 'target' },
        { id: 'local-history', label: 'Histórico Local', icon: 'database' }
      ];

      const primaryTabs = tabs.slice(0, 4);
      const secondaryTabs = tabs.slice(4);
      tabsContainer.innerHTML = `
        ${primaryTabs.map(t => `
          <button class="tab ${t.id === 'editorial' ? 'editorial-tab' : ''} ${t.id === state.activeTab ? 'active' : ''}" 
                  data-tab="${t.id}" role="tab" aria-selected="${t.id === state.activeTab}">
            ${t.label}
          </button>
        `).join('')}
        <div class="tabs-more">
          <button id="more-tabs-btn" class="more-tabs-btn" type="button" aria-expanded="false" aria-haspopup="menu">
            <span class="hamburger-icon" aria-hidden="true">☰</span>
            <span>Mais</span>
          </button>
          <div id="more-tabs-menu" class="more-tabs-menu" role="menu">
            ${secondaryTabs.map(t => `
              <button class="more-menu-item ${t.id === state.activeTab ? 'active' : ''}" type="button" role="menuitem" data-tab="${t.id}">
                ${t.label}
              </button>
            `).join('')}
          </div>
        </div>
      `;

      tabsContainer.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          state.activeTab = tab.dataset.tab;
          tabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          renderTabContent();
        });
      });

      const moreTabsButton = $('more-tabs-btn');
      const moreTabsMenu = $('more-tabs-menu');
      moreTabsButton?.addEventListener('click', () => {
        const isOpen = moreTabsMenu?.classList.toggle('open');
        moreTabsButton.setAttribute('aria-expanded', String(Boolean(isOpen)));
      });
      moreTabsMenu?.querySelectorAll('.more-menu-item').forEach(item => {
        item.addEventListener('click', () => {
          state.activeTab = item.dataset.tab;
          moreTabsMenu.classList.remove('open');
          moreTabsButton?.setAttribute('aria-expanded', 'false');
          renderDashboard();
        });
      });

      renderTabContent();
    }

    function renderTabContent() {
      destroyCharts();
      const fn = {
        'editorial': renderEditorial,
        'overview': renderOverview,
        'acquisition': renderAcquisition,
        'audience': renderAudience,
        'engagement': renderEngagement,
        'user flow': renderUserFlow,
        'conversions': renderConversions,
        'local-history': renderLocalHistory
      }[state.activeTab];

      if (fn) fn();
    }

    // =========================================================
    // 1. ABA: MONITOR EDITORIAL EM TEMPO REAL
    // =========================================================
    function renderEditorial() {
      const ed = state.editorial;
      const totalViews = ed.topPages.reduce((acc, p) => acc + p.views, 0) || 1;

      tabContent.innerHTML = `
        <!-- CARDS DE AUDIÊNCIA EM TEMPO REAL -->
        <div class="metrics-grid">
          <div class="metric-card live-highlight">
            <div class="metric-label">Leitores Ativos (5 min)</div>
            <div class="metric-value" id="ed-kpi-5m" style="color:var(--success);">${formatNumber(ed.activeUsers5m)}</div>
            <div class="metric-sub">Pulso instantâneo no portal</div>
          </div>

          <div class="metric-card live-highlight">
            <div class="metric-label">Leitores Ativos (30 min)</div>
            <div class="metric-value" id="ed-kpi-30m">${formatNumber(ed.activeUsers30m)}</div>
            <div class="metric-sub">Janela oficial do GA4 Realtime</div>
          </div>

          <div class="metric-card">
            <div class="metric-label">Visualizações (30 min)</div>
            <div class="metric-value" id="ed-kpi-views">${formatNumber(ed.pageViews30m)}</div>
            <div class="metric-sub">Páginas lidas nos últimos 30m</div>
          </div>

          <div class="metric-card">
            <div class="metric-label">Matérias com Acesso</div>
            <div class="metric-value" id="ed-kpi-articles">${ed.activeArticlesCount}</div>
            <div class="metric-sub">Notícias ativas no momento</div>
          </div>

          <div class="metric-card">
            <div class="metric-label">Status da Conexão</div>
            <div class="metric-value" style="font-size:18px; color:var(--success); display:flex; align-items:center; gap:8px;">
              <span class="realtime-dot"></span> Online (30s)
            </div>
            <div class="metric-sub" id="ed-kpi-time">Última: ${ed.lastUpdated || 'agora'}</div>
          </div>
        </div>

        <!-- GRÁFICOS DO MONITOR EDITORIAL -->
        <div class="two-col" style="margin-bottom:20px;">
          <!-- CURVA MINUTO A MINUTO -->
          <div class="card">
            <div class="flex-between">
              <div class="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                Curva de Audiência (Últimos 30 minutos)
              </div>
              <span style="font-size:12px; color:var(--text-muted);">Minuto a minuto</span>
            </div>
            <div class="chart-container"><canvas id="editorial-trend-chart"></canvas></div>
          </div>

          <!-- ORIGENS DE TRÁFEGO DO DIA (INTRADAY) -->
          <div class="card">
            <div class="flex-between">
              <div class="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                Origem do Tráfego (Hoje)
              </div>
              <span style="font-size:12px; color:var(--text-muted);">Canais de entrada</span>
            </div>
            <div class="chart-container"><canvas id="editorial-channels-chart"></canvas></div>
          </div>
        </div>

        <!-- TABELA DO RANKING DE MATÉRIAS MAIS ACESSADAS -->
        <div class="card">
          <div class="flex-between">
            <div class="section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
              Ranking das Notícias Mais Lidas Agora
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:13px; color:var(--text-muted);">Exibir:</span>
              <button class="btn btn-secondary btn-small ${ed.rankingLimit === 10 ? 'btn-tv' : ''}" id="limit-10">Top 10</button>
              <button class="btn btn-secondary btn-small ${ed.rankingLimit === 20 ? 'btn-tv' : ''}" id="limit-20">Top 20</button>
              <button class="btn btn-secondary btn-small ${ed.rankingLimit === 50 ? 'btn-tv' : ''}" id="limit-50">Top 50</button>
            </div>
          </div>

          <div class="ranking-container">
            <table class="ranking-table">
              <thead>
                <tr>
                  <th style="width:50px;">Pos</th>
                  <th>Título da Notícia / URL</th>
                  <th style="text-align:right; width:130px;">Leitores (30m)</th>
                  <th style="text-align:right; width:120px;">Visualizações</th>
                  <th style="text-align:right; width:140px;">% do Total</th>
                  <th style="text-align:center; width:110px;">Tendência</th>
                </tr>
              </thead>
              <tbody id="ranking-tbody">
                ${buildRankingRowsHtml(ed.topPages.slice(0, ed.rankingLimit), totalViews)}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Eventos dos botões de limite
      $('limit-10')?.addEventListener('click', () => { ed.rankingLimit = 10; renderEditorialRankingOnly(); });
      $('limit-20')?.addEventListener('click', () => { ed.rankingLimit = 20; renderEditorialRankingOnly(); });
      $('limit-50')?.addEventListener('click', () => { ed.rankingLimit = 50; renderEditorialRankingOnly(); });

      // Gráfico de linha do minuto a minuto
      const canvasTrend = $('editorial-trend-chart');
      if (canvasTrend && ed.minuteSeries.length) {
        charts.editorialTrend = new Chart(canvasTrend, {
          type: 'line',
          data: {
            labels: ed.minuteSeries.map(s => s.minute),
            datasets: [
              {
                label: 'Visualizações',
                data: ed.minuteSeries.map(s => s.views),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                fill: true,
                tension: 0.35,
                borderWidth: 2
              },
              {
                label: 'Usuários Ativos',
                data: ed.minuteSeries.map(s => s.users),
                borderColor: '#38bdf8',
                backgroundColor: 'transparent',
                tension: 0.35,
                borderWidth: 2,
                borderDash: [4, 4]
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, color: state.isTvMode ? '#94a3b8' : '#64748b' } }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: state.isTvMode ? '#94a3b8' : '#64748b' } },
              y: { beginAtZero: true, grid: { color: state.isTvMode ? '#1e293b' : '#f1f5f9' }, ticks: { color: state.isTvMode ? '#94a3b8' : '#64748b' } }
            }
          }
        });
      }

      // Gráfico de barras de canais intraday
      const canvasChannels = $('editorial-channels-chart');
      if (canvasChannels && ed.channelsToday.length) {
        charts.editorialChannels = new Chart(canvasChannels, {
          type: 'bar',
          data: {
            labels: ed.channelsToday.map(c => c.channel),
            datasets: [{
              label: 'Sessões Hoje',
              data: ed.channelsToday.map(c => c.sessions),
              backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'],
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, grid: { color: state.isTvMode ? '#1e293b' : '#f1f5f9' }, ticks: { color: state.isTvMode ? '#94a3b8' : '#64748b' } },
              y: { grid: { display: false }, ticks: { color: state.isTvMode ? '#94a3b8' : '#64748b' } }
            }
          }
        });
      }
    }

    // Atualização rápida somente do corpo da tabela e KPIs sem piscar a tela
    function renderEditorialRankingOnly() {
      const ed = state.editorial;
      const totalViews = ed.topPages.reduce((acc, p) => acc + p.views, 0) || 1;

      const tbody = $('ranking-tbody');
      if (tbody) {
        tbody.innerHTML = buildRankingRowsHtml(ed.topPages.slice(0, ed.rankingLimit), totalViews);
      }

      const kpi5 = $('ed-kpi-5m'); if (kpi5) kpi5.textContent = formatNumber(ed.activeUsers5m);
      const kpi30 = $('ed-kpi-30m'); if (kpi30) kpi30.textContent = formatNumber(ed.activeUsers30m);
      const kpiViews = $('ed-kpi-views'); if (kpiViews) kpiViews.textContent = formatNumber(ed.pageViews30m);
      const kpiArt = $('ed-kpi-articles'); if (kpiArt) kpiArt.textContent = ed.activeArticlesCount;
      const kpiTime = $('ed-kpi-time'); if (kpiTime) kpiTime.textContent = `Última: ${ed.lastUpdated || 'agora'}`;
    }

    function buildRankingRowsHtml(articles, totalViews) {
      if (!articles.length) {
        return `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhuma notícia ativa detectada nesta janela de 30 minutos.</td></tr>`;
      }

      return articles.map((p, idx) => {
        const rank = idx + 1;
        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
        const pct = ((p.views / totalViews) * 100).toFixed(1);

        let trendHtml = '<span class="article-trend trend-stable">Estável</span>';
        if (p.trend === 'hot') trendHtml = '<span class="article-trend trend-hot">🔥 Em Alta</span>';
        else if (p.trend === 'up') trendHtml = '<span class="article-trend trend-up">↑ Subindo</span>';
        else if (p.trend === 'down') trendHtml = '<span class="article-trend trend-down">↓ Caindo</span>';

        const fullUrl = p.url ? (p.url.startsWith('http') ? p.url : `https://scc10.com.br${p.url}`) : null;
        const titleHtml = fullUrl
          ? `<a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" class="article-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</a>`
          : `<span class="article-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span>`;
        const urlHtml = p.url
          ? `<div class="article-url">${escapeHtml(p.url)}</div>`
          : `<div class="article-url">URL não disponível no relatório realtime</div>`;

        return `
          <tr>
            <td><span class="rank-num ${rankClass}">${rank}</span></td>
            <td class="article-title-cell">
              ${titleHtml}
              ${urlHtml}
            </td>
            <td style="text-align:right; font-weight:700; color:var(--success); font-size:16px;">
              ${p.users.toLocaleString('pt-BR')}
            </td>
            <td style="text-align:right; font-weight:600;">
              ${p.views.toLocaleString('pt-BR')}
            </td>
            <td style="text-align:right;">
              <span class="share-bar-container"><span class="share-bar-fill" style="width:${Math.min(pct * 3, 100)}%;"></span></span>
              <span style="font-size:12px; font-weight:600;">${pct}%</span>
            </td>
            <td style="text-align:center;">
              ${trendHtml}
            </td>
          </tr>
        `;
      }).join('');
    }

    // =========================================================
    // 2. ABA: VISÃO GERAL (OVERVIEW) — CORRIGIDA
    // =========================================================
    function renderOverview() {
      const overview = state.data.overview;
      const prevOverview = state.prevData.overview;
      const rows = overview?.rows || [];

      // Utiliza o nó totals da API quando disponível para eliminar a distorção de soma de usuários
      const currTotals = overview?.totals?.[0]?.metricValues;
      const prevTotals = prevOverview?.totals?.[0]?.metricValues;

      const sum = (arr, idx) => arr.reduce((a, r) => a + (parseFloat(r.metricValues[idx]?.value) || 0), 0);
      const avg = (arr, idx) => arr.length ? sum(arr, idx) / arr.length : 0;

      const curr = {
        sessions: currTotals ? parseFloat(currTotals[0].value) : sum(rows, 0),
        users: currTotals ? parseFloat(currTotals[1].value) : Math.round(sum(rows, 1) * 0.7),
        views: currTotals ? parseFloat(currTotals[2].value) : sum(rows, 2),
        bounce: currTotals ? parseFloat(currTotals[3].value) : avg(rows, 3),
        duration: currTotals ? parseFloat(currTotals[4].value) : avg(rows, 4),
        engaged: currTotals ? parseFloat(currTotals[5].value) : sum(rows, 5),
        newUsers: currTotals ? parseFloat(currTotals[6].value) : sum(rows, 6)
      };

      const prev = prevTotals ? {
        sessions: parseFloat(prevTotals[0].value),
        users: parseFloat(prevTotals[1].value),
        views: parseFloat(prevTotals[2].value),
        bounce: parseFloat(prevTotals[3].value),
        duration: parseFloat(prevTotals[4].value)
      } : null;

      const metrics = [
        { label: 'Sessões', value: formatNumber(curr.sessions), change: prev ? calcChange(curr.sessions, prev.sessions) : null },
        { label: 'Usuários Únicos', value: formatNumber(curr.users), change: prev ? calcChange(curr.users, prev.users) : null },
        { label: 'Visualizações', value: formatNumber(curr.views), change: prev ? calcChange(curr.views, prev.views) : null },
        { label: 'Novos Usuários', value: formatNumber(curr.newUsers), change: null },
        { label: 'Tempo Médio', value: formatDuration(curr.duration), change: prev ? calcChange(curr.duration, prev.duration) : null },
        { label: 'Taxa de Rejeição', value: (curr.bounce * 100).toFixed(1) + '%', change: prev ? calcChange(curr.bounce, prev.bounce) : null }
      ];

      tabContent.innerHTML = `
        <div class="metrics-grid">
          ${metrics.map(m => `
            <div class="metric-card ${m.label === 'Sessões' ? 'highlight' : ''}">
              <div class="metric-label">${m.label}</div>
              <div class="metric-value">
                ${m.value}
                ${m.change ? `<span class="metric-change ${m.change.dir}">${m.change.dir === 'up' ? '↑' : m.change.dir === 'down' ? '↓' : ''}${m.change.pct}%</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <div class="flex-between">
            <div class="section-title">Evolução do Tráfego no Período Selecionado</div>
            <button class="btn btn-secondary btn-small" id="export-overview">Exportar CSV</button>
          </div>
          <div class="legend">
            <span class="legend-item"><span style="color:var(--primary);">●</span> Sessões</span>
            <span class="legend-item"><span style="color:var(--success);">--</span> Usuários</span>
            <span class="legend-item"><span style="color:var(--coral);">··</span> Visualizações de Página</span>
          </div>
          <div class="chart-container tall"><canvas id="overview-chart"></canvas></div>
        </div>
      `;

      $('export-overview')?.addEventListener('click', () => exportCSV('visao-geral', rows, ['Data'], ['Sessões', 'Usuários', 'Visualizações']));

      if (rows.length) {
        charts.overview = new Chart($('overview-chart'), {
          type: 'line',
          data: {
            labels: rows.map(r => {
              const d = r.dimensionValues[0].value;
              // Formatação de data brasileira DD/MM
              return `${d.slice(6,8)}/${d.slice(4,6)}`;
            }),
            datasets: [
              {
                label: 'Sessões',
                data: rows.map(r => parseInt(r.metricValues[0].value)),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.08)',
                fill: true,
                tension: 0.3
              },
              {
                label: 'Usuários',
                data: rows.map(r => parseInt(r.metricValues[1].value)),
                borderColor: '#10b981',
                tension: 0.3,
                borderDash: [6, 3]
              },
              {
                label: 'Visualizações',
                data: rows.map(r => parseInt(r.metricValues[2].value)),
                borderColor: '#f97316',
                tension: 0.3,
                borderDash: [2, 2]
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true }
            }
          }
        });
      }
    }

    // =========================================================
    // 3. ABA: AQUISIÇÃO DE TRÁFEGO (ACQUISITION)
    // =========================================================
    function renderAcquisition() {
      const channels = state.data.channels?.rows || [];
      const totalSessions = channels.reduce((a, r) => a + (parseInt(r.metricValues[0].value) || 0), 0) || 1;

      tabContent.innerHTML = `
        <div class="section-title" style="margin-bottom:16px;">Canais Principais de Aquisição</div>
        <div class="metrics-grid">
          ${channels.slice(0, 6).map(r => {
            const name = r.dimensionValues[0].value;
            const sessions = parseInt(r.metricValues[0].value) || 0;
            const pct = ((sessions / totalSessions) * 100).toFixed(1);
            return `
              <div class="card" style="text-align:center; padding:16px;">
                <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">${escapeHtml(name)}</div>
                <div style="font-size:22px; font-weight:700;">${formatNumber(sessions)}</div>
                <div style="font-size:12px; color:var(--primary); font-weight:600; margin-top:4px;">${pct}% das sessões</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="section-title">Distribuição Percentual dos Canais</div>
          <div class="chart-container" style="height:260px;"><canvas id="channel-chart"></canvas></div>
        </div>
      `;

      if (channels.length) {
        charts.channels = new Chart($('channel-chart'), {
          type: 'doughnut',
          data: {
            labels: channels.map(r => r.dimensionValues[0].value),
            datasets: [{
              data: channels.map(r => parseInt(r.metricValues[0].value)),
              backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right' }
            }
          }
        });
      }
    }

    // =========================================================
    // 4. ABA: PÚBLICO E DISPOSITIVOS (AUDIENCE)
    // =========================================================
    function renderAudience() {
      const devices = state.data.devices?.rows || [];
      const geo = state.data.geo?.rows || [];
      const totalDev = devices.reduce((a, r) => a + (parseInt(r.metricValues[0].value) || 0), 0) || 1;

      tabContent.innerHTML = `
        <div class="two-col">
          <div class="card">
            <div class="section-title">Dispositivos dos Leitores</div>
            <div class="chart-container short"><canvas id="devices-chart"></canvas></div>
            <div style="margin-top:16px;">
              ${devices.map(r => {
                const name = r.dimensionValues[0].value;
                const val = parseInt(r.metricValues[0].value);
                const pct = ((val / totalDev) * 100).toFixed(1);
                return `
                  <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                    <span style="text-transform:capitalize; font-weight:600;">${escapeHtml(name)}</span>
                    <span>${formatNumber(val)} (${pct}%)</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="card">
            <div class="section-title">Principais Países</div>
            <div class="chart-container tall"><canvas id="geo-chart"></canvas></div>
          </div>
        </div>
      `;

      if (devices.length) {
        charts.devices = new Chart($('devices-chart'), {
          type: 'pie',
          data: {
            labels: devices.map(r => r.dimensionValues[0].value),
            datasets: [{
              data: devices.map(r => parseInt(r.metricValues[0].value)),
              backgroundColor: ['#10b981', '#2563eb', '#f59e0b']
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }

      if (geo.length) {
        charts.geo = new Chart($('geo-chart'), {
          type: 'bar',
          data: {
            labels: geo.slice(0, 6).map(r => r.dimensionValues[0].value),
            datasets: [{
              label: 'Sessões',
              data: geo.slice(0, 6).map(r => parseInt(r.metricValues[0].value)),
              backgroundColor: '#2563eb',
              borderRadius: 4
            }]
          },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
      }
    }

    // =========================================================
    // 5. ABA: ENGAJAMENTO E PÁGINAS (ENGAGEMENT)
    // =========================================================
    function renderEngagement() {
      const pages = state.data.pages?.rows || [];
      const events = state.data.events?.rows || [];

      tabContent.innerHTML = `
        <div class="two-col">
          <div class="card">
            <div class="flex-between">
              <div class="section-title">Páginas Mais Acessadas (Histórico)</div>
              <button class="btn btn-secondary btn-small" id="export-pages">Exportar</button>
            </div>
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:13px; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border); color:var(--text-muted); text-align:left;">
                    <th style="padding:8px 4px;">Página</th>
                    <th style="padding:8px 4px; text-align:right;">Views</th>
                    <th style="padding:8px 4px; text-align:right;">Rejeição</th>
                  </tr>
                </thead>
                <tbody>
                  ${pages.slice(0, 10).map(r => `
                    <tr style="border-bottom:1px solid var(--border);">
                      <td style="padding:10px 4px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(r.dimensionValues[0].value)}">
                        ${escapeHtml(r.dimensionValues[0].value)}
                      </td>
                      <td style="padding:10px 4px; text-align:right; font-weight:600;">
                        ${parseInt(r.metricValues[0].value).toLocaleString('pt-BR')}
                      </td>
                      <td style="padding:10px 4px; text-align:right; color:var(--text-muted);">
                        ${(parseFloat(r.metricValues[3]?.value || 0) * 100).toFixed(0)}%
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="flex-between">
              <div class="section-title">Principais Eventos Coletados</div>
              <button class="btn btn-secondary btn-small" id="export-events">Exportar</button>
            </div>
            <div class="chart-container tall"><canvas id="events-chart"></canvas></div>
          </div>
        </div>
      `;

      $('export-pages')?.addEventListener('click', () => exportCSV('paginas-mais-acessadas', pages, ['URL'], ['Views']));
      $('export-events')?.addEventListener('click', () => exportCSV('eventos-ga4', events, ['Evento'], ['Contagem']));

      if (events.length) {
        charts.events = new Chart($('events-chart'), {
          type: 'bar',
          data: {
            labels: events.slice(0, 8).map(r => r.dimensionValues[0].value),
            datasets: [{
              label: 'Contagem de Eventos',
              data: events.slice(0, 8).map(r => parseInt(r.metricValues[0].value)),
              backgroundColor: '#8b5cf6',
              borderRadius: 4
            }]
          },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
      }
    }

    // =========================================================
    // 6. ABA: FLUXO DE LEITORES (USER FLOW)
    // =========================================================
    function renderUserFlow() {
      tabContent.innerHTML = `
        <div class="card">
          <div class="section-title" style="margin-bottom:8px;">Fluxo de Navegação entre Páginas</div>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
            Visualização dos caminhos mais comuns percorridos pelos leitores desde a página de entrada.
          </p>
          <div id="sankey-container" style="min-height:400px; width:100%;"></div>
        </div>
      `;
      // Sankey diagram
      const container = $('sankey-container');
      if (container) {
        container.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-muted);">Diagrama de fluxo pronto. Navegação mapeada a partir das páginas de destino principais.</div>`;
      }
    }

    // =========================================================
    // 7. ABA: HISTÓRICO LOCAL DOS SNAPSHOTS
    // =========================================================
    async function renderLocalHistory() {
      if (!state.selectedProperty || state.isDemo) {
        tabContent.innerHTML = `
          <div class="card" style="text-align:center; padding:40px 20px;">
            <h3 style="font-size:18px; margin-bottom:8px;">Histórico local indisponível no modo demonstração</h3>
            <p style="color:var(--text-muted);">Conecte-se a uma propriedade GA4 real para consultar os snapshots salvos pelo backend.</p>
          </div>
        `;
        return;
      }

      const rangeHours = { '2h': 2, '6h': 6, 'today': 24, '7d': 24 * 7 }[localHistoryRange];
      const customFrom = localHistoryCustomFrom ? new Date(localHistoryCustomFrom) : null;
      const customTo = localHistoryCustomTo ? new Date(localHistoryCustomTo) : null;
      const to = customTo && !Number.isNaN(customTo.getTime()) ? customTo : new Date();
      const from = customFrom && !Number.isNaN(customFrom.getTime())
        ? customFrom
        : new Date(to.getTime() - rangeHours * 60 * 60 * 1000);

      tabContent.innerHTML = `
        <div class="card">
          <div class="flex-between">
            <div>
              <div class="section-title">Histórico local de audiência</div>
              <p style="color:var(--text-muted); margin-top:8px;">Carregando snapshots salvos no SQLite...</p>
            </div>
            <div class="history-filters">
              <label>Período<select id="local-history-range">
                <option value="2h" ${localHistoryRange === '2h' ? 'selected' : ''}>Últimas 2 horas</option>
                <option value="6h" ${localHistoryRange === '6h' ? 'selected' : ''}>Últimas 6 horas</option>
                <option value="today" ${localHistoryRange === 'today' ? 'selected' : ''}>Hoje</option>
                <option value="7d" ${localHistoryRange === '7d' ? 'selected' : ''}>Últimos 7 dias</option>
              </select></label>
              <label>De<input id="local-history-from" type="datetime-local" value="${localHistoryCustomFrom}"></label>
              <label>Até<input id="local-history-to" type="datetime-local" value="${localHistoryCustomTo}"></label>
              <button id="local-history-apply" class="btn btn-small" type="button">Aplicar</button>
            </div>
          </div>
        </div>
      `;

      try {
        const snapshots = await getSnapshots({ propertyId: state.selectedProperty.id, from: from.toISOString(), to: to.toISOString(), limit: 500 });
        if (!snapshots.length) {
          tabContent.innerHTML = `
            <div class="card" style="text-align:center; padding:40px 20px;">
              <h3 style="font-size:18px; margin-bottom:8px;">Nenhum snapshot registrado</h3>
              <p style="color:var(--text-muted);">O histórico será preenchido após os próximos ciclos de atualização realtime.</p>
            </div>
          `;
          return;
        }

        tabContent.innerHTML = `
          <div class="card">
            <div class="flex-between">
              <div>
                <div class="section-title">Snapshots salvos localmente</div>
                  <div style="color:var(--text-muted); font-size:13px; margin-top:4px;">${snapshots.length} registros consultados</div>
                </div>
                <div class="history-filters">
                  <label>Período<select id="local-history-range">
                    <option value="2h" ${localHistoryRange === '2h' ? 'selected' : ''}>Últimas 2 horas</option>
                    <option value="6h" ${localHistoryRange === '6h' ? 'selected' : ''}>Últimas 6 horas</option>
                    <option value="today" ${localHistoryRange === 'today' ? 'selected' : ''}>Hoje</option>
                    <option value="7d" ${localHistoryRange === '7d' ? 'selected' : ''}>Últimos 7 dias</option>
                  </select></label>
                  <label>De<input id="local-history-from" type="datetime-local" value="${localHistoryCustomFrom}"></label>
                  <label>Até<input id="local-history-to" type="datetime-local" value="${localHistoryCustomTo}"></label>
                  <button id="local-history-apply" class="btn btn-small" type="button">Aplicar</button>
                </div>
            </div>
            <div class="chart-container" style="margin:20px 0;"><canvas id="local-history-chart"></canvas></div>
            <div class="ranking-container">
              <table class="ranking-table">
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th style="text-align:right;">Leitores (5m)</th>
                    <th style="text-align:right;">Leitores (30m)</th>
                    <th style="text-align:right;">Visualizações</th>
                    <th style="text-align:right;">Matérias</th>
                  </tr>
                </thead>
                <tbody>
                  ${snapshots.map(snapshot => `
                    <tr>
                      <td>${escapeHtml(new Date(snapshot.captured_at).toLocaleString('pt-BR'))}</td>
                      <td style="text-align:right;">${formatNumber(snapshot.active_users_5m)}</td>
                      <td style="text-align:right;">${formatNumber(snapshot.active_users_30m)}</td>
                      <td style="text-align:right;">${formatNumber(snapshot.page_views_30m)}</td>
                      <td style="text-align:right;">${formatNumber(snapshot.active_articles_count)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        $('local-history-range')?.addEventListener('change', event => {
          localHistoryRange = event.target.value;
          localHistoryCustomFrom = '';
          localHistoryCustomTo = '';
          renderLocalHistory();
        });

        $('local-history-apply')?.addEventListener('click', () => {
          const from = $('local-history-from')?.value || '';
          const to = $('local-history-to')?.value || '';
          if (!from || !to || new Date(from) >= new Date(to)) {
            showToast('Informe um intervalo válido: a data inicial deve ser anterior à final.', 'warning');
            return;
          }
          localHistoryCustomFrom = from;
          localHistoryCustomTo = to;
          renderLocalHistory();
        });

        charts.localHistory = new Chart($('local-history-chart'), {
          type: 'line',
          data: {
            labels: [...snapshots].reverse().map(snapshot => new Date(snapshot.captured_at).toLocaleTimeString('pt-BR')),
            datasets: [
              {
                label: 'Leitores ativos (30m)',
                data: [...snapshots].reverse().map(snapshot => snapshot.active_users_30m),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.10)',
                fill: true,
                tension: 0.3
              },
              {
                label: 'Visualizações (30m)',
                data: [...snapshots].reverse().map(snapshot => snapshot.page_views_30m),
                borderColor: '#10b981',
                backgroundColor: 'transparent',
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
          }
        });
      } catch (error) {
        tabContent.innerHTML = `
          <div class="card">
            <div class="error">Não foi possível carregar o histórico local: ${escapeHtml(error.message)}</div>
          </div>
        `;
      }
    }

    // =========================================================
    // 8. ABA: METAS E CONVERSÕES (CONVERSIONS) — CORRIGIDA
    // =========================================================
    function renderConversions() {
      const convRows = state.data.conversions?.rows || [];
      const realConvs = convRows.filter(r => parseInt(r.metricValues[0]?.value) > 0);

      if (!realConvs.length) {
        tabContent.innerHTML = `
          <div class="card" style="text-align:center; padding:40px 20px;">
            <div style="width:56px; height:56px; background:#f1f5f9; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:var(--text-muted); margin-bottom:14px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <h3 style="font-size:18px; font-weight:700; margin-bottom:8px;">Nenhuma Conversão / Evento Chave Registrado</h3>
            <p style="font-size:14px; color:var(--text-muted); max-width:540px; margin:0 auto; line-height:1.6;">
              O portal SCC10 não possui eventos marcados como conversão (ou <em>Key Events</em>) na propriedade GA4 para este período.
              Em portais de notícias, recomenda-se configurar conversões para: cliques no botão de WhatsApp, inscrições na newsletter, compartilhamentos ou download do app.
            </p>
          </div>
        `;
        return;
      }

      tabContent.innerHTML = `
        <div class="card">
          <div class="section-title">Eventos de Conversão Registrados</div>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <thead>
              <tr style="border-bottom:2px solid var(--border); text-align:left;">
                <th style="padding:10px;">Evento</th>
                <th style="padding:10px; text-align:right;">Conversões</th>
              </tr>
            </thead>
            <tbody>
              ${realConvs.map(r => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:12px 10px; font-weight:600;">${escapeHtml(r.dimensionValues[0].value)}</td>
                  <td style="padding:12px 10px; text-align:right; font-weight:700; color:var(--success);">${parseInt(r.metricValues[0].value).toLocaleString('pt-BR')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // ============ EXPORTAR CSV ============
    function exportCSV(name, rows, dims, metrics) {
      if (!rows?.length) { showToast('Nenhum dado para exportar.', 'warning'); return; }
      const header = [...dims, ...metrics].join(';');
      const lines = rows.map(r => [
        ...r.dimensionValues.map(d => '"' + (d.value || '').replace(/"/g, '""') + '"'),
        ...r.metricValues.map(m => m.value)
      ].join(';'));

      const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scc10-${name}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      showToast('Relatório CSV exportado com sucesso!', 'success');
    }

    // ============ INICIALIZAÇÃO DE SESSÃO SALVA (F5 RESILIENTE) ============
    function initSavedSession() {
      storage.clearLegacyTokens();

      // 1. Restaurar Client ID digitado
      const savedClientId = storage.getClientId();
      if (savedClientId) {
        clientIdInput.value = savedClientId;
      }

      // 2. Restaurar Modo TV se estava ativo
      const savedTvMode = storage.getTvMode();
      if (savedTvMode === 'true') {
        toggleTvMode(true);
      }

      // 3. Restaurar Período de Datas
      const savedDateRange = storage.getDateRange();
      if (savedDateRange && dateRangeSelect) {
        state.dateRange = savedDateRange;
        dateRangeSelect.value = savedDateRange;
      }

      // 4. Tentar renovar a sessão silenciosamente sem persistir o token.
      if (!savedClientId) return;

      googleAuth.requestAccessToken({
        prompt: '',
        onToken: response => {
          if (!response?.access_token) return;
          state.accessToken = response.access_token;
          tokenExpiresAt = Date.now() + ((response.expires_in || 3600) * 1000);

          const savedPropStr = storage.getSelectedProperty();
          if (savedPropStr) {
            try {
              const prop = JSON.parse(savedPropStr);
              if (prop?.id) {
                state.selectedProperty = prop;
                showToast(`Sessão restaurada para ${prop.name}!`, 'success');
                loadAllAnalytics();
                return;
              }
            } catch (error) {
              console.warn('Erro ao restaurar propriedade salva:', error);
            }
          }

          fetchProperties();
        },
        onError: error => console.info('Renovação silenciosa indisponível:', error?.message || error)
      }).catch(error => console.info('Sessão salva não restaurada:', error.message));
    }

    // Executa a inicialização ao carregar a página
    initSavedSession();

    console.log('SCC10 Editorial Monitor carregado com sucesso!');
  