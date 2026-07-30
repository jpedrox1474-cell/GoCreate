const FALLBACK_MESSAGE =
  'Interface gerada com sucesso. Verifique o painel ao lado.';

/**
 * Parse AI raw text: strip <gocreate_artifact> blocks and extract files.
 * @param {string} rawText
 * @returns {{ cleanText: string, files: Record<string, string>, hadArtifacts: boolean }}
 */
export function parseArtifacts(rawText) {
  const artifactRegex = /<gocreate_artifact[^>]*>([\s\S]*?)<\/gocreate_artifact>/g;
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;

  const source = typeof rawText === 'string' ? rawText : '';
  const files = {};
  let hadArtifacts = false;

  let artifactMatch;
  const artifactRe = new RegExp(artifactRegex.source, 'g');
  while ((artifactMatch = artifactRe.exec(source)) !== null) {
    hadArtifacts = true;
    const inner = artifactMatch[1] || '';
    const fileRe = new RegExp(fileRegex.source, 'g');
    let fileMatch;
    while ((fileMatch = fileRe.exec(inner)) !== null) {
      const path = fileMatch[1];
      const content = fileMatch[2] ?? '';
      if (path) files[path] = content.trim() ? content.replace(/^\n/, '') : content;
    }
  }

  let cleanText = source.replace(artifactRegex, '');
  // Hide incomplete artifact/XML while streaming so tags never leak into chat
  cleanText = cleanText
    .replace(/<gocreate_artifact[\s\S]*$/i, '')
    .replace(/<\/?gocreate_artifact[^>]*>/gi, '')
    .replace(/<\/?file\b[^>]*>/gi, '')
    .trim();

  return { cleanText, files, hadArtifacts };
}

/**
 * Clean display text for chat; use fallback when AI sent only code/artifacts.
 * @param {string} rawText
 * @returns {{ displayText: string, files: Record<string, string> }}
 */
export function extractAiDisplay(rawText) {
  const { cleanText, files, hadArtifacts } = parseArtifacts(rawText);
  const hasFiles = Object.keys(files).length > 0;
  const displayText =
    cleanText ||
    (hasFiles || hadArtifacts ? FALLBACK_MESSAGE : '');
  return { displayText, files };
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

export { FALLBACK_MESSAGE };
