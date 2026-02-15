'use client';

import { useEffect, useState } from 'react';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import { useAIPageContext } from '@/lib/ai/pageContext';

interface Mover {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

interface MoversData {
  timestamp: string;
  lastUpdated: string;
  marketMood: 'bullish' | 'bearish' | 'neutral';
  summary: {
    avgGainerChange: number;
    avgLoserChange: number;
    topGainerTicker: string;
    topGainerChange: number;
    topLoserTicker: string;
    topLoserChange: number;
  };
  topGainers: Mover[];
  topLosers: Mover[];
  mostActive: Mover[];
}

export default function MarketMoversPage() {
  const [data, setData] = useState<MoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gainers' | 'losers' | 'active'>('gainers');
  
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/market-movers');
        if (!res.ok) throw new Error('Failed to fetch market movers');
        const result = await res.json();
        
        if (result.error) {
          setError(result.error);
          return;
        }
        
        // Handle old API format
        const formatted: MoversData = result.topGainers ? {
          timestamp: new Date().toISOString(),
          lastUpdated: result.lastUpdated || new Date().toISOString(),
          marketMood: 'neutral',
          summary: {
            avgGainerChange: 0,
            avgLoserChange: 0,
            topGainerTicker: result.topGainers?.[0]?.ticker,
            topGainerChange: parseFloat(result.topGainers?.[0]?.change_percentage?.replace('%', '') || '0'),
            topLoserTicker: result.topLosers?.[0]?.ticker,
            topLoserChange: parseFloat(result.topLosers?.[0]?.change_percentage?.replace('%', '') || '0'),
          },
          topGainers: result.topGainers?.map((g: any) => ({
            ticker: g.ticker,
            price: parseFloat(g.price),
            change: parseFloat(g.change_amount),
            changePercent: parseFloat(g.change_percentage?.replace('%', '') || '0'),
            volume: parseInt(g.volume),
          })) || [],
          topLosers: result.topLosers?.map((l: any) => ({
            ticker: l.ticker,
            price: parseFloat(l.price),
            change: parseFloat(l.change_amount),
            changePercent: parseFloat(l.change_percentage?.replace('%', '') || '0'),
            volume: parseInt(l.volume),
          })) || [],
          mostActive: result.mostActive?.map((a: any) => ({
            ticker: a.ticker,
            price: parseFloat(a.price),
            change: parseFloat(a.change_amount),
            changePercent: parseFloat(a.change_percentage?.replace('%', '') || '0'),
            volume: parseInt(a.volume),
          })) || [],
        } : result;
        
        setData(formatted);
        
        // Set AI context
        setPageData({
          skill: 'market_movers',
          symbols: formatted.topGainers?.slice(0, 5).map((g: any) => g.ticker) || [],
          summary: `Top Gainer: ${formatted.summary?.topGainerTicker} (+${formatted.summary?.topGainerChange?.toFixed(1)}%), Top Loser: ${formatted.summary?.topLoserTicker} (${formatted.summary?.topLoserChange?.toFixed(1)}%)`,
          data: {
            topGainers: formatted.topGainers?.slice(0, 5),
            topLosers: formatted.topLosers?.slice(0, 5),
            mostActive: formatted.mostActive?.slice(0, 5),
          },
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [setPageData]);

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toString();
  };

  const getMoodColor = (mood: string) => {
    switch (mood) {
      case 'bullish': return 'text-green-400';
      case 'bearish': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getMoodEmoji = (mood: string) => {
    switch (mood) {
      case 'bullish': return '🟢';
      case 'bearish': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <ToolsPageHeader
        title="Market Movers"
        subtitle="Find top gainers, losers, and most-active stocks with clear momentum context"
        badge="Live"
        icon="📈"
      />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Market Status */}
        <div className="flex items-center justify-between mb-6">
          <MarketStatusBadge showGlobal />
          {data && (
            <div className={`flex items-center gap-2 ${getMoodColor(data.marketMood)}`}>
              <span>{getMoodEmoji(data.marketMood)}</span>
              <span className="text-sm font-medium capitalize">Market Mood: {data.marketMood}</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center">
            <p className="text-red-400 mb-2">⚠️ {error}</p>
            <p className="text-sm text-slate-400">Market data may be unavailable outside trading hours</p>
          </div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-400 text-sm font-medium">Top Gainer</span>
                  <span className="text-2xl">🚀</span>
                </div>
                <p className="text-2xl font-bold text-white">{data.summary?.topGainerTicker || 'N/A'}</p>
                <p className="text-green-400 text-lg font-semibold">
                  +{data.summary?.topGainerChange?.toFixed(2) || 0}%
                </p>
              </div>

              <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-red-400 text-sm font-medium">Top Loser</span>
                  <span className="text-2xl">📉</span>
                </div>
                <p className="text-2xl font-bold text-white">{data.summary?.topLoserTicker || 'N/A'}</p>
                <p className="text-red-400 text-lg font-semibold">
                  {data.summary?.topLoserChange?.toFixed(2) || 0}%
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-blue-400 text-sm font-medium">Most Active</span>
                  <span className="text-2xl">🔥</span>
                </div>
                <p className="text-2xl font-bold text-white">{data.mostActive?.[0]?.ticker || 'N/A'}</p>
                <p className="text-blue-400 text-lg font-semibold">
                  {formatVolume(data.mostActive?.[0]?.volume || 0)} vol
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              {[
                { id: 'gainers', label: 'Top Gainers', emoji: '🟢', count: data.topGainers?.length || 0 },
                { id: 'losers', label: 'Top Losers', emoji: '🔴', count: data.topLosers?.length || 0 },
                { id: 'active', label: 'Most Active', emoji: '🔥', count: data.mostActive?.length || 0 },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  {tab.label}
                  <span className="text-xs px-1.5 py-0.5 bg-slate-700/50 rounded">{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-400 uppercase px-4 py-3">Symbol</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Price</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Change</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">% Change</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Volume</th>
                    <th className="text-center text-xs font-medium text-slate-400 uppercase px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {(activeTab === 'gainers' ? data.topGainers : activeTab === 'losers' ? data.topLosers : data.mostActive)
                    ?.slice(0, 20)
                    .map((mover, idx) => (
                      <tr key={mover.ticker} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-xs">{idx + 1}</span>
                            <span className="font-semibold text-white">{mover.ticker}</span>
                          </div>
                        </td>
                        <td className="text-right px-4 py-3 text-white font-medium">
                          ${mover.price?.toFixed(2) || '0.00'}
                        </td>
                        <td className={`text-right px-4 py-3 font-medium ${mover.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {mover.change >= 0 ? '+' : ''}{mover.change?.toFixed(2) || '0.00'}
                        </td>
                        <td className={`text-right px-4 py-3 font-semibold ${mover.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {mover.changePercent >= 0 ? '+' : ''}{mover.changePercent?.toFixed(2) || '0'}%
                        </td>
                        <td className="text-right px-4 py-3 text-slate-400">
                          {formatVolume(mover.volume)}
                        </td>
                        <td className="text-center px-4 py-3">
                          <a
                            href={`/tools/options-confluence?symbol=${mover.ticker}`}
                            className="text-xs px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                          >
                            Find Setup
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Last Updated */}
            <p className="text-center text-xs text-slate-500 mt-4">
              Last updated: {new Date(data.lastUpdated || data.timestamp).toLocaleString()}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
