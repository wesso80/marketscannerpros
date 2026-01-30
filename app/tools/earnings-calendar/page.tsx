'use client';

import React, { useState, useEffect } from 'react';

interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

interface RecentResult {
  symbol: string;
  name: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
  beat: boolean;
  history: Array<{
    fiscalDateEnding: string;
    reportedDate: string;
    reportedEPS: number | null;
    estimatedEPS: number | null;
    surprise: number | null;
    surprisePercentage: number | null;
  }>;
}

interface CalendarData {
  success: boolean;
  earnings: EarningsEvent[];
  count: number;
  recentResults: RecentResult[];
  aiAnalysis: string | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
}

function getDaysUntil(dateStr: string): number {
  const eventDate = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  return Math.ceil((eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function SurpriseBadge({ percentage }: { percentage: number | null }) {
  if (percentage === null) {
    return <span className="text-gray-500 text-xs">N/A</span>;
  }
  
  const beat = percentage > 0;
  const color = beat 
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
    : 'bg-red-500/20 text-red-400 border-red-500/50';
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {beat ? '▲' : '▼'} {Math.abs(percentage).toFixed(1)}%
    </span>
  );
}

function TimeframeBadge({ days }: { days: number }) {
  if (days === 0) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
        TODAY
      </span>
    );
  }
  if (days === 1) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/50">
        TOMORROW
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50">
        {days} days
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs text-gray-400">
      {days} days
    </span>
  );
}

export default function EarningsCalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<'3month' | '6month' | '12month'>('3month');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [groupByDate, setGroupByDate] = useState(true);

  useEffect(() => {
    fetchCalendar();
  }, [horizon, searchSymbol]);

  async function fetchCalendar() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        horizon,
        includeResults: 'true',
        includeAI: 'true',
      });
      if (searchSymbol.trim()) {
        params.set('symbol', searchSymbol.trim().toUpperCase());
      }
      const res = await fetch(`/api/earnings-calendar?${params}`);
      if (!res.ok) throw new Error('Failed to fetch earnings calendar');
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load earnings data');
      }
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load earnings calendar');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Group earnings by date
  const groupedEarnings = data?.earnings.reduce((acc, earning) => {
    const date = earning.reportDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(earning);
    return acc;
  }, {} as Record<string, EarningsEvent[]>) || {};

  const sortedDates = Object.keys(groupedEarnings).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  );

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 pt-24">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-emerald-400 to-amber-400 bg-clip-text text-transparent">
              Earnings Calendar
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Track upcoming earnings reports and recent results. See which companies beat or missed estimates.
          </p>
        </div>

        {/* AI Analysis Card */}
        {data?.aiAnalysis && (
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-6 mb-8">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <div className="text-sm text-purple-400 font-medium mb-2">AI EARNINGS ANALYSIS</div>
                <p className="text-gray-300">{data.aiAnalysis}</p>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-[#0a1628]/80 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-3">
              {/* Horizon Filter */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Horizon:</span>
                <div className="flex bg-black/30 rounded-lg p-1">
                  {(['3month', '6month', '12month'] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => setHorizon(h)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        horizon === h
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {h === '3month' ? '3M' : h === '6month' ? '6M' : '12M'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group Toggle */}
              <button
                onClick={() => setGroupByDate(!groupByDate)}
                className={`px-3 py-1 rounded text-sm transition-colors border ${
                  groupByDate
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'text-gray-400 hover:text-white border-white/10'
                }`}
              >
                📅 Group by Date
              </button>
            </div>

            {/* Symbol Search */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && fetchCalendar()}
                placeholder="Search symbol (e.g., AAPL)"
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm w-full md:w-48 focus:outline-none focus:border-emerald-500/50"
              />
              <button
                onClick={fetchCalendar}
                disabled={loading}
                className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors border border-emerald-500/30 disabled:opacity-50"
              >
                {loading ? '...' : '🔍'}
              </button>
            </div>
          </div>
        </div>

        {/* Recent Results Summary */}
        {data?.recentResults && data.recentResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              📊 Recent Earnings Results
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {data.recentResults.map((result) => (
                <div
                  key={result.symbol}
                  className={`bg-[#0a1628]/80 border rounded-xl p-4 ${
                    result.beat 
                      ? 'border-emerald-500/30' 
                      : 'border-red-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">{result.symbol}</span>
                    <SurpriseBadge percentage={result.surprisePercentage} />
                  </div>
                  <div className="text-xs text-gray-400 mb-2 truncate">{result.name}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Reported</span>
                      <div className={result.beat ? 'text-emerald-400' : 'text-red-400'}>
                        ${result.reportedEPS?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Estimate</span>
                      <div className="text-gray-300">
                        ${result.estimatedEPS?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400"></div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={fetchCalendar}
              className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Earnings Calendar */}
        {!loading && !error && data && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                📅 Upcoming Earnings
                <span className="text-sm font-normal text-gray-400">
                  ({data.count} reports)
                </span>
              </h2>
            </div>

            {groupByDate ? (
              // Grouped by Date View
              <div className="space-y-6">
                {sortedDates.length === 0 ? (
                  <div className="bg-[#0a1628]/80 border border-white/10 rounded-xl p-8 text-center">
                    <p className="text-gray-400">No earnings reports found for the selected criteria.</p>
                  </div>
                ) : (
                  sortedDates.map((date) => {
                    const daysUntil = getDaysUntil(date);
                    const events = groupedEarnings[date];
                    
                    return (
                      <div key={date} className="bg-[#0a1628]/80 border border-white/10 rounded-xl overflow-hidden">
                        {/* Date Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-white">
                              {formatDate(date)}
                            </span>
                            <TimeframeBadge days={daysUntil} />
                          </div>
                          <span className="text-sm text-gray-400">
                            {events.length} report{events.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        {/* Events */}
                        <div className="divide-y divide-white/5">
                          {events.map((earning, idx) => (
                            <div key={`${earning.symbol}-${idx}`} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-16">
                                  <span className="font-bold text-emerald-400">{earning.symbol}</span>
                                </div>
                                <div className="text-gray-300 truncate max-w-[200px] md:max-w-[300px]">
                                  {earning.name}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                {earning.estimate !== null && (
                                  <div className="text-right">
                                    <div className="text-xs text-gray-500">Est. EPS</div>
                                    <div className="text-sm text-white">${earning.estimate.toFixed(2)}</div>
                                  </div>
                                )}
                                <div className="text-right hidden md:block">
                                  <div className="text-xs text-gray-500">Fiscal End</div>
                                  <div className="text-sm text-gray-400">{formatShortDate(earning.fiscalDateEnding)}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              // Table View
              <div className="bg-[#0a1628]/80 border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Symbol</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Company</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Report Date</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Est. EPS</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Fiscal End</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.earnings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                            No earnings reports found for the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        data.earnings.map((earning, idx) => {
                          const daysUntil = getDaysUntil(earning.reportDate);
                          return (
                            <tr key={`${earning.symbol}-${idx}`} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3">
                                <span className="font-bold text-emerald-400">{earning.symbol}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">
                                {earning.name}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-white">{formatShortDate(earning.reportDate)}</span>
                                  <TimeframeBadge days={daysUntil} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-white">
                                {earning.estimate !== null ? `$${earning.estimate.toFixed(2)}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-400">
                                {formatShortDate(earning.fiscalDateEnding)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Attribution */}
        <div className="mt-8 text-center text-xs text-gray-500">
          Data provided by Alpha Vantage
        </div>
      </div>
    </div>
  );
}
