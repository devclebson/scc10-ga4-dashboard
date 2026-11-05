import { getServiceAccountAccessToken } from './google-auth.js';

const DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties';

function propertyIdFrom(value) {
  const propertyId = String(value || '').replace(/^properties\//, '');
  if (!/^\d+$/.test(propertyId)) throw new Error('propertyId inválido.');
  return propertyId;
}

export async function requestGa4Report({ propertyId, reportType = 'standard', payload }) {
  const normalizedPropertyId = propertyIdFrom(propertyId);
  const method = reportType === 'realtime' ? 'runRealtimeReport' : 'runReport';
  const accessToken = await getServiceAccountAccessToken();
  if (!accessToken) {
    throw new Error('Service Account não configurada no backend.');
  }

  const response = await fetch(`${DATA_API_BASE}/${normalizedPropertyId}:${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json();
  return { status: response.status, data };
}

export async function getGa4Metadata(propertyId) {
  const normalizedPropertyId = propertyIdFrom(propertyId);
  const accessToken = await getServiceAccountAccessToken();
  if (!accessToken) throw new Error('Service Account não configurada no backend.');

  const response = await fetch(`${DATA_API_BASE}/${normalizedPropertyId}/metadata`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return { status: response.status, data };
}
