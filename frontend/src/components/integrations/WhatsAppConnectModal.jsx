import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  QrCode,
  RefreshCw,
  CheckCircle,
  Loader2,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import ModalShell from '../editor/ModalShell';
import { evolutionQrToImageSrc } from '../../lib/evolutionQrImage';
import {
  requestWhatsAppQr,
  checkWhatsAppConnection,
  disconnectWhatsApp,
} from '../../lib/socialChannelsApi';

const POLL_MS = 4000;

/**
 * Modal QR WhatsApp via Evolution API (proxy backend → VPS).
 * Adaptado de BarberPro WhatsAppConnectSelfService.
 */
export default function WhatsAppConnectModal({
  open,
  onClose,
  idToken,
  connected: initiallyConnected,
  instanceName: initialInstance,
  onConnected,
  onDisconnected,
}) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const [instanceName, setInstanceName] = useState(initialInstance || '');
  const [connected, setConnected] = useState(Boolean(initiallyConnected));
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    if (open) {
      setConnected(Boolean(initiallyConnected));
      setInstanceName(initialInstance || '');
      setQrCode(null);
      setPairingCode(null);
      setError('');
      setHint('');
    }
  }, [open, initiallyConnected, initialInstance]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const pollConnection = useCallback(async () => {
    if (!idToken) return;
    try {
      const data = await checkWhatsAppConnection({
        idToken,
        instanceName: instanceName || undefined,
      });
      if (data?.instanceName) setInstanceName(data.instanceName);
      if (data?.connected) {
        setConnected(true);
        setQrCode(null);
        setPairingCode(null);
        setHint('');
        setError('');
        stopPoll();
        onConnected?.(data);
      } else if (qrCode || pairingCode) {
        setHint('Aguardando leitura do QR no WhatsApp…');
      }
    } catch (err) {
      if (err?.code === 'PREMIUM_REQUIRED') {
        setError(err.message);
        stopPoll();
      }
    }
  }, [idToken, instanceName, qrCode, pairingCode, stopPoll, onConnected]);

  useEffect(() => {
    if (!open || connected || (!qrCode && !pairingCode)) {
      stopPoll();
      return undefined;
    }
    pollRef.current = setInterval(pollConnection, POLL_MS);
    return () => stopPoll();
  }, [open, connected, qrCode, pairingCode, pollConnection, stopPoll]);

  async function handleGenerateQr() {
    if (!idToken) return;
    setLoading(true);
    setError('');
    setHint('');
    try {
      const data = await requestWhatsAppQr({ idToken });
      if (data?.instanceName) setInstanceName(data.instanceName);
      if (data?.qrBase64) setQrCode(data.qrBase64);
      if (data?.pairingCode) setPairingCode(data.pairingCode);
      if (!data?.qrBase64 && !data?.pairingCode) {
        setError(data?.qrError || 'QR indisponível. Tente novamente em alguns segundos.');
      } else {
        setHint('Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho.');
      }
    } catch (err) {
      setError(err.message || 'Falha ao gerar QR.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRecheck() {
    setChecking(true);
    setError('');
    try {
      await pollConnection();
    } finally {
      setChecking(false);
    }
  }

  async function handleDisconnect() {
    if (!idToken) return;
    setDisconnecting(true);
    setError('');
    try {
      await disconnectWhatsApp({ idToken, instanceName: instanceName || undefined });
      setConnected(false);
      setQrCode(null);
      setPairingCode(null);
      stopPoll();
      onDisconnected?.();
    } catch (err) {
      setError(err.message || 'Falha ao desligar.');
    } finally {
      setDisconnecting(false);
    }
  }

  const qrSrc = evolutionQrToImageSrc(qrCode);

  return (
    <ModalShell open={open} onClose={onClose} title="Conectar WhatsApp" wide>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
            <MessageCircle size={18} />
          </span>
          <div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Liga o teu número via Evolution API (VPS). O QR é gerado no servidor — as chaves da
              API não saem do backend.
            </p>
            {instanceName ? (
              <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                Instância: {instanceName}
              </p>
            ) : null}
          </div>
        </div>

        {connected ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle size={18} />
              <span className="text-sm font-semibold">WhatsApp conectado</span>
            </div>
            <p className="text-xs text-emerald-200/80">
              Sessão activa na Evolution. Podes desligar a qualquer momento.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={checking || disconnecting}
                onClick={handleRecheck}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
                Atualizar estado
              </button>
              <button
                type="button"
                disabled={disconnecting}
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {disconnecting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <LogOut size={13} />
                )}
                Desconectar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!qrSrc ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleGenerateQr}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <QrCode size={16} />
                )}
                Gerar QR Code
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl bg-white p-3 shadow-lg">
                  <img src={qrSrc} alt="QR WhatsApp Evolution" className="w-[220px] h-[220px]" />
                </div>
                {pairingCode ? (
                  <p className="text-sm text-zinc-300">
                    Código:{' '}
                    <span className="font-mono font-bold tracking-widest text-zinc-100">
                      {pairingCode}
                    </span>
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGenerateQr}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    Novo QR
                  </button>
                  <button
                    type="button"
                    disabled={checking}
                    onClick={handleRecheck}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white disabled:opacity-50"
                  >
                    {checking ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle size={13} />
                    )}
                    Já conectei
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
