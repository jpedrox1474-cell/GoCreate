import React, { useEffect, useState } from 'react';
import { Save, Loader2, Eye, EyeOff, Key } from 'lucide-react';
import Toast from '../components/Toast';
import { getUserSettings, saveUserSettings } from '../lib/userSettings';
import { useTheme } from '../context/ThemeContext';

export default function Settings() {
  const { preference, setTheme } = useTheme();
  const [theme, setThemeLocal] = useState(preference);
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const s = getUserSettings();
    setOpenaiKey(s.openaiKey);
    setAnthropicKey(s.anthropicKey);
    setNotifications(s.notifications);
  }, []);

  useEffect(() => {
    setThemeLocal(preference);
  }, [preference]);

  function handleThemeChange(next) {
    setThemeLocal(next);
    setTheme(next);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      saveUserSettings({
        theme,
        openaiKey,
        anthropicKey,
        notifications,
      });
      setTheme(theme);
      await new Promise((r) => setTimeout(r, 280));
      setToast({ message: 'Guardado', type: 'success' });
    } catch (err) {
      console.error('[Settings] save:', err);
      setToast({ message: 'Não foi possível guardar.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1">Configurações</h1>
      <p className="text-sm text-zinc-500 mb-8">Preferências da conta e chaves de API.</p>

      <form onSubmit={handleSave} className="space-y-8">
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
            Aplicado de imediato em todas as páginas (e abas abertas).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-1 flex items-center gap-2">
            <Key size={14} className="text-zinc-500" />
            Chaves de API
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Guardadas só neste dispositivo (localStorage). Não são enviadas automaticamente ao servidor.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">OpenAI</label>
              <div className="relative">
                <input
                  type={showOpenAI ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 pl-3.5 pr-10 text-sm text-zinc-200 font-mono outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAI((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition-all"
                  aria-label={showOpenAI ? 'Ocultar chave OpenAI' : 'Mostrar chave OpenAI'}
                >
                  {showOpenAI ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Anthropic</label>
              <div className="relative">
                <input
                  type={showAnthropic ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 pl-3.5 pr-10 text-sm text-zinc-200 font-mono outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropic((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition-all"
                  aria-label={showAnthropic ? 'Ocultar chave Anthropic' : 'Mostrar chave Anthropic'}
                >
                  {showAnthropic ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
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
