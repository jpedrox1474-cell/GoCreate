import React, { useMemo, useState, useEffect } from 'react';
import { FileCode, Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';

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

export default function CodeEditor({ files, activeFile, onSelectFile }) {
  const fileNames = Object.keys(files || {});
  const code = (activeFile && files?.[activeFile]) || '';
  const lines = code ? code.split('\n') : [''];
  const tree = useMemo(() => buildTree(fileNames), [fileNames]);

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

  if (!fileNames.length) {
    return (
      <div className="w-full h-full bg-[#1e1e1e] rounded-xl border border-zinc-800 shadow-2xl flex flex-col items-center justify-center gap-2 px-6 text-center">
        <FileCode size={28} className="text-zinc-600" />
        <p className="text-sm text-zinc-400">Nenhum código gerado ainda</p>
        <p className="text-xs text-zinc-600 max-w-sm">
          Quando a IA responder com código, a árvore de ficheiros aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#1e1e1e] rounded-xl border border-zinc-800 shadow-2xl overflow-hidden flex animate-in">
      <aside className="w-52 shrink-0 border-r border-[#3c3c3c] bg-[#252526] overflow-y-auto custom-scrollbar">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold border-b border-[#3c3c3c] flex items-center justify-between">
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

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="bg-[#252526] border-b border-[#3c3c3c] px-4 py-2 text-xs font-mono text-[#cccccc]/80 truncate">
          {activeFile || '—'}
        </div>
        <div className="flex-1 p-4 overflow-auto custom-scrollbar font-mono text-sm leading-relaxed bg-[#1e1e1e]">
          <div className="flex min-w-max">
            <div className="text-[#858585] text-right pr-6 select-none opacity-50 flex flex-col items-end sticky left-0 bg-[#1e1e1e]">
              {lines.map((_, i) => (
                <div key={i} className="h-5 leading-5">
                  {i + 1}
                </div>
              ))}
            </div>
            <pre className="text-[#d4d4d4] flex-1">
              <code>
                {lines.map((line, i) => (
                  <div key={i} className="h-5 leading-5 whitespace-pre hover:bg-[#2a2d2e]/50 px-1">
                    {highlightLine(line, activeFile) || ' '}
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function highlightLine(line, fileName) {
  if (fileName?.endsWith('.css')) {
    return line;
  }

  const escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = escaped
    .replace(
      /\b(import|from|export|default|function|const|return|let|var|if|else|new)\b/g,
      '<span style="color:#c586c0">$1</span>'
    )
    .replace(
      /\b(React|useState|useEffect|App)\b/g,
      '<span style="color:#4ec9b0">$1</span>'
    )
    .replace(/(&#39;.*?&#39;|&quot;.*?&quot;|'.*?'|".*?")/g, '<span style="color:#ce9178">$&</span>')
    .replace(/(\/\/.*)$/g, '<span style="color:#6a9955">$1</span>');

  return <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />;
}
