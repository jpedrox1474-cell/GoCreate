import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import Automations from './pages/Automations';
import Entities from './pages/Entities';
import Admin from './pages/Admin';
import BackendFunctions from './pages/BackendFunctions';
import PublicPreview from './pages/PublicPreview';
import { resolveCustomHost } from './lib/deployApi';

const PLATFORM_HOSTS = new Set([
  'gocreate.web.app',
  'gocreate.firebaseapp.com',
  'localhost',
  '127.0.0.1',
]);

function NeutralSpinner() {
  return (
    <div className="flex items-center justify-center h-screen w-full bg-white dark:bg-zinc-950">
      <Loader2 size={28} className="text-zinc-400 animate-spin" aria-label="A carregar" />
    </div>
  );
}

/** If visitor opens a mapped custom domain, redirect to /p/{slug}. */
function CustomDomainRedirect({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, path: null });

  useEffect(() => {
    const host = (typeof window !== 'undefined' ? window.location.hostname : '').toLowerCase();
    if (
      !host ||
      PLATFORM_HOSTS.has(host) ||
      host.endsWith('.web.app') ||
      host.endsWith('.firebaseapp.com')
    ) {
      setState({ loading: false, path: null });
      return undefined;
    }
    if (location.pathname.startsWith('/p/')) {
      setState({ loading: false, path: null });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const mapped = await resolveCustomHost(host);
        if (!cancelled && mapped?.path) {
          setState({ loading: false, path: mapped.path });
          return;
        }
      } catch {
        /* not mapped */
      }
      if (!cancelled) setState({ loading: false, path: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) return <NeutralSpinner />;
  if (state.path) return <Navigate to={state.path} replace />;
  return children;
}

function PublicOnly({ children }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-transparent">
        <Loader2 size={28} className="text-zinc-400 animate-spin" />
      </div>
    );
  }
  return children;
}

export default function App() {
  const { loading } = useAuth();
  const location = useLocation();
  const isPublicPreview = location.pathname.startsWith('/p/');

  // Published apps must never show GoCreate silk/video branding while auth bootstraps
  if (loading && isPublicPreview) {
    return <NeutralSpinner />;
  }

  if (loading) {
    return (
      <div className="relative flex items-center justify-center h-screen w-full overflow-hidden">
        <VideoBgFallback />
        <Loader2 size={28} className="relative z-10 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <CustomDomainRedirect>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <Register />
            </PublicOnly>
          }
        />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/entities" element={<Entities />} />
          <Route path="/database" element={<Entities />} />
          <Route path="/functions" element={<BackendFunctions />} />
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route
          path="/editor/:projectId"
          element={
            <ProtectedRoute>
              <Editor />
            </ProtectedRoute>
          }
        />

        {/* Public share links — no auth required */}
        <Route path="/p/:projectId/preview" element={<PublicPreview />} />
        <Route path="/p/:projectId" element={<PublicPreview />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CustomDomainRedirect>
  );
}

/** Minimal same-origin video while auth resolves — avoids solid blank screen */
function VideoBgFallback() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <video
        className="absolute inset-0 h-full w-full object-cover scale-[1.06] origin-center"
        src="/bg-video.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="gocreate-video-overlay-light absolute inset-0" />
      <div className="absolute bottom-0 right-0 h-16 w-20 bg-gradient-to-tl from-white/70 via-white/25 to-transparent" />
    </div>
  );
}
