import React, { useEffect, useState } from 'react';
import { Download, Github, FolderArchive, Loader2, Check, ExternalLink, Unlink } from 'lucide-react';
import ModalShell from './ModalShell';
import { downloadFilesAsZip } from '../../lib/zipDownload';
import { useAuth } from '../../context/AuthContext';
import {
  getGitHubStatus,
  connectGitHubPopup,
  disconnectGitHub,
  exportToGitHub,
} from '../../lib/githubApi';

function slugifyRepo(name) {
  return (name || 'gocreate-project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'gocreate-project';
}

export default function ExportModal({ open, onClose, files, projectName, onToast }) {
  const { user } = useAuth();
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isPrivate, setIsPrivate] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pushedUrl, setPushedUrl] = useState(null);
  const [ghStatus, setGhStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const fileCount = Object.keys(files || {}).length;

  useEffect(() => {
    if (!open) return;
    setRepoName(slugifyRepo(projectName));
    setBranch('main');
    setIsPrivate(true);
    setPushedUrl(null);
  }, [open, projectName]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const token = await user.getIdToken();
        const status = await getGitHubStatus({ idToken: token });
        if (!cancelled) setGhStatus(status);
      } catch (err) {
        if (!cancelled) {
          setGhStatus({ configured: false, connected: false });
          console.warn('[ExportModal] status GitHub:', err);
        }
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  function handleZip() {
    try {
      const safe = slugifyRepo(projectName);
      downloadFilesAsZip(files, `${safe}.zip`);
      onToast?.({ message: 'ZIP descarregado.', type: 'success' });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao exportar ZIP.', type: 'error' });
    }
  }

  async function handleConnect() {
    if (!user || connecting) return;
    setConnecting(true);
    try {
      const token = await user.getIdToken();
      const returnPath = `${window.location.pathname}${window.location.search || ''}`;
      const result = await connectGitHubPopup({ idToken: token, returnPath });
      const status = await getGitHubStatus({ idToken: token });
      setGhStatus(status);
      onToast?.({
        message: result?.login
          ? `GitHub ligado (@${result.login}).`
          : 'GitHub ligado com sucesso.',
        type: 'success',
      });
    } catch (err) {
      if (err?.code === 'GITHUB_NOT_CONFIGURED' || err?.status === 503) {
        onToast?.({
          message: 'GitHub OAuth ainda não configurado no servidor (GITHUB_CLIENT_ID/SECRET).',
          type: 'error',
        });
      } else if (!/redirecionar|Popup bloqueado/i.test(err?.message || '')) {
        onToast?.({ message: err?.message || 'Falha ao ligar GitHub.', type: 'error' });
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await disconnectGitHub({ idToken: token });
      setGhStatus((s) => ({ ...(s || {}), connected: false, login: null }));
      onToast?.({ message: 'GitHub desligado.', type: 'info' });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao desligar.', type: 'error' });
    }
  }

  async function handleGithubPush(e) {
    e.preventDefault();
    if (!user || !repoName.trim() || !fileCount || pushing) return;

    setPushing(true);
    setPushedUrl(null);
    try {
      let token = await user.getIdToken();
      let status = ghStatus;
      if (!status?.connected) {
        setConnecting(true);
        try {
          const returnPath = `${window.location.pathname}${window.location.search || ''}`;
          await connectGitHubPopup({ idToken: token, returnPath });
          token = await user.getIdToken();
          status = await getGitHubStatus({ idToken: token });
          setGhStatus(status);
        } finally {
          setConnecting(false);
        }
      }

      const result = await exportToGitHub({
        idToken: token,
        repoName: repoName.trim(),
        description: `Exportado do GoCreate — ${projectName || 'projeto'}`,
        isPrivate,
        branch: branch.trim() || 'main',
        files,
      });

      setPushedUrl(result.repoUrl || null);
      onToast?.({
        message: result.repoUrl
          ? `Repositório criado: ${result.fullName || result.repoUrl}`
          : 'Push para GitHub concluído.',
        type: 'success',
      });
    } catch (err) {
      if (err?.code === 'GITHUB_NOT_CONNECTED') {
        onToast?.({ message: 'Liga o GitHub e tenta outra vez.', type: 'error' });
      } else if (err?.code === 'GITHUB_NOT_CONFIGURED' || err?.status === 503) {
        onToast?.({
          message: 'GitHub OAuth não configurado no servidor.',
          type: 'error',
        });
      } else {
        onToast?.({ message: err?.message || 'Falha no push para GitHub.', type: 'error' });
      }
    } finally {
      setPushing(false);
    }
  }

  const connected = Boolean(ghStatus?.connected);
  const configured = ghStatus?.configured !== false;

  return (
    <ModalShell open={open} onClose={onClose} title="Exportar projeto" wide>
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Download
          </h3>
          <button
            type="button"
            onClick={handleZip}
            disabled={!fileCount}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
              <FolderArchive size={16} className="text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">Descarregar .zip</p>
              <p className="text-xs text-zinc-500">
                {fileCount
                  ? `${fileCount} ficheiro${fileCount === 1 ? '' : 's'} gerados`
                  : 'Ainda não há ficheiros — gera código no chat primeiro'}
              </p>
            </div>
            <Download size={16} className="text-zinc-500 shrink-0" />
          </button>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            GitHub
          </h3>

          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-950/80">
            <div className="min-w-0 text-xs text-zinc-400">
              {statusLoading ? (
                'A verificar ligação…'
              ) : connected ? (
                <span className="text-zinc-200">
                  Ligado
                  {ghStatus?.login ? (
                    <span className="text-zinc-400"> @{ghStatus.login}</span>
                  ) : null}
                </span>
              ) : !configured ? (
                <span className="text-amber-400/90">OAuth não configurado no servidor</span>
              ) : (
                'Não ligado — vais autorizar ao fazer push'
              )}
            </div>
            {connected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Unlink size={12} />
                Desligar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || !configured}
                className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
              >
                {connecting ? <Loader2 size={12} className="animate-spin" /> : <Github size={12} />}
                Ligar
              </button>
            )}
          </div>

          <form onSubmit={handleGithubPush} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Nome do repositório</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => {
                  setRepoName(e.target.value);
                  setPushedUrl(null);
                }}
                placeholder="meu-projeto"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Visibilidade</label>
                <select
                  value={isPrivate ? 'private' : 'public'}
                  onChange={(e) => setIsPrivate(e.target.value === 'private')}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none transition-all"
                >
                  <option value="private">Privado</option>
                  <option value="public">Público</option>
                </select>
              </div>
            </div>

            {pushedUrl && (
              <a
                href={pushedUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 truncate"
              >
                <ExternalLink size={12} className="shrink-0" />
                {pushedUrl}
              </a>
            )}

            <button
              type="submit"
              disabled={!repoName.trim() || !fileCount || pushing || connecting}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-all"
            >
              {pushing || connecting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : pushedUrl ? (
                <Check size={16} />
              ) : (
                <Github size={16} />
              )}
              {connecting
                ? 'A ligar GitHub…'
                : pushing
                  ? 'A criar repo e enviar…'
                  : pushedUrl
                    ? 'Enviado'
                    : 'Push para GitHub'}
            </button>
          </form>
        </section>
      </div>
    </ModalShell>
  );
}
