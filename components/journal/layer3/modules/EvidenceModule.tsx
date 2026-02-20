import Link from 'next/link';
import { EvidenceModuleModel } from '@/types/journal';

export default function EvidenceModule({ data }: { data: EvidenceModuleModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      {data.links.length === 0 && <div className="text-slate-400">No linked evidence yet.</div>}
      {data.links.map((item) => (
        <div key={item.tradeId} className="rounded-lg bg-white/5 px-3 py-2">
          <div className="font-semibold text-slate-100">{item.symbol}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {item.scanner && <Link className="rounded bg-white/10 px-2 py-1" href={`/tools/scanner?symbol=${encodeURIComponent(item.symbol)}`}>Scanner</Link>}
            {item.options && <Link className="rounded bg-white/10 px-2 py-1" href={`/tools/options?symbol=${encodeURIComponent(item.symbol)}`}>Options</Link>}
            {item.time && <Link className="rounded bg-white/10 px-2 py-1" href={`/tools/time?symbol=${encodeURIComponent(item.symbol)}`}>Time</Link>}
          </div>
        </div>
      ))}
    </div>
  );
}
