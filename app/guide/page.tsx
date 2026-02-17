'use client';

import Link from 'next/link';
import { TOOL_GUIDES } from '@/lib/guides/toolGuides';

export default function UserGuidePage() {
  return (
    <div className="min-h-screen bg-msp-bg text-msp-text">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 rounded-panel border border-msp-border bg-msp-card p-6 shadow-msp">
          <div className="mb-2 inline-flex rounded-full border border-msp-borderStrong bg-msp-panel px-3 py-1 text-xs font-semibold text-msp-accent">
            MarketScannerPros User Guide
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Complete Platform Guide</h1>
          <p className="mt-2 text-sm text-msp-text-muted">
            One standardized guide system for every major tool. Each tool page now includes a built-in “How It Works” tab, and this hub provides the full reference.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {TOOL_GUIDES.map((guide) => (
            <article key={guide.route} className="rounded-panel border border-msp-border bg-msp-card p-5 shadow-msp">
              <div className="mb-2 inline-flex rounded-full border border-msp-borderStrong bg-msp-panel px-2.5 py-0.5 text-[11px] font-semibold text-msp-accent">
                {guide.badge}
              </div>
              <h2 className="text-lg font-bold text-msp-text">{guide.title}</h2>
              <p className="mt-1 text-sm text-msp-text-muted">{guide.summary}</p>

              <div className="mt-3 text-sm">
                <div className="mb-1 font-semibold text-msp-text">How to use it</div>
                <ul className="space-y-1 text-msp-text-muted">
                  {guide.steps.map((step, idx) => (
                    <li key={idx}>• {step}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 text-sm">
                <div className="mb-1 font-semibold text-msp-text">Pro tips</div>
                <ul className="space-y-1 text-msp-text-muted">
                  {guide.tips.map((tip, idx) => (
                    <li key={idx}>• {tip}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-4">
                <Link href={guide.route} className="text-sm font-semibold text-msp-accent no-underline">
                  Open Tool →
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-panel border border-msp-border bg-msp-card p-5 shadow-msp">
          <h3 className="text-base font-bold">Deep Dive Guides</h3>
          <p className="mt-1 text-sm text-msp-text-muted">Advanced walkthroughs for specific topics.</p>
          <div className="mt-3">
            <Link href="/guide/open-interest" className="text-sm font-semibold text-msp-accent no-underline">
              How to Read Open Interest →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
