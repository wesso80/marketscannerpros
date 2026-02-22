import { ReviewModuleModel } from '@/types/journal';

export default function ReviewModule({ data }: { data: ReviewModuleModel }) {
  if (data.queue.length === 0) {
    return <div className="text-sm text-slate-400">No trades requiring review (|R| &ge; 3).</div>;
  }

  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
      {data.queue.map((item) => <li key={item.tradeId}>{item.summary}</li>)}
    </ul>
  );
}
