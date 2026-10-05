import Link from 'next/link';
import { EvidenceModuleModel } from '@/types/journal';

export default function EvidenceModule({ data }: { data: EvidenceModuleModel }) {
  if (data.links.length === 0) {
    return <div className="text-sm text-slate-400">No linked evidence yet.</div>;
  }

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {data.links.map((item) => (
        <div key={item.tradeId} className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5">
          <span className="font-semibold text-slate-100">{item.symbol}</span>
          {item.scanner && (
            <Link className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300 hover:bg-white/20" href={`/tools/scanner?symbol=${encodeURIComponent(item.symbol)}`}>Scan</Link>
          )}
          {item.options && (
            <Link className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300 hover:bg-white/20" href={`/tools/options?symbol=${encodeURIComponent(item.symbol)}`}>Opts</Link>
          )}
          {item.time && (
            <Link className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300 hover:bg-white/20" href={`/tools/time?symbol=${encodeURIComponent(item.symbol)}`}>Time</Link>
          )}
        </div>
      ))}
    </div>
  );
}
