// Client API for project serverless functions.

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

export async function listBackendFunctions({ idToken, projectId }) {
  const res = await fetch(`${API_URL}/api/functions/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao listar'), { status: res.status });
  return data?.functions || [];
}

export async function getBackendFunction({ idToken, projectId, name }) {
  const res = await fetch(
    `${API_URL}/api/functions/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao ler'), { status: res.status });
  return data?.function || null;
}

export async function saveBackendFunction({ idToken, projectId, name, body }) {
  const res = await fetch(
    `${API_URL}/api/functions/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      headers: authHeaders(idToken),
      body: JSON.stringify(body),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao guardar'), { status: res.status, code: data?.code });
  return data?.function;
}

export async function deleteBackendFunction({ idToken, projectId, name }) {
  const res = await fetch(
    `${API_URL}/api/functions/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha ao apagar'), { status: res.status });
  return data;
}

export async function runBackendFunction({ idToken, projectId, name, payload }) {
  const res = await fetch(
    `${API_URL}/api/functions/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}/run`,
    {
      method: 'POST',
      headers: authHeaders(idToken),
      body: JSON.stringify({ payload: payload || {} }),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || 'Falha ao executar'), {
      status: res.status,
      logs: data?.logs,
    });
  }
  return data;
}

export async function listBackendFunctionLogs({ idToken, projectId, name }) {
  const res = await fetch(
    `${API_URL}/api/functions/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}/logs`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha nos logs'), { status: res.status });
  return data?.logs || [];
}

export async function tickCronFunctions({ idToken, projectId }) {
  const res = await fetch(`${API_URL}/api/functions/cron/tick`, {
    method: 'POST',
    headers: authHeaders(idToken),
    body: JSON.stringify({ projectId }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Falha no cron'), { status: res.status });
  return data;
}

export function httpInvokeUrl(projectId, name) {
  const base = API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/api/functions/invoke/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}`;
}

export const DEFAULT_HANDLER_CODE = `async function handler(ctx) {
  // ctx.env — secrets do projeto
  // ctx.entity.list/get/create/update/remove
  // ctx.payload — body do HTTP / dados do evento
  ctx.log('hello', ctx.projectId);
  return { ok: true, at: new Date().toISOString() };
}
`;
