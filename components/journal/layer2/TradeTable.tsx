'use client';

import { Fragment, useState } from 'react';
import TradeRowExpanded from '@/components/journal/layer2/TradeRowExpanded';
import { SortModel, TradeRowModel } from '@/types/journal';
import { formatSignedPct, formatSignedUsd, markTimeLabel, optionContractLabel } from '@/lib/journal/display';

function fmtQty(q: number): string {
  return Number.isFinite(q) ? q.toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—';
}

function targetOf(row: TradeRowModel): number | undefined {
  return row.targets && row.targets.length ? row.targets[0] : undefined;
}

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
  onSnapshot?: (id: string) => void;
  loading: boolean;
  error: string | null;
};

function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`text-left ${active ? 'text-slate-100' : 'text-slate-400'}`}>
      {label}
    </button>
  );
}

export default function TradeTable({ rows, sort, onSort, onSelectTrade, onQuickClose, onSnapshot, loading, error }: TradeTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      {/* ── Mobile: finger-expandable trade cards ── */}
      <div className="msp-mobile-cards space-y-2">
        {loading && <div className="px-3 py-4 text-slate-300 text-sm">Loading trades...</div>}
        {error && !loading && <div className="px-3 py-4 text-rose-300 text-sm">{error}</div>}
        {!loading && !error && rows.length === 0 && <div className="px-3 py-4 text-slate-300 text-sm">No trades found for current filters.</div>}
        {!loading && !error && rows.map((row) => (
          <details key={row.id} className="rounded-xl border border-white/5 bg-slate-900/40">
            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-slate-100 text-sm">{row.symbol}</span>
                {optionContractLabel(row) && <span className="truncate text-[10px] text-slate-400">{optionContractLabel(row)}</span>}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.side === 'long' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {row.side.toUpperCase()}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.status === 'open' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-500/20 text-slate-400'}`}>
                  {row.status.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-mono font-semibold ${Number(row.pnlUsd || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {row.pnlUsd == null ? 'Unavailable' : formatSignedUsd(row.pnlUsd)}
                </span>
                <span className="text-slate-500 text-xs">▸</span>
              </div>
            </summary>
            <div className="border-t border-white/5 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div><span className="text-slate-500">Entry</span> <span className="text-slate-200 font-mono">{fmtPrice(row.entry.price)}</span></div>
              <div><span className="text-slate-500">{row.tradeType === 'Options' ? 'Contracts' : 'Qty'}</span> <span className="text-slate-200 font-mono">{fmtQty(row.qty)}</span></div>
              <div><span className="text-slate-500">Date</span> <span className="text-slate-200">{new Date(row.entry.ts).toLocaleDateString()}</span></div>
              <div><span className="text-slate-500">Stop</span> <span className="text-slate-200 font-mono">{row.stop != null ? fmtPrice(row.stop) : '—'}</span></div>
              <div><span className="text-slate-500">Target</span> <span className="text-slate-200 font-mono">{targetOf(row) != null ? fmtPrice(targetOf(row)!) : '—'}</span></div>
              <div><span className="text-slate-500">Current/Exit</span> <span className="text-slate-200 font-mono" title={row.mark ? markTimeLabel(row.mark) : undefined}>{row.mark ? `Est. ${fmtPrice(row.mark.price)}${row.mark.basis === 'EOD' ? ' (EOD)' : ''}` : row.exit?.price != null ? fmtPrice(row.exit.price) : 'Unmarked'}</span></div>
              {row.mark && <div className="col-span-2 text-[11px] text-slate-500">{markTimeLabel(row.mark)}</div>}
              <div><span className="text-slate-500">P&L %</span> <span className={`font-mono ${Number(row.pnlPct || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatSignedPct(row.pnlPct)}</span></div>
              <div><span className="text-slate-500">R</span> <span className="text-slate-200 font-mono">{row.rMultiple != null ? row.rMultiple.toFixed(2) : '—'}</span></div>
              <div className="col-span-2"><span className="text-slate-500">Strategy</span> <span className="text-slate-200">{row.strategyTag || '—'}</span></div>
              <div className="col-span-2 flex gap-1.5 pt-1">
                <button type="button" onClick={() => onSelectTrade(row.id)} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">View</button>
                {onSnapshot && <button type="button" onClick={() => onSnapshot(row.id)} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">Snapshot</button>}
                <button disabled={row.status !== 'open'} type="button" onClick={() => onQuickClose(row.id)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200">Close</button>
              </div>
            </div>
          </details>
        ))}
      </div>

      {/* ── Desktop: full table ── */}
      <div className="msp-desktop-table overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/40">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-white/5 bg-white/5 text-slate-300">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Symbol</th>
            <th scope="col" className="px-3 py-2 text-left">Status</th>
            <th scope="col" className="px-3 py-2 text-left">Side</th>
            <th scope="col" className="px-3 py-2 text-left">
              <SortButton
                label="Entry"
                active={sort.key === 'entry_ts'}
                onClick={() => onSort({ key: 'entry_ts', dir: sort.key === 'entry_ts' && sort.dir === 'desc' ? 'asc' : 'desc' })}
              />
            </th>
            <th scope="col" className="px-3 py-2 text-left">Qty</th>
            <th scope="col" className="px-3 py-2 text-left">Stop / Target</th>
            <th scope="col" className="px-3 py-2 text-left">Current/Exit</th>
            <th scope="col" className="px-3 py-2 text-left">
              <SortButton
                label="P&L"
                active={sort.key === 'pnl_usd'}
                onClick={() => onSort({ key: 'pnl_usd', dir: sort.key === 'pnl_usd' && sort.dir === 'desc' ? 'asc' : 'desc' })}
              />
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              <SortButton
                label="R"
                active={sort.key === 'r_multiple'}
                onClick={() => onSort({ key: 'r_multiple', dir: sort.key === 'r_multiple' && sort.dir === 'desc' ? 'asc' : 'desc' })}
              />
            </th>
            <th scope="col" className="px-3 py-2 text-left">Strategy</th>
            <th scope="col" className="px-3 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-3 py-4 text-slate-300" colSpan={11}>Loading trades...</td>
            </tr>
          )}
          {error && !loading && (
            <tr>
              <td className="px-3 py-4 text-rose-300" colSpan={11}>{error}</td>
            </tr>
          )}
          {!loading && !error && rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-slate-300" colSpan={11}>No trades found for current filters.</td>
            </tr>
          )}

          {!loading && !error && rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 font-semibold text-slate-100">
                  {row.symbol}
                  {optionContractLabel(row) && <div className="text-[11px] font-normal text-slate-400">{optionContractLabel(row)}</div>}
                </td>
                <td className="px-3 py-2 text-slate-300">{row.status}</td>
                <td className="px-3 py-2 text-slate-300">{row.side}</td>
                <td className="px-3 py-2 text-slate-300">{fmtPrice(row.entry.price)} · {new Date(row.entry.ts).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-slate-300">{fmtQty(row.qty)}</td>
                <td className="px-3 py-2 text-slate-300">{row.stop != null ? fmtPrice(row.stop) : '—'} / {targetOf(row) != null ? fmtPrice(targetOf(row)!) : '—'}</td>
                <td className="px-3 py-2 text-slate-300">
                  {row.status === 'open' && row.mark ? (
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400" title={markTimeLabel(row.mark)}>{row.mark?.basis === 'EOD' ? 'EOD' : 'Est.'}</span>
                      <span className="font-mono">{fmtPrice(row.mark?.price ?? 0)}</span>
                    </span>
                  ) : row.exit?.price != null && row.status === 'closed' ? (
                    fmtPrice(row.exit.price)
                  ) : (
                    <span className="text-slate-500">Open</span>
                  )}
                </td>
                <td className={`px-3 py-2 ${Number(row.pnlUsd || 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {row.status === 'open' && row.mark ? (
                    <span className="font-mono">
                      {row.pnlUsd == null ? 'Unavailable' : `${formatSignedUsd(row.pnlUsd)} / ${formatSignedPct(row.pnlPct)}`}
                    </span>
                  ) : (
                    <>{row.pnlUsd == null ? 'Unavailable' : `${formatSignedUsd(row.pnlUsd)} / ${formatSignedPct(row.pnlPct ?? 0)}`}</>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-300">{row.rMultiple != null ? row.rMultiple.toFixed(2) : '—'}</td>
                <td className="px-3 py-2 text-slate-300">{row.strategyTag || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => onSelectTrade(row.id)} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">View</button>
                    {onSnapshot && <button type="button" onClick={() => onSnapshot(row.id)} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">Snapshot</button>}
                    <button disabled={row.status !== 'open'} type="button" onClick={() => onQuickClose(row.id)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200">Close</button>
                    <button type="button" onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))} className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100">Expand</button>
                  </div>
                </td>
              </tr>
              {expandedId === row.id && <TradeRowExpanded row={row} />}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
