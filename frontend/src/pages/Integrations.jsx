import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Shield,
  Chrome,
  Github,
  Database,
  Image,
  FolderOpen,
  MapPin,
  QrCode,
  Plug,
  Check,
  Loader2,
  Search,
  Lock,
  Server,
} from 'lucide-react';
import Toast from '../components/Toast';
import ConnectIntegrationModal from '../components/integrations/ConnectIntegrationModal';
import SocialChannelsSection from '../components/integrations/SocialChannelsSection';
import {
  INTEGRATIONS_CATALOG,
  INTEGRATION_CATEGORIES,
  BACKEND_GATED_INTEGRATION_IDS,
} from '../lib/integrationsCatalog';
import {
  getIntegrationsStatus,
  connectIntegration,
  disconnectIntegration,
  testIntegration,
} from '../lib/integrationsApi';
import { connectGitHubPopup, disconnectGitHub } from '../lib/githubApi';
import {
  startPlatformOAuth,
  disconnectPlatformOAuth,
  openOAuthPopup,
  waitForOAuthMessage,
} from '../lib/socialChannelsApi';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../context/CreditsContext';
import { BACKEND_ENABLE_CREDIT_COST, PREMIUM_REQUIRED_MESSAGE } from '../lib/plans';

const OAUTH_PROVIDERS = new Set(['github', 'mercadopago']);
const ICONS = {
  Wallet,
  Shield,
  Chrome,
  Github,
  Database,
  Image,
  FolderOpen,
  MapPin,
  QrCode,
  Plug,
};

function statusLabel(status, meta = {}) {
  if (status === 'locked') return 'Bloqueado';
  if (status === 'connected') {
    if (meta?.requiresBackend) return 'Ligado (Backend)';
    if (meta?.platformPowered || meta?.label === 'Ligado (plataforma)') {
      return 'Ligado (plataforma)';
    }
    return 'Ligado';
  }
  if (status === 'coming_soon') return 'Em breve';
  return 'Disponível';
}

function statusClass(status) {
  if (status === 'connected')
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  if (status === 'locked') return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
  if (status === 'coming_soon') return 'bg-zinc-800/80 text-zinc-500 border-zinc-700';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
}

export default function Integrations() {
  const { user, connectGoogleAccount } = useAuth();
  const { canUsePremium, openPremiumPaywall } = useCredits();
  const [statusMap, setStatusMap] = useState({});
  const [platformFlags, setPlatformFlags] = useState({});
  const [idToken, setIdToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [modalIntegration, setModalIntegration] = useState(null);
  const googleHashTried = React.useRef(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      setIdToken(token);
      const data = await getIntegrationsStatus({ idToken: token });
      setStatusMap(data?.providers || {});
      setPlatformFlags(data?.platform || {});
    } catch (err) {
      console.error('[Integrations] status:', err);
      setToast({ message: err.message || 'Erro ao carregar integrações.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash !== 'google' && hash !== 'google_oauth' && hash !== 'firebase_auth') return;
    requestAnimationFrame(() => {
      document.getElementById('integrations-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (!user || !connectGoogleAccount || googleHashTried.current) return;
    googleHashTried.current = true;
    let cancelled = false;
    (async () => {
      setBusyId('google_oauth');
      try {
        const result = await connectGoogleAccount();
        if (cancelled) return;
        setToast({
          message: result?.alreadyConnected
            ? 'Login Google já activo nos apps gerados (GoCreateAuth).'
            : 'Google ligado — apps gerados usam GoCreateAuth.signInWithGoogle().',
          type: 'success',
        });
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setToast({ message: err?.message || 'Falha ao ligar Google.', type: 'error' });
        }
      } finally {
        if (!cancelled) setBusyId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, connectGoogleAccount, refresh]);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INTEGRATIONS_CATALOG.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.includes(q)
      );
    }).map((item) => {
      const api = statusMap[item.id];
      let status = api?.status || 'available';
      if (item.connectType === 'backend_gate' && !api) {
        status = 'locked';
      }
      if (item.connectType === 'platform' && (!api || api.status === 'connected')) {
        status = 'connected';
      }
      return { ...item, status, meta: api?.meta || {} };
    });
  }, [query, category, statusMap]);

  const connectedCount = useMemo(
    () => cards.filter((c) => c.status === 'connected').length,
    [cards]
  );

  async function handleConnectClick(item) {
    if (item.status === 'locked' || item.connectType === 'backend_gate') {
      if (item.status === 'connected') {
        setToast({
          message: `${item.name} activo via Backend Functions.`,
          type: 'info',
        });
        return;
      }
      setToast({
        message: `Ativa Backend Functions nas Configurações do projeto (−${BACKEND_ENABLE_CREDIT_COST} créditos no Free) para desbloquear Login, Firestore e Firebase.`,
        type: 'info',
      });
      return;
    }

    if (item.connectType === 'platform') {
      setToast({
        message:
          item.id === 'pix'
            ? 'Pix usa Mercado Pago — conecta Mercado Pago nesta página ou usa o token da plataforma.'
            : `${item.name} já faz parte da plataforma GoCreate.`,
        type: 'info',
      });
      return;
    }

    if (item.connectType === 'oauth' && item.id === 'github') {
      if (!canUsePremium) {
        openPremiumPaywall();
        return;
      }
      setBusyId(item.id);
      try {
        const token = await user.getIdToken();
        await connectGitHubPopup({ idToken: token, returnPath: '/integrations' });
        setToast({ message: 'GitHub ligado.', type: 'success' });
        await refresh();
      } catch (err) {
        if (err?.code === 'PREMIUM_REQUIRED' || err?.status === 403) {
          openPremiumPaywall();
        } else {
          setToast({ message: err?.message || 'Falha ao ligar GitHub.', type: 'error' });
        }
      } finally {
        setBusyId(null);
      }
      return;
    }

    if (item.connectType === 'oauth' && OAUTH_PROVIDERS.has(item.id)) {
      setBusyId(item.id);
      try {
        const token = await user.getIdToken();
        const { authUrl } = await startPlatformOAuth({ idToken: token, platform: item.id });
        const popup = openOAuthPopup(authUrl);
        await waitForOAuthMessage(item.id, popup);
        setToast({ message: `${item.name} ligado.`, type: 'success' });
        await refresh();
      } catch (err) {
        setToast({ message: err?.message || `Falha ao ligar ${item.name}.`, type: 'error' });
      } finally {
        setBusyId(null);
      }
      return;
    }

    setModalIntegration(item);
  }

  async function handleModalConnect(credentials) {
    if (!modalIntegration || !user) return;
    setBusyId(modalIntegration.id);
    try {
      const token = await user.getIdToken();
      await connectIntegration({
        idToken: token,
        providerId: modalIntegration.id,
        credentials,
      });
      setToast({ message: `${modalIntegration.name} ligado.`, type: 'success' });
      setModalIntegration(null);
      await refresh();
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao ligar.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleModalDisconnect() {
    if (!modalIntegration || !user) return;
    setBusyId(modalIntegration.id);
    try {
      const token = await user.getIdToken();
      if (modalIntegration.id === 'github') {
        await disconnectGitHub({ idToken: token });
      } else if (OAUTH_PROVIDERS.has(modalIntegration.id)) {
        await disconnectPlatformOAuth({ idToken: token, platform: modalIntegration.id });
      } else {
        await disconnectIntegration({ idToken: token, providerId: modalIntegration.id });
      }
      setToast({ message: `${modalIntegration.name} desligado.`, type: 'success' });
      setModalIntegration(null);
      await refresh();
    } catch (err) {
      setToast({ message: err?.message || 'Falha ao desligar.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleModalTest() {
    if (!modalIntegration || !user) return;
    setBusyId(modalIntegration.id);
    try {
      const token = await user.getIdToken();
      await testIntegration({ idToken: token, providerId: modalIntegration.id });
      setToast({ message: 'Ligação OK.', type: 'success' });
    } catch (err) {
      setToast({ message: err?.message || 'Teste falhou.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1">Integrações</h1>
          <p className="text-sm text-zinc-500">
            Só providers activos. Login / Firestore / Firebase desbloqueiam com Backend Functions (−
            {BACKEND_ENABLE_CREDIT_COST} créditos no Free).
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-zinc-600">Ligadas</p>
          <p className="text-2xl font-bold text-zinc-100 tabular-nums">{connectedCount}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar…"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500/50 rounded-lg py-2.5 pl-9 pr-3.5 text-sm text-zinc-200 outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
              category === 'all'
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                : 'bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            Todas
          </button>
          {INTEGRATION_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                category === c.id
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                  : 'bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {!loading ? (
        <SocialChannelsSection
          canUsePremium={canUsePremium}
          openPremiumPaywall={openPremiumPaywall}
          idToken={idToken}
          statusMap={statusMap}
          platform={platformFlags}
          onRefresh={refresh}
          onToast={setToast}
        />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-500 gap-2">
          <Loader2 size={20} className="animate-spin" /> A carregar…
        </div>
      ) : (
        <div id="integrations-grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {cards.map((item) => {
            const Icon = ICONS[item.icon] || Plug;
            const busy = busyId === item.id;
            const isLocked = item.status === 'locked';
            const isConnected = item.status === 'connected';
            const isBackendGate = BACKEND_GATED_INTEGRATION_IDS.has(item.id);

            return (
              <article
                key={item.id}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700 hover:bg-zinc-900/70 transition-all flex flex-col"
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-blue-400 shrink-0 group-hover:border-blue-500/30 transition-colors">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-zinc-100">{item.name}</h2>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${statusClass(item.status)}`}
                      >
                        {statusLabel(item.status, item.meta)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 capitalize">
                      {INTEGRATION_CATEGORIES.find((c) => c.id === item.category)?.label ||
                        item.category}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed flex-1 mb-4">
                  {item.description}
                </p>
                {isLocked ? (
                  <p className="text-[11px] text-amber-400/90 mb-3 flex items-start gap-1.5">
                    <Lock size={12} className="shrink-0 mt-0.5" />
                    Ativa Backend Functions no projeto (−{BACKEND_ENABLE_CREDIT_COST} créditos Free).
                  </p>
                ) : null}
                {item.meta?.login && (
                  <p className="text-[11px] text-zinc-500 mb-3">@{item.meta.login}</p>
                )}
                {!item.meta?.login && item.meta?.label && !isLocked && (
                  <p className="text-[11px] text-zinc-500 mb-3 truncate">{item.meta.label}</p>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (isLocked || isBackendGate) {
                      handleConnectClick(item);
                      return;
                    }
                    if (isConnected && item.connectType === 'oauth') {
                      setModalIntegration(item);
                      return;
                    }
                    handleConnectClick(item);
                  }}
                  className={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                    isConnected
                      ? 'border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                      : isLocked
                        ? 'border border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {busy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isLocked ? (
                    <Server size={13} />
                  ) : isConnected ? (
                    <Check size={13} />
                  ) : (
                    <Plug size={13} />
                  )}
                  {isLocked
                    ? 'Desbloquear com Backend'
                    : isConnected
                      ? item.connectType === 'oauth'
                        ? 'Gerir'
                        : 'Activo'
                      : item.id === 'mercadopago'
                        ? 'Conectar com Mercado Pago'
                        : item.connectType === 'oauth'
                          ? 'Conectar'
                          : 'Ligar'}
                </button>
                {isLocked ? (
                  <Link
                    to="/functions"
                    className="mt-2 text-center text-[11px] text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline"
                  >
                    Ir para Funções / projeto
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {!loading && !cards.length && (
        <p className="text-center text-sm text-zinc-500 py-16">
          Nenhuma integração corresponde à pesquisa.
        </p>
      )}

      <ConnectIntegrationModal
        open={Boolean(modalIntegration)}
        onClose={() => setModalIntegration(null)}
        integration={modalIntegration}
        connected={modalIntegration ? statusMap[modalIntegration.id]?.status === 'connected' : false}
        connectedMeta={modalIntegration ? statusMap[modalIntegration.id]?.meta || {} : {}}
        connecting={busyId === modalIntegration?.id}
        onConnect={handleModalConnect}
        onDisconnect={handleModalDisconnect}
        onTest={
          modalIntegration?.connectType === 'api_key' ? handleModalTest : undefined
        }
      />

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
