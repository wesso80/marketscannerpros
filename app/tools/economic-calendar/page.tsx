'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

interface EconomicEvent {
  date: string;
  time: string;
  event: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

interface CalendarData {
  events: EconomicEvent[];
  grouped: Record<string, EconomicEvent[]>;
  count: number;
  nextMajorEvent: EconomicEvent | null;
  daysUntilMajor: number | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  employment: '👔',
  inflation: '📈',
  central_bank: '🏛️',
  gdp: '📊',
  consumer: '🛒',
  manufacturing: '🏭',
};

const CATEGORY_COLORS: Record<string, string> = {
  employment: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  inflation: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  central_bank: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  gdp: 'bg-green-500/20 text-green-400 border-green-500/30',
  consumer: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  manufacturing: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm} ET`;
}

function getDaysUntil(dateStr: string): number {
  const eventDate = new Date(dateStr);
  const now = new Date();
  return Math.ceil((eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function ImpactBadge({ impact }: { impact: string }) {
  const colors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/50',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    low: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[impact as keyof typeof colors] || colors.low}`}>
      {impact.toUpperCase()}
    </span>
  );
}

export default function EconomicCalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [days, setDays] = useState(30);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    fetchCalendar();
  }, [filter, days]);

  async function fetchCalendar() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        days: days.toString(),
        impact: filter,
      });
      const res = await fetch(`/api/economic-calendar?${params}`);
      if (!res.ok) throw new Error('Failed to fetch calendar');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError('Failed to load economic calendar');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <Header />
      
      <main className="max-w-6xl mx-auto px-4 py-8 pt-24">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Economic Calendar
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Track market-moving economic events. FOMC decisions, jobs reports, inflation data, and more.
          </p>
        </div>

        {/* Next Major Event Card */}
        {data?.nextMajorEvent && (
          <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-sm text-emerald-400 font-medium mb-1">NEXT MAJOR EVENT</div>
                <div className="text-2xl font-bold text-white mb-1">
                  {CATEGORY_ICONS[data.nextMajorEvent.category]} {data.nextMajorEvent.event}
                </div>
                <div className="text-gray-400">
                  {formatDate(data.nextMajorEvent.date)} at {formatTime(data.nextMajorEvent.time)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-emerald-400">
                  {data.daysUntilMajor}
                </div>
                <div className="text-sm text-gray-400">days away</div>
              </div>
            </div>
            {(data.nextMajorEvent.forecast || data.nextMajorEvent.previous) && (
              <div className="mt-4 pt-4 border-t border-emerald-500/20 flex gap-6">
                {data.nextMajorEvent.forecast && (
                  <div>
                    <span className="text-gray-400 text-sm">Forecast:</span>
                    <span className="ml-2 text-white font-medium">{data.nextMajorEvent.forecast}</span>
                  </div>
                )}
                {data.nextMajorEvent.previous && (
                  <div>
                    <span className="text-gray-400 text-sm">Previous:</span>
                    <span className="ml-2 text-white font-medium">{data.nextMajorEvent.previous}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Impact:</span>
            <div className="flex bg-gray-800/50 rounded-lg p-1">
              {(['all', 'high', 'medium'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    filter === level
                      ? 'bg-emerald-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {level === 'all' ? 'All Events' : level.charAt(0).toUpperCase() + level.slice(1) + ' Impact'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Show next:</span>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        </div>

        {/* Calendar Legend */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(CATEGORY_ICONS).map(([category, icon]) => (
            <div
              key={category}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${CATEGORY_COLORS[category]}`}
            >
              <span>{icon}</span>
              <span className="text-sm capitalize">{category.replace('_', ' ')}</span>
            </div>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading economic calendar...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={fetchCalendar}
              className="mt-2 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Try again
            </button>
          </div>
        )}

        {/* Events List */}
        {!loading && !error && data && (
          <div className="space-y-4">
            {data.count === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-xl mb-2">📅</p>
                <p>No events found in this time period</p>
              </div>
            ) : (
              Object.entries(data.grouped).map(([date, events]) => {
                const daysUntil = getDaysUntil(date);
                const isToday = daysUntil === 0;
                const isTomorrow = daysUntil === 1;
                const isExpanded = expandedDate === date;
                
                return (
                  <div
                    key={date}
                    className={`bg-gray-800/30 border rounded-xl overflow-hidden transition-all ${
                      isToday 
                        ? 'border-emerald-500/50 bg-emerald-500/5' 
                        : 'border-gray-700/50 hover:border-gray-600/50'
                    }`}
                  >
                    {/* Date Header */}
                    <button
                      onClick={() => setExpandedDate(isExpanded ? null : date)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${
                          isToday ? 'bg-emerald-500' : 'bg-gray-700'
                        }`}>
                          <span className="text-xs font-medium text-white/70">
                            {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span className="text-lg font-bold text-white">
                            {new Date(date).getDate()}
                          </span>
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-white">
                            {formatDate(date)}
                            {isToday && <span className="ml-2 text-emerald-400 text-sm">(Today)</span>}
                            {isTomorrow && <span className="ml-2 text-yellow-400 text-sm">(Tomorrow)</span>}
                          </div>
                          <div className="text-sm text-gray-400">
                            {events.length} event{events.length !== 1 ? 's' : ''} • 
                            {events.filter(e => e.impact === 'high').length} high impact
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {events.slice(0, 4).map((event, i) => (
                            <span
                              key={i}
                              className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-sm border-2 border-gray-800"
                              title={event.event}
                            >
                              {CATEGORY_ICONS[event.category] || '📅'}
                            </span>
                          ))}
                          {events.length > 4 && (
                            <span className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white border-2 border-gray-800">
                              +{events.length - 4}
                            </span>
                          )}
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    
                    {/* Events Detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-700/50">
                        {events.map((event, index) => (
                          <div
                            key={index}
                            className={`px-4 py-3 flex items-center justify-between gap-4 ${
                              index !== events.length - 1 ? 'border-b border-gray-700/30' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{CATEGORY_ICONS[event.category] || '📅'}</span>
                              <div>
                                <div className="font-medium text-white">{event.event}</div>
                                <div className="text-sm text-gray-400">
                                  {formatTime(event.time)} • {event.country}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {(event.forecast || event.previous) && (
                                <div className="text-right text-sm hidden sm:block">
                                  {event.forecast && (
                                    <div>
                                      <span className="text-gray-500">Forecast:</span>
                                      <span className="ml-1 text-white">{event.forecast}</span>
                                    </div>
                                  )}
                                  {event.previous && (
                                    <div>
                                      <span className="text-gray-500">Previous:</span>
                                      <span className="ml-1 text-gray-400">{event.previous}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <ImpactBadge impact={event.impact} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Stats Summary */}
        {!loading && data && data.count > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{data.count}</div>
              <div className="text-sm text-gray-400">Total Events</div>
            </div>
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">
                {data.events.filter(e => e.impact === 'high').length}
              </div>
              <div className="text-sm text-gray-400">High Impact</div>
            </div>
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">
                {data.events.filter(e => e.category === 'central_bank').length}
              </div>
              <div className="text-sm text-gray-400">Fed Events</div>
            </div>
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">
                {data.events.filter(e => e.category === 'employment').length}
              </div>
              <div className="text-sm text-gray-400">Jobs Data</div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-gray-800/20 border border-gray-700/30 rounded-lg">
          <p className="text-xs text-gray-500 text-center">
            <strong>Disclaimer:</strong> Economic calendar data is provided for informational purposes only. 
            Event times are in Eastern Time (ET). Actual release times may vary. Always verify with official sources 
            before making trading decisions. Past events do not guarantee future results.
          </p>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
