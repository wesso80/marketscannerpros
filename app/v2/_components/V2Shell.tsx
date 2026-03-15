'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Shell Wrapper (Client Component)
   Wraps all v2 pages with V2Provider, TopNav, RegimeBar, and Footer.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useUserTier } from '@/lib/useUserTier';
import { V2Provider } from '../_lib/V2Context';
import TopNav from './TopNav';
import RegimeBar from './RegimeBar';
import Link from 'next/link';

export default function V2Shell({ children }: { children: React.ReactNode }) {
  const { isLoading } = useUserTier();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <V2Provider>
      <div className="min-h-screen bg-[var(--msp-bg)] text-[var(--msp-text)] overflow-x-hidden">
        <TopNav />
        <RegimeBar />
        <main className="px-3 md:px-4 py-4 max-w-none">
          {children}
        </main>
        <footer className="border-t border-[var(--msp-border)] mt-8 py-4 px-6 text-center">
          <div className="text-[10px] text-[var(--msp-text-faint)]">
            MSP v2 Preview — Decision Intelligence Platform
            <span className="mx-2">|</span>
            <Link href="/tools/scanner" className="text-slate-500 hover:text-emerald-400 transition-colors">Back to v1</Link>
          </div>
        </footer>
      </div>
    </V2Provider>
  );
}
