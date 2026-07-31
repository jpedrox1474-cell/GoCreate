/**
 * Helpers for the first-version project card thumbnails:
 * browser chrome + horizontal gradient + initials (no Unsplash).
 */

const GRADIENT_PALETTES = [
  { css: 'from-zinc-800 via-fuchsia-500 to-emerald-400', stops: ['#27272a', '#d946ef', '#34d399'] },
  { css: 'from-zinc-900 via-violet-500 to-pink-400', stops: ['#18181b', '#8b5cf6', '#f472b6'] },
  { css: 'from-neutral-800 via-rose-500 to-amber-400', stops: ['#262626', '#f43f5e', '#fbbf24'] },
  { css: 'from-slate-800 via-indigo-500 to-cyan-400', stops: ['#1e293b', '#6366f1', '#22d3ee'] },
  { css: 'from-zinc-800 via-pink-500 to-lime-400', stops: ['#27272a', '#ec4899', '#a3e635'] },
  { css: 'from-zinc-900 via-purple-500 to-teal-400', stops: ['#18181b', '#a855f7', '#2dd4bf'] },
  { css: 'from-neutral-900 via-sky-500 to-emerald-400', stops: ['#171717', '#0ea5e9', '#34d399'] },
  { css: 'from-slate-900 via-orange-500 to-rose-400', stops: ['#0f172a', '#f97316', '#fb7185'] },
];

export function getProjectInitials(name = 'Projeto') {
  const label = String(name || 'Projeto').trim() || 'Projeto';
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || 'GC';
}

function hashLabel(label = '') {
  let h = 0;
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return h;
}

function paletteFromColorHint(colorClass = '') {
  if (/emerald|teal/.test(colorClass)) return GRADIENT_PALETTES[0];
  if (/violet|purple/.test(colorClass)) return GRADIENT_PALETTES[1];
  if (/rose|pink/.test(colorClass)) return GRADIENT_PALETTES[2];
  if (/blue|indigo|cyan/.test(colorClass)) return GRADIENT_PALETTES[3];
  if (/amber|orange/.test(colorClass)) return GRADIENT_PALETTES[7];
  return null;
}

export function getProjectThumbPalette(name = 'Projeto', colorClass = '') {
  const hinted = paletteFromColorHint(colorClass);
  if (hinted) return hinted;
  const label = String(name || 'Projeto').trim() || 'Projeto';
  return GRADIENT_PALETTES[hashLabel(label) % GRADIENT_PALETTES.length];
}

export function getProjectThumbGradientClass(name = 'Projeto', colorClass = '') {
  return getProjectThumbPalette(name, colorClass).css;
}
