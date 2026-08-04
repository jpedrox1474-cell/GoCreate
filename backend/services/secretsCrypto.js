// AES-256-GCM for project env secrets at rest.
// Key: SECRETS_ENCRYPTION_KEY (32-byte hex or base64) or fallback derived from GEMINI_API_KEY+project.

import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function resolveKeyMaterial() {
  const raw =
    process.env.SECRETS_ENCRYPTION_KEY ||
    process.env.GOCREATE_SECRETS_KEY ||
    '';
  if (raw) {
    // 64 hex chars = 32 bytes
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === 32) return b64;
    return crypto.createHash('sha256').update(raw).digest();
  }
  // Deterministic fallback so existing deploys work without new env
  // (still better than plaintext; rotate by setting SECRETS_ENCRYPTION_KEY).
  const seed = [
    process.env.GEMINI_API_KEY || '',
    process.env.GCLOUD_PROJECT || 'gen-lang-client-0968841856',
    'gocreate-secrets-v1',
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest();
}

let cachedKey = null;
function keyBuf() {
  if (!cachedKey) cachedKey = resolveKeyMaterial();
  return cachedKey;
}

export function encryptSecret(plaintext) {
  const text = String(plaintext ?? '');
  if (!text) return text;
  if (text.startsWith(PREFIX)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptSecret(stored) {
  const raw = String(stored ?? '');
  if (!raw) return '';
  if (!raw.startsWith(PREFIX)) {
    // Legacy plaintext — return as-is (lazy migrate on next write)
    return raw;
  }
  try {
    const body = raw.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(':');
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const data = Buffer.from(dataB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    console.warn('[secretsCrypto] decrypt failed:', err?.message);
    throw Object.assign(new Error('Falha ao desencriptar secret.'), { status: 500 });
  }
}

export function maskSecret(plaintext) {
  const val = String(plaintext || '');
  if (!val) return '';
  return `${'*'.repeat(Math.min(8, val.length))}${val.slice(-4)}`;
}

/** Read plaintext from Firestore doc data (handles enc + legacy). */
export function secretValueFromDoc(data) {
  if (!data) return '';
  return decryptSecret(data.value ?? '');
}
