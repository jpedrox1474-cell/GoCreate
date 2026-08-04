/**
 * One-off: import "Emissor NFe" (C:\Projetos\Emissor NFe) into GoCreate
 * as project "NFE Emitter" owned by sknfaceit@outlook.com.
 *
 * Usage (from repo root or backend):
 *   node tools/import-nfe-emitter.mjs
 *
 * Requires backend/serviceAccountKey.json (not committed).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const admin = require('firebase-admin');
const SA_PATH = path.join(ROOT, 'backend', 'serviceAccountKey.json');

const OWNER_EMAIL = 'sknfaceit@outlook.com';
const OWNER_UID = 'rJi2cR0o4iUlXl5FBlQkGesR6X83';
const PROJECT_NAME = 'NFE Emitter';

const TEXT_EXTS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.json',
  '.html',
  '.md',
  '.prisma',
  '.svg',
  '.txt',
  '.yml',
  '.yaml',
  '.rules',
]);

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  '.git',
  '.firebase',
  '_backup_extract',
  '_tmp_video',
  'storage',
  'certs',
]);

const SKIP_FILE = new Set([
  '.env',
  'package-lock.json',
  'firebase-debug.log',
]);

const MAX_FILE_BYTES = 900_000;
const MAX_CHUNK_BYTES = 700_000;

function findNfeRoot() {
  const projets = path.resolve(ROOT, '..');
  const entries = fs.readdirSync(projets, { withFileTypes: true });
  const hit = entries.find(
    (d) =>
      d.isDirectory() &&
      /nfe|emissor/i.test(d.name) &&
      !/gocreate/i.test(d.name)
  );
  if (!hit) throw new Error('NFE Emitter folder not found under C:\\Projetos');
  return path.join(projets, hit.name);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function mapProjectPath(abs, nfeRoot) {
  const rel = path.relative(nfeRoot, abs).split(path.sep).join('/');
  // Sandpack / GoCreate editor expects SPA sources under src/
  if (rel.startsWith('web/src/')) return rel.replace(/^web\//, '');
  if (rel === 'web/index.html') return 'index.html';
  if (rel === 'web/package.json') return 'web/package.json';
  if (rel === 'web/vite.config.js') return 'web/vite.config.js';
  if (rel === 'web/.env.example') return 'web/.env.example';
  if (rel.startsWith('web/public/')) return rel.replace(/^web\//, 'public/');
  return rel;
}

function shouldInclude(abs, nfeRoot) {
  const base = path.basename(abs);
  if (SKIP_FILE.has(base)) return false;
  if (base.startsWith('.env') && base !== '.env.example') return false;
  if (/\.(pfx|png|jpg|jpeg|gif|webp|mp4|zip|woff2?|ttf|eot)$/i.test(base)) return false;
  const ext = path.extname(base).toLowerCase();
  if (!TEXT_EXTS.has(ext) && base !== 'firebase.json' && !base.endsWith('.rules')) {
    return false;
  }
  const rel = path.relative(nfeRoot, abs).split(path.sep).join('/');
  // Prefer source trees + key configs
  if (
    rel.startsWith('web/src/') ||
    rel.startsWith('web/public/') ||
    rel.startsWith('api/src/') ||
    rel.startsWith('api/prisma/') ||
    rel.startsWith('functions/src/') ||
    rel.startsWith('functions/scripts/') ||
    [
      'web/package.json',
      'web/vite.config.js',
      'web/index.html',
      'web/.env.example',
      'api/package.json',
      'api/tsconfig.json',
      'api/.env.example',
      'functions/package.json',
      'functions/index.js',
      'README.md',
      'firebase.json',
      'firestore.rules',
      'firestore.indexes.json',
      'storage.rules',
      '.firebaserc',
    ].includes(rel)
  ) {
    return true;
  }
  return false;
}

function escapeFileContent(content) {
  return String(content).replace(/<\/file>/gi, '</\u200bfile>');
}

function buildArtifact(files) {
  const parts = ['<gocreate_artifact>'];
  for (const [p, content] of files) {
    parts.push(`<file path="${p}">`);
    parts.push(escapeFileContent(content));
    parts.push('</file>');
  }
  parts.push('</gocreate_artifact>');
  return parts.join('\n');
}

function chunkFiles(entries) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const entry of entries) {
    const add = entry.path.length + entry.content.length + 64;
    if (current.length && size + add > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    if (add > MAX_CHUNK_BYTES) {
      // Oversized single file — still push alone (may fail if >1MB doc)
      if (entry.content.length > MAX_FILE_BYTES) {
        console.warn('SKIP too large:', entry.path, entry.content.length);
        continue;
      }
      chunks.push([entry]);
      continue;
    }
    current.push(entry);
    size += add;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function main() {
  if (!fs.existsSync(SA_PATH)) {
    throw new Error(`Missing service account: ${SA_PATH}`);
  }
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || 'gen-lang-client-0968841856',
    });
  }
  const db = admin.firestore();

  const nfeRoot = findNfeRoot();
  console.log('NFE root:', nfeRoot);

  const absFiles = walk(nfeRoot).filter((f) => shouldInclude(f, nfeRoot));
  const entries = [];
  for (const abs of absFiles) {
    const mapped = mapProjectPath(abs, nfeRoot);
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      console.warn('skip binary/unreadable', mapped);
      continue;
    }
    if (content.length > MAX_FILE_BYTES) {
      console.warn('skip large', mapped, content.length);
      continue;
    }
    entries.push({ path: mapped, content });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  console.log('Collected files:', entries.length);

  // Ensure user elevated
  await db.collection('users').doc(OWNER_UID).set(
    {
      email: OWNER_EMAIL,
      role: 'owner',
      plan: 'enterprise_master',
      credits: 999999,
      unlimited: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const projectRef = db.collection('projects').doc();
  const projectId = projectRef.id;
  const now = admin.firestore.FieldValue.serverTimestamp();

  await projectRef.set({
    ownerId: OWNER_UID,
    ownerEmail: OWNER_EMAIL,
    authAccess: {
      mode: 'invited',
      invitedEmails: ['jpedroxs1474@gmail.com', 'jpedrox1474@gmail.com'],
    },
    name: PROJECT_NAME,
    description:
      'Emissor NFe (web + api + functions) importado para edição completa no GoCreate. Backend Firebase/SEFAZ preservado nos ficheiros.',
    status: 'draft',
    framework: 'React + Vite + Firebase Functions',
    color: 'from-emerald-600 to-teal-600',
    isDefault: false,
    backendEnabled: true,
    backendEnabledAt: now,
    importedFrom: nfeRoot,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const welcome =
    'Projeto **NFE Emitter** importado a partir de Emissor NFe.\n\n' +
    'Abre a aba **Código** para editar web (`src/…`), API (`api/…`) e Cloud Functions (`functions/…`). ' +
    'Conta privilegiada: edição livre (estilo Base44). O preview Sandpack usa sobretudo `src/App.jsx`.';

  await projectRef.collection('messages').add({
    role: 'ai',
    text: welcome,
    uid: null,
    createdAt: now,
  });

  const chunks = chunkFiles(entries);
  console.log('Message chunks:', chunks.length);

  let i = 0;
  for (const chunk of chunks) {
    i += 1;
    const pairs = chunk.map((e) => [e.path, e.content]);
    const artifact = buildArtifact(pairs);
    const text =
      `Import NFE Emitter — lote ${i}/${chunks.length} (${chunk.length} ficheiros).\n\n${artifact}`;
    if (Buffer.byteLength(text, 'utf8') > 950_000) {
      console.warn('Chunk still large, splitting further…', i, Buffer.byteLength(text, 'utf8'));
      for (const e of chunk) {
        const one = buildArtifact([[e.path, e.content]]);
        const oneText = `Import NFE Emitter — ficheiro ${e.path}\n\n${one}`;
        if (Buffer.byteLength(oneText, 'utf8') > 1_000_000) {
          console.warn('SKIP oversize file', e.path);
          continue;
        }
        await projectRef.collection('messages').add({
          role: 'ai',
          text: oneText,
          uid: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      continue;
    }
    await projectRef.collection('messages').add({
      role: 'ai',
      text,
      uid: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  wrote chunk ${i}/${chunks.length}`);
  }

  // Lightweight index on project (paths only — full content lives in messages)
  const pathList = entries.map((e) => e.path).slice(0, 500);
  await projectRef.set(
    {
      fileIndex: pathList,
      fileCount: entries.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        ownerEmail: OWNER_EMAIL,
        ownerUid: OWNER_UID,
        projectId,
        projectName: PROJECT_NAME,
        fileCount: entries.length,
        chunks: chunks.length,
        openUrl: `https://gocreate-app.web.app/editor/${projectId}`,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
