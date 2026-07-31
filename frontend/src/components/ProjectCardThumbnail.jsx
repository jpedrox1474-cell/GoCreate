import React from 'react';
import { FolderKanban } from 'lucide-react';
import { getProjectInitials, getProjectThumbGradientClass } from '../lib/projectThumb';

/**
 * First-version project card thumbnail:
 * browser chrome (traffic-light dots) + horizontal gradient + large initials.
 */
export default function ProjectCardThumbnail({
  name = 'Projeto',
  color,
  isDemo = false,
  className = '',
}) {
  const initials = getProjectInitials(name);
  const gradient = getProjectThumbGradientClass(name, color);
  const shortName = String(name || 'Projeto').trim().slice(0, 28);

  return (
    <div
      className={`relative h-36 bg-zinc-950 border-b border-zinc-800 overflow-hidden ${className}`}
    >
      {/* Browser chrome */}
      <div className="absolute top-0 inset-x-0 h-6 bg-zinc-900/95 border-b border-zinc-800 flex items-center gap-1.5 px-2.5 z-10">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="ml-2 flex-1 h-3 rounded bg-zinc-800/80 max-w-[55%]" />
      </div>

      {/* Horizontal gradient + initials */}
      <div
        className={`absolute inset-0 pt-6 bg-gradient-to-r ${gradient} flex flex-col items-center justify-center px-4`}
      >
        <div className="absolute inset-0 pt-6 bg-[radial-gradient(ellipse_at_30%_40%,rgba(255,255,255,0.18),transparent_55%)] pointer-events-none" />
        <span className="relative text-4xl sm:text-[2.75rem] font-bold tracking-tight text-white drop-shadow-md leading-none">
          {initials}
        </span>
        <span className="relative mt-2 text-xs font-medium text-white/75 truncate max-w-full text-center">
          {shortName}
        </span>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-2 z-[1]">
        <div className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
          <FolderKanban size={14} className="text-white" />
        </div>
      </div>

      {isDemo && (
        <span className="absolute top-8 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white/90 border border-white/10 z-[1]">
          Exemplo
        </span>
      )}
    </div>
  );
}
