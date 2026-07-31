/**
 * Copia o código do backend Express para functions/lib antes do deploy.
 * Mantém uma única fonte de verdade em /backend.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsRoot = path.join(__dirname, '..');
const root = path.join(functionsRoot, '..');
const backend = path.join(root, 'backend');
const dest = path.join(functionsRoot, 'lib');

const FILES = [
  'app.js',
  'config/firebaseAdmin.js',
  'config/cloudinary.js',
  'lib/owner.js',
  'middleware/auth.js',
  'middleware/credits.js',
  'middleware/premium.js',
  'prompts/systemPrompt.js',
  'prompts/buildDynamicSystemPrompt.js',
  'routes/chat.js',
  'routes/upload.js',
  'routes/billing.js',
  'routes/github.js',
  'routes/integrations.js',
  'routes/me.js',
  'routes/deploy.js',
  'routes/projects.js',
  'services/gemini.js',
  'services/mercadopago.js',
  'services/stripe.js',
  'services/github.js',
  'services/integrations.js',
  'services/entities.js',
  'services/evolution.js',
  'services/meta.js',
  'services/suggestIntegrations.js',
  'services/projectSlug.js',
  'services/oauth/pkce.js',
  'services/oauth/state.js',
  'services/oauth/providers.js',
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const rel of FILES) {
  const from = path.join(backend, rel);
  const to = path.join(dest, rel);
  if (!fs.existsSync(from)) {
    console.warn(`[sync] skip missing ${rel}`);
    continue;
  }
  ensureDir(to);
  fs.copyFileSync(from, to);
  console.log(`[sync] ${rel}`);
}

console.log('[sync] done → functions/lib');
