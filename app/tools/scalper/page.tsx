'use client';

import { useUserTier, canAccessScalper } from '@/lib/useUserTier';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

/**
 * No stored last scalper result exists. Session storage, the database and the
 * bar cache do not hold a checked result with a bar time, source and levels.
 * This page does not run a scan.
 */
export default function ScalperPage() {
  const { tier, isLoading: tierLoading, isLoggedIn } = useUserTier();
  const canAccess = canAccessScalper(tier);

  if (tierLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="text-center bg-[#1E293B] border border-slate-700/50 rounded-xl p-8 max-w-md">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Sign In Required</h2>
          <p className="text-slate-400 text-sm mb-4">Please sign in to access the Scalping Scanner.</p>
          <a href="/auth?next=/tools/scalper" className="inline-block px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">Sign In →</a>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="text-center bg-[#1E293B] border border-slate-700/50 rounded-xl p-8 max-w-md">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Scalping Scanner</h2>
          <p className="text-slate-400 text-sm mb-4">This tool requires the <strong className="text-emerald-300">Pro</strong> plan.</p>
          <a href="/pricing" className="inline-block px-5 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ backgroundColor: '#10B98122', color: 'var(--msp-bull)', border: '1px solid #10B98144' }}>Upgrade to Pro →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-[var(--msp-text)]">
      <section
        className="mx-auto max-w-3xl space-y-4 px-4 py-6"
        aria-label="Scalper command header"
      >
        <div>
          <h1 className="text-2xl font-semibold">Scalper</h1>
          <p className="mt-1 text-sm text-[var(--msp-text-muted)]">
            Short-timeframe research for crypto and equities.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/tools/golden-egg"
            className="inline-flex min-h-10 items-center rounded-lg border border-[var(--msp-border)] px-4 text-sm hover:text-[var(--msp-accent)]"
          >
            Open Symbol
          </a>
          <a
            href="/tools/terminal"
            className="inline-flex min-h-10 items-center rounded-lg border border-[var(--msp-border)] px-4 text-sm hover:text-[var(--msp-accent)]"
          >
            Open Terminal
          </a>
        </div>
        <p
          role="status"
          data-scalper-unavailable
          className="rounded-lg border border-[var(--msp-warn)] bg-[var(--msp-warn-tint)] px-4 py-4 text-sm text-[var(--msp-text)]"
        >
          Live scalping scan not available yet. Coming soon.
        </p>
        <ComplianceDisclaimer variant="intraday" />
      </section>
    </div>
  );
}
