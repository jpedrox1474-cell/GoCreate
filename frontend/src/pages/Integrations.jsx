import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  CreditCard,
  CircleDollarSign,
  Landmark,
  Shield,
  KeyRound,
  Lock,
  Chrome,
  Github,
  Database,
  Layers,
  Server,
  HardDrive,
  Mail,
  Send,
  Newspaper,
  MessageCircle,
  Phone,
  SendHorizontal,
  BarChart3,
  Activity,
  LineChart,
  Image,
  Cloud,
  FolderOpen,
  ShoppingBag,
  Map,
  MapPin,
  QrCode,
  FileText,
  Share2,
  Plug,
  Check,
  Loader2,
  Search,
} from 'lucide-react';
import Toast from '../components/Toast';
import ConnectIntegrationModal from '../components/integrations/ConnectIntegrationModal';
import SocialChannelsSection from '../components/integrations/SocialChannelsSection';
import {
  INTEGRATIONS_CATALOG,
  INTEGRATION_CATEGORIES,
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
import { PREMIUM_REQUIRED_MESSAGE } from '../lib/plans';

const OAUTH_PROVIDERS = new Set(['github', 'stripe', 'paypal']);
const ICONS = {
  Wallet,
  CreditCard,
  CircleDollarSign,
  Landmark,
  Shield,
  KeyRound,
  Lock,
  Chrome,
  Github,
  Database,
  Layers,
  Server,
  HardDrive,
  Mail,
  Send,
  Newspaper,
  MessageCircle,
  Phone,
  SendHorizontal,
  BarChart3,
  Activity,
  LineChart,
  Image,
  Cloud,
  FolderOpen,
  ShoppingBag,
  Map,
  MapPin,
  QrCode,
  FileText,
  Share2,
  Plug,
};

function statusLabel(status, meta = {}) {
  if (status === 'connected') {
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
  if (status === 'coming_soon') return 'bg-zinc-800/80 text-zinc-500 border-zinc-700';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
}

export default function Integrations() {
  const { user } = useAuth();
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
    if (hash === 'google' || hash === 'google_oauth' || hash === 'firebase_auth') {
      setToast({
        message:
          'Login Google está ativo nos apps gerados via window.GoCreateAuth.signInWithGoogle() — sem Client Secret.',
        type: 'success',
      });
      requestAnimationFrame(() => {
        document.getElementById('integrations-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, []);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const SOCIAL_SECTION_IDS = new Set([
      'whatsapp_evolution',
      'instagram',
      'facebook',
      'youtube',
      'tiktok',
    ]);
    return INTEGRATIONS_CATALOG.filter((item) => {
      // Secção premium dedicada — evita cartões duplicados no grid
      if (SOCIAL_SECTION_IDS.has(item.id)) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.includes(q)
      );
    }).map((item) => {
      let status = 'available';
      if (item.connectType === 'coming_soon') status = 'coming_soon';
      else if (statusMap[item.id]?.status === 'connected') status = 'connected';
      if (item.connectType === 'platform' && status !== 'coming_soon') {
        const apiStatus = statusMap[item.id]?.status;
        if (apiStatus === 'available') status = 'available';
        else if (apiStatus === 'connected' || !statusMap[item.id]) status = 'connected';
      }
      return { ...item, status, meta: statusMap[item.id]?.meta || {} };
    });
  }, [query, category, statusMap]);

  const connectedCount = useMemo(
    () => cards.filter((c) => c.status === 'connected').length,
    [cards]
  );

  async function handleConnectClick(item) {
    if (item.connectType === 'coming_soon') return;

    if (item.connectType === 'platform') {
      setToast({
        message:
          item.id === 'mercadopago' || item.id === 'pix'
            ? `${item.name} usa o token da plataforma GoCreate — já ligado quando o servidor tem MERCADOPAGO_ACCESS_TOKEN.`
            : item.id === 'google_oauth' || item.id === 'firebase_auth'
              ? 'Login Google nos apps gerados: usa window.GoCreateAuth.signInWithGoogle() (Firebase da plataforma). Sem Client Secret.'
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
          setToast({ message: err.message || PREMIUM_REQUIRED_MESSAGE, type: 'error' });
        } else {
          setToast({ message: err.message || 'Falha ao ligar GitHub.', type: 'error' });
        }
      } finally {
        setBusyId(null);
      }
      return;
    }

    if (item.connectType === 'oauth' && (item.id === 'stripe' || item.id === 'paypal')) {
      setBusyId(item.id);
      try {
        const token = await user.getIdToken();
        const { authUrl } = await startPlatformOAuth({ idToken: token, platform: item.id });
        const popup = openOAuthPopup(authUrl);
        await waitForOAuthMessage(item.id, popup);
        setToast({ message: `${item.name} ligado via OAuth.`, type: 'success' });
        await refresh();
      } catch (err) {
        if (err?.code === 'OAUTH_NOT_CONFIGURED' || err?.status === 501) {
          setToast({
            message:
              err?.details?.hint ||
              err.message ||
              `${item.name} OAuth ainda não configurado no servidor.`,
            type: 'error',
          });
        } else {
          setToast({ message: err.message || `Falha ao ligar ${item.name}.`, type: 'error' });
        }
      } finally {
        setBusyId(null);
      }
      return;
    }

    setModalIntegration(item);
  }

  async function handleModalConnect(credentials) {
    if (!modalIntegration) return;
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
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function handleModalDisconnect() {
    if (!modalIntegration) return;
    setBusyId(modalIntegration.id);
    try {
      const token = await user.getIdToken();
      if (modalIntegration.id === 'github') {
        await disconnectGitHub({ idToken: token });
      } else if (OAUTH_PROVIDERS.has(modalIntegration.id) && modalIntegration.id !== 'github') {
        await disconnectPlatformOAuth({ idToken: token, platform: modalIntegration.id });
      } else {
        await disconnectIntegration({ idToken: token, providerId: modalIntegration.id });
      }
      setToast({ message: `${modalIntegration.name} desligado.`, type: 'success' });
      setModalIntegration(null);
      await refresh();
    } catch (err) {
      setToast({ message: err.message || 'Falha ao desligar.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleModalTest() {
    if (!modalIntegration) return;
    const token = await user.getIdToken();
    return testIntegration({ idToken: token, providerId: modalIntegration.id });
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
            <Plug size={12} /> Conta
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight mb-1">
            Integrações
          </h1>
          <p className="text-sm text-zinc-500 max-w-xl">
            Canais sociais e Pix usam credenciais da plataforma GoCreate. Stripe/PayPal abrem
            OAuth oficial (sem colar Secret). WhatsApp gera QR; Instagram/Facebook abrem login
            Meta. Supabase e similares continuam opcionais (BYO).
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-zinc-100 tabular-nums">{connectedCount}</p>
          <p className="text-[11px] text-zinc-500">ligadas / {INTEGRATIONS_CATALOG.length} no catálogo</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar integração…"
            className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-blue-500/40 rounded-lg py-2.5 pl-9 pr-3 text-sm text-zinc-200 outline-none"
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
            const isSoon = item.status === 'coming_soon';
            const isConnected = item.status === 'connected';

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
                {item.meta?.login && (
                  <p className="text-[11px] text-zinc-500 mb-3">@{item.meta.login}</p>
                )}
                {!item.meta?.login && item.meta?.label && (
                  <p className="text-[11px] text-zinc-500 mb-3 truncate">{item.meta.label}</p>
                )}
                {!item.meta?.login && !item.meta?.label && item.meta?.shop && (
                  <p className="text-[11px] text-zinc-500 mb-3 truncate">{item.meta.shop}</p>
                )}
                {!item.meta?.login && !item.meta?.label && item.meta?.url && (
                  <p className="text-[11px] text-zinc-500 mb-3 truncate">{item.meta.url}</p>
                )}
                <button
                  type="button"
                  disabled={isSoon || busy}
                  onClick={() => {
                    if (isConnected && item.connectType === 'api_key') {
                      setModalIntegration(item);
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
                      : isSoon
                        ? 'border border-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {busy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isConnected ? (
                    <Check size={13} />
                  ) : (
                    <Plug size={13} />
                  )}
                  {isSoon
                    ? 'Em breve'
                    : isConnected
                      ? item.connectType === 'platform'
                        ? 'Activo'
                        : 'Gerir'
                      : 'Ligar'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !cards.length && (
        <p className="text-center text-sm text-zinc-500 py-16">Nenhuma integração corresponde à pesquisa.</p>
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
