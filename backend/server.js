// GoCreate Backend — Entry point
//
//   - POST /api/chat    -> streaming SSE + Gemini (free) + System Prompt + histórico Firestore
//   - POST /api/upload  -> Multer -> Cloudinary (imagens, vídeos, docs)

import 'dotenv/config';
import { createApp } from './app.js';

const PORT = process.env.PORT || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`GoCreate backend rodando em http://localhost:${PORT}`);
  console.log(`[ai] provider=gemini model=${process.env.GEMINI_MODEL || 'gemini-flash-latest (fallback chain)'}`);
});
