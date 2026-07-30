import React, { useEffect, useState } from 'react';
import { Link, useParams, useMatch } from 'react-router-dom';
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import Logo from '../components/Logo';
import PreviewPane from '../components/editor/PreviewPane';
import { getPublishedProject } from '../lib/projects';

export default function PublicPreview() {
  const { projectId } = useParams();
  const isPreviewEnv = Boolean(useMatch('/p/:projectId/preview'));
  const env = isPreviewEnv ? 'preview' : 'production';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [publication, setPublication] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPublication(null);

    (async () => {
      try {
        const data = await getPublishedProject(projectId, env);
        if (cancelled) return;
        if (!data?.files || !Object.keys(data.files).length) {
          setError('Esta publicação não existe ou ainda não tem ficheiros.');
        } else {
          setPublication(data);
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
  }, [projectId, env]);

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 h-12 px-4 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Logo to="/" size="sm" />
          <span className="hidden sm:inline text-zinc-700">/</span>
          <span className="text-xs text-zinc-400 truncate max-w-[40vw]">
            {publication?.name || 'Publicação'}
          </span>
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${
              env === 'preview'
                ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
            }`}
          >
            {env}
          </span>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Criar o teu app
          <ExternalLink size={12} />
        </Link>
      </header>

      <main className="flex-1 min-h-0 p-3 sm:p-4">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40">
            <Loader2 size={28} className="text-blue-500 animate-spin" />
            <p className="text-sm text-zinc-400">A carregar publicação…</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-6 text-center">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle size={20} className="text-amber-400" />
            </div>
            <p className="text-sm font-medium text-zinc-200">{error}</p>
            <p className="text-xs text-zinc-500 max-w-sm">
              Abre o editor GoCreate, gera a interface e faz Deploy para publicar um URL partilhável.
            </p>
            <Link
              to="/dashboard"
              className="mt-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              Ir ao dashboard
            </Link>
          </div>
        ) : (
          <div className="h-full">
            <PreviewPane files={publication.files} isGenerating={false} />
          </div>
        )}
      </main>
    </div>
  );
}
