import Image from 'next/image';
import Link from 'next/link';

/**
 * HomePreviewStrip
 * --------------------------------------------------------------
 * Dated production screenshots of the signed-in Pro Scanner and
 * Symbol pages. Captions use the Sydney capture date.
 */

const CAPTION = "Real screenshot of the Pro view, taken 7 Oct 2026. Open the tool for today's market.";

const previews = [
  {
    href: '/tools/scanner',
    src: '/home/scanner-2026-10-07.webp',
    width: 994,
    height: 452,
    alt: 'Scanner view for stocks: symbols such as LMT, FDX, and BA, with the prices shown on each row',
    sizes: '(max-width: 768px) 100vw, 994px',
    unoptimized: false,
    ring: 'focus-visible:ring-emerald-400/60',
    imageClassName: 'h-auto w-full max-w-full rounded-xl border border-emerald-500/20',
    imageStyle: { width: '100%', height: 'auto' } as const,
  },
  {
    href: '/tools/golden-egg',
    src: '/home/golden-egg-2026-10-07.webp',
    width: 626,
    height: 282,
    alt: 'Symbol page for AAPL: price, 90-day price chart, 20-day average, max pain, and expected move',
    sizes: '(max-width: 768px) 100vw, 626px',
    unoptimized: true,
    ring: 'focus-visible:ring-amber-400/60',
    imageClassName: 'h-auto w-auto max-w-full rounded-xl border border-amber-500/20',
    imageStyle: { width: 'auto', maxWidth: 'min(100%, 626px)', height: 'auto' } as const,
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
                sizes={preview.sizes}
                loading="lazy"
                unoptimized={preview.unoptimized}
                className={preview.imageClassName}
                style={preview.imageStyle}
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-300">{CAPTION}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
