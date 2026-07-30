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
import { getPlanAllowance } from '../lib/plans';
import PricingModal from '../components/PricingModal';

const CreditsContext = createContext(null);

export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState('free');
  const [creditsUsedThisMonth, setCreditsUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setCredits(null);
      setPlan('free');
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
          setCreditsUsedThisMonth(
            typeof data.creditsUsedThisMonth === 'number' ? data.creditsUsedThisMonth : 0
          );
        } else {
          setCredits(50);
          setPlan('free');
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

  const openPricing = useCallback(() => setPricingOpen(true), []);
  const closePricing = useCallback(() => setPricingOpen(false), []);

  const allowance = getPlanAllowance(plan);
  const used = Math.min(
    allowance,
    typeof creditsUsedThisMonth === 'number'
      ? creditsUsedThisMonth
      : Math.max(0, allowance - (credits ?? 0))
  );

  const value = useMemo(
    () => ({
      credits: credits ?? 0,
      plan,
      creditsUsedThisMonth: used,
      allowance,
      loading,
      lowCredits: (credits ?? 0) < 10,
      pricingOpen,
      openPricing,
      closePricing,
    }),
    [credits, plan, used, allowance, loading, pricingOpen, openPricing, closePricing]
  );

  return (
    <CreditsContext.Provider value={value}>
      {children}
      <PricingModal open={pricingOpen} onClose={closePricing} currentPlan={plan} />
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits precisa ser usado dentro de um <CreditsProvider>');
  return ctx;
}

export default CreditsContext;
