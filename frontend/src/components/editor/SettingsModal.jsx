import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Save, Loader2 } from 'lucide-react';
import ModalShell from './ModalShell';
import { renameProject } from '../../lib/projects';
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
  const [theme, setThemeLocal] = useState(preference);
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name || '');
    const s = getUserSettings();
    setThemeLocal(s.theme || preference);
    setNotifications(s.notifications);
  }, [open, project?.name, preference]);

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
      const trimmed = name.trim();
      if (projectId && trimmed && trimmed !== project?.name) {
        await renameProject(projectId, trimmed);
        onProjectUpdated?.({ ...project, name: trimmed });
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

  return (
    <ModalShell open={open} onClose={onClose} title="Configurações do projeto">
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Nome do projeto</label>
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
          <label className="block text-xs text-zinc-500 mb-1.5">Framework</label>
          <div className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200">
            {project?.framework || 'React + Tailwind'}
          </div>
        </div>

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

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-all"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar
        </button>

        <div className="pt-2 border-t border-zinc-800/80">
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
