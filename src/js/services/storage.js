const KEYS = Object.freeze({
  clientId: 'scc10_client_id',
  selectedProperty: 'scc10_selected_property',
  dateRange: 'scc10_date_range',
  tvMode: 'scc10_is_tv_mode'
});

function read(key) {
  return localStorage.getItem(key);
}

function write(key, value) {
  localStorage.setItem(key, value);
}

function remove(key) {
  localStorage.removeItem(key);
}

export const storage = {
  getClientId: () => read(KEYS.clientId),
  setClientId: value => write(KEYS.clientId, value),

  getSelectedProperty: () => read(KEYS.selectedProperty),
  setSelectedProperty: value => write(KEYS.selectedProperty, value),
  removeSelectedProperty: () => remove(KEYS.selectedProperty),

  getDateRange: () => read(KEYS.dateRange),
  setDateRange: value => write(KEYS.dateRange, value),

  getTvMode: () => read(KEYS.tvMode),
  setTvMode: value => write(KEYS.tvMode, value),

  clearSession: () => remove(KEYS.selectedProperty),

  clearLegacyTokens: () => {
    remove('scc10_access_token');
    remove('scc10_token_expires_at');
  }
};
