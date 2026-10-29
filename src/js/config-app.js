const API_BASE = window.SCC10_API_BASE || 'http://127.0.0.1:3001';
const statusEl = document.querySelector('#config-status');
const propertyEl = document.querySelector('#config-property');
const authEl = document.querySelector('#config-auth');
const backendEl = document.querySelector('#config-backend');
const refreshButton = document.querySelector('#refresh-config');

async function loadConfigurationStatus() {
  statusEl.textContent = 'Verificando backend...';
  statusEl.className = 'config-status loading';
  try {
    const [healthResponse, configResponse] = await Promise.all([
      fetch(`${API_BASE}/api/health`),
      fetch(`${API_BASE}/api/config`)
    ]);
    const health = await healthResponse.json();
    const config = await configResponse.json();
    if (!healthResponse.ok || !configResponse.ok || !config.configured) {
      throw new Error('Backend sem configuração completa.');
    }

    propertyEl.textContent = config.propertyId;
    authEl.textContent = config.authMode === 'service-account' ? 'Service Account' : config.authMode;
    backendEl.textContent = health.ok ? 'Online' : 'Indisponível';
    statusEl.textContent = 'Configuração pronta';
    statusEl.className = 'config-status success';
  } catch (error) {
    propertyEl.textContent = '--';
    authEl.textContent = '--';
    backendEl.textContent = 'Indisponível';
    statusEl.textContent = `Não foi possível verificar o backend: ${error.message}`;
    statusEl.className = 'config-status error';
  }
}

refreshButton.addEventListener('click', loadConfigurationStatus);
loadConfigurationStatus();
