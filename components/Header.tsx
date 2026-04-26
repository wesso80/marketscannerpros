'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';
import { useUserTier } from '@/lib/useUserTier';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 Header — Matches Full Site Map
   Always shows: 7 surface buttons + Pricing / Referrals / Account
   Right side changes: Sign In (logged out) vs Tier badge + Sign Out (logged in)
   Mobile: Hamburger → flat drawer with same links
   ═══════════════════════════════════════════════════════════════════════════ */

const SURFACES = [
  { href: '/tools/dashboard',   label: 'Dashboard' },
  { href: '/tools/scanner',     label: 'Scanner' },
  { href: '/tools/golden-egg',  label: 'Golden Egg' },
  { href: '/tools/terminal',    label: 'Terminal' },
  { href: '/tools/explorer',    label: 'Explorer' },
  { href: '/tools/research',    label: 'Research' },
  { href: '/tools/workspace',   label: 'Workspace' },
];

const MORE_TOOLS = [
  { href: '/tools/backtest', label: 'Backtest' },
  { href: '/tools/options-flow', label: 'Options Flow' },
  { href: '/tools/options-terminal', label: 'Options Terminal' },
  { href: '/tools/crypto-dashboard', label: 'Crypto Derivatives' },
  { href: '/tools/scalper', label: 'Scalper' },
  { href: '/tools/time-scanner', label: 'Time Scanner' },
  { href: '/tools/volatility-engine', label: 'Volatility Engine' },
  { href: '/compliance-hub', label: 'Compliance Hub' },
];

export default function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const { isLoggedIn, isLoading: tierLoading, tier } = useUserTier();
  const isAppRoute = pathname.startsWith('/tools') || pathname.startsWith('/operator');

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;

    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || !focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="sticky top-0 z-[100] w-full border-b border-slate-700/80 bg-slate-950/85 backdrop-blur">
      <div className={`mx-auto flex max-w-none items-center justify-between ${isAppRoute ? 'h-12 px-3' : 'h-14 px-4'}`}>

        {/* Logo */}
        <Link href={isLoggedIn ? '/tools/dashboard' : '/'} className="flex items-center gap-2 text-xl font-semibold tracking-tight text-teal-300 flex-shrink-0 mr-4">
          <img src="/logos/msp-logo.png" alt="MarketScannerPros" className="h-8 w-8 object-contain" />
          <span className="msp-full-name">MarketScannerPros</span>
          <span className="msp-short-name">MSP</span>
        </Link>

        {/* ── Desktop Nav (md+) ── */}
        <nav className="msp-desktop-nav items-center gap-1 flex-1 text-sm">
          {/* 7 Surface buttons — always visible */}
          {SURFACES.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${
                isActive(s.href)
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                  : 'text-slate-400 hover:text-teal-300 hover:bg-slate-800/60'
              }`}
            >
              {s.label}
            </Link>
          ))}

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <Link href="/pricing" className="text-xs text-slate-400 hover:text-teal-300 px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Pricing</Link>
            {isLoggedIn && (
              <Link href="/tools/referrals" className="text-xs text-slate-400 hover:text-teal-300 px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Referrals</Link>
            )}
            <Link href="/compliance-hub" className="text-xs text-slate-400 hover:text-teal-300 px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Compliance</Link>
            <NotificationBell compact={isAppRoute} />
            {isLoggedIn && (
              <Link href="/account" className="text-xs text-slate-400 hover:text-teal-300 px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors whitespace-nowrap">Account</Link>
            )}
            {!tierLoading && isLoggedIn && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-teal-500/10 border border-slate-700 text-teal-300">
                {tier === 'pro_trader' ? 'Pro Trader' : tier === 'pro' ? 'Pro' : 'Free'}
              </span>
            )}
            {isLoggedIn ? (
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                  window.location.replace('/');
                }}
                className="ml-1 px-2 py-1 text-xs border border-slate-700 rounded-lg text-red-300/80 hover:text-red-300 hover:bg-red-500/10 whitespace-nowrap transition-all"
              >
                Sign Out
              </button>
            ) : (
              <Link href="/auth" className="ml-1 bg-teal-500/20 hover:bg-teal-500/30 border border-slate-700 rounded-lg text-teal-300 font-medium px-4 py-1.5 text-xs whitespace-nowrap transition-all">Sign In</Link>
            )}
          </div>
        </nav>

        {/* ── Mobile Hamburger (below md) ── */}
        <div className="msp-mobile-nav items-center gap-2 ml-auto">
          {isLoggedIn && !tierLoading && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-teal-500/10 border border-slate-700 text-teal-300">
              {tier === 'pro_trader' ? 'Pro Trader' : tier === 'pro' ? 'Pro' : 'Free'}
            </span>
          )}
          <button
            ref={menuButtonRef}
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col gap-1.5 p-2"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="msp-mobile-menu"
          >
            <span className="block h-0.5 w-6 bg-teal-300 rounded" />
            <span className="block h-0.5 w-6 bg-teal-300 rounded" />
            <span className="block h-0.5 w-6 bg-teal-300 rounded" />
          </button>
        </div>
      </div>

      {/* ── Mobile Overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-[200] md:hidden backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      {/* ── Mobile Drawer ── */}
      <div
        id="msp-mobile-menu"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className={`fixed top-0 right-0 h-[100dvh] w-[min(300px,85vw)] bg-[#111C2D] z-[201] transform transition-transform duration-300 ease-in-out md:hidden border-l border-slate-700/90 shadow-2xl ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          {/* Drawer header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/90">
            <span className="text-lg font-semibold text-teal-300">Menu</span>
            <button onClick={() => { setDrawerOpen(false); menuButtonRef.current?.focus(); }} className="text-2xl text-teal-300 hover:text-teal-400 transition-colors p-1" aria-label="Close menu">&times;</button>
          </div>

          {/* Drawer body — same 7 surfaces always shown */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-0.5">
              {SURFACES.map(s => (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive(s.href)
                      ? 'bg-teal-500/15 text-teal-300'
                      : 'text-white hover:bg-teal-500/10 hover:text-teal-300'
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>

            {/* Supporting links */}
            <div className="mt-4 pt-4 border-t border-slate-700 flex flex-col gap-0.5">
              <div className="px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">More tools</div>
              {MORE_TOOLS.map(s => (
                <Link key={s.href} href={s.href} onClick={() => setDrawerOpen(false)} className="flex items-center px-4 py-2.5 text-sm text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all">
                  {s.label}
                </Link>
              ))}
            </div>

            {/* Supporting links */}
            <div className="mt-4 pt-4 border-t border-slate-700 flex flex-col gap-0.5">
              <Link href="/pricing" onClick={() => setDrawerOpen(false)} className="flex items-center px-4 py-3 text-sm text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all">Pricing</Link>
              {isLoggedIn && (
                <>
                  <Link href="/tools/referrals" onClick={() => setDrawerOpen(false)} className="flex items-center px-4 py-3 text-sm text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all">Referrals</Link>
                  <Link href="/account" onClick={() => setDrawerOpen(false)} className="flex items-center px-4 py-3 text-sm text-white hover:bg-teal-500/10 hover:text-teal-300 rounded-lg transition-all">Account</Link>
                </>
              )}
            </div>

            {/* Sign In / Sign Out */}
            <div className="mt-4 pt-4 border-t border-slate-700/90">
              {isLoggedIn ? (
                <button
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                    window.location.replace('/');
                  }}
                  className="flex items-center justify-center w-full px-4 py-3 border border-red-400/30 rounded-lg text-red-300 font-medium hover:bg-red-500/10 transition-all"
                >
                  Sign Out
                </button>
              ) : (
                <Link href="/auth" onClick={() => setDrawerOpen(false)} className="flex items-center justify-center px-4 py-3 bg-teal-500/20 hover:bg-teal-500/30 border border-slate-700 rounded-lg text-teal-300 font-medium transition-all">Sign In</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
