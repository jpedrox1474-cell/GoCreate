// Firebase Admin SDK — usado no backend para validar tokens de Auth
// e ler/escrever no Firestore com privilégios de servidor.
//
// NUNCA exponha este arquivo nem as credenciais dele no frontend.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function initAdmin() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0968841856';

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }

  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, '..', 'serviceAccountKey.json');

  if (credPath && fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || projectId,
    });
    return;
  }

  // Cloud Functions / ADC
  admin.initializeApp({ projectId });
}

initAdmin();

export const db = admin.firestore();
export const authAdmin = admin.auth();
export default admin;
