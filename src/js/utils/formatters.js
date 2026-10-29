export function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

export function formatNumber(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) {
    return (num / 1000000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' mi';
  }
  if (num >= 1000) {
    return (num / 1000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' mil';
  }
  return num.toLocaleString('pt-BR');
}

export function formatCurrency(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function calcChange(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (p === 0) return { pct: '0.0', dir: 'neutral' };
  const pct = ((c - p) / p) * 100;
  return {
    pct: Math.abs(pct).toFixed(1),
    dir: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'neutral'
  };
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str || '')));
  return div.innerHTML;
}
