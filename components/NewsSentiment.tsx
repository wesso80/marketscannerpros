'use client';

import { useEffect, useState } from 'react';

interface TickerSentiment {
  ticker: string;
  averageScore: number;
  label: string;
  articleCount: number;
  headlineRisk: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  distribution: {
    bullish: number;
    neutral: number;
    bearish: number;
  };
}

interface Headline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  overallSentiment: { score: number; label: string };
}

interface SentimentData {
  tickerSentiments: TickerSentiment[];
  recentHeadlines: Headline[];
  marketSentiment: { score: number; label: string };
}

export function useNewsSentiment(tickers: string | null) {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tickers) return;

    const fetchSentiment = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/news-sentiment?tickers=${tickers}`);
        if (!res.ok) throw new Error('Failed to fetch sentiment');
        const result = await res.json();
        setData(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSentiment();
  }, [tickers]);

  // Get sentiment for a specific ticker
  const getSentiment = (ticker: string): TickerSentiment | null => {
    return data?.tickerSentiments?.find(t => t.ticker.toUpperCase() === ticker.toUpperCase()) || null;
  };

  return { data, loading, error, getSentiment };
}

// Compact sentiment badge for a single ticker
export function SentimentBadge({ ticker }: { ticker: string }) {
  const { getSentiment, loading } = useNewsSentiment(ticker);
  const sentiment = getSentiment(ticker);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded animate-pulse">
        <div className="w-2 h-2 bg-slate-600 rounded-full" />
        <span className="text-xs text-slate-500">...</span>
      </div>
    );
  }

  if (!sentiment) return null;

  const getColor = (label: string) => {
    if (label.includes('Bullish')) return 'text-green-400 bg-green-500/20';
    if (label.includes('Bearish')) return 'text-red-400 bg-red-500/20';
    return 'text-slate-400 bg-slate-500/20';
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${getColor(sentiment.label)}`}>
      <span className="text-xs font-medium">{sentiment.label}</span>
      {sentiment.headlineRisk && (
        <span className="text-[10px] px-1 py-0.5 bg-red-500/30 rounded text-red-300">RISK</span>
      )}
    </div>
  );
}

// Headline risk banner for tools
export function HeadlineRiskBanner({ ticker }: { ticker: string }) {
  const { getSentiment, data, loading } = useNewsSentiment(ticker);
  const sentiment = getSentiment(ticker);

  if (loading || !sentiment) return null;

  // Only show if there's headline risk or strong negative sentiment
  if (!sentiment.headlineRisk && sentiment.averageScore > -0.25) return null;

  const recentNegativeHeadlines = data?.recentHeadlines
    ?.filter(h => h.overallSentiment.score < -0.15)
    ?.slice(0, 3) || [];

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1">
          <h3 className="text-red-400 font-semibold text-sm mb-1">
            Headline Risk Detected
          </h3>
          <p className="text-xs text-slate-400 mb-2">
            {sentiment.articleCount} recent articles with {sentiment.distribution.bearish} bearish vs {sentiment.distribution.bullish} bullish
          </p>
          {recentNegativeHeadlines.length > 0 && (
            <div className="space-y-1.5">
              {recentNegativeHeadlines.map((h, i) => (
                <a 
                  key={i}
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-slate-300 hover:text-white transition-colors"
                >
                  • {h.title.slice(0, 80)}...
                  <span className="text-slate-500 ml-1">({h.source})</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
