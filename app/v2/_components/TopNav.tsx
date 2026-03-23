'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Top Navigation Bar
   7 flat buttons — no dropdowns. Clean, fast, professional.
   Includes Pricing + Account links and tier badge.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import { NAV_ITEMS } from '../_lib/constants';
import { useV2 } from '../_lib/V2Context';
import { useUserTier, type UserTier } from '@/lib/useUserTier';

const TIER_BADGE: Record<UserTier, { label: string; color: string } | null> = {
  anonymous: null,
  free: { label: 'Free', color: '#64748B' },
  pro: { label: '✨ Pro', color: '#3B82F6' },
  pro_trader: { label: '⭐ Pro Trader', color: '#F59E0B' },
};

export default function TopNav() {
  const { activeSurface, navigateTo } = useV2();
  const { tier, isLoggedIn } = useUserTier();
  const badge = TIER_BADGE[tier];

  return (
    <nav className="sticky top-0 z-[100] bg-[var(--msp-bg)]/95 backdrop-blur-sm border-b border-[var(--msp-border)]">
      <div className="px-3 flex items-center gap-1.5 h-11 overflow-x-auto scrollbar-thin">
        <Link href="/" className="text-emerald-400 font-bold text-sm mr-3 whitespace-nowrap flex-shrink-0">
          MSP<span className="text-slate-500 font-normal ml-1">v2</span>
        </Link>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => navigateTo(item.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              activeSurface === item.id
                ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]'
                : 'text-[var(--msp-text-muted)] hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span className="text-sm">{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}

        {/* Right side: Pricing, Account, Tier badge */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <Link
            href="/v2/pricing"
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap"
          >
            Pricing
          </Link>
          {isLoggedIn && (
            <Link
              href="/v2/referrals"
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap"
            >
              Referrals
            </Link>
          )}
          {isLoggedIn ? (
            <button
              onClick={() => navigateTo('workspace')}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap"
            >
              Account
            </button>
          ) : (
            <Link
              href="/auth"
              className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
            >
              Sign In
            </Link>
          )}
          {badge && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }}
            >
              {badge.label}
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
