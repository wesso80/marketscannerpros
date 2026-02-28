'use client';

import Link from 'next/link';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';

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
  { href: '/tools/gainers-losers', icon: '🚀', title: 'Top Gainers & Losers', description: 'Track strongest movers, laggards, and active symbols.' },
  { href: '/tools/company-overview', icon: '🏢', title: 'Company Overview', description: 'Fundamentals, valuation, growth, and analyst context.' },
  { href: '/tools/news', icon: '📰', title: 'News & Sentiment', description: 'Headline flow and sentiment intelligence by symbol.' },
  { href: '/tools/heatmap', icon: '🗺️', title: 'Sector Heatmap', description: 'S&P sector rotation view across key time horizons.' },
  { href: '/tools/crypto-heatmap', icon: '🪙', title: 'Crypto Heatmap', description: 'Visual leadership map for major crypto assets.' },
  { href: '/tools/crypto-dashboard', icon: '₿', title: 'Crypto Derivatives', description: 'Funding, OI, and derivatives pressure diagnostics.' },
  { href: '/tools/commodities', icon: '🛢️', title: 'Commodities', description: 'Energy, metals, and agriculture price dashboard.' },
  { href: '/tools/market-movers', icon: '📈', title: 'Market Movers', description: 'Institutional watchlist of high-impact daily movers.' },
  { href: '/tools/macro', icon: '🏛️', title: 'Macro Dashboard', description: 'Rates, inflation, employment, and macro regime data.' },
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
  const { isLocked: riskLocked } = useRiskPermission();
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
      {/* ─── Hero Logo ─── */}
      <section className="relative overflow-hidden border-b border-white/5">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent" />

        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pb-8 pt-10 text-center md:pb-10 md:pt-14">
          <div className="flex items-center gap-4">
            <img
              src="/logos/msp-logo.png"
              alt="MarketScannerPros"
              className="h-14 w-14 object-contain drop-shadow-lg md:h-20 md:w-20"
            />
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
              Market<span className="text-emerald-400">Scanner</span>Pros
            </h1>
          </div>
          <p className="mt-3 max-w-xl text-sm text-slate-400 md:text-base">
            Institutional-grade scanning, confluence detection, and execution workflow — all in one platform.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/tools/markets"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500"
            >
              Open Markets Dashboard
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-600 bg-slate-900/60 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Workspace
            </Link>
            <Link
              href="/tools/settings"
              className="rounded-lg border border-slate-600 bg-slate-900/60 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Settings
            </Link>
          </div>
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
