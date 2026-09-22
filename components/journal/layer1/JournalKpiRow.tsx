import { JournalKpisModel } from '@/types/journal';

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${positive ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
      {positive ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

function KpiCard({ label, value, suffix, delta }: { label: string; value: string; suffix?: string; delta?: number }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="text-base font-semibold text-slate-100">{value}{suffix || ''}</div>
        {typeof delta === 'number' && <DeltaBadge value={delta} />}
      </div>
    </div>
  );
}

type JournalKpiRowProps = {
  kpis?: JournalKpisModel;
};

export default function JournalKpiRow({ kpis }: JournalKpiRowProps) {
  const data: JournalKpisModel =
    kpis ||
    {
      equity: null,
      realizedPnl30d: 0,
      unrealizedPnlOpen: 0,
      winRate30d: null,
      profitFactor30d: null,
      maxDrawdown90d: null,
    };

  return (
    <>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-9">
      <KpiCard label="Recorded realized P&L (all time)" value={`$${(data.realizedPnlTotal ?? 0).toFixed(2)}`} />
      <KpiCard label="Realized P&L (30d)" value={`$${data.realizedPnl30d.toFixed(2)}`} delta={data.realizedPnl30d} />
      <KpiCard label="Estimated open P&L" value={data.unrealizedPnlOpen == null ? 'Unavailable' : `$${data.unrealizedPnlOpen.toFixed(2)}`} delta={data.unrealizedPnlOpen ?? undefined} />
      <KpiCard label="Win Rate (30d)" value={data.winRate30d == null ? 'Unavailable' : `${(data.winRate30d * 100).toFixed(1)}%`} />
      <KpiCard label="Profit Factor (30d)" value={data.profitFactor30d == null ? data.profitFactorLabel || 'Unavailable' : data.profitFactor30d.toFixed(2)} />
      <KpiCard label="Closed P&L drawdown (90d)" value={data.maxDrawdown90dUsd == null ? 'Unavailable' : `$${data.maxDrawdown90dUsd.toFixed(2)}`} />
      {typeof data.avgMfe30d === 'number' && (
        <KpiCard label="Avg MFE (30d)" value={`$${data.avgMfe30d.toFixed(2)}`} delta={data.avgMfe30d} />
      )}
      {typeof data.avgMae30d === 'number' && (
        <KpiCard label="Avg MAE (30d)" value={`$${data.avgMae30d.toFixed(2)}`} delta={-Math.abs(data.avgMae30d)} />
      )}
      {typeof data.avgR30d === 'number' && (
        <KpiCard label="Avg R (30d)" value={data.avgR30d.toFixed(2)} suffix="R" delta={data.avgR30d} />
      )}
    </div>
    <p className="mt-2 text-xs text-slate-400">Summaries include all loaded journal records, including automated research records. Periods use close dates. Open P&amp;L is an estimate before fees; these figures are not account equity. {data.unpricedOpenTrades ? `${data.unpricedOpenTrades} open records have no usable quote; a complete open P&L total is unavailable.` : ''} {data.excludedClosedTrades ? `${data.excludedClosedTrades} closed records lack a valid close date or P&L and are excluded.` : ''}</p>
    {data.behavioralFlags && data.behavioralFlags.length > 0 && (
      <div className="mt-3 space-y-1.5">
        {data.behavioralFlags.map((flag, i) => (
          <div key={i} className={`flex items-start gap-2 rounded-lg p-2 text-xs ${
            flag.severity === 'alert' ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
          }`}>
            <span className="mt-0.5">{flag.severity === 'alert' ? '🚨' : '⚠️'}</span>
            <div>
              <span className={`font-semibold ${flag.severity === 'alert' ? 'text-red-300' : 'text-amber-300'}`}>
                {flag.type.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span className="text-slate-400"> — {flag.message}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </>
  );
}
