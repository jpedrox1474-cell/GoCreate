// Cliente DELETE /api/projects + helpers de thumbnail.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function apiUrl(path) {
  return `${API_URL}/api/projects${path}`;
}

/**
 * Gera SVG data-URL como placeholder (sem Unsplash).
 * @param {string} name
 * @param {string} [colorClass] Tailwind-ish gradient hint
 */
export function buildProjectThumbnailDataUrl(name = 'Projeto', colorClass = '') {
  const label = String(name || 'Projeto').trim() || 'Projeto';
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'GC';

  const palette = [
    ['#1e3a5f', '#2563eb'],
    ['#064e3b', '#059669'],
    ['#4c1d95', '#7c3aed'],
    ['#7c2d12', '#ea580c'],
    ['#881337', '#e11d48'],
    ['#164e63', '#0891b2'],
  ];
  let h = 0;
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  const [c1, c2] = palette[h % palette.length];
  // Prefer explicit blues if color hint mentions blue
  const from = /emerald|teal/.test(colorClass)
    ? ['#064e3b', '#059669']
    : /violet|purple/.test(colorClass)
      ? ['#4c1d95', '#7c3aed']
      : /amber|orange/.test(colorClass)
        ? ['#7c2d12', '#ea580c']
        : /rose|pink/.test(colorClass)
          ? ['#881337', '#e11d48']
          : /cyan/.test(colorClass)
            ? ['#164e63', '#0891b2']
            : [c1, c2];

  const safe = label.replace(/[<>&"']/g, '').slice(0, 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from[0]}"/>
      <stop offset="100%" stop-color="${from[1]}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="#09090b"/>
  <rect x="0" y="0" width="800" height="450" fill="url(#g)" opacity="0.85"/>
  <rect x="48" y="48" width="704" height="354" rx="16" fill="rgba(9,9,11,0.45)" stroke="rgba(255,255,255,0.08)"/>
  <text x="400" y="210" text-anchor="middle" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="rgba(255,255,255,0.92)">${initials}</text>
  <text x="400" y="270" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.55)">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Apaga um projeto via Cloud Function (Admin cascade).
 * @param {string} projectId
 * @param {string} idToken
 */
export async function deleteProjectViaApi(projectId, idToken) {
  const res = await fetch(apiUrl(`/${encodeURIComponent(projectId)}`), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Falha ao eliminar (${res.status})`);
  }
  return data;
}

/**
 * Apaga vários projetos via API.
 * @param {string[]} projectIds
 * @param {string} idToken
 */
export async function bulkDeleteProjectsViaApi(projectIds, idToken) {
  const res = await fetch(apiUrl('/bulk-delete'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Falha ao eliminar (${res.status})`);
  }
  return data;
}
