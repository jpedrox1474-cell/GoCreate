/**
 * GoCreate Cloud Function — Express API (chat Gemini + upload).
 * Nome separado `gocreateApi` para NÃO sobrescrever a function `api` do Promifer no mesmo projeto.
 *
 * Env: functions/.env (CLOUDINARY_*, GEMINI_*, …) é injectado no deploy pelo Firebase.
 * Upload de mídia: preferir /api/upload/sign → Cloudinary directo (multipart via Hosting
 * quebrava com "Unexpected end of form").
 */

import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './lib/app.js';

const app = createApp();

export const gocreateApi = onRequest(
  {
    region: 'southamerica-east1',
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
  },
  app
);
