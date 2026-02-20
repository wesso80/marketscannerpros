import { ReviewModuleModel } from '@/types/journal';

export default function ReviewModule({ data }: { data: ReviewModuleModel }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
      {data.queue.length === 0 ? <li>No review items.</li> : data.queue.map((item) => <li key={item.tradeId}>{item.summary}</li>)}
    </ul>
  );
}
