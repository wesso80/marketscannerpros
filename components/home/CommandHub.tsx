'use client';

import Link from 'next/link';
import Hero from './Hero';
import SocialProof from './SocialProof';
import WhyMSP from './WhyMSP';


/* ─── Featured scanners (big tiles) ─── */
const featuredTools = [
  {
    href: '/v2/scanner',
    icon: '📊',
    image: '/assets/scanners/multi-market-scanner.png',
    title: 'Market Scanner',
    description: 'Scan equities, crypto, and forex with structured filters across all markets.',
    gradient: 'from-emerald-500/20 to-emerald-900/10',
    border: 'border-emerald-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,.35)]',
  },
  {
    href: '/v2/golden-egg',
    icon: '🥚',
    image: '/assets/scanners/golden-egg.png',
    title: 'Golden Egg',
    description: 'Deep conviction scoring with evidence layering and narrative alignment.',
    gradient: 'from-amber-500/20 to-amber-900/10',
    border: 'border-amber-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,.35)]',
  },
];

/* ─── v2 Platform surfaces ─── */
const v2Surfaces = [
  {
    href: '/v2/dashboard',
    icon: '🧭',
    image: '/assets/platform-tools/operator-dashboard.png',
    title: 'Command Center',
    description: 'Unified dashboard with market overview, regime context, and real-time signal flow.',
    gradient: 'from-emerald-500/20 to-emerald-900/10',
    border: 'border-emerald-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,.35)]',
  },
  {
    href: '/v2/terminal',
    icon: '💹',
    image: '/assets/platform-tools/crypto-command.png',
    title: 'Terminal',
    description: 'Advanced charting, session analysis, and multi-asset execution surface.',
    gradient: 'from-cyan-500/20 to-cyan-900/10',
    border: 'border-cyan-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,.35)]',
  },
  {
    href: '/v2/explorer',
    icon: '🔍',
    image: '/assets/platform-tools/equity-explorer.png',
    title: 'Market Explorer',
    description: 'Deep-dive into any asset with fundamentals, technicals, and on-chain data.',
    gradient: 'from-violet-500/20 to-violet-900/10',
    border: 'border-violet-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,.35)]',
  },
  {
    href: '/v2/research',
    icon: '📰',
    image: '/assets/platform-tools/news-sentiment.png',
    title: 'Research',
    description: 'News, sentiment, macro data, earnings, and commodities in one research hub.',
    gradient: 'from-blue-500/20 to-blue-900/10',
    border: 'border-blue-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,.35)]',
  },
  {
    href: '/v2/workspace',
    icon: '📋',
    image: '/assets/platform-tools/portfolio.png',
    title: 'Workspace',
    description: 'Watchlists, journal, portfolio, alerts, and settings — all in one place.',
    gradient: 'from-rose-500/20 to-rose-900/10',
    border: 'border-rose-500/30',
    glow: 'hover:shadow-[0_0_20px_rgba(244,63,94,.35)]',
  },
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

      {/* ─── Referral Promo ─── */}
      <section className="border-b border-white/5 bg-gradient-to-r from-emerald-950/30 via-slate-950/60 to-emerald-950/30">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-5 text-center sm:flex-row sm:justify-center sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎁</span>
            <span className="text-sm font-semibold text-emerald-400 sm:text-base">
              Refer a Friend, Get $20 Off
            </span>
          </div>
          <span className="text-xs text-slate-400 sm:text-sm">
            Share your link — you both save $20 on your next month.
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

      {/* ─── Stats Bar ─── */}
      <SocialProof />

      {/* ─── Core Scanners ─── */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-4 pt-12 md:px-6">
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
            href="/v2/scanner"
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
