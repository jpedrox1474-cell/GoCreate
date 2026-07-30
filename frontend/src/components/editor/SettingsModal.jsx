import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Database,
  Plug,
  ExternalLink,
} from 'lucide-react';
import ModalShell from './ModalShell';
import { updateProjectSettings } from '../../lib/projects';
import { getUserSettings, saveUserSettings, syncDeployEmailPreference } from '../../lib/userSettings';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

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
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [customDomain, setCustomDomain] = useState(project?.customDomain || '');
  const [theme, setThemeLocal] = useState(preference);
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name || '');
    setDescription(project?.description || '');
    setCustomDomain(project?.customDomain || '');
    const s = getUserSettings();
    setThemeLocal(s.theme || preference);
    setNotifications(s.notifications);
  }, [open, project?.name, project?.description, project?.customDomain, preference]);

  useEffect(() => {
    setThemeLocal(preference);
  }, [preference]);

  function handleThemePick(next) {
    setThemeLocal(next);
    setTheme(next);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedDesc = description.trim();
      const trimmedDomain = customDomain.trim().toLowerCase();

      if (projectId && trimmedName) {
        const nameChanged = trimmedName !== (project?.name || '');
        const descChanged = trimmedDesc !== (project?.description || '');
        const domainChanged = trimmedDomain !== (project?.customDomain || '');
        if (nameChanged || descChanged || domainChanged) {
          await updateProjectSettings(projectId, {
            name: trimmedName,
            description: trimmedDesc,
            customDomain: trimmedDomain,
          });
          onProjectUpdated?.({
            ...project,
            name: trimmedName,
            description: trimmedDesc,
            customDomain: trimmedDomain,
          });
        }
      }

      saveUserSettings({ theme, notifications });
      if (user?.uid) {
        await syncDeployEmailPreference(user.uid, notifications);
      }
      setTheme(theme);
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
  const publishedUrl = project?.publishedUrl || null;

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
              Opcional. Configuração DNS é feita no painel de deploy.
            </p>
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
            className="inline-flex items-center gap-1.5 px-1 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plug size={11} />
            Integrações (pagamentos)
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
