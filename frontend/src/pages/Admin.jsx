import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Loader2, Plus, Minus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isOwnerUser } from '../lib/plans';
import { listAdminUsers, adjustUserCredits, fetchAdminMetrics, fetchAdminAudit } from '../lib/adminApi';
import Toast from '../components/Toast';

const PAGE_SIZE = 40;
const PLAN_OPTIONS = [
  { value: 'all', label: 'Todos os planos' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise_master', label: 'Enterprise' },
];

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [toast, setToast] = useState(null);
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [plan, setPlan] = useState('all');
  const [cursorStack, setCursorStack] = useState([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [audit, setAudit] = useState([]);

  const allowed = isOwnerUser(user);

  const refresh = useCallback(async () => {
    if (!user || !allowed) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const cursor = cursorStack[pageIndex] || null;
      const [result, m, logs] = await Promise.all([
        listAdminUsers({
          idToken,
          limit: PAGE_SIZE,
          cursor,
          q,
          plan,
        }),
        fetchAdminMetrics(idToken).catch(() => null),
        fetchAdminAudit(idToken, 25).catch(() => []),
      ]);
      setUsers(result.users);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setMetrics(m);
      setAudit(logs);
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao carregar admin.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user, allowed, cursorStack, pageIndex, q, plan]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  function applySearch(e) {
    e?.preventDefault?.();
    setQ(qDraft.trim());
    setCursorStack([null]);
    setPageIndex(0);
  }

  function onPlanChange(value) {
    setPlan(value);
    setCursorStack([null]);
    setPageIndex(0);
  }

  function goPrev() {
    if (pageIndex <= 0) return;
    setPageIndex((i) => i - 1);
  }

  function goNext() {
    if (!hasMore || !nextCursor) return;
    setCursorStack((stack) => {
      const next = stack.slice(0, pageIndex + 1);
      next.push(nextCursor);
      return next;
    });
    setPageIndex((i) => i + 1);
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

      {metrics && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {[
            { label: 'Users', value: metrics.usersTotal },
            { label: 'Ativos 7d', value: metrics.activeUsers7d },
            { label: 'Projetos', value: metrics.projectsTotal },
            { label: 'Live', value: metrics.projectsLive },
            { label: 'Pro', value: metrics.byPlan?.pro ?? 0 },
            { label: 'Free', value: metrics.byPlan?.free ?? 0 },
            { label: 'MRR est.', value: `R$ ${metrics.mrrEstimateBrl ?? 0}` },
            { label: 'Créditos mês', value: metrics.creditsUsedThisMonth ?? 0 },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">{c.label}</p>
              <p className="text-lg font-semibold text-zinc-100 font-mono tabular-nums">{c.value}</p>
            </div>
          ))}
          </div>
          <p className="text-[10px] text-zinc-600 mb-6">
            MRR via {metrics.mrrSource === 'subscriptions_30d' ? 'subs 30d' : `assentos Pro × R$ ${metrics.proSeatPriceBrl}`}
            {metrics.usersSampled ? ' · amostra ≤500 users' : ''}
          </p>
        </>
      )}

      <form
        onSubmit={applySearch}
        className="flex flex-col sm:flex-row gap-2 mb-4"
      >
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Filtrar por e-mail…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-600"
          />
        </div>
        <select
          value={plan}
          onChange={(e) => onPlanChange(e.target.value)}
          className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-300 outline-none focus:border-blue-600"
        >
          {PLAN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white"
        >
          Filtrar
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> A carregar…
        </div>
      ) : (
        <>
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

          <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
            <span>
              Página {pageIndex + 1}
              {q ? ` · filtro “${q}”` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pageIndex <= 0 || loading}
                onClick={goPrev}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                type="button"
                disabled={!hasMore || !nextCursor || loading}
                onClick={goNext}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 disabled:opacity-40"
              >
                Seguinte <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {audit.length > 0 && (
        <div className="mt-8 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
            <p className="text-xs font-semibold text-zinc-300">Auditoria recente</p>
          </div>
          <ul className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-zinc-800/80">
            {audit.map((log) => (
              <li key={log.id} className="px-4 py-2 text-[11px] text-zinc-400 font-mono">
                <span className="text-blue-400">{log.action}</span>
                {' · '}
                {log.actorEmail || log.actorUid || '—'}
                {log.projectId ? ` · ${log.projectId.slice(0, 8)}…` : ''}
              </li>
            ))}
          </ul>
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
