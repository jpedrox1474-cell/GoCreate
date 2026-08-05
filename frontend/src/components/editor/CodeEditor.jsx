import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { searchKeymap, openSearchPanel, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  FileCode,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Pencil,
  Search,
  RotateCcw,
  Save,
  GitCompare,
} from 'lucide-react';
import { getUserSettings } from '../../lib/userSettings';
import CodeDiffView from './CodeDiffView';
import { useConfirm } from './ConfirmDialog';

const FONT_SIZE_PX = { sm: 12, md: 14, lg: 16 };

const CODE_THEME_STYLES = {
  dark: {
    shell: 'bg-[#1e1e1e] border-zinc-800',
    aside: 'bg-[#252526] border-[#3c3c3c]',
    codeBg: 'bg-[#1e1e1e]',
    text: 'text-[#d4d4d4]',
  },
  midnight: {
    shell: 'bg-[#0b1220] border-blue-950/60',
    aside: 'bg-[#0f172a] border-slate-800',
    codeBg: 'bg-[#0b1220]',
    text: 'text-slate-200',
  },
  slate: {
    shell: 'bg-[#1c1f26] border-zinc-700/80',
    aside: 'bg-[#22262f] border-zinc-700',
    codeBg: 'bg-[#1c1f26]',
    text: 'text-zinc-200',
  },
};

function languageExtension(fileName = '') {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.css')) return css();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return html();
  if (lower.endsWith('.json')) return json();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return javascript({ jsx: true, typescript: true });
  }
  return javascript({ jsx: true });
}

function buildTree(paths) {
  const root = { name: '', pathKey: '', children: {}, files: [] };

  for (const path of paths) {
    const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
    let node = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.files.push({ name: part, path });
      } else {
        acc = acc ? `${acc}/${part}` : part;
        if (!node.children[part]) {
          node.children[part] = { name: part, pathKey: acc, children: {}, files: [] };
        }
        node = node.children[part];
      }
    }
  }
  return root;
}

function FolderNode({ node, depth, activeFile, onSelect, expanded, toggle }) {
  const folderKeys = Object.keys(node.children).sort();
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  const isOpen = expanded.has(node.name === '' ? '__root__' : node.pathKey);

  return (
    <div>
      {node.name !== '' && (
        <button
          type="button"
          onClick={() => toggle(node.pathKey)}
          className="w-full flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#2a2d2e] transition-all"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {isOpen ? (
            <FolderOpen size={14} className="text-blue-400/80 shrink-0" />
          ) : (
            <Folder size={14} className="text-blue-400/60 shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
      )}

      {(node.name === '' || isOpen) && (
        <>
          {folderKeys.map((key) => {
            const child = node.children[key];
            return (
              <FolderNode
                key={child.pathKey}
                node={child}
                depth={node.name === '' ? depth : depth + 1}
                activeFile={activeFile}
                onSelect={onSelect}
                expanded={expanded}
                toggle={toggle}
              />
            );
          })}
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => onSelect(f.path)}
              className={`w-full flex items-center gap-2 py-1.5 text-xs font-mono transition-all border-l-2 ${
                activeFile === f.path
                  ? 'bg-[#1e1e1e] text-[#cccccc] border-l-blue-500'
                  : 'text-[#cccccc]/60 hover:bg-[#2a2d2e] border-l-transparent'
              }`}
              style={{ paddingLeft: 8 + (node.name === '' ? depth : depth + 1) * 12 + 14 }}
              title={f.path}
            >
              <FileCode
                size={13}
                className={
                  f.name.endsWith('.css')
                    ? 'text-[#cbcb41] shrink-0'
                    : 'text-[#519aba] shrink-0'
                }
              />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export default function CodeEditor({
  files,
  activeFile,
  onSelectFile,
  canEdit = false,
  onChangeFile = null,
  onRevertFile = null,
  onSaveFile = null,
  dirtyFiles = null,
  baselines = null,
  diffBaselines = null,
}) {
  const [askConfirm, confirmDialog] = useConfirm();
  const fileNames = Object.keys(files || {});
  const code = (activeFile && files?.[activeFile]) || '';
  const tree = useMemo(() => buildTree(fileNames), [fileNames]);
  const [prefs, setPrefs] = useState(() => getUserSettings());
  const viewRef = useRef(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    const sync = () => setPrefs(getUserSettings());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const fontSize = FONT_SIZE_PX[prefs.editorFontSize] || FONT_SIZE_PX.md;
  const theme = CODE_THEME_STYLES[prefs.codeTheme] || CODE_THEME_STYLES.dark;

  const isDirty =
    Boolean(activeFile) &&
    (dirtyFiles?.has?.(activeFile) ||
      (baselines &&
        activeFile in baselines &&
        baselines[activeFile] !== code));

  const canRevert =
    Boolean(activeFile) &&
    typeof onRevertFile === 'function' &&
    baselines &&
    activeFile in baselines &&
    baselines[activeFile] !== code;

  const diffBefore =
    activeFile && diffBaselines && activeFile in diffBaselines
      ? diffBaselines[activeFile]
      : activeFile && baselines && activeFile in baselines
        ? baselines[activeFile]
        : null;

  const canShowDiff =
    Boolean(activeFile) &&
    diffBefore != null &&
    String(diffBefore) !== String(code);

  useEffect(() => {
    if (!canShowDiff) setShowDiff(false);
  }, [canShowDiff, activeFile]);

  const allFolderKeys = useMemo(() => {
    const keys = new Set(['__root__']);
    for (const path of fileNames) {
      const parts = path.replace(/^\/+/, '').split('/');
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        keys.add(acc);
      }
    }
    return keys;
  }, [fileNames]);

  const [expanded, setExpanded] = useState(() => allFolderKeys);

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      allFolderKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [allFolderKeys]);

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const extensions = useMemo(() => {
    const lang = languageExtension(activeFile || '');
    return [
      lang,
      history(),
      highlightSelectionMatches(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        {
          key: 'Mod-s',
          run: () => {
            if (activeFile && typeof onSaveFile === 'function') {
              onSaveFile(activeFile);
              setSaveFlash(true);
              setTimeout(() => setSaveFlash(false), 1200);
            }
            return true;
          },
        },
        {
          key: 'Mod-f',
          run: openSearchPanel,
        },
      ]),
      EditorView.theme({
        '&': { height: '100%', fontSize: `${fontSize}px` },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
        '.cm-content': { padding: '12px 0' },
        '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
      }),
      EditorView.lineWrapping,
    ];
  }, [activeFile, fontSize, onSaveFile]);

  const handleChange = useCallback(
    (value) => {
      if (!activeFile || !canEdit || typeof onChangeFile !== 'function') return;
      onChangeFile(activeFile, value);
    },
    [activeFile, canEdit, onChangeFile]
  );

  function openFind() {
    const view = viewRef.current;
    if (view) openSearchPanel(view);
  }

  function handleSaveClick() {
    if (!activeFile || typeof onSaveFile !== 'function') return;
    onSaveFile(activeFile);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1200);
  }

  async function handleRevertClick() {
    if (!activeFile || !canRevert) return;
    const ok = await askConfirm({
      title: 'Reverter ficheiro',
      message: `Reverter “${activeFile}” para a última versão da IA?`,
      confirmLabel: 'Reverter',
      destructive: true,
    });
    if (!ok) return;
    onRevertFile(activeFile);
  }

  if (!fileNames.length) {
    return (
      <div className={`w-full h-full rounded-xl border shadow-2xl flex flex-col items-center justify-center gap-2 px-6 text-center ${theme.shell}`}>
        <FileCode size={28} className="text-zinc-600" />
        <p className="text-sm text-zinc-400">Nenhum código gerado ainda</p>
        <p className="text-xs text-zinc-600 max-w-sm">
          A IA precisa enviar <span className="font-mono text-zinc-500">&lt;gocreate_artifact&gt;</span> com{' '}
          <span className="font-mono text-zinc-500">src/App.jsx</span>. Se a geração ficou incompleta, clique Continuar no preview ou no chat.
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full h-full rounded-xl border shadow-2xl overflow-hidden flex animate-in ${theme.shell}`}>
      {confirmDialog}
      <aside className={`w-52 shrink-0 border-r overflow-y-auto custom-scrollbar ${theme.aside}`}>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold border-b border-inherit flex items-center justify-between gap-1">
          <span>Explorer</span>
          <span className="normal-case tracking-normal text-zinc-600 font-normal">
            {fileNames.length} ficheiro{fileNames.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="py-1">
          <FolderNode
            node={tree}
            depth={0}
            activeFile={activeFile}
            onSelect={onSelectFile}
            expanded={expanded}
            toggle={toggle}
          />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className={`border-b border-inherit px-3 py-1.5 text-xs font-mono text-zinc-400 flex items-center justify-between gap-2 ${theme.aside}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">{activeFile || '—'}</span>
            {isDirty && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Alterações por guardar" />
            )}
            {saveFlash && (
              <span className="shrink-0 text-[10px] text-emerald-400 font-sans font-medium">Guardado</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canShowDiff && (
              <button
                type="button"
                onClick={() => setShowDiff((v) => !v)}
                className={`p-1.5 rounded-md transition-all ${
                  showDiff
                    ? 'text-blue-400 bg-blue-500/15'
                    : 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-800/80'
                }`}
                title={showDiff ? 'Fechar diff' : 'Ver diff (antes / depois)'}
              >
                <GitCompare size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={openFind}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-all"
              title="Localizar / substituir (Ctrl+F)"
            >
              <Search size={13} />
            </button>
            {canEdit && typeof onSaveFile === 'function' && (
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={!activeFile}
                className="p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800/80 transition-all disabled:opacity-40"
                title="Guardar e atualizar preview (Ctrl+S)"
              >
                <Save size={13} />
              </button>
            )}
            {canEdit && canRevert && (
              <button
                type="button"
                onClick={handleRevertClick}
                className="p-1.5 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/80 transition-all"
                title="Reverter ficheiro"
              >
                <RotateCcw size={13} />
              </button>
            )}
            {canEdit ? (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400/90 font-sans font-medium">
                <Pencil size={10} /> Editável
              </span>
            ) : (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-zinc-600 font-sans">
                Só leitura
              </span>
            )}
          </div>
        </div>
        <div className={`flex-1 min-h-0 overflow-hidden ${theme.codeBg} ${theme.text}`}>
          {showDiff && canShowDiff ? (
            <CodeDiffView
              before={diffBefore}
              after={code}
              fileName={activeFile}
              fontSize={fontSize}
            />
          ) : (
            <CodeMirror
              key={activeFile || '__none__'}
              value={code}
              height="100%"
              theme={oneDark}
              extensions={extensions}
              editable={canEdit && typeof onChangeFile === 'function'}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                indentOnInput: true,
              }}
              onChange={handleChange}
              onCreateEditor={(view) => {
                viewRef.current = view;
              }}
              className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-editor]:outline-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}
