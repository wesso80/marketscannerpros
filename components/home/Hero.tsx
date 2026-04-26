'use client';

import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-[var(--msp-bg)] to-[var(--msp-bg)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)]" />
      {/* Top accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-14 pt-16 text-center md:pb-20 md:pt-24">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Structured research across crypto, equities, options &amp; commodities
        </div>

        {/* H1 */}
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
          See The Market{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            With Clarity
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg md:text-xl">
          Educational market analysis, confluence detection,
          options flow and AI research context in one platform.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400 active:bg-emerald-500"
          >
            Start Free Trial
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/tools/scanner"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/50 px-6 py-3.5 text-base font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Try the Scanner
          </Link>
        </div>

        {/* Platform preview image */}
        <div className="relative mx-auto mt-12 w-full max-w-4xl">
          <div className="relative overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/30">
            <img
              src="/logos/landing-hero.png"
              alt="MarketScannerPros platform — multi-asset scanner, confluence detection, and AI analysis dashboard"
              className="w-full"
              loading="eager"
            />
            <div className="absolute inset-0 rounded-lg border border-white/5" />
          </div>
        </div>

        {/* Data provider logos */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
            Trusted Market Data Providers
          </p>
          <div className="flex items-center gap-8 sm:gap-10">
            {/* NASDAQ */}
            <a
              href="https://www.nasdaq.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100"
              title="NASDAQ"
            >
              <img src="/logos/nasdaq-logo.png" alt="NASDAQ" width={28} height={28} className="rounded" />
              <span className="text-sm font-semibold text-slate-400">NASDAQ</span>
            </a>

            {/* CoinGecko */}
            <a
              href="https://www.coingecko.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100"
              title="CoinGecko"
            >
              <img src="/logos/coingecko-logo.png" alt="CoinGecko" width={28} height={28} className="rounded" />
              <span className="text-sm font-semibold text-slate-400">CoinGecko</span>
            </a>

            {/* Alpha Vantage */}
            <a
              href="https://www.alphavantage.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100"
              title="Alpha Vantage"
            >
              <img src="/logos/alphavantage-logo.png" alt="Alpha Vantage" width={28} height={28} className="rounded" />
              <span className="text-sm font-semibold text-slate-400">Alpha Vantage</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
