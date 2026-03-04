'use client';

import Link from 'next/link';

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
  { href: '/tools/ai-analyst', icon: '🧠', image: '/assets/platform-tools/ai-analyst.svg', title: 'AI Analyst', description: 'Structured AI decision support for active workflows.' },
  { href: '/tools/backtest', icon: '📈', image: '/assets/platform-tools/backtest.png', title: 'Backtest', description: 'Validate strategy logic against historical data.' },
  { href: '/tools/portfolio', icon: '💼', image: '/assets/platform-tools/portfolio.png', title: 'Portfolio', description: 'Position tracking with P&L and performance snapshots.' },
  { href: '/tools/journal', icon: '📓', image: '/assets/platform-tools/trade-journal.png', title: 'Trade Journal', description: 'Log, review, and learn from every trade.' },
  { href: '/tools/alerts', icon: '🔔', image: '/assets/platform-tools/alerts.svg', title: 'Alerts', description: 'Custom triggers and notification management.' },
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
      <div className="relative h-40 w-full overflow-hidden">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
      <div className="relative h-28 w-full overflow-hidden bg-slate-950/50">
        <img
          src={image || ''}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
      {/* ─── Full-Width Hero Image ─── */}
      <section className="relative w-full border-b border-white/5">
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
        <img
          src="/logos/landing-hero.png"
          alt="MarketScannerPros — See The Market Before It Moves"
          className="mx-auto block w-[85%] rounded-lg"
        />
      </section>

      {/* ─── ARCxA Intelligence Engine ─── */}
      <section className="relative overflow-hidden border-b border-white/5">
        {/* Red radial glow behind chip */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/[0.07] blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-6 text-center md:py-8">
          {/* Chip icon */}
          <div className="relative mb-3">
            <div className="absolute -inset-3 animate-pulse rounded-full bg-red-500/10 blur-xl" />
            <img
              src="/logos/arcxa-chip.png"
              alt="ARCxA Intelligence Engine"
              className="relative h-16 w-auto rounded-lg drop-shadow-[0_0_30px_rgba(239,68,68,0.5)] md:h-20"
            />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
            <span className="text-red-400">ARCxA</span> Intelligence Engine
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-400 md:text-sm">
            The AI processing core behind MarketScannerPros.<br />
            Multi-asset analysis · Multi-timeframe confluence · Institutional signal detection.
          </p>

          {/* Architecture diagram */}
          <div className="mt-5 w-full max-w-lg">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">Time Engine</span>
              <span className="hidden text-slate-600 sm:inline">│</span>
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">Options Flow</span>
              <span className="hidden text-slate-600 sm:inline">│</span>
              <span className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300">Market Scanner</span>
              <span className="hidden text-slate-600 sm:inline">│</span>
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
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
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
