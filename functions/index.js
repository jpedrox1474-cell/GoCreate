/**
 * GoCreate Cloud Function — Express API (chat Gemini + upload).
 * Nome separado `gocreateApi` para NÃO sobrescrever a function `api` do Promifer no mesmo projeto.
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
