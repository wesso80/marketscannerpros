import Link from 'next/link';
import {formatUsd,markTimeLabel} from '@/lib/journal/display';
import { TradeRowModel } from '@/types/journal';

type TradeRowExpandedProps = {
  row: TradeRowModel;
};

export default function TradeRowExpanded({ row }: TradeRowExpandedProps) {
  return (
    <tr className="border-b border-white/5 bg-slate-950/50">
      <td colSpan={6} className="px-3 py-3">
        <div className="space-y-2 text-sm text-slate-300">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div>Recorded date: {row.entry.ts?.slice(0,10) || 'Not recorded'}</div>
            <div>Quantity: {row.qty.toLocaleString(undefined,{maximumFractionDigits:8})}</div>
            <div>Stop: {row.stop == null ? 'Not recorded' : formatUsd(row.stop)}</div>
            <div>Recorded exit: {row.targets?.[0] == null ? 'Not recorded' : formatUsd(row.targets[0])}</div>
            <div>Current / exit: {row.mark ? formatUsd(row.mark.price) : row.exit ? formatUsd(row.exit.price) : 'Not collected'}</div>
            <div>R: {row.rMultiple == null ? 'Not recorded' : row.rMultiple.toFixed(2)}</div>
            <div>Strategy: {row.strategyTag?.replace(/_/g,' ').toLowerCase() || 'Not recorded'}</div>
          </div>
          {row.mark && <p className="text-xs text-slate-400">{markTimeLabel(row.mark).replace(/\bEOD\b/g,'Session close').replace(/\bREALTIME\b/g,'Observed')}</p>}
          <ul className="list-disc pl-5">
            {(row.notesPreview || []).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div>Last AI Note: {row.lastAiNoteTs ? new Date(row.lastAiNoteTs).toLocaleString(undefined, { timeZoneName: 'short' }) : 'Not recorded'}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href={`/tools/scanner?symbol=${encodeURIComponent(row.symbol)}`} className="rounded bg-white/10 px-2 py-1 text-slate-100">Open Scanner Context</Link>
            <Link href={`/tools/options?symbol=${encodeURIComponent(row.symbol)}`} className="rounded bg-white/10 px-2 py-1 text-slate-100">Open Options Context</Link>
            <Link href={`/tools/time?symbol=${encodeURIComponent(row.symbol)}`} className="rounded bg-white/10 px-2 py-1 text-slate-100">Open Time Context</Link>
          </div>
        </div>
      </td>
    </tr>
  );
}
