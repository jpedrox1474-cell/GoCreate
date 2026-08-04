// Contexto de créditos — listener realtime em users/{uid} + PricingModal global.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  getPlanAllowance,
  canUsePremium,
  isOwnerUser,
  PREMIUM_REQUIRED_MESSAGE,
} from '../lib/plans';
import { getPaymentStatus } from '../lib/billingApi';
import PricingModal from '../components/PricingModal';
import Toast from '../components/Toast';

const CreditsContext = createContext(null);

export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState('free');
  const [role, setRole] = useState('user');
  const [creditsUsedThisMonth, setCreditsUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingMessage, setPricingMessage] = useState(null);
  const [billingToast, setBillingToast] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setCredits(null);
      setPlan('free');
      setRole('user');
      setCreditsUsedThisMonth(0);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCredits(typeof data.credits === 'number' ? data.credits : 50);
          setPlan(data.plan || 'free');
          setRole(data.role || 'user');
          setCreditsUsedThisMonth(
            typeof data.creditsUsedThisMonth === 'number' ? data.creditsUsedThisMonth : 0
          );
        } else {
          setCredits(50);
          setPlan('free');
          setRole('user');
          setCreditsUsedThisMonth(0);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[CreditsContext] snapshot:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user?.uid]);

  // Retorno do Checkout MP/Stripe: ?billing=success&tx=… → poll até fulfill
  useEffect(() => {
    if (!user?.uid) return undefined;
    const params = new URLSearchParams(location.search || '');
    const billing = params.get('billing');
    const tx = params.get('tx');
    if (!billing) return undefined;

    const cleanUrl = () => {
      params.delete('billing');
      params.delete('tx');
      const next = params.toString();
      navigate(
        { pathname: location.pathname, search: next ? `?${next}` : '' },
        { replace: true }
      );
    };

    if (billing === 'failure' || billing === 'stripe_cancel') {
      setBillingToast({
        message: 'Pagamento cancelado ou falhou. Podes tentar de novo.',
        type: 'error',
      });
      cleanUrl();
      return undefined;
    }

    if (billing === 'pending') {
      setBillingToast({
        message: 'Pagamento pendente. Os créditos entram quando for aprovado.',
        type: 'info',
      });
      cleanUrl();
      return undefined;
    }

    if (billing !== 'success' && billing !== 'stripe_success') {
      return undefined;
    }

    if (!tx) {
      setBillingToast({
        message: 'Pagamento recebido. O plano atualiza em instantes.',
        type: 'success',
      });
      cleanUrl();
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;
    setBillingToast({
      message: 'A confirmar pagamento…',
      type: 'info',
    });

    const poll = async () => {
      attempts += 1;
      try {
        const idToken = await user.getIdToken();
        const status = await getPaymentStatus({ transactionId: tx, idToken });
        if (cancelled) return true;
        if (status?.status === 'completed') {
          setBillingToast({
            message:
              status.plan === 'pro'
                ? 'Plano Pro ativado. Créditos atualizados.'
                : 'Pagamento confirmado. Créditos atualizados.',
            type: 'success',
          });
          cleanUrl();
          return true;
        }
      } catch (err) {
        console.warn('[CreditsContext] billing poll:', err);
      }
      if (attempts >= 12) {
        if (!cancelled) {
          setBillingToast({
            message:
              'Pagamento em processamento. O plano deve atualizar em breve via webhook.',
            type: 'info',
          });
          cleanUrl();
        }
        return true;
      }
      return false;
    };

    let timer = null;
    (async () => {
      const done = await poll();
      if (done || cancelled) return;
      timer = setInterval(async () => {
        const doneNow = await poll();
        if (doneNow && timer) clearInterval(timer);
      }, 2500);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [user, location.search, location.pathname, navigate]);

  const openPricing = useCallback((message) => {
    setPricingMessage(
      typeof message === 'string' && message.trim() ? message.trim() : null
    );
    setPricingOpen(true);
  }, []);

  const closePricing = useCallback(() => {
    setPricingOpen(false);
    setPricingMessage(null);
  }, []);

  const openPremiumPaywall = useCallback(() => {
    openPricing(PREMIUM_REQUIRED_MESSAGE);
  }, [openPricing]);

  const profile = useMemo(
    () => ({
      plan,
      role,
      email: user?.email || null,
    }),
    [plan, role, user?.email]
  );

  const unlimited = isOwnerUser(profile);
  const premium = canUsePremium(profile);
  const allowance = unlimited ? Infinity : getPlanAllowance(plan);
  const used = unlimited
    ? 0
    : Math.min(
        allowance,
        typeof creditsUsedThisMonth === 'number'
          ? creditsUsedThisMonth
          : Math.max(0, allowance - (credits ?? 0))
      );

  const value = useMemo(
    () => ({
      credits: unlimited ? Infinity : credits ?? 0,
      plan,
      role,
      unlimited,
      canUsePremium: premium,
      creditsUsedThisMonth: used,
      allowance,
      loading,
      lowCredits: unlimited ? false : (credits ?? 0) < 10,
      pricingOpen,
      openPricing,
      openPremiumPaywall,
      closePricing,
    }),
    [
      credits,
      plan,
      role,
      unlimited,
      premium,
      used,
      allowance,
      loading,
      pricingOpen,
      openPricing,
      openPremiumPaywall,
      closePricing,
    ]
  );

  return (
    <CreditsContext.Provider value={value}>
      {children}
      <PricingModal
        open={pricingOpen}
        onClose={closePricing}
        currentPlan={plan === 'enterprise_master' ? 'pro' : plan}
        message={pricingMessage}
      />
      {billingToast && (
        <Toast
          message={billingToast.message}
          type={billingToast.type}
          onClose={() => setBillingToast(null)}
          duration={5000}
        />
      )}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits precisa ser usado dentro de um <CreditsProvider>');
  return ctx;
}

export default CreditsContext;
