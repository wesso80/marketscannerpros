'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>

        <nav className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-emerald-300/90">
          {/* Products Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setOpenDropdown('products')}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button className="hover:text-emerald-300">Products ▾</button>
            {openDropdown === 'products' && (
              <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-white/10 bg-black/90 backdrop-blur shadow-lg">
                <Link href="/tools/scanner" className="block px-4 py-2 text-sm hover:bg-white/5">Market Scanner</Link>
                <Link href="/tools/backtest" className="block px-4 py-2 text-sm hover:bg-white/5">Backtesting</Link>
                <Link href="/tools/gainers-losers" className="block px-4 py-2 text-sm hover:bg-white/5">Options Flow</Link>
                <Link href="/tools/portfolio" className="block px-4 py-2 text-sm hover:bg-white/5">Portfolio</Link>
                <Link href="/tools/journal" className="block px-4 py-2 text-sm hover:bg-white/5">Trade Journal</Link>
              </div>
            )}
          </div>

          {/* Tools Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setOpenDropdown('tools')}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button className="hover:text-emerald-300">Tools ▾</button>
            {openDropdown === 'tools' && (
              <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-white/10 bg-black/90 backdrop-blur shadow-lg">
                <Link href="/tools/ai-analyst" className="block px-4 py-2 text-sm hover:bg-white/5">AI Analyst</Link>
                <Link href="/tools/ai-tools" className="block px-4 py-2 text-sm hover:bg-white/5">Signal Explainer</Link>
                <Link href="/tools/commodities" className="block px-4 py-2 text-sm hover:bg-white/5">XRP Dashboard</Link>
                <Link href="/tools/news" className="block px-4 py-2 text-sm hover:bg-white/5">News</Link>
              </div>
            )}
          </div>

          {/* Solutions Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setOpenDropdown('solutions')}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button className="hover:text-emerald-300">Solutions ▾</button>
            {openDropdown === 'solutions' && (
              <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-white/10 bg-black/90 backdrop-blur shadow-lg">
                <Link href="/tradingview-scripts" className="block px-4 py-2 text-sm hover:bg-white/5">TradingView Scripts</Link>
              </div>
            )}
          </div>

          <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
        </nav>
      </div>
    </header>
  );
}
