'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-emerald-300/90">
          <Link href="/blog">Blog</Link>
          <Link href="/guide">User Guide</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>

        <nav className="flex md:hidden items-center gap-4 text-emerald-300/90">
          <Link href="/blog">Blog</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
      </div>
    </header>
  );
}
