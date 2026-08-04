import { SETTINGS_KEYS, getUserSettings, saveUserSettings } from './userSettings';

export const THEME_OPTIONS = ['dark', 'light'];
export const THEME_STORAGE_KEY = SETTINGS_KEYS.theme;
export const THEME_CHANGE_EVENT = 'gocreate-theme-change';

export function getThemePreference() {
  const raw = getUserSettings().theme;
  if (raw === 'system') return 'dark';
  return THEME_OPTIONS.includes(raw) ? raw : 'dark';
}

/** Alias público. */
export function getTheme() {
  return getThemePreference();
}

export function resolveTheme(preference = getThemePreference()) {
  return preference === 'light' ? 'light' : 'dark';
}

/** Aplica classe dark|light no <html>. Default = dark (identidade premium). */
export function applyTheme(preference = getThemePreference()) {
  const resolved = resolveTheme(preference);
  if (typeof document === 'undefined') return resolved;

  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(resolved);
  root.dataset.theme = preference;
  root.dataset.resolvedTheme = resolved;
  return resolved;
}

export function setThemePreference(preference) {
  const next = THEME_OPTIONS.includes(preference) ? preference : 'dark';
  saveUserSettings({ theme: next });
  const resolved = applyTheme(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: next, resolved } })
    );
  }
  return resolved;
}

/** Alias público. */
export function setTheme(preference) {
  return setThemePreference(preference);
}

export function initTheme() {
  const preference = getThemePreference();
  applyTheme(preference);
  return preference;
}

/** No-op: tema System removido (só Dark/Light). */
export function subscribeSystemTheme() {
  return () => {};
}

/**
 * Escuta mudanças de tema:
 * - storage (outras abas)
 * - CustomEvent (mesma aba, fora do React)
 */
export function subscribeThemeStorage(onChange) {
  if (typeof window === 'undefined') return () => {};

  const emit = () => {
    const preference = getThemePreference();
    const resolved = applyTheme(preference);
    onChange?.({ preference, resolved });
  };

  const onStorage = (e) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) emit();
  };

  const onCustom = (e) => {
    const preference = e?.detail?.preference ?? getThemePreference();
    const resolved = e?.detail?.resolved ?? applyTheme(preference);
    onChange?.({ preference, resolved });
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onCustom);
  };
}

export { SETTINGS_KEYS };
