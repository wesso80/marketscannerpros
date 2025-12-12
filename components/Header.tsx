'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [showToolsMenu, setShowToolsMenu] = useState(false);

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
  
  {/* Tools Dropdown */}
  <div 
    className="relative"
    onMouseEnter={() => setShowToolsMenu(true)}
    onMouseLeave={() => setShowToolsMenu(false)}
  >
    <button className="hover:text-emerald-300 flex items-center gap-1">
      More <span className="text-xs">▼</span>
    </button>
    {showToolsMenu && (
      <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-emerald-500/30 rounded-lg shadow-xl">
        <Link href="/tools/gainers-losers" className="block px-4 py-2 hover:bg-emerald-500/10 hover:text-emerald-300">
          📊 Gainers & Losers
        </Link>
        <Link href="/tools/company-overview" className="block px-4 py-2 hover:bg-emerald-500/10 hover:text-emerald-300">
          🏢 Company Overview
        </Link>
        <Link href="/tools/news" className="block px-4 py-2 hover:bg-emerald-500/10 hover:text-emerald-300">
          📰 News & Sentiments
        </Link>
      </div>
    )}
  </div>
  
  <Link href="/blog" className="hidden md:block hover:text-emerald-300">Blog</Link>
  <Link href="/tradingview-scripts" className="hidden md:block hover:text-emerald-300">TradingView</Link>
  <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
</nav>

      </div>
    </header>
  );
}
