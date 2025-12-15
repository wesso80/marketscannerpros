'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>

        <nav className="hidden lg:flex flex-row items-center gap-1 text-xs text-emerald-300/90">
          <Link href="/tools/scanner" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Scanner</Link>
          <Link href="/tools/portfolio" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Portfolio</Link>
          <Link href="/tools/backtest" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Backtest</Link>
          <Link href="/tools/journal" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Journal</Link>
          <Link href="/tools/ai-tools" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">AI Tools</Link>
          <Link href="/tools/ai-analyst" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">AI Analyst</Link>
          <Link href="/tools/gainers-losers" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Gainers</Link>
          <Link href="/tools/company-overview" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Overview</Link>
          <Link href="/tools/news" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">News</Link>
          <Link href="/tradingview-scripts" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Scripts</Link>
          <Link href="/partners" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Partners</Link>
          <Link href="/pricing" className="px-2 py-1 hover:text-emerald-300 whitespace-nowrap transition-colors">Pricing</Link>
        </nav>

        {/* Mobile menu button - simplified for now */}
        <div className="lg:hidden">
          <Link href="/tools" className="text-emerald-300 hover:text-emerald-400 text-sm">
            Menu
          </Link>
        </div>
      </div>
    </header>
  );
}
