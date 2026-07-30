import express from 'express';
import cors from 'cors';

import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import billingRouter from './routes/billing.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
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
  // Stripe / Mercado Pago webhooks → POST /api/billing/webhook (ver routes/billing.js)
  app.use('/api/billing', billingRouter);

  app.use((err, _req, res, _next) => {
    console.error('[server] Erro não tratado:', err);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.' });
  });

  return app;
}

export default createApp;
