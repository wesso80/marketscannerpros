'use client';

import { useEffect, useState } from 'react';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import { useAIPageContext } from '@/lib/ai/pageContext';

interface EarningsEvent {
  symbol: string;
  name?: string;
  reportDate: string;
  estimate: number | null;
}

interface EarningsData {
  timestamp: string;
  totalUpcoming: number;
  thisWeek: EarningsEvent[];
  nextWeek: EarningsEvent[];
  majorEarnings: EarningsEvent[];
  allUpcoming: EarningsEvent[];
}

export default function EarningsCalendarPage() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'thisWeek' | 'nextWeek' | 'major' | 'all'>('thisWeek');
  const [search, setSearch] = useState('');
  
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/earnings?type=calendar');
        if (!res.ok) throw new Error('Failed to fetch earnings calendar');
        const result = await res.json();
        
        if (result.error) {
          setError(result.error);
          return;
        }
        
        setData(result);
        
        // Set AI context
        setPageData({
          skill: 'earnings',
          symbols: result.majorEarnings?.slice(0, 10).map((e: any) => e.symbol) || [],
          summary: `${result.thisWeek?.length || 0} earnings this week, ${result.nextWeek?.length || 0} next week. Major: ${result.majorEarnings?.slice(0, 5).map((e: any) => e.symbol).join(', ')}`,
          data: {
            thisWeek: result.thisWeek?.slice(0, 10),
            majorEarnings: result.majorEarnings?.slice(0, 10),
          },
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60 * 60 * 1000); // Refresh hourly
    return () => clearInterval(interval);
  }, [setPageData]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getDaysUntil = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const getUrgencyColor = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 1) return 'bg-red-500/20 border-red-500/50 text-red-400';
    if (days <= 3) return 'bg-orange-500/20 border-orange-500/50 text-orange-400';
    if (days <= 7) return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400';
    return 'bg-slate-700/50 border-slate-600/50 text-slate-400';
  };

  const getActiveData = () => {
    if (!data) return [];
    let list = [];
    switch (activeTab) {
      case 'thisWeek': list = data.thisWeek || []; break;
      case 'nextWeek': list = data.nextWeek || []; break;
      case 'major': list = data.majorEarnings || []; break;
      default: list = data.allUpcoming || [];
    }
    
    if (search) {
      list = list.filter(e => 
        e.symbol.toLowerCase().includes(search.toLowerCase()) ||
        e.name?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return list;
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <ToolsPageHeader
        title="Earnings Calendar"
        subtitle="Track upcoming earnings reports and event risk"
        badge="Live"
        icon="📅"
      />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Market Status */}
        <div className="flex items-center justify-between mb-6">
          <MarketStatusBadge showGlobal />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center">
            <p className="text-red-400">⚠️ {error}</p>
          </div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-red-400 text-sm font-medium">This Week</span>
                  <span className="text-2xl">🔥</span>
                </div>
                <p className="text-3xl font-bold text-white">{data.thisWeek?.length || 0}</p>
                <p className="text-red-400/70 text-sm">earnings reports</p>
              </div>

              <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-orange-400 text-sm font-medium">Next Week</span>
                  <span className="text-2xl">📆</span>
                </div>
                <p className="text-3xl font-bold text-white">{data.nextWeek?.length || 0}</p>
                <p className="text-orange-400/70 text-sm">earnings reports</p>
              </div>

              <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-400 text-sm font-medium">Major Names</span>
                  <span className="text-2xl">⭐</span>
                </div>
                <p className="text-3xl font-bold text-white">{data.majorEarnings?.length || 0}</p>
                <p className="text-purple-400/70 text-sm">high-profile earnings</p>
              </div>

              <div className="bg-gradient-to-br from-slate-500/20 to-slate-600/10 border border-slate-500/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm font-medium">Total Upcoming</span>
                  <span className="text-2xl">📊</span>
                </div>
                <p className="text-3xl font-bold text-white">{data.totalUpcoming || 0}</p>
                <p className="text-slate-400/70 text-sm">in next 3 months</p>
              </div>
            </div>

            {/* Event Risk Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-yellow-400 font-medium">Options Event Risk</p>
                  <p className="text-sm text-slate-400">
                    Avoid undefined-risk strategies (naked options) on symbols with earnings within your DTE window.
                    Consider spreads or defined-risk plays for earnings volatility.
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs & Search */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'thisWeek', label: 'This Week', emoji: '🔥', count: data.thisWeek?.length || 0 },
                  { id: 'nextWeek', label: 'Next Week', emoji: '📆', count: data.nextWeek?.length || 0 },
                  { id: 'major', label: 'Major Names', emoji: '⭐', count: data.majorEarnings?.length || 0 },
                  { id: 'all', label: 'All Upcoming', emoji: '📋', count: data.allUpcoming?.length || 0 },
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
              
              <div className="flex-1 md:max-w-xs">
                <input
                  type="text"
                  placeholder="Search symbol..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Earnings Table */}
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-400 uppercase px-4 py-3">Symbol</th>
                    <th className="text-left text-xs font-medium text-slate-400 uppercase px-4 py-3">Company</th>
                    <th className="text-center text-xs font-medium text-slate-400 uppercase px-4 py-3">Report Date</th>
                    <th className="text-center text-xs font-medium text-slate-400 uppercase px-4 py-3">Time Until</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase px-4 py-3">Est. EPS</th>
                    <th className="text-center text-xs font-medium text-slate-400 uppercase px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {getActiveData().slice(0, 50).map((event, idx) => (
                    <tr key={`${event.symbol}-${idx}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-white">{event.symbol}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-sm">
                        {event.name || '-'}
                      </td>
                      <td className="text-center px-4 py-3 text-white">
                        {formatDate(event.reportDate)}
                      </td>
                      <td className="text-center px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded border ${getUrgencyColor(event.reportDate)}`}>
                          {getDaysUntil(event.reportDate)}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 text-slate-400">
                        {event.estimate ? `$${event.estimate.toFixed(2)}` : '-'}
                      </td>
                      <td className="text-center px-4 py-3">
                        <a
                          href={`/tools/company-overview?symbol=${event.symbol}`}
                          className="text-xs px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                        >
                          Analyze
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {getActiveData().length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  No earnings found matching your criteria
                </div>
              )}
            </div>

            {/* Last Updated */}
            <p className="text-center text-xs text-slate-500 mt-4">
              Updated hourly • Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
