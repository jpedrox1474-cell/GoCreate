import React from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

export default function Logo({ to = '/', variant = 'dark', size = 'md' }) {
  const isLight = variant === 'light';
  const box = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const icon = size === 'sm' ? 14 : 16;
  const text = size === 'sm' ? 'text-sm' : 'text-[15px]';

  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 shrink-0 group transition-all"
    >
      <div
        className={`${box} rounded-lg flex items-center justify-center transition-all ${
          isLight
            ? 'bg-zinc-900 group-hover:bg-zinc-800'
            : 'bg-blue-600 shadow-lg shadow-blue-900/30 group-hover:shadow-blue-900/50'
        }`}
      >
        <Zap size={icon} className="text-white fill-white/20" />
      </div>
      <span
        className={`font-semibold ${text} tracking-tight transition-colors ${
          isLight ? 'text-zinc-900 group-hover:text-zinc-700' : 'text-zinc-100 group-hover:text-white'
        }`}
      >
        GoCreate
        <span className={isLight ? 'text-zinc-500' : 'text-blue-400'}>.dev</span>
      </span>
    </Link>
  );
}
