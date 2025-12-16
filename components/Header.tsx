'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>

        {/* Desktop Navigation - Hidden on mobile */}
        <nav className="hidden lg:flex items-center gap-2 xl:gap-4 text-xs xl:text-sm text-emerald-300/90">
          <Link href="/tools/scanner" className="hover:text-emerald-300">Scanner</Link>
          <Link href="/tools/portfolio" className="hover:text-emerald-300">Portfolio</Link>
          <Link href="/tools/backtest" className="hover:text-emerald-300">Backtest</Link>
          <Link href="/tools/journal" className="hover:text-emerald-300">Journal</Link>
          <Link href="/tools/ai-tools" className="hover:text-emerald-300">AI Tools</Link>
          <Link href="/tools/ai-analyst" className="hover:text-emerald-300">AI Analyst</Link>
          <Link href="/tools/gainers-losers" className="hover:text-emerald-300">Gainers</Link>
          <Link href="/tools/company-overview" className="hover:text-emerald-300">Overview</Link>
          <Link href="/tools/news" className="hover:text-emerald-300">News</Link>
          <Link href="/tradingview-scripts" className="hover:text-emerald-300">Scripts</Link>
          <Link href="/partners" className="hover:text-emerald-300">Partners</Link>
          <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="lg:hidden flex flex-col gap-1 p-2"
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-5 bg-emerald-300 transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <span className={`block h-0.5 w-5 bg-emerald-300 transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-5 bg-emerald-300 transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div className={`
        fixed top-0 right-0 h-full w-64 bg-neutral-900 z-50 
        transform transition-transform duration-300 ease-in-out
        lg:hidden border-l border-neutral-800
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="flex flex-col p-6 gap-3">
          <button 
            onClick={() => setIsOpen(false)}
            className="self-end text-2xl text-emerald-300"
          >
            ✕
          </button>
          <Link href="/tools/scanner" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Scanner</Link>
          <Link href="/tools/portfolio" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Portfolio</Link>
          <Link href="/tools/backtest" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Backtest</Link>
          <Link href="/tools/journal" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Journal</Link>
          <Link href="/tools/ai-tools" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>AI Tools</Link>
          <Link href="/tools/ai-analyst" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>AI Analyst</Link>
          <Link href="/tools/gainers-losers" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Gainers & Losers</Link>
          <Link href="/tools/company-overview" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Company Overview</Link>
          <Link href="/tools/news" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>News</Link>
          <Link href="/tradingview-scripts" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>TradingView Scripts</Link>
          <Link href="/partners" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Partners</Link>
          <Link href="/pricing" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Pricing</Link>
        </div>
      </div>
    </header>
  );
}
