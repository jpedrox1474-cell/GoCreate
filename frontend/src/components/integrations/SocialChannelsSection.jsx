import React, { useCallback, useEffect, useState } from 'react';
import {
  MessageCircle,
  Instagram,
  Facebook,
  Youtube,
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
  startPlatformOAuth,
  disconnectPlatformOAuth,
  openOAuthPopup,
  waitForOAuthMessage,
} from '../../lib/socialChannelsApi';
import { useConfirm } from '../editor/ConfirmDialog';

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

function TikTokIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 16.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z" />
    </svg>
  );
}

const CHANNELS = [
  {
    id: 'whatsapp_evolution',
    name: 'WhatsApp',
    description: 'Conectar conta — escaneie o QR no celular. Sem colar API key.',
    icon: MessageCircle,
    accent: 'from-emerald-600/20 to-emerald-900/10 border-emerald-500/25 text-emerald-400',
    btn: 'bg-emerald-600 hover:bg-emerald-500',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Conta profissional — Página + Instagram no mesmo login Meta.',
    icon: Facebook,
    accent: 'from-[#1877F2]/20 to-[#1877F2]/5 border-blue-500/25 text-blue-400',
    btn: 'bg-[#1877F2] hover:bg-[#166fe5]',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Conta profissional via Meta Login. Sem secret key.',
    icon: Instagram,
    accent:
      'from-[#833AB4]/20 via-[#FD1D1D]/10 to-[#F77737]/10 border-pink-500/25 text-pink-400',
    btn: 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] hover:opacity-90',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Conectar conta Google — canal YouTube do marketplace.',
    icon: Youtube,
    accent: 'from-[#FF0000]/20 to-[#FF0000]/5 border-red-500/25 text-red-400',
    btn: 'bg-[#FF0000] hover:bg-[#e60000]',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Conectar conta — OAuth TikTok para o marketplace.',
    icon: TikTokIcon,
    accent: 'from-zinc-100/10 to-cyan-500/10 border-zinc-500/30 text-zinc-100',
    btn: 'bg-zinc-100 hover:bg-white text-zinc-900',
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
  const [askConfirm, confirmDialog] = useConfirm();
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

  // Deep-link from chat chip / Integrations#whatsapp → open QR modal
  useEffect(() => {
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash !== 'whatsapp' && hash !== 'whatsapp_evolution') return;
    const el = document.getElementById('social-channels');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (canUsePremium) {
      setWaOpen(true);
    } else {
      openPremiumPaywall?.();
    }
  }, [canUsePremium, openPremiumPaywall]);

  useEffect(() => {
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'google' || hash === 'google_oauth' || hash === 'firebase_auth') {
      const el = document.getElementById('integrations-grid') || document.getElementById('social-channels');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const guardPremium = useCallback(() => {
    if (canUsePremium) return true;
    openPremiumPaywall?.();
    onToast?.({
      message: 'Canais sociais disponíveis nos planos pagos.',
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
    const ok = await askConfirm({
      title: 'Desligar Meta',
      message: 'Desligar Instagram e Facebook desta conta?',
      confirmLabel: 'Desligar',
      destructive: true,
    });
    if (!ok) return;
    setBusy('meta');
    try {
      await disconnectMeta({ idToken });
      onToast?.({ message: 'Facebook e Instagram desligados.', type: 'success' });
      await onRefresh?.();
    } catch (err) {
      onToast?.({ message: err.message || 'Falha ao desligar.', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleOAuthConnect(platformId) {
    if (!guardPremium()) return;
    if (!idToken) return;
    setBusy(platformId);
    try {
      const { authUrl } = await startPlatformOAuth({ idToken, platform: platformId });
      const popup = openOAuthPopup(authUrl);
      const result = await waitForOAuthMessage(platformId, popup);
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      const label = platformId === 'youtube' ? 'YouTube' : 'TikTok';
      onToast?.({
        message: result?.displayName
          ? `${label} conectado: ${result.displayName}`
          : `${label} conectado.`,
        type: 'success',
      });
      await onRefresh?.();
    } catch (err) {
      if (err?.code === 'PREMIUM_REQUIRED' || err?.status === 403) {
        openPremiumPaywall?.();
      }
      if (err?.code === 'OAUTH_NOT_CONFIGURED') {
        onToast?.({
          message: err.details?.hint || err.message || 'OAuth ainda não configurado no servidor.',
          type: 'error',
        });
      } else {
        onToast?.({ message: err.message || `Falha ao ligar ${platformId}.`, type: 'error' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleOAuthDisconnect(platformId) {
    if (!guardPremium()) return;
    const label = platformId === 'youtube' ? 'YouTube' : 'TikTok';
    const ok = await askConfirm({
      title: `Desligar ${label}`,
      message: `Desligar ${label} desta conta?`,
      confirmLabel: 'Desligar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(platformId);
    try {
      await disconnectPlatformOAuth({ idToken, platform: platformId });
      onToast?.({ message: `${label} desligado.`, type: 'success' });
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

    if (channel.id === 'youtube' || channel.id === 'tiktok') {
      const connected = statusMap[channel.id]?.status === 'connected';
      if (connected) handleOAuthDisconnect(channel.id);
      else handleOAuthConnect(channel.id);
      return;
    }

    const igConnected = statusMap.instagram?.status === 'connected';
    const fbConnected = statusMap.facebook?.status === 'connected';
    if (igConnected || fbConnected) {
      handleMetaDisconnect();
      return;
    }
    handleMetaConnect();
  }

  return (
    <section id="social-channels" className="mb-10">
      {confirmDialog}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/90 mb-1.5 flex items-center gap-1.5">
            <Sparkles size={12} /> Premium
          </p>
          <h2 className="text-lg font-bold text-zinc-100 tracking-tight">
            Canais de Atendimento & Social
          </h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            WhatsApp, Facebook, Instagram, YouTube e TikTok — ligue contas profissionais ao marketplace.
            {!canUsePremium ? ' Incluído nos planos Pro e Enterprise.' : null}
          </p>
          {canUsePremium && metaAppId ? (
            <p className="text-[11px] text-zinc-600 mt-2 max-w-xl leading-relaxed">
              Meta (IG/FB): no{' '}
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 underline-offset-2 hover:underline"
              >
                Meta Developer
              </a>
              , App Domains e Allowed Domains for the JavaScript SDK devem incluir{' '}
              <span className="font-mono text-zinc-500">gocreate-app.web.app</span> e{' '}
              <span className="font-mono text-zinc-500">localhost</span>. Redirects:{' '}
              <span className="font-mono text-zinc-500">https://gocreate-app.web.app/</span> e{' '}
              <span className="font-mono text-zinc-500">/integrations</span>.
            </p>
          ) : null}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {CHANNELS.map((ch) => {
          const Icon = ch.icon;
          const meta = statusMap[ch.id]?.meta || {};
          const isConnected = statusMap[ch.id]?.status === 'connected';
          const isBusy =
            (busy === 'meta' && (ch.id === 'instagram' || ch.id === 'facebook')) ||
            busy === ch.id;
          const locked = !canUsePremium;

          let subtitle = '';
          if (ch.id === 'whatsapp_evolution') {
            if (isConnected && meta.instanceName) subtitle = 'Conta conectada';
            else if (!platform.evolutionApi && canUsePremium) subtitle = 'Servidor: configurar WhatsApp';
            else subtitle = 'QR no celular';
          } else if (ch.id === 'instagram') {
            if (isConnected && meta.username) subtitle = `@${meta.username}`;
            else if (isConnected) subtitle = 'Conta profissional';
            else subtitle = 'Conta profissional';
          } else if (ch.id === 'facebook') {
            if (isConnected && meta.pageName) subtitle = meta.pageName;
            else if (isConnected) subtitle = 'Conta profissional';
            else if (statusMap.instagram?.status === 'connected') subtitle = 'Mesmo login Meta';
            else subtitle = 'Conta profissional';
          } else if (ch.id === 'youtube') {
            if (isConnected && meta.channelTitle) subtitle = meta.channelTitle;
            else if (isConnected) subtitle = 'Canal conectado';
            else if (!platform.youtubeOAuth && canUsePremium) subtitle = 'OAuth: configurar no servidor';
            else subtitle = 'Conectar conta';
          } else if (ch.id === 'tiktok') {
            if (isConnected && meta.username) subtitle = `@${meta.username}`;
            else if (isConnected) subtitle = 'Conta conectada';
            else if (!platform.tiktokOAuth && canUsePremium) subtitle = 'OAuth: configurar no servidor';
            else subtitle = 'Conectar conta';
          }

          const connectedStyle =
            isConnected &&
            (ch.id === 'instagram' ||
              ch.id === 'facebook' ||
              ch.id === 'whatsapp_evolution' ||
              ch.id === 'youtube' ||
              ch.id === 'tiktok');

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
                className={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                  connectedStyle
                    ? 'border border-emerald-500/30 text-emerald-300 bg-transparent hover:bg-emerald-500/10'
                    : locked
                      ? 'bg-zinc-800 text-zinc-400 border border-zinc-700 text-white'
                      : `${ch.btn} text-white`
                } ${ch.id === 'tiktok' && !connectedStyle && !locked ? '!text-zinc-900' : ''}`}
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
                        : 'Conectar'}
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
