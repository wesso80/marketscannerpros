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
      equity: 0,
      realizedPnl30d: 0,
      unrealizedPnlOpen: 0,
      winRate30d: 0,
      profitFactor30d: 0,
      maxDrawdown90d: 0,
    };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
      <KpiCard label="Equity / Balance" value={`$${data.equity.toFixed(2)}`} />
      <KpiCard label="Realized P&L (30d)" value={`$${data.realizedPnl30d.toFixed(2)}`} delta={data.realizedPnl30d} />
      <KpiCard label="Unrealized P&L (Open)" value={`$${data.unrealizedPnlOpen.toFixed(2)}`} delta={data.unrealizedPnlOpen} />
      <KpiCard label="Win Rate (30d)" value={(data.winRate30d * 100).toFixed(1)} suffix="%" />
      <KpiCard label="Profit Factor (30d)" value={data.profitFactor30d.toFixed(2)} />
      <KpiCard label="Max Drawdown (90d)" value={(data.maxDrawdown90d * 100).toFixed(1)} suffix="%" delta={data.maxDrawdown90d * 100} />
    </div>
  );
}
