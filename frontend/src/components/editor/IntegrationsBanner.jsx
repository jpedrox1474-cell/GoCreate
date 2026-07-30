import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plug } from 'lucide-react';

/**
 * Discreet link to Integrations — no promo banner / plug widget.
 */
export default function IntegrationsBanner({ projectId }) {
  const to = projectId
    ? `/integrations?projectId=${encodeURIComponent(projectId)}`
    : '/integrations';

  return (
    <div className="mx-3 mb-2 flex items-center justify-between gap-2 px-1 py-1 text-[11px] text-zinc-500">
      <span className="truncate">Pagamentos e APIs</span>
      <Link
        to={to}
        className="inline-flex items-center gap-1 shrink-0 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <Plug size={11} />
        Integrações
      </Link>
    </div>
  );
}
