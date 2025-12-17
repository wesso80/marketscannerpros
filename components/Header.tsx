'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300 flex-shrink-0 mr-6">
          MarketScannerPros
        </Link>

        {/* Desktop Navigation - Always visible on desktop */}
        <nav className="flex items-center gap-4 lg:gap-5 text-sm text-emerald-300/90 max-md:hidden">
          <Link href="/tools/scanner" className="hover:text-emerald-300 whitespace-nowrap">Scanner</Link>
          <Link href="/tools/portfolio" className="hover:text-emerald-300 whitespace-nowrap">Portfolio</Link>
          <Link href="/tools/backtest" className="hover:text-emerald-300 whitespace-nowrap">Backtest</Link>
          <Link href="/tools/journal" className="hover:text-emerald-300 whitespace-nowrap">Journal</Link>
          <Link href="/tools/ai-tools" className="hover:text-emerald-300 whitespace-nowrap">AI Tools</Link>
          <Link href="/tools/ai-analyst" className="hover:text-emerald-300 whitespace-nowrap">AI Analyst</Link>
          <Link href="/tools/gainers-losers" className="hover:text-emerald-300 whitespace-nowrap">Gainers</Link>
          <Link href="/tools/company-overview" className="hover:text-emerald-300 whitespace-nowrap">Overview</Link>
          <Link href="/tools/news" className="hover:text-emerald-300 whitespace-nowrap">News</Link>
          <Link href="/tradingview-scripts" className="hover:text-emerald-300 whitespace-nowrap">Scripts</Link>
          <Link href="/partners" className="hover:text-emerald-300 whitespace-nowrap">Partners</Link>
          <Link href="/pricing" className="hover:text-emerald-300 whitespace-nowrap">Pricing</Link>
        </nav>

        {/* Mobile Hamburger Button - Only on mobile */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-col gap-1.5 p-2 flex-shrink-0 md:hidden"
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-6 bg-emerald-300 transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block h-0.5 w-6 bg-emerald-300 transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-6 bg-emerald-300 transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div className={`
        fixed top-0 right-0 h-[100dvh] w-72 bg-[#0F172A] z-50 
        transform transition-transform duration-300 ease-in-out
        md:hidden border-l border-emerald-300/20 shadow-2xl
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="flex flex-col h-full min-h-0 overscroll-contain">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-emerald-300/20 flex-shrink-0">
            <span className="text-lg font-semibold text-emerald-300">Menu</span>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-3xl text-emerald-300 hover:text-emerald-400 transition-colors"
            >
              ✕
            </button>
          </div>
          
          {/* Links - Scrollable area */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="flex flex-col gap-1">
              <Link href="/tools/scanner" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Scanner</Link>
              <Link href="/tools/portfolio" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Portfolio</Link>
              <Link href="/tools/backtest" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Backtest</Link>
              <Link href="/tools/journal" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Trade Journal</Link>
              <Link href="/tools/ai-tools" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>AI Tools</Link>
              <Link href="/tools/ai-analyst" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>AI Analyst</Link>
              <Link href="/tools/gainers-losers" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Gainers & Losers</Link>
              <Link href="/tools/company-overview" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Company Overview</Link>
              <Link href="/tools/news" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Market News</Link>
              <Link href="/tradingview-scripts" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>TradingView Scripts</Link>
              <Link href="/partners" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Partners</Link>
              <Link href="/pricing" className="px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>Pricing</Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
