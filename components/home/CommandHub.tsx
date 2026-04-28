'use client';

import Link from 'next/link';
import Hero from './Hero';
import HomePreviewStrip from './HomePreviewStrip';
import SocialProof from './SocialProof';
import WhyMSP from './WhyMSP';


/* ─── Featured scanners (big tiles) ─── */
const featuredTools = [
  {
    href: '/tools/scanner',
    icon: '📊',
    image: '/assets/scanners/multi-market-scanner.png',
    title: 'Market Scanner',
    description: 'Review equities, crypto, and forex with structured filters across all markets.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-emerald-500/30',
    glow: 'hover:border-emerald-500/45',
  },
  {
    href: '/tools/golden-egg',
    icon: '🥚',
    image: '/assets/scanners/golden-egg.png',
    title: 'Golden Egg',
    description: 'Evidence-layered scenario scoring with narrative and data-quality context.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-amber-500/30',
    glow: 'hover:border-amber-500/45',
  },
];

/* ─── v2 Platform surfaces ─── */
const v2Surfaces = [
  {
    href: '/tools/dashboard',
    icon: '🧭',
    image: '/assets/platform-tools/operator-dashboard.png',
    title: 'Command Center',
    description: 'Unified dashboard with market overview, regime context, and live research flow.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-emerald-500/30',
    glow: 'hover:border-emerald-500/45',
  },
  {
    href: '/tools/terminal',
    icon: '💹',
    image: '/assets/platform-tools/crypto-command.png',
    title: 'Terminal',
    description: 'Advanced charting, session analysis, and multi-asset analytical surface.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-cyan-500/30',
    glow: 'hover:border-cyan-500/45',
  },
  {
    href: '/tools/explorer',
    icon: '🔍',
    image: '/assets/platform-tools/equity-explorer.png',
    title: 'Market Explorer',
    description: 'Research assets with fundamentals, technicals, and on-chain data where available.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-violet-500/30',
    glow: 'hover:border-violet-500/45',
  },
  {
    href: '/tools/research',
    icon: '📰',
    image: '/assets/platform-tools/news-sentiment.png',
    title: 'Research',
    description: 'News, sentiment, macro data, earnings, and commodities in one research hub.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-blue-500/30',
    glow: 'hover:border-blue-500/45',
  },
  {
    href: '/tools/workspace',
    icon: '📋',
    image: '/assets/platform-tools/portfolio.png',
    title: 'Workspace',
    description: 'Watchlists, journal, portfolio, alerts, and settings — all in one place.',
    gradient: 'from-slate-800/70 to-slate-950/40',
    border: 'border-rose-500/30',
    glow: 'hover:border-rose-500/45',
  },
];

const valueStack = [
  { label: 'Scan faster', detail: 'Rank equities, crypto, forex, and options context with one research workflow.' },
  { label: 'Verify context', detail: 'Combine regime, volatility, flow, news, and data-quality warnings before review.' },
  { label: 'Test safely', detail: 'Use backtests, paper simulation, journal analytics, and scenario notes before real-world decisions.' },
  { label: 'Track your edge', detail: 'Sync watchlists, alerts, journal, and portfolio research across devices.' },
];

const guidedPaths = [
  { goal: 'Find new market scenarios', href: '/tools/scanner', tool: 'Market Scanner', detail: 'Ranked research candidates and Pro Scanner filters.' },
  { goal: 'Analyse one symbol deeply', href: '/tools/golden-egg', tool: 'Golden Egg', detail: 'Multi-factor scenario packet with data-quality context.' },
  { goal: 'Review options flow', href: '/tools/options-flow', tool: 'Options Flow', detail: 'Large-flow estimates, IV skew, and chain context.' },
  { goal: 'Test a strategy', href: '/tools/backtest', tool: 'Backtest', detail: 'Historical paper simulation with overfitting warnings.' },
  { goal: 'Track process and outcomes', href: '/tools/workspace', tool: 'Workspace', detail: 'Journal, portfolio, watchlists, and alerts.' },
  { goal: 'Study crypto derivatives', href: '/tools/crypto-dashboard', tool: 'Crypto Dashboard', detail: 'Funding, OI, liquidations, and long/short context.' },
];

/* ─── Featured tile component ─── */
function FeaturedTile({
  href,
  image,
  title,
  description,
  gradient,
  border,
  glow,
}: {
  href: string;
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
      className={`group relative flex flex-col overflow-hidden rounded-lg border ${border} bg-slate-950/40 transition-colors duration-200 ${glow}`}
    >
      {/* Image hero */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-950/40">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-contain object-center p-1"
        />
      </div>
      {/* Content */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{description}</p>
        </div>
        <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/70 transition group-hover:text-white">
          Explore <span className="transition-transform group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}

/* ─── Main Component ─── */
export default function CommandHub() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      {/* ─── Coded Hero ─── */}
      <Hero />

      {/* ─── Guided workflow chooser ─── */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-10 md:px-6">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 md:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">Start with the workflow</p>
              <h2 className="mt-1 text-2xl font-bold text-white">Find, validate, test, then track.</h2>
            </div>
            <Link href="/tools" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">Open workflow map →</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {guidedPaths.map((path) => (
              <Link key={path.href} href={path.href} className="group rounded-xl border border-white/10 bg-slate-950/50 p-4 transition hover:border-emerald-500/40 hover:bg-slate-900/80">
                <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">I want to</div>
                <div className="mt-1 text-sm font-extrabold text-white">{path.goal}</div>
                <div className="mt-2 text-xs font-bold text-emerald-300">Use {path.tool}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{path.detail}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Inside the platform (UI preview, sample data) ─── */}
      <HomePreviewStrip />

      {/* ─── Stats Bar ─── */}
      <SocialProof />

      {/* ─── 30-second value stack ─── */}
      <section className="border-y border-white/5 bg-slate-950/60">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">30-second value stack</p>
              <h2 className="mt-1 text-2xl font-bold text-white">What MSP helps you do</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-slate-400">
              MarketScanner Pros is an educational research cockpit: no broker execution, no personal advice, just faster structure, cleaner evidence, and better review loops.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {valueStack.map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm font-extrabold text-white">{item.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Core Scanners ─── */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-4 pt-10 md:px-6">
        <section>
          <h2 className="mb-6 text-2xl font-bold text-white">Core Scanners</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-10 text-center md:py-14">
          <div className="relative mb-4">
            <img
              src="/logos/arcxa-chip.png"
              alt="ARCxA Intelligence Engine"
              className="relative h-16 w-auto rounded-lg md:h-20"
              loading="lazy"
            />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Powered by <span className="text-emerald-400">ARCxA</span>
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400 md:text-base">
            ARCxA helps organize scanner, regime, volatility, flow, and market-structure
            context into educational research summaries — a copilot for review, not a trade oracle.
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
            href="/tools/scanner"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 hover:text-emerald-300"
          >
            Explore the AI Engine <span>→</span>
          </Link>
        </div>
      </section>

      {/* ─── v2 Platform Surfaces ─── */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-10 md:px-6">
        <section>
          <h2 className="mb-6 text-2xl font-bold text-white">Platform</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {v2Surfaces.map((surface) => (
              <FeaturedTile key={surface.href} {...surface} />
            ))}
          </div>
        </section>
      </div>

      {/* ─── Referral Promo ─── */}
      <section className="border-t border-white/5 bg-slate-950/70">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-5 text-center sm:flex-row sm:justify-center sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-emerald-400 sm:text-base">
              Refer a Friend, Save on Your Plan
            </span>
          </div>
          <span className="text-xs text-slate-400 sm:text-sm">
            Share your link — your friend saves $5–$10 and you earn credit too.
          </span>
          <Link
            href="/tools/referrals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 hover:border-emerald-500/50 sm:text-sm"
          >
            Learn More
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="border-t border-white/5 bg-slate-950/80">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-14 text-center md:py-20">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Ready to explore the markets?
          </h2>
          <p className="mt-3 text-sm text-slate-400 md:text-base">
            Use structured market research to review technically aligned scenarios faster.
          </p>
          <Link
            href="/pricing"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400 active:bg-emerald-500"
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
