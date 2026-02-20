import { TradeModel } from '@/types/journal';

export default function TradeOverviewTab({ trade }: { trade?: TradeModel }) {
  if (!trade) return <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">Create a new trade from this drawer.</div>;
  return (
    <div className="space-y-3 text-sm text-slate-200">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-slate-400">Lifecycle</div>
        <div>Entry: {trade.entry.price.toFixed(2)} · {new Date(trade.entry.ts).toLocaleString()}</div>
        <div>Exit: {trade.exit ? `${trade.exit.price.toFixed(2)} · ${new Date(trade.exit.ts).toLocaleString()}` : 'Open'}</div>
        <div>Qty: {trade.qty}</div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-slate-400">Forensics</div>
        <div>P&L: {Number(trade.pnlUsd || 0).toFixed(2)} ({Number(trade.pnlPct || 0).toFixed(2)}%)</div>
        <div>R Multiple: {trade.rMultiple != null ? trade.rMultiple.toFixed(2) : 'N/A'}</div>
      </div>
    </div>
  );
}
