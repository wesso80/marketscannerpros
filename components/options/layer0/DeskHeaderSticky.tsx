import { DeskHeaderModel } from '@/types/optionsScanner';

type DeskHeaderStickyProps = {
  header: DeskHeaderModel;
};

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xs text-slate-100">{value}</div>
    </div>
  );
}

export default function DeskHeaderSticky({ header }: DeskHeaderStickyProps) {
  return (
    <div className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className="mx-auto grid w-full max-w-none grid-cols-1 gap-2 px-4 py-2 md:grid-cols-12">
        <div className="md:col-span-4 flex items-center gap-2">
          <Pill label="Symbol" value={header.symbol} />
          <Pill label="Price" value={header.underlyingPrice.toFixed(2)} />
          <Pill label="Session" value={header.sessionLabel || 'regular'} />
        </div>
        <div className="md:col-span-5 flex flex-wrap gap-2">
          <Pill label="Regime" value={header.regime.marketRegime} />
          <Pill label="Volatility" value={header.regime.volatility} />
          <Pill label="Liquidity" value={header.regime.liquidity} />
        </div>
        <div className="md:col-span-3 flex flex-wrap justify-start gap-2 md:justify-end">
          <Pill label="Integrity" value={header.feed.integrity} />
          <Pill label="Latency" value={header.feed.latencySec == null ? 'N/A' : `${header.feed.latencySec}s`} />
          <Pill label="Feed" value={header.feed.feedStatus} />
        </div>
      </div>
    </div>
  );
}
