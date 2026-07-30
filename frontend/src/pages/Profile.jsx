import React, { useEffect, useState } from 'react';
import { Camera, Save, Loader2, Zap, Crown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import Toast from '../components/Toast';
import { getProfileExtras, saveProfileExtras } from '../lib/userSettings';

export default function Profile() {
  const { user, updateUserProfile } = useAuth();
  const { credits, plan, openPricing, lowCredits, unlimited } = useCredits();
  const [name, setName] = useState(user?.displayName || '');
  const [email] = useState(user?.email || '');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [showPhotoField, setShowPhotoField] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const extras = getProfileExtras();
    setName(user?.displayName || '');
    setPhotoURL(extras.photoURL || user?.photoURL || '');
    setBio(extras.bio || '');
  }, [user]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedPhoto = photoURL.trim();
      await updateUserProfile({
        displayName: trimmedName || null,
        photoURL: trimmedPhoto || null,
      });
      saveProfileExtras({ bio: bio.trim(), photoURL: trimmedPhoto });
      setToast({ message: 'Perfil atualizado.', type: 'success' });
    } catch (err) {
      console.error('[Profile] save:', err);
      setToast({
        message: err?.message || 'Não foi possível atualizar o perfil.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  const avatarSrc = photoURL || user?.photoURL;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1">Perfil</h1>
      <p className="text-sm text-zinc-500 mb-8">Gere a tua conta e a informação pública.</p>

      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center">
            <Crown size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100 capitalize">
              Plano {plan === 'enterprise_master' ? 'Owner Master' : plan}
            </p>
            <p className={`text-xs ${lowCredits ? 'text-amber-400' : 'text-zinc-500'}`}>
              <Zap size={11} className="inline mr-0.5 -mt-0.5" />
              {unlimited ? '∞ Ilimitado' : `${credits} créditos disponíveis`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openPricing}
          className="inline-flex items-center justify-center px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all"
        >
          Fazer upgrade
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="w-20 h-20 rounded-2xl object-cover border border-zinc-800 shadow-lg shadow-blue-900/20"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
            {!avatarSrc && (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-blue-900/30">
                {(name || email || 'U')[0].toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPhotoField((v) => !v)}
              className="absolute -bottom-1 -right-1 p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-all"
              title="Editar URL da foto"
            >
              <Camera size={14} />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200">{name || 'Sem nome'}</p>
            <p className="text-xs text-zinc-500">{email}</p>
          </div>
        </div>

        {showPhotoField && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">URL da foto</label>
            <input
              type="url"
              value={photoURL}
              onChange={(e) => setPhotoURL(e.target.value)}
              placeholder="https://…"
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 px-3.5 text-sm text-zinc-200 outline-none transition-all"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 px-3.5 text-sm text-zinc-200 outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">E-mail</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg py-2.5 px-3.5 text-sm text-zinc-500 outline-none cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Conta um pouco sobre ti…"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 px-3.5 text-sm text-zinc-200 outline-none transition-all resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar alterações
        </button>
      </form>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
