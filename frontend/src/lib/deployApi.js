// Cliente deploy production (premium) — preview continua via Firestore directo.
// Slug APIs: check availability + update public path segment.

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
 * Redeploy always overwrites the same publicProjects/{projectId} snapshot.
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

/** GET availability for a public slug (alphanumeric + hyphen). */
export async function checkSlugAvailability({ idToken, slug, projectId }) {
  const q = new URLSearchParams({ slug: String(slug || '') });
  if (projectId) q.set('projectId', projectId);
  const res = await fetch(`${API_URL}/api/deploy/slug/check?${q}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** PUT customize public slug — only the /p/{slug} segment changes. */
export async function updateProjectSlug({ idToken, projectId, slug }) {
  const res = await fetch(`${API_URL}/api/deploy/slug`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId, slug }),
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
