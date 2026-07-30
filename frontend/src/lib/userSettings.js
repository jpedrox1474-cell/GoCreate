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
  return {
    theme: readString(SETTINGS_KEYS.theme, DEFAULTS.theme) || DEFAULTS.theme,
    openaiKey: readString(SETTINGS_KEYS.openai, ''),
    anthropicKey: readString(SETTINGS_KEYS.anthropic, ''),
    notifications: notificationsRaw === '1' || notificationsRaw === 'true',
    bio: readString(SETTINGS_KEYS.bio, DEFAULTS.bio),
    photoURL: readString(SETTINGS_KEYS.photoURL, DEFAULTS.photoURL),
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
 * Após deploy bem-sucedido: regista flag/stub se o utilizador pediu avisos.
 * (Envio de e-mail real fica para um worker futuro.)
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
  return { bio: s.bio, photoURL: s.photoURL };
}

export function saveProfileExtras({ bio, photoURL }) {
  return saveUserSettings({
    ...(bio !== undefined ? { bio } : {}),
    ...(photoURL !== undefined ? { photoURL } : {}),
  });
}
