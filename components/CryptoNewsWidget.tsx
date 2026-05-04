'use client';

import { useState, useEffect } from 'react';

interface NewsArticle {
  title: string;
  url: string;
  image: string;
  author: string;
  posted_at: string;
  type: 'news' | 'guides';
  source_name: string;
  related_coin_ids: string[];
}

interface Props {
  coinId?: string;
  title?: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CryptoNewsWidget({ coinId, title = 'Crypto News' }: Props) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'news' | 'guides'>('all');

  useEffect(() => {
    let cancelled = false;

    async function fetchNews() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ per_page: '25' });
        if (coinId) params.set('coin_id', coinId);
        if (filter !== 'all') params.set('type', filter);

        const res = await fetch(`/api/crypto/cg-news?${params}`);
        const data = await res.json();

        if (!cancelled) {
          if (!res.ok) setError(data.error || 'Failed to load news');
          else setArticles(data.articles || []);
        }
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNews();
    return () => { cancelled = true; };
  }, [coinId, filter]);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg leading-none">📰</span>
          <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        </div>
        <div className="flex gap-1">
          {(['all', 'news', 'guides'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                filter === f
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-transparent text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex gap-3 border-b border-slate-800 py-2.5">
              <div className="h-12 w-[72px] flex-shrink-0 rounded-md bg-slate-700" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3.5 w-full rounded bg-slate-700" />
                <div className="h-3 w-3/4 rounded bg-slate-700/60" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-center text-[13px] text-rose-300">
          Unable to load news: {error}
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div className="py-6 text-center text-[13px] text-slate-500">No articles found</div>
      )}

      {!loading && !error && articles.length > 0 && (
        <div className="divide-y divide-slate-800">
          {articles.map((article, i) => (
            <a
              key={`${article.url}-${i}`}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 rounded py-2.5 transition-colors hover:bg-slate-800/40"
            >
              {article.image && (
                <img
                  src={article.image}
                  alt=""
                  className="h-12 w-[72px] flex-shrink-0 rounded-md bg-slate-800 object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="mb-1 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-200 group-hover:text-white">
                  {article.title}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">{article.source_name}</span>
                  {article.author && (
                    <span className="text-[10px] text-slate-600">by {article.author}</span>
                  )}
                  <span className="text-[10px] text-slate-600">· {timeAgo(article.posted_at)}</span>
                  {article.type === 'guides' && (
                    <span className="rounded border border-indigo-400/30 bg-indigo-500/15 px-1.5 py-px text-[9px] font-bold text-indigo-300">
                      GUIDE
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="mt-3 text-right text-[10px] text-slate-600">Powered by CoinGecko News</p>
    </div>
  );
}
