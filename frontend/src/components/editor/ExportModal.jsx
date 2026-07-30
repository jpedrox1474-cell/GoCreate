import React, { useState } from 'react';
import { Download, Github, FolderArchive, Loader2, Check } from 'lucide-react';
import ModalShell from './ModalShell';
import { downloadFilesAsZip } from '../../lib/zipDownload';

export default function ExportModal({ open, onClose, files, projectName, onToast }) {
  const [githubUrl, setGithubUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);
  const fileCount = Object.keys(files || {}).length;

  function handleZip() {
    try {
      const safe = (projectName || 'gocreate-project')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-|-$/g, '') || 'gocreate-project';
      downloadFilesAsZip(files, `${safe}.zip`);
      onToast?.({ message: 'ZIP descarregado.', type: 'success' });
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao exportar ZIP.', type: 'error' });
    }
  }

  async function handleGithubPush(e) {
    e.preventDefault();
    if (!githubUrl.trim()) return;
    setPushing(true);
    setPushed(false);
    await new Promise((r) => setTimeout(r, 1400));
    setPushing(false);
    setPushed(true);
    onToast?.({
      message: 'Push simulado para GitHub (demo). Integração real em breve.',
      type: 'success',
    });
  }

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
          <form onSubmit={handleGithubPush} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">URL do repositório</label>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => {
                  setGithubUrl(e.target.value);
                  setPushed(false);
                }}
                placeholder="https://github.com/user/repo"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!githubUrl.trim() || pushing}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-all"
            >
              {pushing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : pushed ? (
                <Check size={16} />
              ) : (
                <Github size={16} />
              )}
              {pushing ? 'A enviar…' : pushed ? 'Enviado (demo)' : 'Push para GitHub'}
            </button>
          </form>
        </section>
      </div>
    </ModalShell>
  );
}
