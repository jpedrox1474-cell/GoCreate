// Cliente DELETE /api/projects + helpers de thumbnail.

import { getProjectInitials, getProjectThumbPalette } from './projectThumb';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function apiUrl(path) {
  return `${API_URL}/api/projects${path}`;
}

/**
 * Gera SVG data-URL no estilo da 1ª versão (chrome + gradiente horizontal + iniciais).
 * Sem Unsplash / fotos stock.
 * @param {string} name
 * @param {string} [colorClass] Tailwind-ish gradient hint
 */
export function buildProjectThumbnailDataUrl(name = 'Projeto', colorClass = '') {
  const label = String(name || 'Projeto').trim() || 'Projeto';
  const initials = getProjectInitials(label);
  const { stops } = getProjectThumbPalette(label, colorClass);
  const [c1, c2, c3] = stops;
  const safe = label.replace(/[<>&"']/g, '').slice(0, 28);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" y1="0.5" x2="1" y2="0.5">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="50%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="#09090b"/>
  <rect x="0" y="0" width="800" height="36" fill="#18181b"/>
  <circle cx="22" cy="18" r="6" fill="#ef4444"/>
  <circle cx="42" cy="18" r="6" fill="#fbbf24"/>
  <circle cx="62" cy="18" r="6" fill="#22c55e"/>
  <rect x="82" y="12" width="220" height="12" rx="4" fill="#27272a"/>
  <rect x="0" y="36" width="800" height="414" fill="url(#g)"/>
  <text x="400" y="230" text-anchor="middle" font-family="system-ui,sans-serif" font-size="96" font-weight="700" fill="rgba(255,255,255,0.95)">${initials}</text>
  <text x="400" y="290" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.7)">${safe}</text>
  <rect x="36" y="370" width="48" height="48" rx="10" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.12)"/>
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
