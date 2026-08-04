import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Database,
  Plug,
  ExternalLink,
  Server,
  CheckCircle2,
  Shield,
  X,
  Plus,
} from 'lucide-react';
import ModalShell from './ModalShell';
import { updateProjectSettings, getPublishUrl, getProjectPublicKey } from '../../lib/projects';
import { checkSlugAvailability, updateProjectSlug, updateCustomDomain, verifyCustomDomain, getCustomDomainStatus } from '../../lib/deployApi';
import { enableProjectBackend } from '../../lib/projectsApi';
import { getUserSettings, saveUserSettings, syncDeployEmailPreference } from '../../lib/userSettings';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { BACKEND_ENABLE_CREDIT_COST } from '../../lib/plans';

function normalizeInviteEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export default function SettingsModal({
  open,
  onClose,
  project,
  projectId,
  onProjectUpdated,
  onToast,
}) {
  const { preference, setTheme } = useTheme();
  const { user } = useAuth();
  const { canUsePremium, credits, openPricing } = useCredits();
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [customDomain, setCustomDomain] = useState(project?.customDomain || '');
  const [slug, setSlug] = useState(project?.slug || projectId || '');
  const [theme, setThemeLocal] = useState(preference);
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slugHint, setSlugHint] = useState('');
  const [backendBusy, setBackendBusy] = useState(false);
  const [backendEnabled, setBackendEnabled] = useState(Boolean(project?.backendEnabled));
  const [authMode, setAuthMode] = useState(
    project?.authAccess?.mode === 'invited' ? 'invited' : 'owner_only'
  );
  const [invitedEmails, setInvitedEmails] = useState(
    () => project?.authAccess?.invitedEmails || []
  );
  const [inviteDraft, setInviteDraft] = useState('');
  const [domainDns, setDomainDns] = useState(null);
  const [domainVerified, setDomainVerified] = useState(Boolean(project?.customDomainVerified));
  const [domainBusy, setDomainBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name || '');
    setDescription(project?.description || '');
    setCustomDomain(project?.customDomain || '');
    setDomainVerified(Boolean(project?.customDomainVerified));
    setDomainDns(null);
    setSlug(project?.slug || projectId || '');
    setSlugHint('');
    setBackendEnabled(Boolean(project?.backendEnabled));
    setAuthMode(project?.authAccess?.mode === 'invited' ? 'invited' : 'owner_only');
    setInvitedEmails(
      Array.isArray(project?.authAccess?.invitedEmails)
        ? project.authAccess.invitedEmails
        : []
    );
    setInviteDraft('');
    const s = getUserSettings();
    setThemeLocal(s.theme || preference);
    setNotifications(s.notifications);
  }, [
    open,
    project?.name,
    project?.description,
    project?.customDomain,
    project?.customDomainVerified,
    project?.slug,
    project?.backendEnabled,
    project?.authAccess?.mode,
    project?.authAccess?.invitedEmails,
    projectId,
    preference,
  ]);

  useEffect(() => {
    setThemeLocal(preference);
  }, [preference]);

  function handleThemePick(next) {
    setThemeLocal(next);
    setTheme(next);
  }

  function addInviteEmail() {
    const email = normalizeInviteEmail(inviteDraft);
    if (!email || !email.includes('@')) {
      onToast?.({ message: 'Indica um e-mail válido.', type: 'error' });
      return;
    }
    setInvitedEmails((prev) => (prev.includes(email) ? prev : [...prev, email].slice(0, 50)));
    setInviteDraft('');
    if (authMode !== 'invited') setAuthMode('invited');
  }

  function removeInviteEmail(email) {
    setInvitedEmails((prev) => prev.filter((e) => e !== email));
  }

  useEffect(() => {
    if (!open || !projectId || !user || !project?.customDomain) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const status = await getCustomDomainStatus({ idToken, projectId });
        if (cancelled) return;
        setDomainVerified(Boolean(status.verified));
        setDomainDns(status.dns || null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, user, project?.customDomain]);

  async function handleVerifyDomain() {
    if (!user || !projectId || domainBusy) return;
    setDomainBusy(true);
    try {
      const idToken = await user.getIdToken();
      const result = await verifyCustomDomain({ idToken, projectId });
      setDomainVerified(true);
      onToast?.({
        message: result.hostingNote || 'Domínio verificado via TXT.',
        type: 'success',
      });
      onProjectUpdated?.({
        ...project,
        customDomainVerified: true,
      });
    } catch (err) {
      onToast?.({ message: err?.message || 'DNS ainda pendente.', type: 'error' });
    } finally {
      setDomainBusy(false);
    }
  }

  async function handleEnableBackend() {
    if (!projectId || !user?.getIdToken) return;
    setBackendBusy(true);
    try {
      const idToken = await user.getIdToken();
      const result = await enableProjectBackend({ projectId, idToken });
      setBackendEnabled(true);
      onProjectUpdated?.({ ...project, backendEnabled: true });
      const charged = result.creditsCharged || 0;
      onToast?.({
        message:
          charged > 0
            ? `Backend ativado (−${charged} créditos).`
            : result.alreadyEnabled
              ? 'Backend já estava ativo.'
              : 'Backend Functions ativadas.',
        type: 'success',
      });
    } catch (err) {
      console.error('[SettingsModal] backend', err);
      if (err?.code === 'INSUFFICIENT_CREDITS') {
        onToast?.({
          message: err.message || 'Créditos insuficientes.',
          type: 'error',
        });
        openPricing?.();
        return;
      }
      onToast?.({ message: err?.message || 'Não foi possível ativar o Backend.', type: 'error' });
    } finally {
      setBackendBusy(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSlugHint('');
    try {
      const trimmedName = name.trim();
      const trimmedDesc = description.trim();
      const trimmedDomain = customDomain.trim().toLowerCase();
      const trimmedSlug = slug
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      let nextSlug = project?.slug || null;
      let nextPublishedUrl = project?.publishedUrl || null;

      if (projectId && trimmedSlug && trimmedSlug !== (project?.slug || projectId)) {
        if (!user?.getIdToken) throw new Error('Sessão inválida para alterar o link.');
        const idToken = await user.getIdToken();
        const check = await checkSlugAvailability({
          idToken,
          slug: trimmedSlug,
          projectId,
        });
        if (!check.available) {
          setSlugHint(check.error || 'Slug indisponível.');
          throw new Error(check.error || 'Slug indisponível.');
        }
        const slugResult = await updateProjectSlug({
          idToken,
          projectId,
          slug: check.slug || trimmedSlug,
        });
        nextSlug = slugResult.slug;
        nextPublishedUrl = slugResult.url || nextPublishedUrl;
        setSlug(nextSlug);
      }

      const nextAuthAccess = {
        mode: authMode === 'invited' ? 'invited' : 'owner_only',
        invitedEmails: authMode === 'invited' ? invitedEmails : [],
      };
      const ownerEmail =
        normalizeInviteEmail(project?.ownerEmail || user?.email) || null;

      if (projectId && trimmedName) {
        const nameChanged = trimmedName !== (project?.name || '');
        const descChanged = trimmedDesc !== (project?.description || '');
        const domainChanged = trimmedDomain !== (project?.customDomain || '');
        const prevAccess = project?.authAccess || { mode: 'owner_only', invitedEmails: [] };
        const authChanged =
          prevAccess.mode !== nextAuthAccess.mode ||
          JSON.stringify(prevAccess.invitedEmails || []) !==
            JSON.stringify(nextAuthAccess.invitedEmails) ||
          !project?.ownerEmail;
        if (nameChanged || descChanged || domainChanged || authChanged) {
          await updateProjectSettings(projectId, {
            name: trimmedName,
            description: trimmedDesc,
            customDomain: trimmedDomain,
            authAccess: nextAuthAccess,
            ownerEmail,
          });
        }
        if (domainChanged && user?.getIdToken) {
          const idToken = await user.getIdToken();
          const domainResult = await updateCustomDomain({
            idToken,
            projectId,
            host: trimmedDomain,
          });
          if (domainResult.cleared) {
            setDomainDns(null);
            setDomainVerified(false);
          } else {
            setDomainDns(domainResult.dns || null);
            setDomainVerified(Boolean(domainResult.verified));
          }
        }
      }

      saveUserSettings({ theme, notifications });
      if (user?.uid) {
        await syncDeployEmailPreference(user.uid, notifications);
      }
      setTheme(theme);
      onProjectUpdated?.({
        ...project,
        name: trimmedName || project?.name,
        description: trimmedDesc,
        customDomain: trimmedDomain,
        customDomainVerified: domainChanged ? Boolean(domainDns && domainVerified) : domainVerified,
        slug: nextSlug || project?.slug || null,
        publishedUrl: nextPublishedUrl || project?.publishedUrl || null,
        backendEnabled,
        authAccess: nextAuthAccess,
        ownerEmail,
      });
      onToast?.({ message: 'Configurações guardadas.', type: 'success' });
      onClose?.();
    } catch (err) {
      console.error('[SettingsModal]', err);
      onToast?.({ message: err?.message || 'Não foi possível guardar.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const entitiesHref = projectId
    ? `/entities?projectId=${encodeURIComponent(projectId)}`
    : '/entities';
  const integrationsHref = projectId
    ? `/integrations?projectId=${encodeURIComponent(projectId)}`
    : '/integrations';
  const publicKey = getProjectPublicKey(slug || project?.slug, projectId);
  const publishedUrl =
    project?.publishedUrl ||
    (projectId ? getPublishUrl(projectId, project?.publishedEnv || 'production', publicKey) : null);
  const creditCost = canUsePremium ? 0 : BACKEND_ENABLE_CREDIT_COST;
  const ownerLabel = project?.ownerEmail || user?.email || 'o teu e-mail';

  return (
    <ModalShell open={open} onClose={onClose} title="Configurações do projeto" wide>
      <form onSubmit={handleSave} className="space-y-5">
        <section className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Projeto
          </p>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!projectId}
              placeholder="Nome do projeto"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all disabled:opacity-50"
            />
            {!projectId && (
              <p className="mt-1 text-[11px] text-zinc-600">
                Projeto demo — o nome não pode ser alterado.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!projectId}
              rows={2}
              placeholder="Breve descrição do projeto"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all resize-none disabled:opacity-50 custom-scrollbar"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Link público (slug)</label>
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden focus-within:border-blue-600">
              <span className="pl-3 text-[11px] text-zinc-600 font-mono shrink-0">/p/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[\s_]+/g, '-')
                      .replace(/[^a-z0-9-]/g, '')
                  )
                }
                disabled={!projectId}
                placeholder="meu-salao"
                className="w-full bg-transparent px-1.5 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none font-mono disabled:opacity-50"
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Estável entre deploys. Só podes alterar esta parte do link (disponibilidade verificada).
            </p>
            {slugHint ? <p className="mt-1 text-[10px] text-amber-400">{slugHint}</p> : null}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Domínio personalizado</label>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              disabled={!projectId}
              placeholder="app.meudominio.com"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-all disabled:opacity-50 font-mono"
            />
            <p className="mt-1 text-[10px] text-zinc-600">
              Guarda as settings para mapear o domínio. Depois cria TXT + CNAME e clica Verificar.
            </p>
            {customDomain.trim() && (
              <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-300">
                    Estado:{' '}
                    <span className={domainVerified ? 'text-emerald-400' : 'text-amber-400'}>
                      {domainVerified ? 'Verificado' : 'Pendente DNS'}
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={!projectId || domainBusy}
                    onClick={() => void handleVerifyDomain()}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {domainBusy ? <Loader2 size={11} className="animate-spin" /> : null}
                    Verificar DNS
                  </button>
                </div>
                {domainDns?.records?.length ? (
                  <ul className="space-y-1.5">
                    {domainDns.records.map((r) => (
                      <li key={`${r.type}-${r.value}`} className="text-[10px] text-zinc-500 font-mono break-all">
                        <span className="text-zinc-400">{r.type}</span> → {r.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-zinc-600">
                    TXT: gocreate-verify=… · CNAME → gocreate.web.app · depois Add custom domain no
                    Firebase Hosting (site gocreate).
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Framework</label>
            <div className="px-3 py-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 text-sm text-zinc-400">
              {project?.framework || 'React + Tailwind'}
            </div>
          </div>

          {publishedUrl && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">URL publicada</label>
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 max-w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-blue-400 hover:text-blue-300 truncate transition-colors"
              >
                <ExternalLink size={13} className="shrink-0" />
                <span className="truncate">{publishedUrl}</span>
              </a>
            </div>
          )}
        </section>

        <section className="space-y-2 pt-1 border-t border-zinc-800/80">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 pt-2">
            Quem pode entrar com Google
          </p>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-md bg-violet-600/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Shield size={14} className="text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200">Login no app publicado</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Por defeito só o dono ({ownerLabel}) pode usar Google no site publicado.
                  Podes convidar e-mails específicos.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!projectId}
                onClick={() => setAuthMode('owner_only')}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all disabled:opacity-50 ${
                  authMode === 'owner_only'
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <p className="text-xs font-semibold">Só o dono</p>
                <p className="text-[10px] opacity-80 mt-0.5">Apenas a tua conta Google</p>
              </button>
              <button
                type="button"
                disabled={!projectId}
                onClick={() => setAuthMode('invited')}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all disabled:opacity-50 ${
                  authMode === 'invited'
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <p className="text-xs font-semibold">Dono + convidados</p>
                <p className="text-[10px] opacity-80 mt-0.5">Lista de e-mails autorizados</p>
              </button>
            </div>

            {authMode === 'invited' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteDraft}
                    onChange={(e) => setInviteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addInviteEmail();
                      }
                    }}
                    disabled={!projectId}
                    placeholder="email@exemplo.com"
                    className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-blue-600 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={!projectId}
                    onClick={addInviteEmail}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    Convidar
                  </button>
                </div>
                {invitedEmails.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {invitedEmails.map((email) => (
                      <li
                        key={email}
                        className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeInviteEmail(email)}
                          className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
                          aria-label={`Remover ${email}`}
                        >
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-zinc-600">
                    Ainda sem convidados — só o dono consegue entrar.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-2 pt-1 border-t border-zinc-800/80">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 pt-2">
            Backend Functions
          </p>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-md bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Server size={14} className="text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200">Funções de Backend</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Permite ao site publicado gravar na base de dados via API GoCreate (estilo Base44).
                  Contas novas com créditos podem ativar. Free gasta {BACKEND_ENABLE_CREDIT_COST}{' '}
                  créditos; Pro/Owner é grátis.
                </p>
              </div>
            </div>
            {backendEnabled ? (
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 size={14} />
                Backend ativo
              </div>
            ) : (
              <button
                type="button"
                disabled={!projectId || backendBusy}
                onClick={handleEnableBackend}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-all"
              >
                {backendBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Server size={14} />
                )}
                Ativar funções de Backend
                {creditCost > 0 ? ` (−${creditCost} créditos)` : ' (incluído)'}
              </button>
            )}
            {!backendEnabled && !canUsePremium && typeof credits === 'number' ? (
              <p className="text-[10px] text-zinc-600">Tens {credits} créditos disponíveis.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-2 pt-1 border-t border-zinc-800/80">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 pt-2">
            Env secrets
          </p>
          <EnvSecretsBlock projectId={projectId} onToast={onToast} />
        </section>

        <section className="space-y-2 pt-1 border-t border-zinc-800/80">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 pt-2">
            Atalhos
          </p>
          <Link
            to={entitiesHref}
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Database size={14} className="text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-200 group-hover:text-white">Entidades</p>
              <p className="text-[11px] text-zinc-500">Banco de dados do projeto</p>
            </div>
          </Link>
          <Link
            to={integrationsHref}
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
          >
            <div className="w-8 h-8 rounded-md bg-amber-600/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Plug size={14} className="text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-200 group-hover:text-white">
                Integrações
              </p>
              <p className="text-[11px] text-zinc-500">Pagamentos, Google, redes sociais</p>
            </div>
          </Link>
        </section>

        <section className="space-y-3 pt-1 border-t border-zinc-800/80">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 pt-2">
            Preferências
          </p>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Tema da app</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', label: 'Dark' },
                { id: 'light', label: 'Light' },
                { id: 'system', label: 'Sistema' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleThemePick(opt.id)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg border transition-all ${
                    theme === opt.id
                      ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-600">
              Também podes alterar o tema em{' '}
              <Link
                to="/settings"
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline"
              >
                configurações da conta
              </Link>
              .
            </p>
          </div>

          <label className="flex items-center justify-between gap-4 p-3 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer">
            <div>
              <p className="text-sm text-zinc-200">E-mails de deploy</p>
              <p className="text-xs text-zinc-500">Aviso quando um deploy terminar</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifications}
              onClick={() => setNotifications((v) => !v)}
              className={`relative w-10 h-6 rounded-full transition-all shrink-0 ${
                notifications ? 'bg-blue-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all ${
                  notifications ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </label>
        </section>

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-all"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar
        </button>

        <div className="pt-1 border-t border-zinc-800/80">
          <Link
            to="/settings"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-all"
          >
            <SettingsIcon size={14} />
            Abrir configurações da conta →
          </Link>
        </div>
      </form>
    </ModalShell>
  );
}

function EnvSecretsBlock({ projectId, onToast }) {
  const { user } = useAuth();
  const [secrets, setSecrets] = useState([]);
  const [keyName, setKeyName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    if (!projectId || !user) {
      setSecrets([]);
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const res = await fetch(
        `${API_URL}/api/projects/${encodeURIComponent(projectId)}/env-secrets`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSecrets(data.secrets || []);
    } catch {
      /* ignore */
    }
  }, [projectId, user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (!projectId || !user || !keyName.trim() || !value) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const safe = keyName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
      const res = await fetch(
        `${API_URL}/api/projects/${encodeURIComponent(projectId)}/env-secrets/${encodeURIComponent(safe)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao guardar');
      setKeyName('');
      setValue('');
      onToast?.({ message: 'Secret guardado (mascarado).', type: 'success' });
      await load();
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao guardar secret.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(key) {
    if (!window.confirm(`Apagar secret ${key}?`)) return;
    try {
      const idToken = await user.getIdToken();
      const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      await fetch(
        `${API_URL}/api/projects/${encodeURIComponent(projectId)}/env-secrets/${encodeURIComponent(key)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } }
      );
      await load();
    } catch (err) {
      onToast?.({ message: err?.message || 'Falha ao apagar.', type: 'error' });
    }
  }

  if (!projectId) {
    return <p className="text-[11px] text-zinc-500">Guarda o projeto primeiro.</p>;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 space-y-2">
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Injetadas no preview e no site publicado como{' '}
        <span className="font-mono text-zinc-400">window.__GOCREATE_ENV__</span> (visíveis no
        browser — só config client-safe). Valores mascarados na UI.
      </p>
      {secrets.length > 0 && (
        <ul className="space-y-1">
          {secrets.map((s) => (
            <li
              key={s.id || s.key}
              className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded border border-zinc-800/80"
            >
              <span className="font-mono text-zinc-300">{s.key}</span>
              <span className="text-zinc-600 font-mono truncate">{s.masked}</span>
              <button
                type="button"
                onClick={() => void handleDelete(s.key)}
                className="text-zinc-500 hover:text-red-400"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={keyName}
          onChange={(e) => setKeyName(e.target.value.toUpperCase())}
          placeholder="API_TOKEN"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-200 font-mono outline-none focus:border-blue-500/50"
        />
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="valor"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500/50"
        />
        <button
          type="button"
          disabled={busy || !keyName.trim() || !value}
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Guardar
        </button>
      </div>
    </div>
  );
}
