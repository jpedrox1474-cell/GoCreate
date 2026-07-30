import express from 'express';
import cors from 'cors';

import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import billingRouter, { stripeWebhookHandler } from './routes/billing.js';
import githubRouter from './routes/github.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Stripe needs the raw body for signature verification — before JSON parser.
  app.post(
    '/api/billing/stripe-webhook',
    express.raw({ type: 'application/json' }),
    stripeWebhookHandler
  );

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'gocreate-backend',
      ai: 'gemini',
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
    });
  });

  app.use('/api/chat', chatRouter);
  app.use('/api/upload', uploadRouter);
  // Mercado Pago / Stripe — create-payment, stripe-checkout, webhook
  app.use('/api/billing', billingRouter);
  // GitHub OAuth (export) + create repo / push
  app.use('/api/github', githubRouter);

  app.use((err, _req, res, _next) => {
    console.error('[server] Erro não tratado:', err);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.' });
  });

  return app;
}

export default createApp;
