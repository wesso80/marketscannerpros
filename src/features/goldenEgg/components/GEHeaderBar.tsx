import GETag from '@/src/features/goldenEgg/components/shared/GETag';

export default function GEHeaderBar() {
  return (
    <div className="border-b border-white/5 bg-slate-950/80">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-100">Market Edge Analyzer</h1>
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
