import React, { useCallback, useEffect, useState } from 'react';
import {
  MessageCircle,
  Instagram,
  Facebook,
  Lock,
  Loader2,
  Check,
  Plug,
  Sparkles,
} from 'lucide-react';
import WhatsAppConnectModal from './WhatsAppConnectModal';
import {
  connectMeta,
  disconnectMeta,
  getMetaPublicConfig,
} from '../../lib/socialChannelsApi';

const META_LOGIN_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  'instagram_basic',
].join(',');

let fbSdkInitPromise = null;
let fbInitialized = false;

function loadFbSdk(appId) {
  if (window.FB && fbInitialized) return Promise.resolve();
  if (fbSdkInitPromise) return fbSdkInitPromise;

  fbSdkInitPromise = new Promise((resolve, reject) => {
    const finishInit = () => {
      if (!appId) {
        reject(new Error('META_APP_ID / VITE_META_APP_ID não configurado.'));
        return;
      }
      if (!fbInitialized) {
        window.FB.init({
          appId,
          version: 'v19.0',
          cookie: true,
          xfbml: false,
          status: false,
        });
        fbInitialized = true;
      }
      resolve();
    };

    if (window.FB) {
      finishInit();
      return;
    }

    const timeout = setTimeout(() => reject(new Error('Timeout ao carregar Facebook SDK.')), 15000);
    const prevAsyncInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      try {
        if (typeof prevAsyncInit === 'function') prevAsyncInit();
      } catch {
        /* ignore */
      }
      clearTimeout(timeout);
      finishInit();
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      clearTimeout(timeout);
      fbSdkInitPromise = null;
      reject(new Error('Falha ao carregar Facebook SDK.'));
    };
    document.head.appendChild(s);
  }).catch((err) => {
    fbSdkInitPromise = null;
    throw err;
  });

  return fbSdkInitPromise;
}

const CHANNELS = [
  {
    id: 'whatsapp_evolution',
    name: 'WhatsApp',
    description: 'QR Code via Evolution API no teu VPS. Mensagens e sessão Baileys.',
    icon: MessageCircle,
    accent: 'from-emerald-600/20 to-emerald-900/10 border-emerald-500/25 text-emerald-400',
    btn: 'bg-emerald-600 hover:bg-emerald-500',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Conta Professional ligada à Página — login Meta (padrão ManuTV Hub).',
    icon: Instagram,
    accent:
      'from-[#833AB4]/20 via-[#FD1D1D]/10 to-[#F77737]/10 border-pink-500/25 text-pink-400',
    btn: 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] hover:opacity-90',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Página do Facebook no mesmo login Meta do Instagram.',
    icon: Facebook,
    accent: 'from-[#1877F2]/20 to-[#1877F2]/5 border-blue-500/25 text-blue-400',
    btn: 'bg-[#1877F2] hover:bg-[#166fe5]',
  },
];

/**
 * Secção premium — Canais de Atendimento & Social.
 * Free (não-owner) → paywall; owner / pro / enterprise_master → conexões reais.
 */
export default function SocialChannelsSection({
  canUsePremium,
  openPremiumPaywall,
  idToken,
  statusMap = {},
  platform = {},
  onRefresh,
  onToast,
}) {
  const [waOpen, setWaOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [metaAppId, setMetaAppId] = useState(
    () => import.meta.env.VITE_META_APP_ID || ''
  );

  useEffect(() => {
    if (!idToken || !canUsePremium) return;
    getMetaPublicConfig({ idToken })
      .then((cfg) => {
        if (cfg?.appId) setMetaAppId(cfg.appId);
      })
      .catch(() => {});
  }, [idToken, canUsePremium]);

  const guardPremium = useCallback(() => {
    if (canUsePremium) return true;
    openPremiumPaywall?.();
    onToast?.({
      message: 'Canais sociais usam recursos VPS — disponíveis nos planos pagos.',
      type: 'error',
    });
    return false;
  }, [canUsePremium, openPremiumPaywall, onToast]);

  async function handleMetaConnect() {
    if (!guardPremium()) return;
    if (!idToken) return;
    setBusy('meta');
    try {
      const appId = metaAppId || import.meta.env.VITE_META_APP_ID;
      if (!appId) {
        throw new Error(
          'Meta App ID em falta. Define META_APP_ID no backend e VITE_META_APP_ID no frontend.'
        );
      }
      await loadFbSdk(appId);
      if (!window.FB) throw new Error('Facebook SDK não carregou.');

      await new Promise((resolve, reject) => {
        window.FB.login(
          async (response) => {
            try {
              if (!response.authResponse?.accessToken) {
                reject(new Error('Login Meta cancelado.'));
                return;
              }
              const result = await connectMeta({
                idToken,
                accessToken: response.authResponse.accessToken,
              });
              onToast?.({
                message: result?.instagram?.username
                  ? `Instagram @${result.instagram.username} e Facebook ligados.`
                  : 'Instagram e Facebook ligados.',
                type: 'success',
              });
              await onRefresh?.();
              resolve(result);
            } catch (err) {
              reject(err);
            }
          },
          { scope: META_LOGIN_SCOPES, return_scopes: true }
        );
      });
    } catch (err) {
      if (err?.code === 'PREMIUM_REQUIRED' || err?.status === 403) {
        openPremiumPaywall?.();
      }
      onToast?.({ message: err.message || 'Falha ao ligar Meta.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleMetaDisconnect() {
    if (!guardPremium()) return;
    if (!window.confirm('Desligar Instagram e Facebook desta conta GoCreate?')) return;
    setBusy('meta');
    try {
      await disconnectMeta({ idToken });
      onToast?.({ message: 'Meta desligado.', type: 'success' });
      await onRefresh?.();
    } catch (err) {
      onToast?.({ message: err.message || 'Falha ao desligar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function handleChannelClick(channel) {
    if (!guardPremium()) return;

    if (channel.id === 'whatsapp_evolution') {
      setWaOpen(true);
      return;
    }

    // Instagram e Facebook partilham o mesmo fluxo Meta
    const igConnected = statusMap.instagram?.status === 'connected';
    const fbConnected = statusMap.facebook?.status === 'connected';
    if (igConnected || fbConnected) {
      handleMetaDisconnect();
      return;
    }
    handleMetaConnect();
  }

  return (
    <section className="mb-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/90 mb-1.5 flex items-center gap-1.5">
            <Sparkles size={12} /> Premium · VPS
          </p>
          <h2 className="text-lg font-bold text-zinc-100 tracking-tight">
            Canais de Atendimento & Social
          </h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            WhatsApp (Evolution API), Instagram e Facebook — ligam à tua infra VPS / Meta App.
            {!canUsePremium ? ' Incluído nos planos Pro e Enterprise.' : null}
          </p>
        </div>
        {!canUsePremium ? (
          <button
            type="button"
            onClick={() => openPremiumPaywall?.()}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-2 rounded-lg text-xs font-semibold border border-amber-500/30 text-amber-300 bg-amber-500/10 hover:bg-amber-500/15"
          >
            <Lock size={13} /> Desbloquear
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CHANNELS.map((ch) => {
          const Icon = ch.icon;
          const meta = statusMap[ch.id]?.meta || {};
          const isConnected = statusMap[ch.id]?.status === 'connected';
          const isBusy =
            busy === 'meta' && (ch.id === 'instagram' || ch.id === 'facebook');
          const locked = !canUsePremium;

          let subtitle = '';
          if (ch.id === 'whatsapp_evolution') {
            if (isConnected && meta.instanceName) subtitle = meta.instanceName;
            else if (!platform.evolutionApi && canUsePremium)
              subtitle = 'Servidor: falta EVOLUTION_API_URL';
            else subtitle = 'Evolution · QR no celular';
          } else if (ch.id === 'instagram') {
            if (isConnected && meta.username) subtitle = `@${meta.username}`;
            else if (isConnected) subtitle = 'Conta Professional';
            else subtitle = 'Login Meta · Business';
          } else if (ch.id === 'facebook') {
            if (isConnected && meta.pageName) subtitle = meta.pageName;
            else if (isConnected) subtitle = 'Página vinculada';
            else if (statusMap.instagram?.status === 'connected')
              subtitle = 'Mesmo login Meta';
            else subtitle = 'Página + Instagram';
          }

          return (
            <article
              key={ch.id}
              className={`relative rounded-xl border bg-gradient-to-br p-4 flex flex-col ${ch.accent} ${
                locked ? 'opacity-80' : ''
              } bg-zinc-900/50`}
            >
              {locked ? (
                <span className="absolute top-3 right-3 text-zinc-500">
                  <Lock size={14} />
                </span>
              ) : null}
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    {ch.name}
                    {isConnected ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                        Ligado
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-[11px] text-zinc-500 truncate">{subtitle}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed flex-1 mb-4">{ch.description}</p>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleChannelClick(ch)}
                className={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50 ${
                  isConnected && (ch.id === 'instagram' || ch.id === 'facebook')
                    ? 'border border-emerald-500/30 text-emerald-300 bg-transparent hover:bg-emerald-500/10'
                    : isConnected && ch.id === 'whatsapp_evolution'
                      ? 'border border-emerald-500/30 text-emerald-300 bg-transparent hover:bg-emerald-500/10'
                      : locked
                        ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        : ch.btn
                }`}
              >
                {isBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : locked ? (
                  <Lock size={13} />
                ) : isConnected ? (
                  <Check size={13} />
                ) : (
                  <Plug size={13} />
                )}
                {locked
                  ? 'Premium'
                  : isConnected
                    ? ch.id === 'whatsapp_evolution'
                      ? 'Gerir'
                      : 'Desligar'
                    : ch.id === 'instagram'
                      ? 'Entrar com Instagram'
                      : ch.id === 'facebook'
                        ? 'Entrar com Facebook'
                        : 'Ligar QR'}
              </button>
            </article>
          );
        })}
      </div>

      <WhatsAppConnectModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        idToken={idToken}
        connected={statusMap.whatsapp_evolution?.status === 'connected'}
        instanceName={statusMap.whatsapp_evolution?.meta?.instanceName}
        onConnected={async () => {
          onToast?.({ message: 'WhatsApp conectado.', type: 'success' });
          await onRefresh?.();
        }}
        onDisconnected={async () => {
          onToast?.({ message: 'WhatsApp desligado.', type: 'success' });
          await onRefresh?.();
        }}
      />
    </section>
  );
}
