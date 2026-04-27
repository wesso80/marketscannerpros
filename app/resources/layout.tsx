import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resources',
  description: 'Educational MarketScanner Pros resources, platform guides, and workflow notes for structured market research.',
  alternates: { canonical: '/resources' },
  openGraph: {
    title: 'MarketScanner Pros Resources',
    description: 'Educational platform guides and market research workflow resources.',
    url: 'https://marketscannerpros.app/resources',
    siteName: 'MarketScanner Pros',
    images: [{ url: '/scan-banner.png', width: 1200, height: 630, alt: 'MarketScanner Pros resources' }],
  },
  twitter: { card: 'summary_large_image', images: ['/scan-banner.png'] },
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-20 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-56 h-[820px] w-[820px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-white/60">MSP Adaptive Trader Personality Layer (read-only)</div>
            <div className="text-xs text-emerald-300">54% Adaptive Confidence</div>
          </div>
        </div>

        {children}
      </div>
    </main>
  );
}
