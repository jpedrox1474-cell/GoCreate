import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { isLight } = useTheme();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className={`gc-themed flex items-center justify-center h-screen w-full ${
          isLight ? 'bg-zinc-50' : 'bg-zinc-950'
        }`}
      >
        <Loader2 size={28} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
