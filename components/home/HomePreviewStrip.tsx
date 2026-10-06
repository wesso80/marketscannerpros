import Image from 'next/image';
import Link from 'next/link';

/**
 * HomePreviewStrip
 * --------------------------------------------------------------
 * Dated production screenshots of the Scanner and Symbol pages,
 * captured signed-out. Captions use the Sydney capture date.
 */

const CAPTION = "Real screenshot, taken 7 Oct 2026. Open the tool for today's market.";

const previews = [
  {
    href: '/tools/scanner',
    src: '/home/scanner-2026-10-07.webp',
    width: 1200,
    height: 563,
    alt: 'The Scanner page: preset choices, Quick scan and Pro scanner, and a one-symbol scan for AAPL, SPY, BTC and NVDA.',
    ring: 'focus-visible:ring-emerald-400/60',
    border: 'border-emerald-500/20',
  },
  {
    href: '/tools/golden-egg',
    src: '/home/golden-egg-2026-10-07.webp',
    width: 1200,
    height: 477,
    alt: 'The Symbol page for AAPL as a signed-out visitor: the research snapshot line and the public panel covering regime, indicators, scenario levels and volatility context.',
    ring: 'focus-visible:ring-amber-400/60',
    border: 'border-amber-500/20',
  },
] as const;

export default function HomePreviewStrip() {
  return (
    <section className="border-b border-white/5 bg-gradient-to-b from-slate-950/80 to-slate-950/40">
      <div className="mx-auto max-w-7xl px-4 py-1.5 md:py-8">
        <div className="mb-1.5 md:mb-5">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Inside the platform</h2>
          <p className="mt-1 text-sm text-slate-400">
            What the two main tools look like. Open them for real markets.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 md:gap-4">
          {previews.map((preview) => (
            <Link
              key={preview.href}
              href={preview.href}
              className={`block h-full min-w-0 rounded-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 ${preview.ring}`}
            >
              <Image
                src={preview.src}
                alt={preview.alt}
                width={preview.width}
                height={preview.height}
                sizes="(min-width: 768px) 50vw, 100vw"
                loading="lazy"
                className={`h-auto w-full max-w-full rounded-xl border ${preview.border}`}
                style={{ width: '100%', height: 'auto' }}
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-300">{CAPTION}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
