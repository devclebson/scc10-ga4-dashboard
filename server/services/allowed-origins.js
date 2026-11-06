export function createAllowedOrigins(publicOrigin) {
  const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  if (!publicOrigin) return origins;
  let parsed;
  try {
    parsed = new URL(publicOrigin);
  } catch {
    throw new Error('SCC10_PUBLIC_ORIGIN deve ser uma origem HTTP(S) completa.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== publicOrigin) {
    throw new Error('SCC10_PUBLIC_ORIGIN deve conter apenas a origem, sem caminho ou credenciais.');
  }
  origins.add(publicOrigin);
  return origins;
}
