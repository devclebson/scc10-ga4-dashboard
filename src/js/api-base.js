const localDevelopment = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '3000';
window.SCC10_API_BASE ||= localDevelopment ? `http://${location.hostname}:3001` : location.origin;
