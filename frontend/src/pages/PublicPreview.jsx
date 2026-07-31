import React, { useEffect, useState } from 'react';
import { Link, useParams, useMatch } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import PreviewPane from '../components/editor/PreviewPane';
import { getPublishedProject } from '../lib/projects';

const GOCREATE_HOME = 'https://gocreate.web.app';

/** Free-plan watermark: only when snapshot says so (or legacy free default). */
function shouldShowGoCreateBadge(publication) {
  if (!publication) return false;
  if (typeof publication.showBadge === 'boolean') return publication.showBadge;
  const plan = publication.plan || 'free';
  return plan !== 'pro' && plan !== 'enterprise_master';
}

/** Live projects.backendEnabled + authAccess — overrides stale publicProjects snapshot. */
async function fetchLiveRuntime(projectId) {
  if (!projectId) return null;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/runtime`);
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json;
  } catch {
    /* ignore — fall back to snapshot */
  }
  return null;
}

export default function PublicPreview() {
  const { projectId: pathKey } = useParams();
  const isPreviewEnv = Boolean(useMatch('/p/:projectId/preview'));
  const env = isPreviewEnv ? 'preview' : 'production';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [publication, setPublication] = useState(null);
  const [liveRuntime, setLiveRuntime] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPublication(null);
    setLiveRuntime(null);

    (async () => {
      try {
        const data = await getPublishedProject(pathKey, env);
        if (cancelled) return;
        if (!data?.files || !Object.keys(data.files).length) {
          setError('Esta publicação não existe ou ainda não tem ficheiros.');
        } else {
          setPublication(data);
          const pid = data.projectId || pathKey;
          const live = await fetchLiveRuntime(pid);
          if (!cancelled && live) setLiveRuntime(live);
        }
      } catch (err) {
        console.error('[PublicPreview]', err);
        if (!cancelled) setError('Não foi possível carregar a publicação.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathKey, env]);

  const showBadge = shouldShowGoCreateBadge(publication);
  const runtimeProjectId = publication?.projectId || pathKey;
  const backendEnabled =
    typeof liveRuntime?.backendEnabled === 'boolean'
      ? liveRuntime.backendEnabled
      : Boolean(publication?.backendEnabled);

  const authAccess = {
    mode:
      (liveRuntime?.mode || publication?.authAccess?.mode) === 'invited'
        ? 'invited'
        : 'owner_only',
    invitedEmails: Array.isArray(liveRuntime?.invitedEmails)
      ? liveRuntime.invitedEmails
      : Array.isArray(publication?.authAccess?.invitedEmails)
        ? publication.authAccess.invitedEmails
        : [],
    ownerId: liveRuntime?.ownerId || publication?.ownerId || null,
    ownerEmail: liveRuntime?.ownerEmail || publication?.ownerEmail || null,
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <Loader2 size={28} className="text-zinc-400 animate-spin" aria-label="A carregar" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 gap-3 px-6 text-center">
        <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <AlertTriangle size={20} className="text-amber-400" />
        </div>
        <p className="text-sm font-medium text-zinc-200">{error}</p>
        <p className="text-xs text-zinc-500 max-w-sm">
          Abre o editor, gera a interface e faz Deploy para publicar um URL partilhável.
        </p>
        <Link
          to="/"
          className="mt-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
        >
          Ir ao GoCreate
        </Link>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-zinc-950 relative">
      <PreviewPane
        files={publication.files}
        isGenerating={false}
        publicMode
        projectId={runtimeProjectId}
        backendEnabled={backendEnabled}
        authAccess={authAccess}
      />

      {showBadge && (
        <a
          href={GOCREATE_HOME}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-3 right-3 z-50 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700/60 text-[11px] font-medium text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 shadow-lg shadow-black/40 backdrop-blur-md transition-colors"
        >
          Feito com GoCreate
        </a>
      )}
    </div>
  );
}
