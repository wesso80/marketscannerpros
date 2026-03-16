'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Top Navigation Bar
   Desktop: horizontal nav buttons.  Mobile: hamburger → slide-out drawer.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { NAV_ITEMS } from '../_lib/constants';
import { useV2 } from '../_lib/V2Context';
import { useUserTier, type UserTier } from '@/lib/useUserTier';

const TIER_BADGE: Record<UserTier, { label: string; color: string } | null> = {
  anonymous: null,
  free: { label: 'Free', color: '#64748B' },
  pro: { label: 'Pro', color: '#3B82F6' },
  pro_trader: { label: 'Pro Trader', color: '#F59E0B' },
};

export default function TopNav() {
  const { activeSurface, navigateTo } = useV2();
  const { tier, isLoggedIn } = useUserTier();
  const badge = TIER_BADGE[tier];
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <>
      <nav className="sticky top-0 z-[100] bg-[var(--msp-bg)]/95 backdrop-blur-sm border-b border-[var(--msp-border)]">
        <div className="px-3 flex items-center gap-1.5 h-11">
          {/* MSP Logo */}
          <Link href="/" className="text-emerald-400 font-bold text-sm mr-3 whitespace-nowrap flex-shrink-0">
            MSP
          </Link>

          {/* ── Desktop nav (md+) ── */}
          <div className="hidden md:flex items-center gap-1.5 overflow-x-auto scrollbar-thin flex-1">
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
                {item.label}
              </button>
            ))}
            {/* Desktop right links */}
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <Link href="/pricing" className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Pricing</Link>
              {isLoggedIn && (
                <Link href="/tools/referrals" className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Referrals</Link>
              )}
              {isLoggedIn ? (
                <button onClick={() => navigateTo('workspace')} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Account</button>
              ) : (
                <Link href="/auth" className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors whitespace-nowrap">Sign In</Link>
              )}
              {badge && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }}>
                  {badge.label}
                </span>
              )}
            </div>
          </div>

          {/* ── Mobile: active page label + hamburger (below md) ── */}
          <div className="md:hidden flex items-center gap-2 ml-auto">
            {badge && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }}>
                {badge.label}
              </span>
            )}
            <button onClick={() => setDrawerOpen(true)} className="flex flex-col gap-1 p-2" aria-label="Open menu">
              <span className="block h-0.5 w-5 bg-teal-300 rounded" />
              <span className="block h-0.5 w-5 bg-teal-300 rounded" />
              <span className="block h-0.5 w-5 bg-teal-300 rounded" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-[200] md:hidden backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
      )}

      {/* ── Mobile drawer ── */}
      <div className={`fixed top-0 right-0 h-[100dvh] w-[min(300px,85vw)] bg-[#111C2D] z-[201] transform transition-transform duration-300 ease-in-out md:hidden border-l border-slate-700/90 shadow-2xl ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Drawer header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/90">
            <span className="text-base font-semibold text-teal-300">Navigate</span>
            <button onClick={() => setDrawerOpen(false)} className="text-xl text-teal-300 hover:text-teal-400 p-1">&#x2715;</button>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => { navigateTo(item.id); setDrawerOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${
                    activeSurface === item.id
                      ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                      : 'text-white hover:bg-teal-500/10 hover:text-teal-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Links section */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <Link href="/pricing" className="flex items-center gap-3 px-4 py-3 text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all" onClick={() => setDrawerOpen(false)}>Pricing</Link>
              {isLoggedIn && (
                <Link href="/tools/referrals" className="flex items-center gap-3 px-4 py-3 text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all" onClick={() => setDrawerOpen(false)}>Referrals</Link>
              )}
              <Link href="/account" className="flex items-center gap-3 px-4 py-3 text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all" onClick={() => setDrawerOpen(false)}>Account</Link>
            </div>

            {/* Tier + Sign out */}
            <div className="mt-4 pt-4 border-t border-slate-700/90 space-y-2">
              {isLoggedIn ? (
                <>
                  {badge && (
                    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-500/10 border border-slate-700 rounded-lg text-teal-300 font-medium">
                      {badge.label}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                      window.location.replace('/');
                    }}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-red-400/30 rounded-lg text-red-300 font-medium hover:bg-red-500/10 transition-all"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link href="/auth" className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-500/20 hover:bg-teal-500/30 border border-slate-700 rounded-lg text-teal-300 font-medium transition-all" onClick={() => setDrawerOpen(false)}>Sign In</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
