// Preferências do utilizador persistidas no cliente (+ espelho Firestore quando há uid).

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const SETTINGS_KEYS = {
  theme: 'gocreate-theme',
  openai: 'gocreate-openai-key',
  anthropic: 'gocreate-anthropic-key',
  notifications: 'gocreate-notifications',
  bio: 'gocreate-profile-bio',
  photoURL: 'gocreate-profile-photo',
  company: 'gocreate-profile-company',
  phone: 'gocreate-profile-phone',
  timezone: 'gocreate-profile-timezone',
  website: 'gocreate-profile-website',
  location: 'gocreate-profile-location',
  editorFontSize: 'gocreate-editor-font-size',
  codeTheme: 'gocreate-code-theme',
};

const DEFAULTS = {
  theme: 'dark',
  openaiKey: '',
  anthropicKey: '',
  notifications: true,
  bio: '',
  photoURL: '',
  company: '',
  phone: '',
  timezone: 'America/Sao_Paulo',
  website: '',
  location: '',
  editorFontSize: 'md',
  codeTheme: 'dark',
};

function readString(key, fallback = '') {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeString(key, value) {
  try {
    if (value == null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch (err) {
    console.warn('[userSettings] falha ao gravar', key, err);
  }
}

export function getUserSettings() {
  const notificationsRaw = readString(SETTINGS_KEYS.notifications, '1');
  let theme = readString(SETTINGS_KEYS.theme, DEFAULTS.theme) || DEFAULTS.theme;
  // Migrar "system" (quebrado) → dark
  if (theme === 'system') theme = 'dark';
  return {
    theme,
    openaiKey: readString(SETTINGS_KEYS.openai, ''),
    anthropicKey: readString(SETTINGS_KEYS.anthropic, ''),
    notifications: notificationsRaw === '1' || notificationsRaw === 'true',
    bio: readString(SETTINGS_KEYS.bio, DEFAULTS.bio),
    photoURL: readString(SETTINGS_KEYS.photoURL, DEFAULTS.photoURL),
    company: readString(SETTINGS_KEYS.company, DEFAULTS.company),
    phone: readString(SETTINGS_KEYS.phone, DEFAULTS.phone),
    timezone: readString(SETTINGS_KEYS.timezone, DEFAULTS.timezone) || DEFAULTS.timezone,
    website: readString(SETTINGS_KEYS.website, DEFAULTS.website),
    location: readString(SETTINGS_KEYS.location, DEFAULTS.location),
    editorFontSize:
      readString(SETTINGS_KEYS.editorFontSize, DEFAULTS.editorFontSize) || DEFAULTS.editorFontSize,
    codeTheme: readString(SETTINGS_KEYS.codeTheme, DEFAULTS.codeTheme) || DEFAULTS.codeTheme,
  };
}

/** @param {Partial<ReturnType<typeof getUserSettings>>} partial */
export function saveUserSettings(partial = {}) {
  if (partial.theme != null) writeString(SETTINGS_KEYS.theme, partial.theme);
  if (partial.openaiKey !== undefined) writeString(SETTINGS_KEYS.openai, partial.openaiKey.trim());
  if (partial.anthropicKey !== undefined) {
    writeString(SETTINGS_KEYS.anthropic, partial.anthropicKey.trim());
  }
  if (partial.notifications !== undefined) {
    writeString(SETTINGS_KEYS.notifications, partial.notifications ? '1' : '0');
  }
  if (partial.bio !== undefined) writeString(SETTINGS_KEYS.bio, partial.bio);
  if (partial.photoURL !== undefined) writeString(SETTINGS_KEYS.photoURL, partial.photoURL.trim());
  if (partial.company !== undefined) writeString(SETTINGS_KEYS.company, partial.company);
  if (partial.phone !== undefined) writeString(SETTINGS_KEYS.phone, partial.phone);
  if (partial.timezone !== undefined) writeString(SETTINGS_KEYS.timezone, partial.timezone);
  if (partial.website !== undefined) writeString(SETTINGS_KEYS.website, partial.website);
  if (partial.location !== undefined) writeString(SETTINGS_KEYS.location, partial.location);
  if (partial.editorFontSize != null) {
    writeString(SETTINGS_KEYS.editorFontSize, partial.editorFontSize);
  }
  if (partial.codeTheme != null) writeString(SETTINGS_KEYS.codeTheme, partial.codeTheme);
  return getUserSettings();
}

/**
 * Espelha preferência de e-mails de deploy em users/{uid}.preferences
 * (sem tocar em credits/plan — Firestore rules).
 */
export async function syncDeployEmailPreference(uid, enabled) {
  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        preferences: { deployEmails: Boolean(enabled) },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[userSettings] sync deployEmails falhou:', err);
  }
}

/**
 * Após deploy bem-sucedido: preferência já sincronizada em users.preferences.deployEmails.
 * O e-mail real é enviado pelo backend (Resend) em POST /api/deploy.
 * Este stub só regista lastDeployNotify no cliente se a API ainda não o fizer.
 */
export async function recordDeployNotificationStub({
  uid,
  projectId,
  url,
  env,
  enabled,
}) {
  if (!uid || !enabled) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        preferences: { deployEmails: true },
        lastDeployNotify: {
          projectId: projectId || null,
          url: url || null,
          env: env || 'production',
          at: serverTimestamp(),
          status: 'pending_email',
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[userSettings] recordDeployNotificationStub:', err);
  }
}

/** Exposto para chat/backend futuro — só lê do cliente. */
export function getApiKeys() {
  const s = getUserSettings();
  return {
    openai: s.openaiKey || null,
    anthropic: s.anthropicKey || null,
  };
}

export function getProfileExtras() {
  const s = getUserSettings();
  return {
    bio: s.bio,
    photoURL: s.photoURL,
    company: s.company,
    phone: s.phone,
    timezone: s.timezone,
    website: s.website,
    location: s.location,
  };
}

export function saveProfileExtras(partial = {}) {
  return saveUserSettings({
    ...(partial.bio !== undefined ? { bio: partial.bio } : {}),
    ...(partial.photoURL !== undefined ? { photoURL: partial.photoURL } : {}),
    ...(partial.company !== undefined ? { company: partial.company } : {}),
    ...(partial.phone !== undefined ? { phone: partial.phone } : {}),
    ...(partial.timezone !== undefined ? { timezone: partial.timezone } : {}),
    ...(partial.website !== undefined ? { website: partial.website } : {}),
    ...(partial.location !== undefined ? { location: partial.location } : {}),
  });
}
