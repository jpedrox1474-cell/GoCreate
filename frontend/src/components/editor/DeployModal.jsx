import React, { useState, useEffect } from 'react';
import { Rocket, Loader2, CheckCircle2, ExternalLink, Globe, Copy, Check } from 'lucide-react';
import ModalShell from './ModalShell';
import { publishProject, getPublishUrl } from '../../lib/projects';

const STEPS = ['A preparar build…', 'A guardar snapshot…', 'A publicar…', 'Live!'];

export default function DeployModal({
  open,
  onClose,
  projectName,
  projectId,
  files,
  ownerId,
  onToast,
}) {
  const [env, setEnv] = useState('production');
  const [phase, setPhase] = useState('idle'); // idle | deploying | done | error
  const [stepIdx, setStepIdx] = useState(0);
  const [deployUrl, setDeployUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setStepIdx(0);
      setDeployUrl('');
      setErrorMsg('');
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    if (phase !== 'deploying') return undefined;
    if (stepIdx >= STEPS.length - 2) return undefined;
    const t = setTimeout(() => setStepIdx((i) => i + 1), 450);
    return () => clearTimeout(t);
  }, [phase, stepIdx]);

  async function startDeploy() {
    setErrorMsg('');
    setCopied(false);
    setDeployUrl('');

    if (!projectId || !ownerId) {
      setPhase('error');
      setErrorMsg('Guarda o projeto (conta real) antes de publicar. Templates demo não têm URL live.');
      onToast?.({ message: 'Deploy precisa de um projeto guardado.', type: 'error' });
      return;
    }

    const fileCount = files && typeof files === 'object' ? Object.keys(files).length : 0;
    if (!fileCount) {
      setPhase('error');
      setErrorMsg('Não há ficheiros gerados. Pede à IA para criar a interface primeiro.');
      onToast?.({ message: 'Sem ficheiros para publicar.', type: 'error' });
      return;
    }

    setPhase('deploying');
    setStepIdx(0);

    try {
      const result = await publishProject(projectId, {
        files,
        name: projectName,
        env,
        ownerId,
      });
      setStepIdx(STEPS.length - 1);
      setDeployUrl(result.url || getPublishUrl(projectId, env));
      setPhase('done');
      onToast?.({ message: 'Publicado com sucesso.', type: 'success' });
    } catch (err) {
      console.error('[DeployModal]', err);
      setPhase('error');
      setErrorMsg(err?.message || 'Falha ao publicar. Tenta novamente.');
      onToast?.({ message: 'Deploy falhou.', type: 'error' });
    }
  }

  async function copyUrl() {
    if (!deployUrl) return;
    try {
      await navigator.clipboard.writeText(deployUrl);
      setCopied(true);
      onToast?.({ message: 'URL copiado.', type: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.({ message: 'Não foi possível copiar.', type: 'error' });
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Deploy">
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Publica o preview num URL partilhável em gocreate.web.app — qualquer pessoa pode abrir sem
          login.
        </p>

        <div className="space-y-2">
          <label className="block text-xs text-zinc-500">Ambiente</label>
          <div className="flex gap-2">
            {['preview', 'production'].map((e) => (
              <button
                key={e}
                type="button"
                disabled={phase === 'deploying'}
                onClick={() => setEnv(e)}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all capitalize ${
                  env === e
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 font-mono break-all">
            {projectId
              ? getPublishUrl(projectId, env).replace(/^https?:\/\//, '')
              : 'gocreate.web.app/p/…'}
          </p>
        </div>

        {phase === 'idle' && (
          <button
            type="button"
            onClick={startDeploy}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-900/20 transition-all"
          >
            <Rocket size={16} />
            Iniciar deploy
          </button>
        )}

        {phase === 'deploying' && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-blue-400" />
              {STEPS[Math.min(stepIdx, STEPS.length - 1)]}
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500"
                style={{ width: `${((Math.min(stepIdx, STEPS.length - 1) + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-4 space-y-3">
            <p className="text-xs text-red-300 leading-relaxed">{errorMsg}</p>
            <button
              type="button"
              onClick={startDeploy}
              className="w-full text-xs font-medium text-zinc-300 hover:text-zinc-100 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
              <CheckCircle2 size={16} />
              Publicado em {env}
            </div>
            <a
              href={deployUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 transition-all break-all"
            >
              <Globe size={14} className="text-blue-400 shrink-0" />
              {deployUrl}
              <ExternalLink size={12} className="text-zinc-500 shrink-0" />
            </a>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyUrl}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar URL'}
              </button>
              <button
                type="button"
                onClick={startDeploy}
                className="flex-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
              >
                Redeploy
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
