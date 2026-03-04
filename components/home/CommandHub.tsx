'use client';

import Link from 'next/link';
import { useContext } from 'react';

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
    title: 'Multi-Market Scanner',
    description: 'Scan equities, crypto, and forex with structured filters across all markets.',
    gradient: 'from-emerald-500/20 to-emerald-900/10',
    border: 'border-emerald-500/30',
    glow: 'hover:shadow-emerald-500/10',
  },
  {
    href: '/tools/options-confluence',
    icon: '🎯',
    title: 'Options Confluence Scanner',
    description: 'Strike and expiry recommendations with flow, structure, and Greeks context.',
    gradient: 'from-violet-500/20 to-violet-900/10',
    border: 'border-violet-500/30',
    glow: 'hover:shadow-violet-500/10',
  },
  {
    href: '/tools/confluence-scanner',
    icon: '🔮',
    title: 'Time Confluence Scanner',
    description: 'Detect multi-timeframe decompression events and 50% magnet windows.',
    gradient: 'from-cyan-500/20 to-cyan-900/10',
    border: 'border-cyan-500/30',
    glow: 'hover:shadow-cyan-500/10',
  },
  {
    href: '/tools/golden-egg',
    icon: '🥚',
    title: 'Golden Egg',
    description: 'Deep conviction scoring with evidence layering and narrative alignment.',
    gradient: 'from-amber-500/20 to-amber-900/10',
    border: 'border-amber-500/30',
    glow: 'hover:shadow-amber-500/10',
  },
];

/* ─── Secondary tools (small tiles) ─── */
const secondaryTools = [
  { href: '/operator', icon: '🧭', title: 'Operator Dashboard', description: 'Unified execution surface for signal flow and risk command.' },
  { href: '/tools/markets', icon: '🗺️', title: 'Markets Dashboard', description: 'Central hub for all market data, indices, and sector overview.' },
  { href: '/tools/crypto', icon: '₿', title: 'Crypto Command Center', description: 'Full crypto dashboard with prices, dominance, and market structure.' },
  { href: '/tools/gainers-losers', icon: '🚀', title: 'Top Gainers & Losers', description: 'Track strongest movers, laggards, and active symbols.' },
  { href: '/tools/company-overview', icon: '🏢', title: 'Company Overview', description: 'Fundamentals, valuation, growth, and analyst context.' },
  { href: '/tools/news', icon: '📰', title: 'News & Sentiment', description: 'Headline flow and sentiment intelligence by symbol.' },
  { href: '/tools/heatmap', icon: '🗺️', title: 'Sector Heatmap', description: 'S&P sector rotation view across key time horizons.' },
  { href: '/tools/crypto-heatmap', icon: '🪙', title: 'Crypto Heatmap', description: 'Visual leadership map for major crypto assets.' },
  { href: '/tools/crypto-dashboard', icon: '₿', title: 'Crypto Derivatives', description: 'Funding, OI, and derivatives pressure diagnostics.' },
  { href: '/tools/commodities', icon: '🛢️', title: 'Commodities', description: 'Energy, metals, and agriculture price dashboard.' },
  { href: '/tools/market-movers', icon: '📈', title: 'Market Movers', description: 'Institutional watchlist of high-impact daily movers.' },
  { href: '/tools/macro', icon: '🏛️', title: 'Macro Dashboard', description: 'Rates, inflation, employment, and macro regime data.' },
  { href: '/tools/crypto-explorer', icon: '🔍', title: 'Crypto Explorer', description: 'Deep-dive into any crypto asset with technicals and on-chain metrics.' },
  { href: '/tools/equity-explorer', icon: '📊', title: 'Equity Explorer', description: 'Full equity analysis with fundamentals, technicals, and ownership data.' },
  { href: '/tools/options-terminal', icon: '📋', title: 'Options Terminal', description: 'Options chain viewer with Greeks, IV skew, and flow analysis.' },
  { href: '/tools/news?tab=earnings', icon: '📅', title: 'Earnings Calendar', description: 'Event-risk map for upcoming earnings windows.' },
  { href: '/tools/intraday-charts', icon: '⏱️', title: 'Intraday Charts', description: 'Fast intraday charting and session-level views.' },
  { href: '/tools/ai-analyst', icon: '🧠', title: 'AI Analyst', description: 'Structured AI decision support for active workflows.' },
  { href: '/tools/backtest', icon: '📈', title: 'Backtest', description: 'Validate strategy logic against historical data.' },
  { href: '/tools/portfolio', icon: '💼', title: 'Portfolio', description: 'Position tracking with P&L and performance snapshots.' },
  { href: '/tools/journal', icon: '📓', title: 'Trade Journal', description: 'Log, review, and learn from every trade.' },
  { href: '/tools/alerts', icon: '🔔', title: 'Alerts', description: 'Custom triggers and notification management.' },
  { href: '/tools/watchlists', icon: '👁️', title: 'Watchlists', description: 'Track symbols across your workspace.' },
];

/* ─── Featured tile component ─── */
function FeaturedTile({
  href,
  icon,
  title,
  description,
  gradient,
  border,
  glow,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  gradient: string;
  border: string;
  glow: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border ${border} bg-gradient-to-br ${gradient} p-6 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl ${glow}`}
      style={{ minHeight: 200 }}
    >
      <div>
        <div className="text-4xl">{icon}</div>
        <h3 className="mt-4 text-xl font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
      </div>
      <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/70 transition group-hover:text-white">
        Open Scanner <span className="transition-transform group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}

/* ─── Small tile component ─── */
function SmallTile({
  href,
  icon,
  title,
  description,
  locked,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 transition-all duration-150 hover:border-slate-600 hover:bg-slate-900/70"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-950/50 text-xl">
        {icon}
      </div>
      <div className="min-w-0">
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
  const lockSensitiveTools = new Set([
    '/operator',
    '/tools/scanner',
    '/tools/watchlists',
    '/tools/portfolio',
    '/tools/backtest',
    '/tools/journal',
    '/tools/alerts',
  ]);

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      {/* ─── Cinematic Hero ─── */}
      <section className="relative w-full overflow-hidden border-b border-white/5">
        {/* Ambient glow effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.06] blur-[120px]" />
          <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-cyan-500/[0.04] blur-[100px]" />
        </div>
        {/* Top accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-8 px-5 pb-12 pt-12 md:flex-row md:gap-12 md:pb-16 md:pt-16 lg:gap-16">
          {/* Left column: Copy */}
          <div className="flex-1 text-center md:text-left">
            <div className="mb-6 text-xl font-bold tracking-tight text-white md:text-2xl">
              Market<span className="text-emerald-400">Scanner</span>Pros
            </div>

            <h1 className="mb-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-6xl">
              See The Market<br />
              <span className="text-emerald-400">Before It Moves</span>
            </h1>

            <p className="mx-auto mb-2 max-w-lg text-base leading-relaxed text-slate-400 md:mx-0 md:text-lg">
              Institutional-grade scanning, confluence detection,
              options flow and AI market intelligence —<br />
              all in one platform.
            </p>

            <p className="mx-auto mb-8 max-w-lg text-sm text-slate-500 md:mx-0">
              Scan 10,000+ assets across crypto, equities, options and commodities
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap justify-center gap-4 md:justify-start">
              <Link
                href="/tools/scanner"
                className="inline-flex items-center rounded-lg bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400"
              >
                Start Scanning
              </Link>
              <Link
                href="/tools/markets"
                className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-900/50 px-7 py-3.5 text-[15px] font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/60"
              >
                Explore Platform
              </Link>
            </div>

            {/* Trusted Data Providers */}
            <div className="mt-10">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
                Trusted Market Data Providers
              </p>
              <div className="flex flex-wrap items-center justify-center gap-6 md:justify-start">
                <div className="flex items-center gap-2 opacity-70">
                  <svg viewBox="0 0 120 28" className="h-5 w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.2 2L10.8 8.4V2H5.4v24h5.4V14.4L16.2 26h6.6l-7.2-12L22.8 2h-6.6z" fill="#fff"/>
                    <text x="30" y="21" fill="#fff" fontSize="18" fontWeight="700" fontFamily="system-ui,sans-serif">NASDAQ</text>
                  </svg>
                </div>
                <div className="flex items-center gap-1.5 opacity-70">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="12" fill="#8DC63F"/>
                    <circle cx="9" cy="10" r="2.5" fill="#fff"/>
                    <circle cx="9" cy="10" r="1.2" fill="#222"/>
                  </svg>
                  <span className="text-sm font-semibold text-slate-300">CoinGecko</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-70">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="4" fill="#1A1A2E"/>
                    <path d="M12 4l8 16H4L12 4z" fill="#E94560" opacity="0.9"/>
                    <path d="M12 8l5 10H7L12 8z" fill="#0F3460"/>
                  </svg>
                  <span className="text-sm font-semibold text-slate-300">Alpha Vantage</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-70">
                  <img src="/logos/arcxa-chip.png" alt="ARCxA" className="h-5 w-5 rounded-sm" />
                  <span className="text-sm font-semibold text-red-400">ARCxA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Hero Image */}
          <div className="relative flex-1">
            <div className="relative">
              <div className="pointer-events-none absolute -inset-4 rounded-2xl bg-gradient-to-br from-cyan-500/10 via-transparent to-emerald-500/10 blur-2xl" />
              <img
                src="/logos/landing-hero.png"
                alt="MarketScannerPros Platform"
                className="relative w-full max-w-[560px] rounded-xl shadow-2xl shadow-black/50"
                style={{ aspectRatio: '16/10', objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── ARCxA Intelligence Engine ─── */}
      <section className="relative overflow-hidden border-b border-white/5">
        {/* Red radial glow behind chip */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/[0.07] blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-10 text-center md:py-14">
          {/* Chip icon */}
          <div className="relative mb-5">
            <div className="absolute -inset-4 animate-pulse rounded-full bg-red-500/10 blur-xl" />
            <img
              src="/logos/arcxa-chip.png"
              alt="ARCxA Intelligence Engine"
              className="relative h-24 w-auto rounded-lg drop-shadow-[0_0_30px_rgba(239,68,68,0.5)] md:h-32"
            />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            <span className="text-red-400">ARCxA</span> Intelligence Engine
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400 md:text-base">
            The AI processing core behind MarketScannerPros.<br />
            Multi-asset analysis · Multi-timeframe confluence · Institutional signal detection.
          </p>

          {/* Architecture diagram */}
          <div className="mt-8 w-full max-w-lg">
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">Time Engine</span>
              <span className="text-slate-600">│</span>
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">Options Flow</span>
              <span className="text-slate-600">│</span>
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">Market Scanner</span>
              <span className="text-slate-600">│</span>
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">AI Analyst</span>
            </div>
            <div className="mx-auto mt-2 h-4 w-px bg-gradient-to-b from-slate-600 to-transparent" />
            <div className="mx-auto mt-0 flex items-center justify-center">
              <span className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[11px] font-bold tracking-wide text-red-400">
                Institutional Decision Engine
              </span>
            </div>
          </div>

          <Link
            href="/tools/options-confluence"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
          >
            Explore the AI Engine <span>→</span>
          </Link>
        </div>
      </section>

      {/* ─── Content ─── */}
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 pb-16 pt-8 md:px-6">
        {/* Featured Scanners — 4 big tiles */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Core Scanners</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredTools.map((tool) => (
              <FeaturedTile key={tool.href} {...tool} />
            ))}
          </div>
        </section>

        {/* All other tools — smaller tiles */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Platform Tools</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {secondaryTools.map((tool) => (
              <SmallTile
                key={tool.href}
                {...tool}
                locked={riskLocked && lockSensitiveTools.has(tool.href)}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
