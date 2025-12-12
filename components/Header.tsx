'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>
<nav className="flex items-center gap-3 md:gap-6 text-sm md:text-base text-emerald-300/90">
  <Link href="/tools/scanner" className="hover:text-emerald-300">Scanner</Link>
  <Link href="/tools/portfolio" className="hover:text-emerald-300">Portfolio</Link>
  <Link href="/tools/alerts" className="hover:text-emerald-300">Alerts</Link>
  <Link href="/tools/backtest" className="hover:text-emerald-300">Backtest</Link>
  <Link href="/tools/journal" className="hover:text-emerald-300">Journal</Link>
  <Link href="/tools/ai-analyst" className="hover:text-emerald-300">AI Analyst</Link>
  <Link href="/blog" className="hidden md:block hover:text-emerald-300">Blog</Link>
  <Link href="/tradingview-scripts" className="hidden md:block hover:text-emerald-300">TradingView</Link>
  <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
</nav>

      </div>
    </header>
  );
}
