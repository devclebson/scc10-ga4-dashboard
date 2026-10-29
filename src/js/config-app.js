const API_BASE = window.SCC10_API_BASE || 'http://127.0.0.1:3001';
const statusEl = document.querySelector('#config-status');
const propertyEl = document.querySelector('#config-property');
const authEl = document.querySelector('#config-auth');
const backendEl = document.querySelector('#config-backend');
const tokenInput = document.querySelector('#admin-token');
const propertyInput = document.querySelector('#config-property-input');
const rangeInput = document.querySelector('#config-range-input');
const compareInput = document.querySelector('#config-compare-input');
const intervalInput = document.querySelector('#config-interval-input');
const refreshButton = document.querySelector('#refresh-config');
const saveButton = document.querySelector('#save-config');

function adminHeaders() {
  const token = tokenInput.value.trim();
  return token ? { 'X-Admin-Token': token } : {};
}

function fillForm(config) {
  propertyInput.value = config.propertyId || '';
  rangeInput.value = config.defaultDateRange || '30';
  compareInput.checked = config.compareEnabled !== false;
  intervalInput.value = config.collectorIntervalSeconds || 30;
  propertyEl.textContent = config.propertyId || '--';
  authEl.textContent = config.authMode === 'service-account' ? 'Service Account' : (config.authMode || '--');
}

async function loadConfigurationStatus() {
  statusEl.textContent = 'Verificando backend...';
  statusEl.className = 'config-status loading';
  try {
    const [healthResponse, publicConfigResponse] = await Promise.all([
      fetch(`${API_BASE}/api/health`),
      fetch(`${API_BASE}/api/config`)
    ]);
    const health = await healthResponse.json();
    const publicConfig = await publicConfigResponse.json();
    if (!healthResponse.ok || !publicConfigResponse.ok) throw new Error('Backend indisponível.');

    backendEl.textContent = health.ok ? 'Online' : 'Indisponível';
    const adminResponse = await fetch(`${API_BASE}/api/admin/config`, { headers: adminHeaders() });
    const adminConfig = await adminResponse.json();
    if (adminResponse.ok) {
      fillForm(adminConfig);
      statusEl.textContent = 'Configuração administrativa carregada';
      statusEl.className = 'config-status success';
      return;
    }

    fillForm(publicConfig);
    statusEl.textContent = 'Backend online. Informe o token administrativo para editar.';
    statusEl.className = 'config-status';
  } catch (error) {
    propertyEl.textContent = '--';
    authEl.textContent = '--';
    backendEl.textContent = 'Indisponível';
    statusEl.textContent = `Não foi possível verificar o backend: ${error.message}`;
    statusEl.className = 'config-status error';
  }
}

async function saveConfiguration() {
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';
  try {
    const response = await fetch(`${API_BASE}/api/admin/config`, {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: propertyInput.value.trim(),
        defaultDateRange: rangeInput.value,
        compareEnabled: compareInput.checked,
        collectorIntervalSeconds: Number(intervalInput.value)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
    fillForm(data);
    statusEl.textContent = 'Configuração salva com sucesso';
    statusEl.className = 'config-status success';
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = 'config-status error';
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Salvar configuração';
  }
}

refreshButton.addEventListener('click', loadConfigurationStatus);
saveButton.addEventListener('click', saveConfiguration);
loadConfigurationStatus();
