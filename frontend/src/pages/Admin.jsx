import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Loader2, Plus, Minus } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isOwnerUser } from '../lib/plans';
import { listAdminUsers, adjustUserCredits } from '../lib/adminApi';
import Toast from '../components/Toast';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [toast, setToast] = useState(null);

  const allowed = isOwnerUser(user);

  const refresh = useCallback(async () => {
    if (!user || !allowed) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const list = await listAdminUsers({ idToken, limit: 80 });
      setUsers(list);
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao carregar admin.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user, allowed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  async function bumpCredits(uid, delta) {
    if (!user || busyUid) return;
    setBusyUid(uid);
    try {
      const idToken = await user.getIdToken();
      const result = await adjustUserCredits({ idToken, uid, delta });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, credits: result.credits } : u))
      );
      setToast({ message: `Créditos atualizados: ${result.credits}`, type: 'success' });
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao ajustar.', type: 'error' });
    } finally {
      setBusyUid(null);
    }
  }

  async function setCreditsPrompt(uid, current) {
    const raw = window.prompt('Definir créditos para:', String(current ?? 0));
    if (raw == null) return;
    const setTo = Number(raw);
    if (!Number.isFinite(setTo) || setTo < 0) {
      setToast({ message: 'Valor inválido.', type: 'error' });
      return;
    }
    setBusyUid(uid);
    try {
      const idToken = await user.getIdToken();
      const result = await adjustUserCredits({ idToken, uid, setTo });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, credits: result.credits } : u))
      );
      setToast({ message: `Créditos definidos: ${result.credits}`, type: 'success' });
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao definir créditos.', type: 'error' });
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center">
          <Shield size={18} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Admin</h1>
          <p className="text-sm text-zinc-500">Utilizadores, planos e créditos (owner only)</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> A carregar…
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-3 py-2.5">Plano</th>
                <th className="text-left font-medium px-3 py-2.5">Role</th>
                <th className="text-right font-medium px-3 py-2.5">Créditos</th>
                <th className="text-right font-medium px-4 py-2.5">Ajustar</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid} className="border-t border-zinc-800/80 hover:bg-zinc-900/40">
                  <td className="px-4 py-2.5 text-zinc-200">
                    <div className="truncate max-w-[240px]">{u.email || u.uid}</div>
                    <div className="text-[10px] text-zinc-600 font-mono truncate">{u.uid}</div>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400">{u.plan}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{u.role}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{u.credits}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={busyUid === u.uid}
                        onClick={() => void bumpCredits(u.uid, -10)}
                        className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-red-300 hover:border-red-500/40 disabled:opacity-40"
                        title="-10"
                      >
                        <Minus size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={busyUid === u.uid}
                        onClick={() => void bumpCredits(u.uid, 10)}
                        className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/40 disabled:opacity-40"
                        title="+10"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={busyUid === u.uid}
                        onClick={() => void setCreditsPrompt(u.uid, u.credits)}
                        className="px-2 py-1 rounded-md text-[10px] border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                      >
                        Definir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && (
            <p className="text-center text-sm text-zinc-500 py-10">Nenhum utilizador encontrado.</p>
          )}
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
