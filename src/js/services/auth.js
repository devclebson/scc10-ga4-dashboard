const GOOGLE_IDENTITY_URL = 'https://accounts.google.com/gsi/client';
const GOOGLE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

let scriptPromise;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_URL}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_URL;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca do Google Identity Services.'));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function createGoogleAuth({ getClientId, scope = GOOGLE_ANALYTICS_SCOPE }) {
  async function requestAccessToken({ prompt, onToken, onError } = {}) {
    const clientId = getClientId();
    if (!clientId) throw new Error('OAuth Client ID não informado.');

    await loadGoogleIdentityScript();

    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: response => onToken?.(response),
      error_callback: error => onError?.(error)
    });

    client.requestAccessToken(prompt === undefined ? {} : { prompt });
  }

  return { requestAccessToken };
}
