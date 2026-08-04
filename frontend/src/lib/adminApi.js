// Admin API — owner allowlist only.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function listAdminUsers({ idToken, limit = 50 }) {
  const res = await fetch(`${API_URL}/api/admin/users?limit=${limit}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || 'Falha ao listar utilizadores'), {
      status: res.status,
    });
  }
  return data?.users || [];
}

export async function adjustUserCredits({ idToken, uid, delta, setTo }) {
  const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(uid)}/credits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      typeof setTo === 'number' ? { setTo } : { delta: Number(delta) || 0 }
    ),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || 'Falha ao ajustar créditos'), {
      status: res.status,
    });
  }
  return data;
}
