'use client';

import Link from 'next/link';

const footerLinks = [
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/guide', label: 'Guide' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookie-policy', label: 'Cookies' },
];

const socialLinks = [
  {
    href: 'https://x.com/Marketscans1980',
    label: 'Follow us on X',
    icon: (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: 'https://www.instagram.com/marketscannerpros',
    label: 'Follow us on Instagram',
    icon: (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    href: 'https://www.youtube.com/@MarketScannerPros',
    label: 'Subscribe on YouTube',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

export default function Footer() {
  const openCookieSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('msp-consent');
      window.location.reload();
    }
  };

  return (
    <footer className="mt-8 border-t border-[var(--msp-border)] bg-[var(--msp-bg)] text-[var(--msp-text)]">
      <div className="border-b border-[var(--msp-border)] bg-[var(--msp-warn-tint)] px-4 py-4 text-center">
        <p className="mx-auto max-w-[900px] text-[13px] leading-relaxed text-[var(--msp-text-muted)]">
          <strong className="text-[var(--msp-warn)]">Important:</strong> MarketScanner Pros provides general information only and does not hold an Australian Financial Services Licence (AFSL). Nothing on this platform is financial, investment, or trading advice, nor does it consider your personal objectives, financial situation, or needs. Past performance does not guarantee future results. Trading involves substantial risk of loss. Consult a licensed financial advisor before making investment decisions.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[var(--msp-content-max)] flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 py-4 text-sm text-[var(--msp-text-muted)]">
        {footerLinks.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-md px-1 py-0.5 no-underline transition-colors hover:text-[var(--msp-accent)]">
            {link.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={openCookieSettings}
          className="rounded-md px-1 py-0.5 text-inherit underline decoration-white/20 underline-offset-4 transition-colors hover:text-[var(--msp-accent)]"
        >
          Cookie Settings
        </button>
        <a href="mailto:support@marketscannerpros.app" className="rounded-md px-1 py-0.5 no-underline transition-colors hover:text-[var(--msp-accent)]">Contact</a>
        <span className="hidden h-4 w-px bg-white/10 sm:inline-block" aria-hidden="true" />
        <div className="flex items-center gap-2">
          {socialLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[var(--msp-text-muted)] transition-colors hover:border-[var(--msp-border-strong)] hover:bg-white/[0.03] hover:text-[var(--msp-accent)]"
              aria-label={link.label}
              title={link.label}
            >
              {link.icon}
            </a>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.04] px-4 py-3 text-center text-[11px] text-[var(--msp-text-faint)]">
        Market data powered by CoinGecko and Alpha Vantage
      </div>

      <div className="px-4 pb-4 text-center text-xs text-[var(--msp-text-faint)]">
        <Link href="/privacy#ccpa" className="no-underline transition-colors hover:text-[var(--msp-accent)]">
          Do Not Sell My Personal Information
        </Link>
      </div>
    </footer>
  );
}
