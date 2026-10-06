"use client";

import Link from 'next/link';
import Image from 'next/image';
import { trackEvent } from '@/lib/analytics';
import { useUserTier } from '@/lib/useUserTier';

export default function Hero() {
  const { isLoggedIn, isLoading } = useUserTier();
  // Render the signed-out version until the session check finishes.
  const signedIn = !isLoading && isLoggedIn;
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[var(--msp-bg)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-emerald-950/10" />
      {/* Top accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-8 pt-8 text-center md:pb-16 md:pt-20">
        {/* Badge */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Educational research workflow
        </div>

        {/* H1 */}
        <h1 className="mx-auto max-w-4xl !text-[1.375rem] font-extrabold leading-tight tracking-tight text-white sm:!text-4xl md:!text-5xl">
          Check the market in{' '}
          <span className="text-emerald-400">one path</span>
          : regime, a clear Symbol verdict with reasons, and data you can check.
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-slate-400 sm:text-lg md:text-xl">
          Educational market research for equities, crypto and options. No brokerage execution. No financial advice.
        </p>

        {/* CTAs */}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          {signedIn ? (
          <Link
            href="/tools/command-center"
            onClick={() => trackEvent('open_dashboard', { location: 'home_hero', destination: '/tools/command-center' })}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400 active:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            Open Today
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          ) : (
          <Link
            href="/auth"
            onClick={() => trackEvent('cta_get_started', { location: 'home_hero', destination: '/auth' })}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400 active:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            Start Free — No Card
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          )}
          <Link
            href="/tools/scanner"
            onClick={() => trackEvent('open_scanner', { location: 'home_hero', destination: '/tools/scanner' })}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/50 px-6 py-3.5 text-base font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Open the Scanner
          </Link>
        </div>

        {/* Data provider logos */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
            Market data sources, not endorsements
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-10">
            {/* NASDAQ */}
            <a
              href="https://www.nasdaq.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60 rounded"
              title="NASDAQ"
            >
              <Image src="/logos/nasdaq-logo.png" alt="NASDAQ" width={28} height={28} className="rounded" />
              <span className="text-sm font-semibold text-slate-400">NASDAQ</span>
            </a>

            {/* CoinGecko */}
            <a
              href="https://www.coingecko.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60 rounded"
              title="CoinGecko"
            >
              <Image src="/logos/coingecko-logo.png" alt="CoinGecko" width={28} height={28} className="rounded" />
              <span className="text-sm font-semibold text-slate-400">CoinGecko</span>
            </a>

            {/* Alpha Vantage */}
            <a
              href="https://www.alphavantage.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60 rounded"
              title="Alpha Vantage"
            >
              <Image src="/logos/alphavantage-logo.png" alt="Alpha Vantage" width={28} height={28} className="rounded" />
              <span className="text-sm font-semibold text-slate-400">Alpha Vantage</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
