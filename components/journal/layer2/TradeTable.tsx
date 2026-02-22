'use client';

import { Fragment, useState } from 'react';
import TradeRowExpanded from '@/components/journal/layer2/TradeRowExpanded';
import { SortModel, TradeRowModel } from '@/types/journal';

/** Smart price format: 2 decimals for prices >= $1, up to 6 for tiny crypto */
function fmtPrice(p: number): string {
  if (p === 0) return '0.00';
  if (p >= 1) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

type TradeTableProps = {
  rows: TradeRowModel[];
  sort: SortModel;
  onSort: (s: SortModel) => void;
  onSelectTrade: (id: string) => void;
  onQuickClose: (id: string) => void;
  onSnapshot: (id: string) => void;
  loading: boolean;
  error: string | null;
};

function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left ${active ? 'text-slate-100' : 'text-slate-400'}`}>
      {label}
    </button>
  );
}

export default function TradeTable({ rows, sort, onSort, onSelectTrade, onQuickClose, onSnapshot, loading, error }: TradeTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/40">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-white/5 bg-white/5 text-slate-300">
          <tr>
            <th className="px-3 py-2 text-left">Symbol</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Side</th>
            <th className="px-3 py-2 text-left">
              <SortButton
                label="Entry"
                active={sort.key === 'entry_ts'}
                onClick={() => onSort({ key: 'entry_ts', dir: sort.key === 'entry_ts' && sort.dir === 'desc' ? 'asc' : 'desc' })}
              />
            </th>
            <th className="px-3 py-2 text-left">Stop</th>
            <th className="px-3 py-2 text-left">Current/Exit</th>
            <th className="px-3 py-2 text-left">
              <SortButton
                label="P&L"
                active={sort.key === 'pnl_usd'}
                onClick={() => onSort({ key: 'pnl_usd', dir: sort.key === 'pnl_usd' && sort.dir === 'desc' ? 'asc' : 'desc' })}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortButton
                label="R"
                active={sort.key === 'r_multiple'}
                onClick={() => onSort({ key: 'r_multiple', dir: sort.key === 'r_multiple' && sort.dir === 'desc' ? 'asc' : 'desc' })}
              />
            </th>
            <th className="px-3 py-2 text-left">Strategy</th>
            <th className="px-3 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-3 py-4 text-slate-300" colSpan={10}>Loading trades...</td>
            </tr>
          )}
          {error && !loading && (
            <tr>
              <td className="px-3 py-4 text-rose-300" colSpan={10}>{error}</td>
            </tr>
          )}
          {!loading && !error && rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-slate-300" colSpan={10}>No trades found for current filters.</td>
            </tr>
          )}

          {!loading && !error && rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 font-semibold text-slate-100">{row.symbol}</td>
                <td className="px-3 py-2 text-slate-300">{row.status}</td>
                <td className="px-3 py-2 text-slate-300">{row.side}</td>
                <td className="px-3 py-2 text-slate-300">{fmtPrice(row.entry.price)} · {new Date(row.entry.ts).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-slate-300">{row.stop != null ? fmtPrice(row.stop) : '—'}</td>
                <td className="px-3 py-2 text-slate-300">{row.exit?.price != null ? fmtPrice(row.exit.price) : 'Open'}</td>
                <td className={`px-3 py-2 ${Number(row.pnlUsd || 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{Number(row.pnlUsd || 0).toFixed(2)} / {Number(row.pnlPct || 0).toFixed(2)}%</td>
                <td className="px-3 py-2 text-slate-300">{row.rMultiple != null ? row.rMultiple.toFixed(2) : '—'}</td>
                <td className="px-3 py-2 text-slate-300">{row.strategyTag || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => onSelectTrade(row.id)} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">View</button>
                    <button onClick={() => onSnapshot(row.id)} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">Snapshot</button>
                    <button onClick={() => onQuickClose(row.id)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200">Close</button>
                    <button onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">Expand</button>
                  </div>
                </td>
              </tr>
              {expandedId === row.id && <TradeRowExpanded row={row} />}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
