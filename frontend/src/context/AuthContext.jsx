// Contexto de autenticação — envolve o Firebase Auth e expõe user, loading
// e as funções de login/registro/logout pro resto do app.
// No signup / first login: garante users/{uid} com plan free + 50 créditos.

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';

const AuthContext = createContext(null);

const INITIAL_CREDITS = 50;
const INITIAL_PLAN = 'free';

const ERROR_MESSAGES = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/popup-closed-by-user': 'Login cancelado.',
};

function translateError(code) {
  return ERROR_MESSAGES[code] || 'Ocorreu um erro. Tenta novamente.';
}

/**
 * Cria ou atualiza users/{uid}.
 * Novos users: plan free + 50 credits. Existentes: só perfil / lastLogin
 * (créditos só via Admin / bootstrap se campo ausente).
 */
export async function ensureUserDoc(firebaseUser) {
  if (!firebaseUser?.uid) return;
  try {
    const ref = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        email: firebaseUser.email || null,
        displayName: firebaseUser.displayName || null,
        photoURL: firebaseUser.photoURL || null,
        plan: INITIAL_PLAN,
        credits: INITIAL_CREDITS,
        creditsUsedThisMonth: 0,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      return;
    }

    const data = snap.data() || {};
    const patch = {
      email: firebaseUser.email || null,
      displayName: firebaseUser.displayName || null,
      photoURL: firebaseUser.photoURL || null,
      lastLoginAt: serverTimestamp(),
    };

    // Migração: docs antigos sem credits
    if (typeof data.credits !== 'number') {
      patch.plan = INITIAL_PLAN;
      patch.credits = INITIAL_CREDITS;
      if (typeof data.creditsUsedThisMonth !== 'number') {
        patch.creditsUsedThisMonth = 0;
      }
    }

    await setDoc(ref, patch, { merge: true });
  } catch (err) {
    console.error('[AuthContext] Falha ao salvar doc do usuário:', err);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await ensureUserDoc(firebaseUser);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function loginWithGoogle() {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(result.user);
    } catch (err) {
      setAuthError(translateError(err.code));
      throw err;
    }
  }

  async function loginWithEmail(email, password) {
    setAuthError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(result.user);
    } catch (err) {
      setAuthError(translateError(err.code));
      throw err;
    }
  }

  async function registerWithEmail(email, password) {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(result.user);
    } catch (err) {
      setAuthError(translateError(err.code));
      throw err;
    }
  }

  async function logout() {
    await signOut(auth);
  }

  async function updateUserProfile({ displayName, photoURL }) {
    if (!auth.currentUser) throw new Error('Sem sessão ativa.');
    const payload = {};
    if (displayName !== undefined) payload.displayName = displayName || '';
    if (photoURL !== undefined) payload.photoURL = photoURL || '';
    await updateProfile(auth.currentUser, payload);
    await auth.currentUser.reload();
    await setDoc(
      doc(db, 'users', auth.currentUser.uid),
      {
        displayName: auth.currentUser.displayName || null,
        photoURL: auth.currentUser.photoURL || null,
        email: auth.currentUser.email,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    // Novo wrapper para forçar re-render sem perder métodos (getIdToken, etc.)
    const u = auth.currentUser;
    setUser(Object.assign(Object.create(Object.getPrototypeOf(u)), u));
    return u;
  }

  const value = {
    user,
    loading,
    authError,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
    updateUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de um <AuthProvider>');
  return ctx;
}

export default AuthContext;
