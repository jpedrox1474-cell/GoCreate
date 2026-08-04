// Cliente Data API — keys, OpenAPI, permissões.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function authHeaders(idToken) {
  return {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  };
}

export async function listApiKeys({ idToken, projectId }) {
  const res = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/api-keys`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao listar keys'), { status: res.status });
  return data?.keys || [];
}

export async function createApiKey({ idToken, projectId, name }) {
  const res = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/api-keys`, {
    method: 'POST',
    headers: authHeaders(idToken),
    body: JSON.stringify({ name }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao criar key'), { status: res.status });
  return data;
}

export async function revokeApiKey({ idToken, projectId, keyId }) {
  const res = await fetch(
    `${API_URL}/api/projects/${encodeURIComponent(projectId)}/api-keys/${encodeURIComponent(keyId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } }
  );
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao revogar key'), { status: res.status });
  return data;
}

export async function fetchOpenApiSpec(projectId) {
  const res = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/openapi.json`);
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao carregar OpenAPI'), { status: res.status });
  return data;
}

export function openApiDocsUrl(projectId) {
  return `${API_URL || ''}/api/projects/${encodeURIComponent(projectId)}/openapi.json`;
}

export const ACCESS_OPTIONS = [
  { id: 'public', label: 'Público' },
  { id: 'authenticated', label: 'Autenticado / API key' },
  { id: 'admin', label: 'Só admin (dono)' },
];
