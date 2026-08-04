import React, { useEffect, useRef } from 'react';
import { MergeView } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';

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

/**
 * Side-by-side before (checkpoint/baseline) vs after (current).
 */
export default function CodeDiffView({
  before = '',
  after = '',
  fileName = '',
  fontSize = 14,
}) {
  const parentRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!parentRef.current) return undefined;
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const lang = languageExtension(fileName);
    const shared = [
      oneDark,
      lang,
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', fontSize: `${fontSize}px` },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        },
        '.cm-content': { padding: '8px 0' },
        '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
      }),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    const view = new MergeView({
      parent: parentRef.current,
      orientation: 'a-b',
      gutter: true,
      a: {
        doc: before ?? '',
        extensions: shared,
      },
      b: {
        doc: after ?? '',
        extensions: shared,
      },
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [before, after, fileName, fontSize]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 flex text-[10px] uppercase tracking-wider font-semibold border-b border-zinc-800">
        <div className="flex-1 px-3 py-1.5 text-zinc-500 bg-zinc-900/50">Antes</div>
        <div className="flex-1 px-3 py-1.5 text-blue-400/80 bg-zinc-900/80">Depois</div>
      </div>
      <div ref={parentRef} className="flex-1 min-h-0 overflow-hidden [&_.cm-mergeView]:h-full [&_.cm-mergeViewEditors]:h-full" />
    </div>
  );
}
