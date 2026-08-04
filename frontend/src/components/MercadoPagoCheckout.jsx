import React, { useEffect, useMemo, useRef, useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { Loader2 } from 'lucide-react';
import { processPayment } from '../lib/billingApi';

/**
 * Payment Brick embutido (checkout transparente).
 * Dark zinc+blue — container GoCreate; Brick usa theme dark do MP.
 */
export default function MercadoPagoCheckout({
  publicKey,
  amount,
  preferenceId,
  transactionId,
  payerEmail,
  idToken,
  onResult,
  onError,
}) {
  const [ready, setReady] = useState(false);
  const [brickError, setBrickError] = useState(null);
  const initKeyRef = useRef(null);

  const pk = String(publicKey || import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim();

  useEffect(() => {
    if (!pk) {
      setBrickError('Chave pública do Mercado Pago ausente.');
      return undefined;
    }
    if (initKeyRef.current !== pk) {
      initMercadoPago(pk, { locale: 'pt-BR' });
      initKeyRef.current = pk;
    }
    setReady(true);
    return undefined;
  }, [pk]);

  const initialization = useMemo(
    () => ({
      amount: Number(amount),
      ...(preferenceId ? { preferenceId: String(preferenceId) } : {}),
      ...(payerEmail
        ? {
            payer: {
              email: payerEmail,
            },
          }
        : {}),
    }),
    [amount, preferenceId, payerEmail]
  );

  const customization = useMemo(() => {
    const paymentMethods = {
      ticket: 'all',
      bankTransfer: 'all',
      creditCard: 'all',
      debitCard: 'all',
      prepaidCard: 'all',
    };
    if (preferenceId) {
      paymentMethods.mercadoPago = 'all';
    }
    return {
      paymentMethods,
      visual: {
        style: {
          theme: 'dark',
        },
      },
    };
  }, [preferenceId]);

  async function handleSubmit({ selectedPaymentMethod, formData }) {
    try {
      const result = await processPayment({
        transactionId,
        formData,
        selectedPaymentMethod,
        idToken,
      });
      onResult?.(result);
      return result;
    } catch (err) {
      onError?.(err);
      throw err;
    }
  }

  if (brickError) {
    return (
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
        {brickError}
      </div>
    );
  }

  if (!ready || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
        <Loader2 size={16} className="animate-spin text-blue-400" />
        A carregar checkout…
      </div>
    );
  }

  return (
    <div className="mp-brick-host w-full min-h-[320px] rounded-xl overflow-hidden">
      <Payment
        initialization={initialization}
        customization={customization}
        onSubmit={handleSubmit}
        onReady={() => setBrickError(null)}
        onError={(error) => {
          console.error('[MercadoPagoCheckout] brick:', error);
          const msg =
            error?.message ||
            error?.cause?.message ||
            'Erro no formulário de pagamento Mercado Pago.';
          setBrickError(msg);
          onError?.(error instanceof Error ? error : new Error(msg));
        }}
      />
    </div>
  );
}
