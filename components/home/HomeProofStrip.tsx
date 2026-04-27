import Link from 'next/link';

const proofShots = [
  {
    href: '/tools/scanner',
    image: '/marketing/hero-top.png',
    eyebrow: 'Scan',
    title: 'Market Scanner',
    description:
      'Rank scenarios across equities, crypto, and forex with structured technical filters and ranked candidates.',
  },
  {
    href: '/tools/golden-egg',
    image: '/marketing/tradingview-confluence.png',
    eyebrow: 'Validate',
    title: 'Confluence view',
    description:
      'Review multi-timeframe alignment, key levels, and data-quality context before deeper research.',
  },
  {
    href: '/tools/dashboard',
    image: '/dashboard-screenshot.png',
    eyebrow: 'Track',
    title: 'Command Center',
    description:
      'See market regime, watchlists, journal notes, and research flow in a single educational dashboard.',
  },
];

export default function HomeProofStrip() {
  return (
    <section className="border-b border-white/5 bg-slate-950/70">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-6 flex flex-col gap-2 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">
              What you see inside
            </p>
            <h2 className="mt-1 text-2xl font-bold text-white md:text-3xl">
              Real research surfaces, not just marketing
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate-400">
            A quick look at the scanner, confluence view, and command center used for educational
            market research.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {proofShots.map((shot) => (
            <Link
              key={shot.href}
              href={shot.href}
              className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 transition hover:border-emerald-500/40 hover:bg-slate-900/70"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
                <img
                  src={shot.image}
                  alt={`${shot.title} preview`}
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.02]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                <span className="absolute left-3 top-3 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                  {shot.eyebrow}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-base font-bold text-white">{shot.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{shot.description}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 transition group-hover:text-emerald-200">
                  See it in the platform
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          Educational research only. No broker execution, no personal financial advice.
        </p>
      </div>
    </section>
  );
}
