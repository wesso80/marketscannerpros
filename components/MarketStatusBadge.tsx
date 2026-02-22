'use client';

import { useEffect, useState } from 'react';

interface MarketStatus {
  us: {
    status: string;
    session: 'pre-market' | 'regular' | 'after-hours' | 'closed';
    sessionDisplay: string;
    nextEvent: string;
  };
  global: {
    forex: { status: string };
    crypto: { status: string };
  };
}

export default function MarketStatusBadge({ 
  compact = false,
  showGlobal = false,
}: { 
  compact?: boolean;
  showGlobal?: boolean;
}) {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/market-status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (e) {
        console.error('Failed to fetch market status:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    // Refresh every 5 minutes
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg animate-pulse">
        <div className="w-2 h-2 bg-slate-600 rounded-full" />
        <span className="text-xs text-slate-500">Loading...</span>
      </div>
    );
  }

  if (!status) return null;

  const getStatusColor = (session: string) => {
    switch (session) {
      case 'regular': return { dot: 'bg-green-500', text: 'text-green-400', glow: 'shadow-green-500/50' };
      case 'pre-market': return { dot: 'bg-yellow-500', text: 'text-yellow-400', glow: 'shadow-yellow-500/50' };
      case 'after-hours': return { dot: 'bg-orange-500', text: 'text-orange-400', glow: 'shadow-orange-500/50' };
      default: return { dot: 'bg-red-500', text: 'text-red-400', glow: 'shadow-red-500/50' };
    }
  };

  const colors = getStatusColor(status.us.session);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${colors.dot} shadow-lg ${colors.glow} animate-pulse`} />
        <span className={`text-xs font-medium ${colors.text}`}>
          {status.us.session === 'regular' ? 'OPEN' : (status.us.session ?? 'closed').toUpperCase().replace('-', ' ')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* US Market */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg">
        <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} shadow-lg ${colors.glow} ${status.us.session === 'regular' ? 'animate-pulse' : ''}`} />
        <div className="flex flex-col">
          <span className={`text-xs font-semibold ${colors.text}`}>
            US: {status.us.sessionDisplay}
          </span>
          {status.us.nextEvent && (
            <span className="text-[10px] text-slate-500">{status.us.nextEvent}</span>
          )}
        </div>
      </div>

      {/* Global Markets */}
      {showGlobal && (
        <>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/30 rounded">
            <div className={`w-1.5 h-1.5 rounded-full ${status.global.forex.status === 'open' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[10px] text-slate-400">FX</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/30 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-slate-400">Crypto</span>
          </div>
        </>
      )}
    </div>
  );
}

// Export a hook for use in other components
export function useMarketStatus() {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/market-status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (e) {
        console.error('Failed to fetch market status:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const isMarketOpen = status?.us.session === 'regular';
  const isPreMarket = status?.us.session === 'pre-market';
  const isAfterHours = status?.us.session === 'after-hours';
  const isClosed = status?.us.session === 'closed';

  return {
    status,
    loading,
    isMarketOpen,
    isPreMarket,
    isAfterHours,
    isClosed,
    session: status?.us.session || 'closed',
    sessionDisplay: status?.us.sessionDisplay || 'Closed',
    nextEvent: status?.us.nextEvent || '',
  };
}
