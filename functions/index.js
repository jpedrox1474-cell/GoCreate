/**
 * GoCreate Cloud Function — Express API + scheduled cron for project functions.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
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

/** Every 15 minutes — run due project cron functions */
export const gocreateCronTick = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'southamerica-east1',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async () => {
    const { runDueCronFunctions } = await import('./lib/services/projectFunctions.js');
    const results = await runDueCronFunctions({ limit: 40 });
    console.log('[gocreateCronTick] ran', results.length, results);
  }
);
