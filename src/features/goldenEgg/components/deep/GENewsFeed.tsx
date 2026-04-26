import type { DeepAnalysisData } from '@/src/features/goldenEgg/types';

type NewsItem = NonNullable<DeepAnalysisData['news']>[number];
type Props = { news: NewsItem[] };

function sentimentBadge(sentiment: string) {
  const s = sentiment.toLowerCase();
  if (s.includes('bullish') || s === 'positive') return { text: sentiment, cls: 'bg-emerald-500/20 text-emerald-300' };
  if (s.includes('bearish') || s === 'negative') return { text: sentiment, cls: 'bg-rose-500/20 text-rose-300' };
  return { text: sentiment || 'Neutral', cls: 'bg-slate-700 text-slate-300' };
}

export default function GENewsFeed({ news }: Props) {
  if (!news.length) return null;

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">News &amp; Sentiment</h2>
      </div>

      <div className="space-y-3">
        {news.map((item, i) => {
          const badge = sentimentBadge(item.sentiment);
          return (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-white/5 bg-white/[0.03] p-3 transition hover:border-amber-500/30 hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-medium leading-snug text-slate-100">{item.title}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                  {badge.text}
                </span>
              </div>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{item.summary}</p>
              )}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span>{item.source}</span>
                {item.publishedAt && (
                  <>
                    <span>·</span>
                    <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
