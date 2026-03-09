'use client';

import type { UserTier } from '@/lib/useUserTier';
import { canExportCSV } from '@/lib/useUserTier';

interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  holdingPeriodDays: number;
}

interface TradeHistoryTableProps {
  trades: Trade[];
  tier: UserTier;
}

function exportTradesToCSV(trades: Trade[]) {
  const headers = ['Entry Date', 'Exit Date', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Hold (days)', 'P&L ($)', 'Return (%)'];
  const rows = trades.map((t) => [
    t.entryDate,
    t.exitDate,
    t.symbol,
    t.side,
    t.entry.toFixed(2),
    t.exit.toFixed(2),
    String(t.holdingPeriodDays),
    t.return.toFixed(2),
    t.returnPercent.toFixed(2),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backtest-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const thClass = 'px-4 py-3.5 text-left text-xs font-medium uppercase text-slate-400 sm:px-5';
const thRightClass = 'px-4 py-3.5 text-right text-xs font-medium uppercase text-slate-400 sm:px-5';
const tdClass = 'px-4 py-4 text-sm text-slate-400 sm:px-5';
const tdRightClass = 'px-4 py-4 text-right text-sm text-slate-400 sm:px-5';

export default function TradeHistoryTable({ trades, tier }: TradeHistoryTableProps) {
  const canExport = canExportCSV(tier);

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-slate-700/80 bg-[var(--msp-card)] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/50 px-5 py-4 sm:px-6">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold uppercase tracking-wider text-slate-100">
          <span className="rounded-lg bg-amber-500 px-2 py-1.5 text-sm">📋</span>
          Trade History
        </h2>
        <button
          onClick={() => canExport && exportTradesToCSV(trades)}
          disabled={!canExport}
          aria-label={canExport ? 'Export trade history as CSV' : 'CSV export requires Pro plan'}
          title={canExport ? undefined : 'Pro plan required for CSV export'}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase transition ${
            canExport
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'cursor-not-allowed border-slate-600 text-slate-500 opacity-50'
          }`}
        >
          📥 Export CSV {!canExport && '🔒'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" role="table">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <th className={thClass}>Entry</th>
              <th className={thClass}>Exit</th>
              <th className={thClass}>Symbol</th>
              <th className={thClass}>Side</th>
              <th className={thRightClass}>Entry</th>
              <th className={thRightClass}>Exit</th>
              <th className={`${thRightClass} hidden sm:table-cell`}>Hold (d)</th>
              <th className={thRightClass}>P&L</th>
              <th className={thRightClass}>Return %</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, idx) => (
              <tr key={idx} className="border-b border-slate-700">
                <td className={tdClass}>
                  {new Date(trade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className={tdClass}>
                  {new Date(trade.exitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-100 sm:px-5">
                  {trade.symbol}
                </td>
                <td className="px-4 py-4 sm:px-5">
                  <span className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                    trade.side === 'SHORT'
                      ? 'border border-red-500/30 bg-red-500/15 text-red-500'
                      : 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-500'
                  }`}>
                    {trade.side}
                  </span>
                </td>
                <td className={tdRightClass}>${trade.entry.toFixed(2)}</td>
                <td className="px-4 py-4 text-right text-sm text-slate-100 sm:px-5">${trade.exit.toFixed(2)}</td>
                <td className={`${tdRightClass} hidden sm:table-cell`}>{trade.holdingPeriodDays}</td>
                <td className={`px-4 py-4 text-right text-sm font-semibold sm:px-5 ${trade.return >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {trade.return >= 0 ? '+' : ''}${trade.return.toFixed(2)}
                </td>
                <td className={`px-4 py-4 text-right text-sm font-semibold sm:px-5 ${trade.returnPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {trade.returnPercent >= 0 ? '+' : ''}{trade.returnPercent.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
