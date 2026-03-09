'use client';

import Link from 'next/link';
import { useState } from 'react';
import Hero from './Hero';
import SocialProof from './SocialProof';
import WhyMSP from './WhyMSP';

// Safe import — avoid throwing during static prerender when provider is absent
function useSafeRiskLocked(): boolean {
  try {
    // Dynamic require to avoid hard import crash during SSR
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useRiskPermission } = require('@/components/risk/RiskPermissionContext');
    const ctx = useRiskPermission();
    return ctx?.isLocked ?? false;
  } catch {
    return false;
  }
}

/* ─── Featured scanners (big tiles) ─── */
const featuredTools = [
  {
    href: '/tools/scanner',
    icon: '📊',
    image: '/assets/scanners/multi-market-scanner.png',
    title: 'Multi-Market Scanner',
    description: 'Scan equities, crypto, and forex with structured filters across all markets.',
    gradient: 'from-emerald-500/20 to-emerald-900/10',
    border: 'border-emerald-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,.35)]',
  },
  {
    href: '/tools/options-confluence',
    icon: '🎯',
    image: '/assets/scanners/options-confluence.png',
    title: 'Options Confluence Scanner',
    description: 'Strike and expiry recommendations with flow, structure, and Greeks context.',
    gradient: 'from-violet-500/20 to-violet-900/10',
    border: 'border-violet-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,.35)]',
  },
  {
    href: '/tools/confluence-scanner',
    icon: '🔮',
    image: '/assets/scanners/time-confluence.png',
    title: 'Time Confluence Scanner',
    description: 'Detect multi-timeframe decompression events and 50% magnet windows.',
    gradient: 'from-cyan-500/20 to-cyan-900/10',
    border: 'border-cyan-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,.35)]',
  },
  {
    href: '/tools/golden-egg',
    icon: '🥚',
    image: '/assets/scanners/golden-egg.png',
    title: 'Golden Egg',
    description: 'Deep conviction scoring with evidence layering and narrative alignment.',
    gradient: 'from-amber-500/20 to-amber-900/10',
    border: 'border-amber-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,.35)]',
  },
];

/* ─── Secondary tools (small tiles) ─── */
const secondaryTools = [
  { href: '/operator', icon: '🧭', image: '/assets/platform-tools/operator-dashboard.png', title: 'Operator Dashboard', description: 'Unified execution surface for signal flow and risk command.' },
  { href: '/tools/markets', icon: '🗺️', image: '/assets/platform-tools/markets-dashboard.png', title: 'Markets Dashboard', description: 'Central hub for all market data, indices, and sector overview.' },
  { href: '/tools/crypto', icon: '₿', image: '/assets/platform-tools/crypto-command.png', title: 'Crypto Command Center', description: 'Full crypto dashboard with prices, dominance, and market structure.' },
  { href: '/tools/gainers-losers', icon: '🚀', image: '/assets/platform-tools/top-gainers.png', title: 'Top Gainers & Losers', description: 'Track strongest movers, laggards, and active symbols.' },
  { href: '/tools/company-overview', icon: '🏢', image: '/assets/platform-tools/company-overview.png', title: 'Company Overview', description: 'Fundamentals, valuation, growth, and analyst context.' },
  { href: '/tools/news', icon: '📰', image: '/assets/platform-tools/news-sentiment.png', title: 'News & Sentiment', description: 'Headline flow and sentiment intelligence by symbol.' },
  { href: '/tools/heatmap', icon: '🗺️', image: '/assets/platform-tools/sector-heatmap.png', title: 'Sector Heatmap', description: 'S&P sector rotation view across key time horizons.' },
  { href: '/tools/crypto-heatmap', icon: '🪙', image: '/assets/platform-tools/crypto-heatmap.png', title: 'Crypto Heatmap', description: 'Visual leadership map for major crypto assets.' },
  { href: '/tools/crypto-dashboard', icon: '₿', image: '/assets/platform-tools/crypto-derivatives.png', title: 'Crypto Derivatives', description: 'Funding, OI, and derivatives pressure diagnostics.' },
  { href: '/tools/commodities', icon: '🛢️', image: '/assets/platform-tools/commodities.png', title: 'Commodities', description: 'Energy, metals, and agriculture price dashboard.' },
  { href: '/tools/market-movers', icon: '📈', image: '/assets/platform-tools/market-movers.png', title: 'Market Movers', description: 'Institutional watchlist of high-impact daily movers.' },
  { href: '/tools/macro', icon: '🏛️', image: '/assets/platform-tools/macro-dashboard.png', title: 'Macro Dashboard', description: 'Rates, inflation, employment, and macro regime data.' },
  { href: '/tools/crypto-explorer', icon: '🔍', image: '/assets/platform-tools/crypto-explorer.png', title: 'Crypto Explorer', description: 'Deep-dive into any crypto asset with technicals and on-chain metrics.' },
  { href: '/tools/equity-explorer', icon: '📊', image: '/assets/platform-tools/equity-explorer.png', title: 'Equity Explorer', description: 'Full equity analysis with fundamentals, technicals, and ownership data.' },
  { href: '/tools/options-terminal', icon: '📋', image: '/assets/platform-tools/options-terminal.png', title: 'Options Terminal', description: 'Options chain viewer with Greeks, IV skew, and flow analysis.' },
  { href: '/tools/news?tab=earnings', icon: '📅', image: '/assets/platform-tools/earnings-calendar.png', title: 'Earnings Calendar', description: 'Event-risk map for upcoming earnings windows.' },
  { href: '/tools/intraday-charts', icon: '⏱️', image: '/assets/platform-tools/intraday-charts.png', title: 'Intraday Charts', description: 'Fast intraday charting and session-level views.' },
  { href: '/tools/backtest', icon: '📈', image: '/assets/platform-tools/backtest.png', title: 'Backtest', description: 'Validate strategy logic against historical data.' },
  { href: '/tools/portfolio', icon: '💼', image: '/assets/platform-tools/portfolio.png', title: 'Portfolio', description: 'Position tracking with P&L and performance snapshots.' },
  { href: '/tools/journal', icon: '📓', image: '/assets/platform-tools/trade-journal.png', title: 'Trade Journal', description: 'Log, review, and learn from every trade.' },
  { href: '/tools/alerts', icon: '🔔', image: '/assets/platform-tools/alerts.png', title: 'Alerts', description: 'Custom triggers and notification management.' },
  { href: '/tools/watchlists', icon: '👁️', image: '/assets/platform-tools/watchlists.png', title: 'Watchlists', description: 'Track symbols across your workspace.' },
];

/* ─── Featured tile component ─── */
function FeaturedTile({
  href,
  icon,
  image,
  title,
  description,
  gradient,
  border,
  glow,
}: {
  href: string;
  icon: string;
  image: string;
  title: string;
  description: string;
  gradient: string;
  border: string;
  glow: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border ${border} bg-gradient-to-br ${gradient} transition-all duration-200 hover:scale-[1.02] hover:shadow-xl ${glow}`}
    >
      {/* Image hero */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-950/40">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-contain object-center p-1 transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
      </div>
      {/* Content */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{description}</p>
        </div>
        <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/70 transition group-hover:text-white">
          Open Scanner <span className="transition-transform group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}

/* ─── Small tile component ─── */
function SmallTile({
  href,
  icon,
  image,
  title,
  description,
  locked,
}: {
  href: string;
  icon: string;
  image?: string;
  title: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40 transition-all duration-150 hover:border-slate-600 hover:bg-slate-900/70 hover:shadow-[0_0_15px_rgba(16,185,129,.15)]"
    >
      {/* Image thumbnail */}
      <div className="relative h-36 w-full overflow-hidden bg-slate-950/50">
        <img
          src={image || ''}
          alt={title}
          className="h-full w-full object-contain object-center p-1 transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            // Hide broken image and show emoji fallback
            (e.target as HTMLImageElement).style.display = 'none';
            const fallback = (e.target as HTMLImageElement).nextElementSibling;
            if (fallback) (fallback as HTMLElement).style.display = 'flex';
          }}
        />
        <div
          className="absolute inset-0 items-center justify-center text-3xl"
          style={{ display: 'none' }}
        >
          {icon}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>
      {/* Content */}
      <div className="p-3">
        <div className="text-sm font-semibold text-slate-100">
          {locked ? '🔒 ' : ''}{title}
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{description}</div>
      </div>
    </Link>
  );
}

/* ─── Main Component ─── */
export default function CommandHub() {
  const riskLocked = useSafeRiskLocked();
  const [showAllTools, setShowAllTools] = useState(false);
  const lockSensitiveTools = new Set([
    '/operator',
    '/tools/scanner',
    '/tools/watchlists',
    '/tools/portfolio',
    '/tools/backtest',
    '/tools/journal',
    '/tools/alerts',
  ]);

  const visibleTools = showAllTools ? secondaryTools : secondaryTools.slice(0, 8);

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      {/* ─── Coded Hero ─── */}
      <Hero />

      {/* ─── Stats Bar ─── */}
      <SocialProof />

      {/* ─── Core Scanners ─── */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-4 pt-12 md:px-6">
        <section>
          <h2 className="mb-6 text-2xl font-bold text-white">Core Scanners</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredTools.map((tool) => (
              <FeaturedTile key={tool.href} {...tool} />
            ))}
          </div>
        </section>
      </div>

      {/* ─── Why MSP ─── */}
      <WhyMSP />

      {/* ─── ARCxA Intelligence Engine (rewritten) ─── */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.05] blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-10 text-center md:py-14">
          <div className="relative mb-4">
            <div className="absolute -inset-3 animate-pulse rounded-full bg-emerald-500/10 blur-xl" />
            <img
              src="/logos/arcxa-chip.png"
              alt="ARCxA Intelligence Engine"
              className="relative h-16 w-auto rounded-lg drop-shadow-[0_0_30px_rgba(16,185,129,0.4)] md:h-20"
              loading="lazy"
            />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Powered by <span className="text-emerald-400">ARCxA</span>
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400 md:text-base">
            Our AI engine analyzes 10,000+ assets across multiple timeframes to surface
            high-probability setups — combining institutional signals, options flow,
            and market structure so you don&apos;t have to.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span>Works across</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Equities</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Crypto</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Options</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Forex</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Commodities</span>
          </div>

          <Link
            href="/tools/options-confluence"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 hover:text-emerald-300"
          >
            Explore the AI Engine <span>→</span>
          </Link>
        </div>
      </section>

      {/* ─── Platform Tools (collapsible) ─── */}
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 pb-8 pt-10 md:px-6">
        <section>
          <h2 className="mb-6 text-2xl font-bold text-white">Platform Tools</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {visibleTools.map((tool) => (
              <SmallTile
                key={tool.href}
                {...tool}
                locked={riskLocked && lockSensitiveTools.has(tool.href)}
              />
            ))}
          </div>
          {!showAllTools && secondaryTools.length > 8 && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowAllTools(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
              >
                View All {secondaryTools.length} Tools
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ─── Bottom CTA ─── */}
      <section className="border-t border-white/5 bg-gradient-to-b from-slate-950 to-[var(--msp-bg)]">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-14 text-center md:py-20">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Ready to find your edge?
          </h2>
          <p className="mt-3 text-sm text-slate-400 md:text-base">
            Join traders using institutional-grade scanning to find high-probability setups faster.
          </p>
          <Link
            href="/pricing"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            Get Started Free
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="mt-3 text-xs text-slate-500">No credit card required · Free tier available</p>
        </div>
      </section>
    </main>
  );
}
