import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import PublicPreview from './pages/PublicPreview';

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

  if (loading) {
    return (
      <div className="relative flex items-center justify-center h-screen w-full overflow-hidden">
        <VideoBgFallback />
        <Loader2 size={28} className="relative z-10 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
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
