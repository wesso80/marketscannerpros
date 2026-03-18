'use client';

import Link from "next/link";

export default function Hero() {
  return (
    <>
      <style jsx global>{`
        :root {
          --bg: #05070b;
          --bg-alt: #0c1018;
          --card: #111624;
          --accent: var(--msp-accent);
          --accent-soft: rgba(20, 184, 166, 0.12);
          --text-main: #f9fafb;
          --text-muted: #9ca3af;
          --border-subtle: #1f2933;
          --radius-lg: 18px;
          --radius-md: 12px;
          --shadow-soft: var(--msp-shadow);
          --shadow-small: var(--msp-shadow);
        }
      `}</style>

      {/* ─── Cinematic Hero ─── */}
      <section className="relative w-full overflow-hidden" style={{ background: 'var(--msp-bg)', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Ambient glow effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.06] blur-[120px]" />
          <div className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full bg-cyan-500/[0.04] blur-[100px]" />
        </div>
        {/* Top accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-8 px-5 pb-12 pt-12 md:flex-row md:gap-12 md:pb-16 md:pt-16 lg:gap-16">
          {/* ─── Left column: Copy ─── */}
          <div className="flex-1 text-center md:text-left">
            {/* Logo wordmark */}
            <div className="mb-6 text-xl font-bold tracking-tight text-white md:text-2xl">
              Market<span className="text-emerald-400">Scanner</span>Pros
            </div>

            <h1 className="mb-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-6xl">
              Scan The Market<br />
              <span className="text-emerald-400">With Clarity</span>
            </h1>

            <p className="mx-auto mb-2 max-w-lg text-base leading-relaxed text-slate-400 md:mx-0 md:text-lg">
              Professional-level scanning, confluence detection,
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
                className="inline-flex items-center rounded-lg bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 hover:shadow-emerald-400/30"
              >
                Start Scanning
              </Link>
              <Link
                href="/pricing"
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
                {/* Nasdaq */}
                <div className="flex items-center gap-2 opacity-70">
                  <svg viewBox="0 0 120 28" className="h-5 w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.2 2L10.8 8.4V2H5.4v24h5.4V14.4L16.2 26h6.6l-7.2-12L22.8 2h-6.6z" fill="#fff"/>
                    <text x="30" y="21" fill="#fff" fontSize="18" fontWeight="700" fontFamily="system-ui,sans-serif">NASDAQ</text>
                  </svg>
                </div>
                {/* CoinGecko */}
                <div className="flex items-center gap-1.5 opacity-70">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="12" fill="#8DC63F"/>
                    <circle cx="9" cy="10" r="2.5" fill="#fff"/>
                    <circle cx="9" cy="10" r="1.2" fill="#222"/>
                  </svg>
                  <span className="text-sm font-semibold text-slate-300">CoinGecko</span>
                </div>
                {/* Alpha Vantage */}
                <div className="flex items-center gap-1.5 opacity-70">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="4" fill="#1A1A2E"/>
                    <path d="M12 4l8 16H4L12 4z" fill="#E94560" opacity="0.9"/>
                    <path d="M12 8l5 10H7L12 8z" fill="#0F3460"/>
                  </svg>
                  <span className="text-sm font-semibold text-slate-300">Alpha Vantage</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Right column: Hero Image ─── */}
          <div className="relative flex-1">
            <div className="relative">
              {/* Glow behind image */}
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
    </>
  );
}
