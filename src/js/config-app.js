const API_BASE = window.SCC10_API_BASE || `http://${location.hostname || '127.0.0.1'}:3001`;
const statusEl = document.querySelector('#config-status');
const propertyEl = document.querySelector('#config-property');
const authEl = document.querySelector('#config-auth');
const backendEl = document.querySelector('#config-backend');
const loginPanel = document.querySelector('#admin-login');
const adminPanel = document.querySelector('#admin-content');
const usernameInput = document.querySelector('#admin-username');
const passwordInput = document.querySelector('#admin-password');
const loginButton = document.querySelector('#login-admin');
const loginError = document.querySelector('#login-error');
const sessionUserEl = document.querySelector('#admin-session-user');
const logoutButton = document.querySelector('#logout-admin');
const propertyInput = document.querySelector('#config-property-input');
const rangeInput = document.querySelector('#config-range-input');
const compareInput = document.querySelector('#config-compare-input');
const intervalInput = document.querySelector('#config-interval-input');
const refreshButton = document.querySelector('#refresh-config');
const saveButton = document.querySelector('#save-config');

async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { ...options, credentials: 'include' });
}

function showLogin() {
  loginPanel.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  sessionUserEl.textContent = '--';
}

function showAdmin(user) {
  loginPanel.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  sessionUserEl.textContent = user?.username || '--';
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
    const [healthResponse, publicConfigResponse, sessionResponse] = await Promise.all([
      apiFetch('/api/health'),
      apiFetch('/api/config'),
      apiFetch('/api/auth/session')
    ]);
    const health = await healthResponse.json();
    const publicConfig = await publicConfigResponse.json();
    const session = await sessionResponse.json();
    if (!healthResponse.ok || !publicConfigResponse.ok) throw new Error('Backend indisponível.');

    backendEl.textContent = health.ok ? 'Online' : 'Indisponível';
    if (!session.authenticated) {
      showLogin();
      fillForm(publicConfig);
      statusEl.textContent = health.passwordLoginConfigured
        ? 'Backend online. Faça login para administrar.'
        : 'Para migrar do token antigo, configure SCC10_ADMIN_USERNAME e SCC10_ADMIN_PASSWORD no backend e reinicie. O token permanece disponível apenas na API durante a migração.';
      statusEl.className = 'config-status';
      return;
    }

    showAdmin(session.user);
    const adminResponse = await apiFetch('/api/admin/config');
    const adminConfig = await adminResponse.json();
    if (adminResponse.ok) {
      fillForm(adminConfig);
      statusEl.textContent = 'Configuração administrativa carregada';
      statusEl.className = 'config-status success';
      return;
    }

    fillForm(publicConfig);
    showLogin();
    statusEl.textContent = 'Sessão expirada. Faça login novamente para administrar.';
    statusEl.className = 'config-status error';
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
    const response = await apiFetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

async function loginAdmin() {
  loginButton.disabled = true;
  loginButton.textContent = 'Entrando...';
  loginError.classList.add('hidden');
  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
    passwordInput.value = '';
    showAdmin(data.user);
    await loadConfigurationStatus();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar';
  }
}

async function logoutAdmin() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  showLogin();
  statusEl.textContent = 'Sessão encerrada. Faça login para administrar.';
  statusEl.className = 'config-status';
}

refreshButton.addEventListener('click', loadConfigurationStatus);
saveButton.addEventListener('click', saveConfiguration);
loginButton.addEventListener('click', loginAdmin);
logoutButton.addEventListener('click', logoutAdmin);
loadConfigurationStatus();
