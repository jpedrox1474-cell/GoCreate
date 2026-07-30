import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Loader2, ArrowLeft, Github, User } from 'lucide-react';
import Logo from '../components/Logo';
import VideoBackground from '../components/VideoBackground';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Register() {
  const { user, loginWithGoogle, loginWithGithub, registerWithEmail, authError } = useAuth();
  const { isLight } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 6;
  const confirmValid = confirm === password && confirm.length >= 6;
  const showEmailError = touched.email && email && !emailValid;
  const showPasswordError = touched.password && password && !passwordValid;
  const showConfirmError = touched.confirm && confirm && !confirmValid;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ email: true, password: true, confirm: true });
    if (!emailValid || !passwordValid || !confirmValid || submitting) return;
    setSubmitting(true);
    try {
      await registerWithEmail(email, password);
      navigate(from, { replace: true });
    } catch {
      // authError
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await loginWithGoogle();
      navigate(from, { replace: true });
    } catch {
      // authError
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGithub() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await loginWithGithub();
      navigate(from, { replace: true });
    } catch {
      // authError
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden font-display ${
        isLight ? 'text-zinc-900' : 'text-zinc-100'
      }`}
    >
      <VideoBackground variant={isLight ? 'light' : 'dark'} />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-10">
        <Link
          to="/"
          className={`absolute top-5 left-4 sm:left-8 inline-flex items-center gap-1.5 text-sm font-medium transition-all ${
            isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <div
          className={`w-full max-w-sm backdrop-blur-md rounded-2xl border p-6 sm:p-8 ${
            isLight
              ? 'bg-white/85 shadow-[0_12px_50px_rgba(0,0,0,0.1)] border-zinc-200/90'
              : 'bg-zinc-900/85 shadow-[0_12px_50px_rgba(0,0,0,0.4)] border-zinc-700/90'
          }`}
        >
          <div className="flex flex-col items-center mb-6">
            <Logo to="/" variant={isLight ? 'light' : 'dark'} />
            <p className={`text-sm mt-3 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Cria a tua conta GoCreate
            </p>
          </div>

          <div className="space-y-2.5 mb-4">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 rounded-lg text-sm font-medium text-zinc-800 transition-all disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.87-3c-1.08.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.96H1.24v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.25 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.24a12 12 0 0 0 0 10.78l4.01-3.1z" />
                <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.6 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.24 6.61l4.01 3.1C6.2 6.87 8.86 4.75 12 4.75z" />
              </svg>
              Continuar com Google
            </button>
            <button
              type="button"
              onClick={handleGithub}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              <Github size={16} />
              Continuar com GitHub
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">ou</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div className="relative">
              <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome (opcional)"
                className="w-full bg-white border border-zinc-200 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 rounded-lg py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all"
              />
            </div>
            <div>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="teu@email.com"
                  className={`w-full bg-white border rounded-lg py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all ${
                    showEmailError
                      ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                      : 'border-zinc-200 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200'
                  }`}
                />
              </div>
              {showEmailError && (
                <p className="mt-1 text-xs text-red-500">Introduz um e-mail vÃ¡lido.</p>
              )}
            </div>
            <div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder="Senha (mÃ­n. 6)"
                  className={`w-full bg-white border rounded-lg py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all ${
                    showPasswordError
                      ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                      : 'border-zinc-200 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200'
                  }`}
                />
              </div>
              {showPasswordError && (
                <p className="mt-1 text-xs text-red-500">A senha precisa de pelo menos 6 caracteres.</p>
              )}
            </div>
            <div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                  placeholder="Confirmar senha"
                  className={`w-full bg-white border rounded-lg py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all ${
                    showConfirmError
                      ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                      : 'border-zinc-200 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200'
                  }`}
                />
              </div>
              {showConfirmError && (
                <p className="mt-1 text-xs text-red-500">As senhas nÃ£o coincidem.</p>
              )}
            </div>

            {authError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Criar conta
            </button>
          </form>

          <p className="text-center text-xs text-zinc-500 mt-5">
            JÃ¡ tens conta?{' '}
            <Link to="/login" state={{ from }} className="text-zinc-900 hover:underline font-semibold transition-all">
              Entrar
            </Link>
          </p>
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}

