import React, { useEffect, useMemo, useState } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
  SandpackLayout,
  useLoadingOverlayState,
  useErrorMessage,
} from '@codesandbox/sandpack-react';
import { AlertTriangle, Wand2, Loader2, LayoutTemplate } from 'lucide-react';
import {
  toSandpackFiles,
  resolveSandpackDependencies,
} from '../../lib/artifactParser';
import { installPreviewAuthBridge } from '../../lib/previewAuthBridge';
import SandpackErrorBoundary from './SandpackErrorBoundary';

function CompilingOverlay({ externalLoading, publicMode }) {
  const state = useLoadingOverlayState(undefined, Boolean(externalLoading));
  const [holdAfterGen, setHoldAfterGen] = useState(false);

  useEffect(() => {
    if (externalLoading) {
      setHoldAfterGen(true);
      return undefined;
    }
    // Keep spinner briefly after generation ends while Sandpack remounts/bundlers.
    const t = setTimeout(() => setHoldAfterGen(false), 2800);
    return () => clearTimeout(t);
  }, [externalLoading]);

  const sandpackBusy =
    state === 'LOADING' || state === 'PRE_FADING' || state === 'TIMEOUT';

  const visible = sandpackBusy || Boolean(externalLoading) || holdAfterGen;

  if (!visible) return null;

  if (publicMode) {
    return (
      <div
        className="absolute inset-0 z-40 bg-zinc-950 flex items-center justify-center pointer-events-none"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 size={28} className="text-zinc-400 animate-spin" aria-label="A carregar" />
      </div>
    );
  }

  const label =
    state === 'TIMEOUT'
      ? 'Preview a demorar…'
      : externalLoading
        ? 'A gerar / compilar…'
        : holdAfterGen && !sandpackBusy
          ? 'A atualizar preview…'
          : 'A compilar dependências…';

  return (
    <div
      className="absolute inset-0 z-40 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none"
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

function RuntimeErrorOverlay({ onAskFix, hidden }) {
  const error = useErrorMessage();
  if (hidden || !error) return null;

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

function IncompleteBanner({ visible, onContinue }) {
  if (!visible || typeof onContinue !== 'function') return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[min(100%-1.5rem,24rem)]">
      <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/90 px-3 py-2 shadow-lg backdrop-blur-sm">
        <p className="text-[11px] text-amber-100/90 leading-snug">
          Geração incompleta — ficheiros parciais mantidos.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md"
        >
          <Wand2 size={12} />
          Continuar
        </button>
      </div>
    </div>
  );
}

function PreviewInner({ isGenerating, onAskFix, publicMode, generationIncomplete, onContinue }) {
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
      <IncompleteBanner visible={Boolean(generationIncomplete)} onContinue={onContinue} />
      <CompilingOverlay externalLoading={Boolean(isGenerating)} publicMode={publicMode} />
      <RuntimeErrorOverlay onAskFix={onAskFix} hidden={Boolean(isGenerating)} />
    </div>
  );
}

function EmptyPreviewPlaceholder({
  isGenerating,
  entitiesOnly,
  generationIncomplete,
  onRequestUi,
  onContinue,
}) {
  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-zinc-900/40 px-6 text-center">
        <Loader2 size={28} className="text-blue-500 animate-spin mb-1" />
        <p className="text-sm font-medium text-zinc-200">A aguardar código gerado…</p>
        <p className="text-xs text-zinc-500 max-w-xs">
          O preview Sandpack aparece assim que a IA enviar ficheiros React.
        </p>
      </div>
    );
  }

  if (generationIncomplete) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-zinc-900/40 px-6 text-center">
        <p className="text-sm font-medium text-zinc-200">Geração incompleta</p>
        <p className="text-xs text-zinc-500 max-w-sm">
          A resposta foi cortada antes de fechar os ficheiros. Continua para a IA emitir o restante.
        </p>
        {typeof onContinue === 'function' && (
          <button
            type="button"
            onClick={onContinue}
            className="mt-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all"
          >
            <Wand2 size={14} />
            Continuar geração
          </button>
        )}
      </div>
    );
  }

  if (entitiesOnly) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-zinc-900/40 px-6 text-center">
        <p className="text-sm font-medium text-zinc-200">Só chegou o modelo de dados</p>
        <p className="text-xs text-zinc-500 max-w-sm">
          Entidades foram guardadas, mas ainda não há UI React para o preview. Pede a interface agora.
        </p>
        {typeof onRequestUi === 'function' && (
          <button
            type="button"
            onClick={onRequestUi}
            className="mt-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all"
          >
            <LayoutTemplate size={14} />
            Pedir UI agora
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 bg-zinc-900/40 px-6 text-center">
      <p className="text-sm font-medium text-zinc-300">Live Preview</p>
      <p className="text-xs text-zinc-500 max-w-xs">
        Ainda não há ficheiros gerados. Envia uma mensagem no chat para a IA criar a interface.
      </p>
    </div>
  );
}

export default function PreviewPane({
  files,
  isGenerating,
  onAskFix,
  publicMode = false,
  projectId = null,
  backendEnabled = false,
  authAccess = null,
  entitiesOnly = false,
  generationIncomplete = false,
  onRequestUi = null,
  onContinue = null,
}) {
  // Sandpack iframe OAuth → parent Google popup on authorized domain
  useEffect(() => installPreviewAuthBridge(), []);

  const sandpackFiles = useMemo(() => toSandpackFiles(files), [files]);
  const hasFiles = Boolean(sandpackFiles && Object.keys(sandpackFiles).length);

  const dependencies = useMemo(
    () => resolveSandpackDependencies(sandpackFiles || files),
    [sandpackFiles, files]
  );

  const sandpackKey = useMemo(() => {
    if (!sandpackFiles) return 'empty';
    const depsKey = Object.keys(dependencies).sort().join(',');
    const beKey = backendEnabled ? 'be1' : 'be0';
    return `${depsKey}::${projectId || ''}::${beKey}::${Object.entries(sandpackFiles)
      .map(([path, entry]) => `${path}:${(entry?.code || '').length}:${(entry?.code || '').slice(0, 48)}`)
      .sort()
      .join('|')}`;
  }, [sandpackFiles, dependencies, projectId, backendEnabled]);

  const apiBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://gocreate.web.app';

  const paymentsBootstrap = useMemo(() => {
    const pid = JSON.stringify(projectId || '');
    const base = JSON.stringify(apiBase);
    const be = JSON.stringify(Boolean(backendEnabled));
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    };
    const cfg = JSON.stringify(firebaseConfig);
    const access = JSON.stringify(
      authAccess && typeof authAccess === 'object'
        ? {
            mode: authAccess.mode === 'invited' ? 'invited' : 'owner_only',
            invitedEmails: Array.isArray(authAccess.invitedEmails)
              ? authAccess.invitedEmails
              : [],
            ownerId: authAccess.ownerId || null,
            ownerEmail: authAccess.ownerEmail || null,
          }
        : null
    );
    return `data:text/javascript,window.__GOCREATE_PROJECT_ID__=${pid};window.__GOCREATE_API_BASE__=${base};window.__GOCREATE_BACKEND_ENABLED__=${be};window.__GOCREATE_FIREBASE_CONFIG__=${cfg};window.__GOCREATE_AUTH_ACCESS__=${access};`;
  }, [projectId, apiBase, backendEnabled, authAccess]);

  const shellClass = publicMode
    ? 'w-full h-full min-h-0 overflow-hidden bg-zinc-950 relative flex flex-col'
    : 'w-full h-full min-h-0 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 relative shadow-2xl shadow-black/40 flex flex-col';

  return (
    <div className={shellClass}>
      <div className="flex-1 min-h-0 bg-zinc-950 [&_.sp-wrapper]:h-full [&_.sp-wrapper]:!bg-zinc-950 [&_.sp-layout]:h-full [&_.sp-layout]:!bg-zinc-950 [&_.sp-layout]:!border-zinc-800 [&_.sp-preview-container]:h-full [&_.sp-preview-container]:!bg-zinc-950 [&_.sp-stack]:h-full [&_.sp-preview]:h-full [&_.sp-preview]:!bg-zinc-950">
        {!hasFiles ? (
          <EmptyPreviewPlaceholder
            isGenerating={isGenerating}
            entitiesOnly={entitiesOnly}
            generationIncomplete={generationIncomplete}
            onRequestUi={onRequestUi}
            onContinue={onContinue}
          />
        ) : (
          <SandpackErrorBoundary onAskFix={onAskFix} isGenerating={isGenerating} key={sandpackKey}>
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
                  'https://cdn.tailwindcss.com',
                  paymentsBootstrap,
                  `${apiBase}/gocreate-payments.js`,
                  `${apiBase}/gocreate-auth.js`,
                  `${apiBase}/gocreate-data.js`,
                ],
              }}
              style={{ height: '100%' }}
            >
              <PreviewInner
                isGenerating={isGenerating}
                onAskFix={onAskFix}
                publicMode={publicMode}
                generationIncomplete={generationIncomplete}
                onContinue={onContinue}
              />
            </SandpackProvider>
          </SandpackErrorBoundary>
        )}
      </div>
    </div>
  );
}
