'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70 border-b border-neutral-800">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl md:text-2xl font-bold">
          MarketScanner<span className="text-emerald-400">Pros</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/blog" className="hover:text-emerald-400">Blog</Link>
          <Link href="/user-guide" className="hover:text-emerald-400">User Guide</Link>
          <Link href="/pricing" className="hover:text-emerald-400">Pricing</Link>
          <Link href="/contact" className="hover:text-emerald-400">Contact</Link>
          <Link href="/dashboard" className="hover:text-emerald-400">Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}
