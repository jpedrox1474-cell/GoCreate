import React, { useMemo } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
  SandpackLayout,
  useLoadingOverlayState,
  useErrorMessage,
} from '@codesandbox/sandpack-react';
import { AlertTriangle, Wand2, Loader2 } from 'lucide-react';
import {
  toSandpackFiles,
  resolveSandpackDependencies,
} from '../../lib/artifactParser';
import SandpackErrorBoundary from './SandpackErrorBoundary';

function CompilingOverlay({ externalLoading }) {
  const state = useLoadingOverlayState(undefined, Boolean(externalLoading));
  const visible =
    state === 'LOADING' ||
    state === 'PRE_FADING' ||
    state === 'TIMEOUT' ||
    Boolean(externalLoading);

  if (!visible) return null;

  const label =
    state === 'TIMEOUT'
      ? 'Preview a demorar…'
      : externalLoading
        ? 'A gerar / compilar…'
        : 'A compilar dependências…';

  return (
    <div
      className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl bg-zinc-900/95 border border-zinc-800/80 shadow-2xl">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-blue-600/20 blur-md animate-pulse" />
          <Loader2 size={28} className="relative text-blue-500 animate-spin" />
        </div>
        <span className="text-sm font-medium text-zinc-100">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '140ms' }} />
          <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce [animation-duration:0.7s]" style={{ animationDelay: '280ms' }} />
        </div>
        <span className="text-[11px] text-zinc-500">Sandpack · React</span>
      </div>
    </div>
  );
}

function RuntimeErrorOverlay({ onAskFix }) {
  const error = useErrorMessage();
  if (!error) return null;

  return (
    <div className="absolute inset-0 z-30 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md w-full rounded-xl border border-red-500/30 bg-zinc-900 p-5 shadow-2xl space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">Erro no código gerado</h3>
            <p className="text-xs text-zinc-500 font-mono leading-relaxed break-words max-h-28 overflow-y-auto custom-scrollbar">
              {error}
            </p>
          </div>
        </div>
        {typeof onAskFix === 'function' && (
          <button
            type="button"
            onClick={() => onAskFix(error)}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-900/20 transition-all"
          >
            <Wand2 size={14} />
            Pedir para a IA consertar
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewInner({ isGenerating, onAskFix, publicMode }) {
  return (
    <div
      className={`relative h-full w-full [&_.sp-overlay]:!opacity-0 [&_.sp-overlay]:!pointer-events-none ${
        publicMode
          ? '[&_.sp-navigator]:!hidden [&_.sp-preview-actions]:!hidden [&_.sp-button]:!hidden'
          : ''
      }`}
    >
      <SandpackLayout style={{ height: '100%', border: 'none', background: 'transparent' }}>
        <SandpackPreview
          showNavigator={!publicMode}
          showOpenInCodeSandbox={false}
          showRefreshButton={!publicMode}
          showSandpackErrorOverlay={false}
          style={{ height: '100%', flex: 1 }}
        />
      </SandpackLayout>
      <CompilingOverlay externalLoading={Boolean(isGenerating)} />
      <RuntimeErrorOverlay onAskFix={onAskFix} />
    </div>
  );
}

export default function PreviewPane({ files, isGenerating, onAskFix, publicMode = false }) {
  const sandpackFiles = useMemo(() => toSandpackFiles(files), [files]);
  const hasFiles = Boolean(sandpackFiles && Object.keys(sandpackFiles).length);

  const dependencies = useMemo(
    () => resolveSandpackDependencies(sandpackFiles || files),
    [sandpackFiles, files]
  );

  const sandpackKey = useMemo(() => {
    if (!sandpackFiles) return 'empty';
    const depsKey = Object.keys(dependencies).sort().join(',');
    return `${depsKey}::${Object.entries(sandpackFiles)
      .map(([path, entry]) => `${path}:${(entry?.code || '').length}:${(entry?.code || '').slice(0, 48)}`)
      .sort()
      .join('|')}`;
  }, [sandpackFiles, dependencies]);

  const shellClass = publicMode
    ? 'w-full h-full min-h-0 overflow-hidden bg-zinc-950 relative flex flex-col'
    : 'w-full h-full min-h-0 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 relative shadow-2xl shadow-black/40 flex flex-col';

  return (
    <div className={shellClass}>
      <div className="flex-1 min-h-0 bg-zinc-950 [&_.sp-wrapper]:h-full [&_.sp-wrapper]:!bg-zinc-950 [&_.sp-layout]:h-full [&_.sp-layout]:!bg-zinc-950 [&_.sp-layout]:!border-zinc-800 [&_.sp-preview-container]:h-full [&_.sp-preview-container]:!bg-zinc-950 [&_.sp-stack]:h-full [&_.sp-preview]:h-full [&_.sp-preview]:!bg-zinc-950">
        {!hasFiles ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 bg-zinc-900/40 px-6 text-center">
            {isGenerating ? (
              <>
                <Loader2 size={28} className="text-blue-500 animate-spin mb-1" />
                <p className="text-sm font-medium text-zinc-200">GoCreate a construir interface…</p>
                <p className="text-xs text-zinc-500">A aguardar ficheiros da IA</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-300">Live Preview</p>
                <p className="text-xs text-zinc-500 max-w-xs">
                  Ainda não há ficheiros gerados. Envia uma mensagem no chat para a IA criar a interface.
                </p>
              </>
            )}
          </div>
        ) : (
          <SandpackErrorBoundary onAskFix={onAskFix} key={sandpackKey}>
            <SandpackProvider
              key={sandpackKey}
              template="react"
              theme="dark"
              files={sandpackFiles}
              customSetup={{
                dependencies,
              }}
              options={{
                autorun: true,
                autoReload: true,
                recompileMode: 'delayed',
                recompileDelay: 300,
                externalResources: [
                  // Tailwind CDN — system prompt styles with utility classes
                  'https://cdn.tailwindcss.com',
                ],
              }}
              style={{ height: '100%' }}
            >
              <PreviewInner
                isGenerating={isGenerating}
                onAskFix={onAskFix}
                publicMode={publicMode}
              />
            </SandpackProvider>
          </SandpackErrorBoundary>
        )}
      </div>
    </div>
  );
}
