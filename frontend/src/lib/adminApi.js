// Admin API — owner allowlist only.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function listAdminUsers({
  idToken,
  limit = 50,
  cursor = null,
  q = '',
  plan = '',
} = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (q) params.set('q', q);
  if (plan && plan !== 'all') params.set('plan', plan);

  const res = await fetch(`${API_URL}/api/admin/users?${params}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || 'Falha ao listar utilizadores'), {
      status: res.status,
    });
  }
  return {
    users: data?.users || [],
    nextCursor: data?.nextCursor || null,
    hasMore: Boolean(data?.hasMore),
    filtered: Boolean(data?.filtered),
  };
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
