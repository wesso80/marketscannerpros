'use client';

const pillars = [
  {
    icon: (
      <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: 'Speed',
    description: 'Scan thousands of assets in seconds. Multi-market filters deliver results before the move happens.',
  },
  {
    icon: (
      <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    title: 'Confluence',
    description: 'Multi-timeframe alignment detection. Find setups where time, price, and structure converge for higher-probability trades.',
  },
  {
    icon: (
      <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
    title: 'AI Intelligence',
    description: 'ARCxA engine processes institutional signals, options flow, and sentiment — surfacing actionable trade ideas automatically.',
  },
];

export default function WhyMSP() {
  return (
    <section className="border-b border-white/5">
      <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <h2 className="mb-2 text-center text-2xl font-bold text-white md:text-3xl">
          Why Traders Choose MarketScannerPros
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm text-slate-400">
          Built for traders who need speed, confluence, and intelligence — not noise.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="flex flex-col items-center rounded-xl border border-slate-700/50 bg-slate-900/40 p-6 text-center transition-all hover:border-emerald-500/30 hover:bg-slate-900/60"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
                {p.icon}
              </div>
              <h3 className="mb-2 text-lg font-bold text-white">{p.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
