'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Top Navigation Bar
   7 flat buttons — no dropdowns. Clean, fast, professional.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import { NAV_ITEMS } from '../_lib/constants';
import { useV2 } from '../_lib/V2Context';

export default function TopNav() {
  const { activeSurface, navigateTo } = useV2();

  return (
    <nav className="sticky top-0 z-50 bg-[#0A101C]/95 backdrop-blur-sm border-b border-slate-700/50">
      <div className="max-w-[1800px] mx-auto px-3 flex items-center gap-1 h-12 overflow-x-auto scrollbar-thin">
        <Link href="/" className="text-emerald-400 font-bold text-sm mr-3 whitespace-nowrap flex-shrink-0">
          MSP<span className="text-slate-500 font-normal ml-1">v2</span>
        </Link>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              activeSurface === item.id
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span className="text-sm">{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.shortLabel}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
