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
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>📰</span>
          <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
            {title}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'news', 'guides'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 10px',
                background: filter === f ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: filter === f ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #334155',
                borderRadius: '6px',
                color: filter === f ? '#10b981' : '#64748b',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
              <div className="h-16 w-16 bg-slate-700 rounded" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="h-4 bg-slate-700 rounded w-full" />
                <div className="h-3 bg-slate-700/50 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '13px',
          textAlign: 'center',
        }}>
          Unable to load news: {error}
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
          No articles found
        </div>
      )}

      {!loading && !error && articles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {articles.map((article, i) => (
            <a
              key={`${article.url}-${i}`}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px 0',
                borderBottom: i < articles.length - 1 ? '1px solid #1e293b' : 'none',
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
              className="hover:bg-slate-800/30 rounded group"
            >
              {article.image && (
                <img
                  src={article.image}
                  alt=""
                  style={{
                    width: '72px',
                    height: '48px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    flexShrink: 0,
                    background: '#1e293b',
                  }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: '#e2e8f0',
                  fontSize: '13px',
                  fontWeight: 600,
                  lineHeight: '1.4',
                  marginBottom: '4px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {article.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748b', fontSize: '10px' }}>
                    {article.source_name}
                  </span>
                  {article.author && (
                    <span style={{ color: '#475569', fontSize: '10px' }}>
                      by {article.author}
                    </span>
                  )}
                  <span style={{ color: '#475569', fontSize: '10px' }}>
                    · {timeAgo(article.posted_at)}
                  </span>
                  {article.type === 'guides' && (
                    <span style={{
                      padding: '1px 6px',
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '4px',
                      color: '#818cf8',
                      fontSize: '9px',
                      fontWeight: 700,
                    }}>
                      GUIDE
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <div style={{ marginTop: '12px', textAlign: 'right' }}>
        <span style={{ color: '#475569', fontSize: '10px' }}>
          Powered by CoinGecko News
        </span>
      </div>
    </div>
  );
}
