import React, { useState, useEffect, useMemo } from 'react';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Globe,
  Copy,
  Check,
  Pencil,
  Server,
  History,
} from 'lucide-react';
import ModalShell from './ModalShell';
import { useConfirm } from './ConfirmDialog';
import { publishProject, getPublishUrl, getProjectPublicKey } from '../../lib/projects';
import { publishViaApi, checkSlugAvailability, updateProjectSlug, listDeployHistory, rollbackDeploy } from '../../lib/deployApi';
import { getUserSettings, recordDeployNotificationStub } from '../../lib/userSettings';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';

const STEPS = ['A preparar build…', 'A guardar snapshot…', 'A publicar…', 'Pronto!'];

export default function DeployModal({
  open,
  onClose,
  projectName,
  projectId,
  projectSlug = null,
  files,
  ownerId,
  ownerPlan = 'free',
  backendEnabled = false,
  onToast,
  onSlugUpdated,
  onOpenSettings,
}) {
  const { user } = useAuth();
  const { canUsePremium, plan, role } = useCredits();
  const [askConfirm, confirmDialog] = useConfirm();
  const [env, setEnv] = useState('production');
  const [phase, setPhase] = useState('idle'); // idle | deploying | done | error
  const [stepIdx, setStepIdx] = useState(0);
  const [deployUrl, setDeployUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState('');
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugBusy, setSlugBusy] = useState(false);
  const [slugHint, setSlugHint] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(null);

  const effectivePlan = plan || ownerPlan;
  const publicKey = useMemo(
    () => getProjectPublicKey(slug || projectSlug, projectId),
    [slug, projectSlug, projectId]
  );
  const fixedUrl = useMemo(
    () => (projectId ? getPublishUrl(projectId, env, publicKey) : ''),
    [projectId, env, publicKey]
  );

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setStepIdx(0);
      setDeployUrl('');
      setErrorMsg('');
      setCopied(false);
      setEditingSlug(false);
      setSlugHint('');
      setHistory([]);
    } else {
      const initial = projectSlug || projectId || '';
      setSlug(initial);
      setSlugDraft(initial);
    }
  }, [open, projectSlug, projectId]);

  useEffect(() => {
    if (!open || !projectId || !user) return undefined;
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const idToken = await user.getIdToken();
        const items = await listDeployHistory({ idToken, projectId, env });
        if (!cancelled) setHistory(items);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, user, env, phase]);

  async function handleRollback(historyId) {
    if (!user || !projectId || rollbackBusy) return;
    const ok = await askConfirm({
      title: 'Reverter publicação',
      message:
        'Reverter para este snapshot? A publicação atual será guardada no histórico.',
      confirmLabel: 'Reverter',
      destructive: true,
    });
    if (!ok) return;
    setRollbackBusy(historyId);
    try {
      const idToken = await user.getIdToken();
      const result = await rollbackDeploy({ idToken, projectId, historyId });
      setDeployUrl(result.url || fixedUrl);
      setPhase('done');
      onToast?.({ message: 'Rollback concluído.', type: 'success' });
      const items = await listDeployHistory({ idToken, projectId, env });
      setHistory(items);
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha no rollback.', type: 'error' });
    } finally {
      setRollbackBusy(null);
    }
  }

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
      onToast?.({ message: 'Publicar precisa de um projeto guardado.', type: 'error' });
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
      let result;
      const wantsNotify = getUserSettings().notifications;
      if (env === 'production') {
        const idToken = await user.getIdToken();
        result = await publishViaApi({
          idToken,
          projectId,
          files,
          name: projectName,
          env: 'production',
          notifyEmail: wantsNotify,
        });
      } else {
        result = await publishProject(projectId, {
          files,
          name: projectName,
          env: 'preview',
          ownerId,
          plan: effectivePlan,
          role,
          slug: publicKey,
        });
      }
      setStepIdx(STEPS.length - 1);
      const nextSlug = result.slug || publicKey;
      if (result.slug) setSlug(result.slug);
      setDeployUrl(result.url || getPublishUrl(projectId, env, nextSlug));
      setPhase('done');
      onToast?.({ message: 'Publicado com sucesso — o link mantém-se estável.', type: 'success' });

      if (wantsNotify) {
        await recordDeployNotificationStub({
          uid: ownerId,
          projectId,
          url: result.url,
          env,
          enabled: true,
        });
      }
    } catch (err) {
      console.error('[DeployModal]', err);
      setPhase('error');
      setErrorMsg(err?.message || 'Falha ao publicar. Tenta novamente.');
      onToast?.({ message: 'Publicação falhou.', type: 'error' });
    }
  }

  async function copyUrl() {
    const url = deployUrl || fixedUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onToast?.({ message: 'URL copiado.', type: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.({ message: 'Não foi possível copiar.', type: 'error' });
    }
  }

  async function saveSlug() {
    if (!user?.getIdToken || !projectId) return;
    setSlugBusy(true);
    setSlugHint('');
    try {
      const idToken = await user.getIdToken();
      const check = await checkSlugAvailability({
        idToken,
        slug: slugDraft,
        projectId,
      });
      if (!check.available) {
        setSlugHint(check.error || 'Slug indisponível.');
        return;
      }
      const result = await updateProjectSlug({
        idToken,
        projectId,
        slug: check.slug || slugDraft,
      });
      setSlug(result.slug);
      setSlugDraft(result.slug);
      setEditingSlug(false);
      setSlugHint('Link atualizado.');
      onSlugUpdated?.({ slug: result.slug, publishedUrl: result.url });
      onToast?.({ message: 'Link público atualizado.', type: 'success' });
      if (phase === 'done') {
        setDeployUrl(env === 'preview' ? result.previewUrl : result.url);
      }
    } catch (err) {
      setSlugHint(err?.message || 'Não foi possível alterar o link.');
      onToast?.({ message: err?.message || 'Falha ao alterar link.', type: 'error' });
    } finally {
      setSlugBusy(false);
    }
  }

  return (
    <>
      {confirmDialog}
    <ModalShell open={open} onClose={onClose} title="Publicar">
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          O link é fixo para este projeto — cada publicação atualiza o mesmo URL. Free publica com a
          tag “Feito com GoCreate”; Pro remove a badge. Guardar dados no site exige Backend ativado.
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
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all capitalize inline-flex items-center justify-center gap-1.5 ${
                  env === e
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">URL fixo</p>
                <p className="text-[11px] text-zinc-300 font-mono break-all">
                  {(deployUrl || fixedUrl || 'gocreate-app.web.app/p/…').replace(/^https?:\/\//, '')}
                </p>
              </div>
              <button
                type="button"
                disabled={!projectId || phase === 'deploying'}
                onClick={() => {
                  setEditingSlug((v) => !v);
                  setSlugDraft(slug || projectId || '');
                  setSlugHint('');
                }}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40"
              >
                <Pencil size={12} />
                Alterar link
              </button>
            </div>

            {editingSlug ? (
              <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                <p className="text-[10px] text-zinc-500">
                  Só a parte <span className="font-mono text-zinc-400">/p/…</span> muda. Letras,
                  números e hífens (3–48).
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
                    <span className="pl-2.5 text-[11px] text-zinc-600 font-mono shrink-0">/p/</span>
                    <input
                      type="text"
                      value={slugDraft}
                      onChange={(e) =>
                        setSlugDraft(
                          e.target.value
                            .toLowerCase()
                            .replace(/[\s_]+/g, '-')
                            .replace(/[^a-z0-9-]/g, '')
                        )
                      }
                      disabled={slugBusy}
                      className="w-full bg-transparent px-1.5 py-2 text-xs text-zinc-200 font-mono outline-none"
                      placeholder="meu-salao"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={slugBusy || !slugDraft.trim()}
                    onClick={saveSlug}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {slugBusy ? <Loader2 size={12} className="animate-spin" /> : null}
                    Guardar
                  </button>
                </div>
                {slugHint ? (
                  <p
                    className={`text-[10px] ${
                      slugHint.includes('atualizado') ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {slugHint}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {!canUsePremium ? (
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Plano Free: o site publicado mostra a tag “Feito com GoCreate” (link para signup).
              Assina Pro para remover a badge.
            </p>
          ) : null}

          {!backendEnabled ? (
            <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2">
              <Server size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Backend Functions desativadas — o site publica, mas gravar na base de dados fica
                  bloqueado até ativares.
                </p>
                {typeof onOpenSettings === 'function' ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose?.();
                      onOpenSettings();
                    }}
                    className="text-[11px] font-semibold text-amber-300 hover:text-amber-200"
                  >
                    Ativar funções de Backend →
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-emerald-400/90 leading-relaxed inline-flex items-center gap-1.5">
              <Server size={12} />
              Backend ativo — apps publicados podem guardar dados.
            </p>
          )}

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 space-y-1.5">
            <p className="text-[11px] font-medium text-zinc-300 inline-flex items-center gap-1.5">
              <Globe size={12} className="text-blue-400" />
              Domínio personalizado
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Em Settings do projeto: define o hostname, cria TXT{' '}
              <span className="font-mono text-zinc-400">gocreate-verify=…</span> + CNAME →{' '}
              <span className="font-mono text-zinc-400">gocreate-app.web.app</span>, verifica DNS, e
              adiciona o domínio no Firebase Hosting (site gocreate-app).
            </p>
            {typeof onOpenSettings === 'function' ? (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onOpenSettings();
                }}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300"
              >
                Abrir Settings → Domínio →
              </button>
            ) : null}
          </div>
        </div>

        {phase === 'idle' && (
          <button
            type="button"
            onClick={startDeploy}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md shadow-blue-900/20 transition-all"
          >
            <Rocket size={16} />
            Publicar
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
                style={{
                  width: `${((Math.min(stepIdx, STEPS.length - 1) + 1) / STEPS.length) * 100}%`,
                }}
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
              Publicado em {env} (mesmo link)
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
                Republicar
              </button>
            </div>
          </div>
        )}

        {projectId && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
              <History size={12} className="text-blue-400" /> Histórico / rollback
            </div>
            {historyLoading ? (
              <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> A carregar…
              </p>
            ) : !history.length ? (
              <p className="text-[11px] text-zinc-500">
                Ainda sem snapshots. Cada republicação guarda a versão anterior.
              </p>
            ) : (
              <ul className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-zinc-800/80 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="text-zinc-300 truncate">
                        {h.fileCount} ficheiros
                        {h.slug ? ` · ${h.slug}` : ''}
                      </p>
                      <p className="text-[10px] text-zinc-600 font-mono truncate">{h.id.slice(0, 12)}…</p>
                    </div>
                    <button
                      type="button"
                      disabled={!!rollbackBusy}
                      onClick={() => void handleRollback(h.id)}
                      className="shrink-0 px-2 py-1 rounded-md text-[10px] font-medium border border-zinc-700 text-zinc-300 hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-40"
                    >
                      {rollbackBusy === h.id ? '…' : 'Reverter'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </ModalShell>
    </>
  );
}
