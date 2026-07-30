// Contexto de créditos — listener realtime em users/{uid} + PricingModal global.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  getPlanAllowance,
  canUsePremium,
  isOwnerUser,
  PREMIUM_REQUIRED_MESSAGE,
} from '../lib/plans';
import PricingModal from '../components/PricingModal';

const CreditsContext = createContext(null);

export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState('free');
  const [role, setRole] = useState('user');
  const [creditsUsedThisMonth, setCreditsUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingMessage, setPricingMessage] = useState(null);

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
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits precisa ser usado dentro de um <CreditsProvider>');
  return ctx;
}

export default CreditsContext;
