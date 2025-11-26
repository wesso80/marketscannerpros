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
          <Link href="/tools" className="hover:text-emerald-300">Tools</Link>
          <Link href="/blog" className="hover:text-emerald-300">Blog</Link>
          <Link href="/tradingview-scripts" className="hover:text-emerald-300">TradingView</Link>
          <Link href="/guide" className="hover:text-emerald-300">Guide</Link>
          <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
          <Link href="/contact" className="hidden md:block hover:text-emerald-300">Contact</Link>
          <Link href="/dashboard" className="hidden md:block hover:text-emerald-300">Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}
