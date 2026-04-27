'use client';

const stats = [
  { value: 'Multi-asset', label: 'Equities, crypto, options, commodities' },
  { value: 'Regime-aware', label: 'Context before signal' },
  { value: 'Data quality', label: 'Stale/degraded inputs flagged' },
  { value: 'Workflow-first', label: 'Scan → validate → test → track' },
];

export default function SocialProof() {
  return (
    <section className="border-b border-white/5 bg-slate-950/60">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-6 px-4 py-5 sm:gap-10 md:gap-14">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-sm font-bold text-emerald-400 sm:text-base md:text-lg">
              {s.value}
            </span>
            <span className="max-w-32 text-[10px] font-medium leading-snug text-slate-500 sm:text-[11px]">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
