// Middleware de autenticação — valida o ID Token do Firebase enviado pelo
// frontend no header Authorization: Bearer <token>.
//
// Toda rota que mexe em dados do usuário (chat, upload, projetos) deve passar
// por este middleware antes do handler.

import { authAdmin } from '../config/firebaseAdmin.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }

    const decoded = await authAdmin.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
    };

    next();
  } catch (err) {
    console.error('[requireAuth] Falha ao validar token:', err.message);
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

export default requireAuth;
