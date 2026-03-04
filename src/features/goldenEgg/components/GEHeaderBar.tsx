import GETag from '@/src/features/goldenEgg/components/shared/GETag';

export default function GEHeaderBar() {
  return (
    <div className="border-b border-white/5 bg-slate-950/80">
      <div className="mx-auto w-full max-w-none px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg overflow-hidden"><img src="/assets/scanners/golden-egg.png" alt="" className="h-full w-full object-contain p-0.5" /></div>
          <h1 className="min-w-0 text-xl font-semibold text-slate-100">Market Edge Analyzer</h1>
          <GETag tone="amber" text="Powered by Golden Egg™" />
        </div>
        <p className="mt-1 text-sm text-slate-300">One search. Full context → setup → execution permission.</p>
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-300 md:grid-cols-3">
          <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-1">Context: regime, bias, volatility, liquidity</div>
          <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-1">Setup: structure + confluence score</div>
          <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-1">Execution: permission + trigger + invalidation</div>
        </div>
      </div>
    </div>
  );
}
