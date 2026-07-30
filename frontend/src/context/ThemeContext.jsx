import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getThemePreference,
  resolveTheme,
  applyTheme,
  setThemePreference,
  subscribeSystemTheme,
  subscribeThemeStorage,
} from '../lib/theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => getThemePreference());
  const [resolved, setResolved] = useState(() => resolveTheme(getThemePreference()));

  // Keep <html> class in sync whenever preference changes (incl. already-mounted routes).
  useEffect(() => {
    const next = applyTheme(preference);
    setResolved(next);
  }, [preference]);

  useEffect(() => {
    return subscribeSystemTheme((next) => {
      setResolved(next);
    });
  }, []);

  useEffect(() => {
    return subscribeThemeStorage(({ preference: nextPref, resolved: nextResolved }) => {
      setPreference(nextPref);
      setResolved(nextResolved);
    });
  }, []);

  // Re-apply on tab focus (covers storage races / multi-tab).
  useEffect(() => {
    const sync = () => {
      const pref = getThemePreference();
      const next = applyTheme(pref);
      setPreference(pref);
      setResolved(next);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const setTheme = useCallback((next) => {
    const applied = setThemePreference(next);
    setPreference(next);
    setResolved(applied);
  }, []);

  /** Preview sem gravar (até Guardar) — preferir setTheme para sync imediato. */
  const previewTheme = useCallback((next) => {
    setResolved(applyTheme(next));
    setPreference(next);
  }, []);

  const value = {
    preference,
    resolved,
    isLight: resolved === 'light',
    setTheme,
    previewTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa de <ThemeProvider>');
  return ctx;
}

export default ThemeContext;
