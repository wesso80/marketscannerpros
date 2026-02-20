import Link from 'next/link';
import { TradeRowModel } from '@/types/journal';

type TradeRowExpandedProps = {
  row: TradeRowModel;
};

export default function TradeRowExpanded({ row }: TradeRowExpandedProps) {
  return (
    <tr className="border-b border-white/5 bg-slate-950/50">
      <td colSpan={10} className="px-3 py-3">
        <div className="space-y-2 text-sm text-slate-300">
          <ul className="list-disc pl-5">
            {(row.notesPreview || []).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div>Last AI Note: {row.lastAiNoteTs ? new Date(row.lastAiNoteTs).toLocaleString() : 'N/A'}</div>
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
