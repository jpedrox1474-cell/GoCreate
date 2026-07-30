const FALLBACK_MESSAGE =
  'Interface gerada com sucesso. Verifique o painel ao lado.';

const FILE_TAG_RE = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/gi;
const ARTIFACT_RE = /<gocreate_artifact[^>]*>([\s\S]*?)<\/gocreate_artifact>/gi;
const ENTITIES_RE = /<gocreate_entities>([\s\S]*?)<\/gocreate_entities>/gi;

const ALLOWED_ENTITY_TYPES = new Set(['string', 'number', 'boolean']);

function slugifyEntityId(id) {
  return (
    String(id || 'entity')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'entity'
  );
}

function normalizeEntity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = slugifyEntityId(raw.id || raw.name || raw.table);
  const name = String(raw.name || raw.id || id);
  const columns = Array.isArray(raw.columns)
    ? raw.columns
        .map((c) => {
          if (!c) return null;
          if (typeof c === 'string') return { name: c, type: 'string' };
          const colName = String(c.name || c.key || '').trim();
          if (!colName) return null;
          const type = ALLOWED_ENTITY_TYPES.has(c.type) ? c.type : 'string';
          return { name: colName, type };
        })
        .filter(Boolean)
    : [];
  if (!columns.length) return null;
  const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [];
  return { id, name, columns, rows };
}

/**
 * Collect complete <file path="...">...</file> blocks from a string.
 * @param {string} source
 * @param {Record<string, string>} files
 */
function collectFileTags(source, files) {
  const re = new RegExp(FILE_TAG_RE.source, 'gi');
  let match;
  while ((match = re.exec(source)) !== null) {
    const path = match[1];
    const content = match[2] ?? '';
    if (path) files[path] = content.trim() ? content.replace(/^\n/, '') : content;
  }
}

/**
 * Detect truncated XML streams (open tags without matching close),
 * or creation replies that never produced usable files.
 * @param {string} rawText
 * @param {{ fileCount?: number }} [opts]
 * @returns {boolean}
 */
export function isGenerationIncomplete(rawText, opts = {}) {
  const source = typeof rawText === 'string' ? rawText : '';
  if (!source) return false;

  const count = (re) => (source.match(re) || []).length;

  if (count(/<gocreate_artifact\b/gi) > count(/<\/gocreate_artifact>/gi)) return true;
  if (count(/<file\s+path=/gi) > count(/<\/file>/gi)) return true;
  if (
    /<gocreate_entities\b/i.test(source) &&
    count(/<gocreate_entities\b/gi) > count(/<\/gocreate_entities>/gi)
  ) {
    return true;
  }
  // Mid-tag truncation e.g. "</gocreate..." at end of stream
  if (/<\/?gocreate(?:_artifact|_entities)?[^>]*$/i.test(source.trim())) return true;
  if (/<\/?file\b[^>]*$/i.test(source.trim())) return true;

  const fileCount = typeof opts.fileCount === 'number' ? opts.fileCount : null;
  const looksLikeCreation =
    /<gocreate_artifact\b|<gocreate_entities\b|<file\s+path=|src\/App\.(jsx|js)|Next\.js|whatsapp-web|vou criar|vou montar|App Router/i.test(
      source
    );
  if (looksLikeCreation && fileCount === 0) return true;

  return false;
}

/**
 * Salvage trailing incomplete <file path="..."> without </file>.
 * @param {string} blob
 * @param {Record<string, string>} files
 */
function salvagePartialFile(blob, files) {
  const openRe = /<file\s+path="([^"]+)">/gi;
  let lastOpen = null;
  let m;
  while ((m = openRe.exec(blob)) !== null) {
    lastOpen = m;
  }
  if (!lastOpen) return;

  const path = lastOpen[1];
  const afterOpen = blob.slice(lastOpen.index + lastOpen[0].length);
  if (files[path]) return;
  if (/<\/file>/i.test(afterOpen)) return;

  const partial = afterOpen
    .replace(/<\/gocreate_artifact>[\s\S]*$/i, '')
    .replace(/<gocreate_entities>[\s\S]*$/i, '')
    .trimEnd();

  if (path && partial.length >= 40) {
    files[path] = partial.replace(/^\n/, '');
  }
}

/**
 * Parse optional <gocreate_entities>[...]</gocreate_entities> (complete blocks only).
 * @param {string} text
 * @returns {Array<{id: string, name: string, columns: Array, rows: Array}>}
 */
export function parseEntitiesBlock(text) {
  if (!text || typeof text !== 'string') return [];
  const entities = [];
  const re = new RegExp(ENTITIES_RE.source, 'gi');
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const list = Array.isArray(parsed) ? parsed : parsed?.entities || [];
      for (const item of list) {
        const ent = normalizeEntity(item);
        if (ent) entities.push(ent);
      }
    } catch {
      // incomplete / invalid JSON — ignore
    }
  }
  return entities;
}

/**
 * Strip entity XML (complete + incomplete) so it never leaks into the chat bubble.
 * @param {string} text
 */
function stripEntitiesFromText(text) {
  return String(text || '')
    .replace(ENTITIES_RE, '')
    .replace(/<gocreate_entities[\s\S]*$/i, '')
    .replace(/<\/?gocreate_entities[^>]*>/gi, '');
}

/**
 * Parse AI raw text: strip artifacts/entities and extract files.
 * Also pulls complete <file> tags from incomplete (still-open) artifacts while streaming.
 * @param {string} rawText
 * @returns {{
 *   cleanText: string,
 *   files: Record<string, string>,
 *   hadArtifacts: boolean,
 *   entities: Array,
 *   incomplete: boolean,
 * }}
 */
export function parseArtifacts(rawText) {
  const source = typeof rawText === 'string' ? rawText : '';
  const files = {};
  let hadArtifacts = false;

  const artifactRe = new RegExp(ARTIFACT_RE.source, 'gi');
  let artifactMatch;
  while ((artifactMatch = artifactRe.exec(source)) !== null) {
    hadArtifacts = true;
    collectFileTags(artifactMatch[1] || '', files);
  }

  // Streaming: also harvest complete <file> tags before </gocreate_artifact> arrives
  if (/<gocreate_artifact\b/i.test(source) || /<file\s+path=/i.test(source)) {
    hadArtifacts = true;
    collectFileTags(source, files);
  }

  // Truncation: keep trailing open <file> content so preview isn't empty
  salvagePartialFile(source, files);

  const entities = parseEntitiesBlock(source);
  const incomplete = isGenerationIncomplete(source, {
    fileCount: Object.keys(files).length,
  });

  let cleanText = source.replace(ARTIFACT_RE, '');
  cleanText = stripEntitiesFromText(cleanText);
  // Hide incomplete artifact/XML while streaming so tags never leak into chat
  cleanText = cleanText
    .replace(/<gocreate_artifact[\s\S]*$/i, '')
    .replace(/<\/?gocreate_artifact[^>]*>/gi, '')
    .replace(/<\/?file\b[^>]*>/gi, '')
    .replace(/<\/?gocreate[\s\S]*$/i, '')
    .trim();

  return { cleanText, files, hadArtifacts, entities, incomplete };
}

/**
 * Clean display text for chat; use fallback when AI sent only code/artifacts.
 * @param {string} rawText
 * @returns {{ displayText: string, files: Record<string, string>, entities: Array, incomplete: boolean }}
 */
export function extractAiDisplay(rawText) {
  const { cleanText, files, hadArtifacts, entities, incomplete } = parseArtifacts(rawText);
  const hasFiles = Object.keys(files).length > 0;
  const displayText =
    cleanText ||
    (hasFiles || hadArtifacts ? FALLBACK_MESSAGE : '');
  return { displayText, files, entities, incomplete };
}

/**
 * Normalize AI paths (often `src/App.jsx`) to Sandpack react-template roots (`/App.js`).
 * Maps .tsx → .jsx so the plain `react` template (Babel) can compile them.
 * @param {string} path
 * @returns {string}
 */
export function normalizeSandpackPath(path) {
  let p = String(path || '').replace(/\\/g, '/').trim();
  if (!p) return '/App.js';
  if (!p.startsWith('/')) p = `/${p}`;

  // Gemini system prompt uses src/... — Sandpack react template is rooted at /
  if (p.startsWith('/src/')) p = p.slice(4);
  else if (p === '/src') p = '/';

  // Next.js App Router paths → fold into Sandpack-friendly names when possible
  if (/^\/app\/page\.(jsx?|tsx?)$/i.test(p)) p = '/App.js';
  else if (/^\/app\/layout\.(jsx?|tsx?)$/i.test(p)) p = p.replace(/^\/app\//i, '/');
  else if (/^\/pages\/index\.(jsx?|tsx?)$/i.test(p)) p = '/App.js';

  if (/^\/App\.(jsx|tsx)$/i.test(p)) p = '/App.js';
  else if (/^\/index\.(jsx|tsx)$/i.test(p)) p = '/index.js';
  else if (/\.tsx$/i.test(p)) p = p.replace(/\.tsx$/i, '.jsx');

  return p;
}

/** Packages provided by the Sandpack react template — do not redeclare. */
const SANDPACK_BUILTIN_PACKAGES = new Set([
  'react',
  'react-dom',
  'react/jsx-runtime',
  'scheduler',
]);

/** Always available in preview (system prompt encourages these). */
export const SANDPACK_BASE_DEPENDENCIES = {
  'lucide-react': 'latest',
  'react-router-dom': 'latest',
};

const IMPORT_SPEC_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Resolve an import specifier to an npm package name, or null if relative/builtin.
 * @param {string} specifier
 * @returns {string | null}
 */
export function npmPackageFromSpecifier(specifier) {
  const spec = String(specifier || '').trim();
  if (!spec) return null;
  if (
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('http:') ||
    spec.startsWith('https:') ||
    spec.startsWith('data:') ||
    spec.startsWith('#')
  ) {
    return null;
  }
  // Path aliases common in Vite apps — not npm packages
  if (spec.startsWith('@/') || spec.startsWith('~/')) return null;

  let pkg;
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    if (parts.length < 2) return null;
    pkg = `${parts[0]}/${parts[1]}`;
  } else {
    pkg = spec.split('/')[0];
  }

  if (!pkg || SANDPACK_BUILTIN_PACKAGES.has(pkg) || SANDPACK_BUILTIN_PACKAGES.has(spec)) {
    return null;
  }
  // Skip CSS / asset side-effect imports mistaken as packages
  if (/\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|json)$/i.test(pkg)) return null;

  // Node-only packages that would break Sandpack — skip declaring them
  if (
    /^(whatsapp-web\.js|baileys|puppeteer|playwright|express|next|fs|path|net|http|https|child_process)$/i.test(
      pkg
    )
  ) {
    return null;
  }

  return pkg;
}

/**
 * Scan generated / Sandpack file contents for npm imports.
 * @param {Record<string, string | { code?: string }> | null | undefined} files
 * @returns {Record<string, string>} package → version
 */
export function extractNpmDependencies(files) {
  const deps = {};
  if (!files || typeof files !== 'object') return deps;

  for (const entry of Object.values(files)) {
    const code = typeof entry === 'string' ? entry : entry?.code;
    if (typeof code !== 'string' || !code) continue;

    const re = new RegExp(IMPORT_SPEC_RE.source, 'g');
    let match;
    while ((match = re.exec(code)) !== null) {
      const spec = match[1] || match[2];
      const pkg = npmPackageFromSpecifier(spec);
      if (pkg) deps[pkg] = 'latest';
    }
  }

  return deps;
}

/**
 * Merge base Sandpack deps with packages discovered in generated code.
 * @param {Record<string, string | { code?: string }> | null | undefined} files
 * @returns {Record<string, string>}
 */
export function resolveSandpackDependencies(files) {
  return {
    ...SANDPACK_BASE_DEPENDENCIES,
    ...extractNpmDependencies(files),
  };
}

function componentNameFromPath(filePath) {
  const base = filePath.split('/').pop() || 'Component';
  const name = base.replace(/\.(jsx?|tsx?)$/i, '');
  if (!name || /^index$/i.test(name)) return null;
  const cleaned = name.replace(/[^a-zA-Z0-9_$]/g, '');
  if (!cleaned) return null;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

function toSandpackEntry(code) {
  return { code: typeof code === 'string' ? code : String(code ?? '') };
}

/**
 * Build a minimal App when the model only returned components (no App entry).
 * @param {Record<string, { code: string }>} files
 */
function injectFallbackApp(files) {
  if (files['/App.js']) return;

  const jsxFiles = Object.keys(files).filter(
    (k) => /\.(jsx?|tsx?)$/i.test(k) && k !== '/index.js'
  );

  const components = [];
  for (const path of jsxFiles) {
    const name = componentNameFromPath(path);
    if (!name) continue;
    const importPath = `.${path.replace(/\.(jsx|tsx)$/i, '')}`;
    components.push({ name, importPath });
  }

  if (components.length) {
    const imports = components
      .map((c) => `import ${c.name} from '${c.importPath}';`)
      .join('\n');
    const body = components.map((c) => `      <${c.name} />`).join('\n');
    files['/App.js'] = toSandpackEntry(`${imports}

export default function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#e4e4e7', padding: 24 }}>
${body}
    </div>
  );
}
`);
    return;
  }

  files['/App.js'] = toSandpackEntry(`export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#a1a1aa', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ color: '#fafafa', marginBottom: 8 }}>GoCreate Preview</h1>
        <p>Nenhum App.jsx encontrado. Abre a aba Código para ver os ficheiros gerados.</p>
      </div>
    </div>
  );
}
`);
}

/**
 * Map generated file paths to Sandpack's expected shape.
 * Always returns entries as `{ code: string }` with an `/App.js` entry when possible.
 * @param {Record<string, string>} generatedFiles
 * @returns {Record<string, { code: string }> | null}
 */
export function toSandpackFiles(generatedFiles) {
  if (!generatedFiles || typeof generatedFiles !== 'object') return null;
  const keys = Object.keys(generatedFiles);
  if (!keys.length) return null;

  const out = {};
  for (const [path, content] of Object.entries(generatedFiles)) {
    const sandPath = normalizeSandpackPath(path);
    out[sandPath] = toSandpackEntry(content);
  }

  injectFallbackApp(out);
  return out;
}

/** Prompt the model to resume a truncated generation. */
export const CONTINUE_GENERATION_PROMPT =
  'Continua exactamente de onde paraste. Emite o restante código em <gocreate_artifact> com <file path="..."> completos (React Vite-compatible para Sandpack — NÃO Next.js). Fecha todas as tags. Se já enviaste entidades incompletas, reenvia <gocreate_entities> completo ou omite. Prioriza src/App.jsx com UI visível.';

/** Alias used by Editor continue/retry. */
export const CONTINUE_PROMPT = CONTINUE_GENERATION_PROMPT;

/** Ask for UI when only entities (or chat) arrived with no files. */
export const REQUEST_UI_PROMPT =
  'Gera agora a interface React (Vite-compatible) em <gocreate_artifact> com src/App.jsx e componentes necessários para o preview Sandpack. Não uses Next.js nem whatsapp-web.js. UI visível imediatamente; WhatsApp via wa.me / Integrações GoCreate.';

/**
 * Choose the best recovery prompt after a failed/empty generation.
 * @param {string} rawText
 * @param {number} fileCount
 */
export function pickRecoveryPrompt(rawText, fileCount = 0) {
  if (fileCount > 0 || isGenerationIncomplete(rawText)) {
    return CONTINUE_GENERATION_PROMPT;
  }
  return REQUEST_UI_PROMPT;
}

export { FALLBACK_MESSAGE };
