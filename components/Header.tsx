'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>
<nav className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-emerald-300/90">
  <Link href="/tools/scanner" className="hover:text-emerald-300">Scanner</Link>
  <Link href="/tools/portfolio" className="hover:text-emerald-300">Portfolio</Link>
  <Link href="/tools/alerts" className="hover:text-emerald-300">Alerts</Link>
  <Link href="/tools/backtest" className="hover:text-emerald-300">Backtest</Link>
  <Link href="/tools/journal" className="hover:text-emerald-300">Journal</Link>
  <Link href="/tools/ai-analyst" className="hover:text-emerald-300">AI Analyst</Link>
  <Link href="/tools/gainers-losers" className="hover:text-emerald-300">Gainers</Link>
  <Link href="/tools/company-overview" className="hover:text-emerald-300">Overview</Link>
  <Link href="/tools/news" className="hover:text-emerald-300">News</Link>
  <Link href="/tradingview-scripts" className="hover:text-emerald-300">Scripts</Link>
  <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
</nav>

      </div>
    </header>
  );
}
