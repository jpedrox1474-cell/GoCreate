import React, { useEffect, useState } from 'react';
import { Save, Loader2, User, Type, Palette, MonitorSmartphone, Trash2 } from 'lucide-react';
import Toast from '../components/Toast';
import { getUserSettings, saveUserSettings, syncDeployEmailPreference } from '../lib/userSettings';
import {
  listMySessions,
  revokeMySession,
  revokeOtherSessions,
} from '../lib/meApi';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const FONT_SIZES = [
  { id: 'sm', label: 'Pequeno', px: 12 },
  { id: 'md', label: 'Médio', px: 14 },
  { id: 'lg', label: 'Grande', px: 16 },
];

const CODE_THEMES = [
  { id: 'dark', label: 'Dark Zinc' },
  { id: 'midnight', label: 'Midnight Blue' },
  { id: 'slate', label: 'Slate Soft' },
];

export default function Settings() {
  const { preference, setTheme } = useTheme();
  const { user, updateUserProfile } = useAuth();
  const [theme, setThemeLocal] = useState(preference);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email] = useState(user?.email || '');
  const [notifications, setNotifications] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState('md');
  const [codeTheme, setCodeTheme] = useState('dark');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(null);

  useEffect(() => {
    const s = getUserSettings();
    setNotifications(s.notifications);
    setEditorFontSize(s.editorFontSize || 'md');
    setCodeTheme(s.codeTheme || 'dark');
  }, []);

  useEffect(() => {
    setThemeLocal(preference);
  }, [preference]);

  useEffect(() => {
    setDisplayName(user?.displayName || '');
  }, [user]);

  useEffect(() => {
    if (!user?.getIdToken) return undefined;
    let cancelled = false;
    (async () => {
      setSessionsLoading(true);
      try {
        const idToken = await user.getIdToken();
        const list = await listMySessions(idToken);
        if (!cancelled) setSessions(list);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function handleThemeChange(next) {
    setThemeLocal(next);
    setTheme(next);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = displayName.trim();
      if (user && trimmedName !== (user.displayName || '')) {
        await updateUserProfile({ displayName: trimmedName || null });
      }
      saveUserSettings({
        theme,
        notifications,
        editorFontSize,
        codeTheme,
      });
      if (user?.uid) {
        await syncDeployEmailPreference(user.uid, notifications);
      }
      setTheme(theme);
      await new Promise((r) => setTimeout(r, 280));
      setToast({ message: 'Guardado', type: 'success' });
    } catch (err) {
      console.error('[Settings] save:', err);
      setToast({ message: err?.message || 'Não foi possível guardar.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id) {
    if (!user || sessionBusy) return;
    setSessionBusy(id);
    try {
      const idToken = await user.getIdToken();
      await revokeMySession(idToken, id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setToast({ message: 'Sessão revogada.', type: 'success' });
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao revogar.', type: 'error' });
    } finally {
      setSessionBusy(null);
    }
  }

  async function handleRevokeOthers() {
    if (!user || sessionBusy) return;
    if (!window.confirm('Terminar todas as outras sessões neste dispositivo?')) return;
    setSessionBusy('others');
    try {
      const idToken = await user.getIdToken();
      const result = await revokeOtherSessions(idToken);
      const idToken2 = await user.getIdToken();
      setSessions(await listMySessions(idToken2));
      setToast({
        message: `${result.revoked || 0} sessão(ões) terminada(s).`,
        type: 'success',
      });
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao revogar.', type: 'error' });
    } finally {
      setSessionBusy(null);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1">Configurações</h1>
      <p className="text-sm text-zinc-500 mb-8">Conta, aparência e preferências do editor.</p>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-1 flex items-center gap-2">
            <User size={14} className="text-zinc-500" />
            Detalhes da Conta
          </h2>
          <p className="text-xs text-zinc-500 mb-4">Atualiza o nome exibido na app.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nome</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="O teu nome"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 px-3.5 text-sm text-zinc-200 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg py-2.5 px-3.5 text-sm text-zinc-500 outline-none cursor-not-allowed"
              />
              <p className="text-[11px] text-zinc-600 mt-1.5">
                O e-mail é gerido pelo fornecedor de login e não pode ser alterado aqui.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <MonitorSmartphone size={14} className="text-zinc-500" />
              Sessões ativas
            </h2>
            <button
              type="button"
              disabled={!!sessionBusy || sessionsLoading}
              onClick={() => void handleRevokeOthers()}
              className="text-[11px] font-medium text-zinc-400 hover:text-red-300 disabled:opacity-40"
            >
              Terminar outras
            </button>
          </div>
          {sessionsLoading ? (
            <p className="text-xs text-zinc-500 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> A carregar…
            </p>
          ) : !sessions.length ? (
            <p className="text-xs text-zinc-500">
              Ainda sem sessões registadas. Faz login de novo para começar a listar dispositivos.
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-950/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">
                      {s.label}
                      {s.current ? (
                        <span className="ml-2 text-[10px] text-emerald-400">esta sessão</span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-zinc-600 font-mono truncate">
                      {s.ip || 'ip —'}
                    </p>
                  </div>
                  {!s.current && (
                    <button
                      type="button"
                      disabled={sessionBusy === s.id}
                      onClick={() => void handleRevoke(s.id)}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-300 disabled:opacity-40"
                      title="Revogar"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">Aparência</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'dark', label: 'Dark' },
              { id: 'light', label: 'Light' },
              { id: 'system', label: 'Sistema' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleThemeChange(opt.id)}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-all ${
                  theme === opt.id
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            A Landing pública permanece sempre em Dark Mode Premium.
          </p>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-1 flex items-center gap-2">
            <Type size={14} className="text-zinc-500" />
            Preferências do Editor
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Guardadas neste dispositivo (localStorage).
          </p>

          <div className="space-y-5">
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2">Tamanho da fonte</p>
              <div className="grid grid-cols-3 gap-2">
                {FONT_SIZES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditorFontSize(opt.id)}
                    className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-all ${
                      editorFontSize === opt.id
                        ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                    <span className="block text-[10px] opacity-60 mt-0.5">{opt.px}px</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                <Palette size={12} />
                Tema do código
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CODE_THEMES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCodeTheme(opt.id)}
                    className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-all text-left ${
                      codeTheme === opt.id
                        ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">Notificações</h2>
          <label className="flex items-center justify-between gap-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer transition-all hover:border-zinc-700">
            <div>
              <p className="text-sm text-zinc-200">E-mails de deploy</p>
              <p className="text-xs text-zinc-500">Receber aviso quando um deploy terminar</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifications}
              onClick={() => setNotifications((v) => !v)}
              className={`relative w-10 h-6 rounded-full transition-all ${
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
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar configurações
        </button>
      </form>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
