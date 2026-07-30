// Cliente deploy production (premium) — preview continua via Firestore directo.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Publica via Cloud Function (production exige Pro/Owner).
 */
export async function publishViaApi({
  idToken,
  projectId,
  files,
  name,
  env = 'production',
}) {
  const res = await fetch(`${API_URL}/api/deploy/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId, files, name, env }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export default publishViaApi;
