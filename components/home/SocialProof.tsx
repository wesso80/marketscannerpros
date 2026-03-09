'use client';

const stats = [
  { value: '10,000+', label: 'Assets Scanned' },
  { value: '4', label: 'Market Classes' },
  { value: '24/7', label: 'Crypto Monitoring' },
  { value: '<30s', label: 'Full Scan Speed' },
];

export default function SocialProof() {
  return (
    <section className="border-b border-white/5 bg-slate-950/60">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-6 px-4 py-5 sm:gap-10 md:gap-14">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-lg font-bold text-emerald-400 sm:text-xl md:text-2xl">
              {s.value}
            </span>
            <span className="text-[11px] font-medium text-slate-500 sm:text-xs">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
