'use client';

import { useEffect, useState } from 'react';

interface EarningsData {
  symbol: string;
  reportDate: string;
  daysUntil: number;
  estimate: number | null;
}

interface EarningsInfo {
  hasUpcoming: boolean;
  earnings: EarningsData | null;
  beatRate: number | null;
  warning: string | null;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
}

export function useEarningsRisk(symbol: string | null): EarningsInfo & { loading: boolean } {
  const [data, setData] = useState<EarningsInfo>({
    hasUpcoming: false,
    earnings: null,
    beatRate: null,
    warning: null,
    riskLevel: 'none',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;

    const checkEarnings = async () => {
      setLoading(true);
      try {
        // Check calendar for this symbol
        const calRes = await fetch('/api/earnings?type=calendar');
        if (!calRes.ok) throw new Error('Failed to fetch earnings');
        
        const calendar = await calRes.json();
        const allEarnings = [...(calendar.thisWeek || []), ...(calendar.nextWeek || []), ...(calendar.allUpcoming || [])];
        
        // Find earnings for this symbol
        const symbolEarnings = allEarnings.find((e: any) => 
          e.symbol?.toUpperCase() === symbol.toUpperCase()
        );
        
        if (!symbolEarnings) {
          setData({ hasUpcoming: false, earnings: null, beatRate: null, warning: null, riskLevel: 'none' });
          return;
        }
        
        // Calculate days until earnings
        const reportDate = new Date(symbolEarnings.reportDate);
        const now = new Date();
        const daysUntil = Math.ceil((reportDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        // Fetch beat rate history
        let beatRate: number | null = null;
        try {
          const histRes = await fetch(`/api/earnings?type=history&symbol=${symbol}`);
          if (histRes.ok) {
            const hist = await histRes.json();
            beatRate = hist.beatRate || null;
          }
        } catch (e) {
          // Ignore history fetch errors
        }
        
        // Determine risk level based on days until earnings
        let riskLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
        let warning: string | null = null;
        
        if (daysUntil <= 3) {
          riskLevel = 'high';
          warning = `⚠️ EARNINGS IN ${daysUntil} DAY${daysUntil === 1 ? '' : 'S'} - Use defined risk strategies only`;
        } else if (daysUntil <= 7) {
          riskLevel = 'medium';
          warning = `⚡ Earnings in ${daysUntil} days - Consider event risk`;
        } else if (daysUntil <= 14) {
          riskLevel = 'low';
          warning = `📅 Earnings on ${symbolEarnings.reportDate}`;
        }
        
        setData({
          hasUpcoming: true,
          earnings: {
            symbol: symbolEarnings.symbol,
            reportDate: symbolEarnings.reportDate,
            daysUntil,
            estimate: symbolEarnings.estimate,
          },
          beatRate,
          warning,
          riskLevel,
        });
      } catch (e) {
        console.error('Earnings check failed:', e);
        setData({ hasUpcoming: false, earnings: null, beatRate: null, warning: null, riskLevel: 'none' });
      } finally {
        setLoading(false);
      }
    };

    checkEarnings();
  }, [symbol]);

  return { ...data, loading };
}

// Component to display earnings warning
export function EarningsWarningBadge({ symbol }: { symbol: string }) {
  const { hasUpcoming, earnings, warning, riskLevel, beatRate, loading } = useEarningsRisk(symbol);

  if (loading || !hasUpcoming || !warning) return null;

  const colors = {
    high: 'bg-red-500/20 border-red-500/50 text-red-400',
    medium: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
    low: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
    none: 'bg-slate-500/20 border-slate-500/50 text-slate-400',
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${colors[riskLevel]}`}>
      <div className="flex-1">
        <p className="text-sm font-medium">{warning}</p>
        {beatRate !== null && (
          <p className="text-xs opacity-75 mt-0.5">
            Historical beat rate: {beatRate}%
          </p>
        )}
      </div>
      {riskLevel === 'high' && (
        <span className="text-xs px-2 py-0.5 bg-red-500/30 rounded font-medium">
          AVOID UNDEFINED RISK
        </span>
      )}
    </div>
  );
}
