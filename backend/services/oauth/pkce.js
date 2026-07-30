import crypto from 'crypto';

/** RFC 7636 code_verifier (43–128 chars). */
export function createCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

export function createCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString('base64url');
}
