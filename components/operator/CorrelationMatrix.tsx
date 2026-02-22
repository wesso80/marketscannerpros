'use client';

import React, { useEffect, useMemo, useState } from 'react';

interface Position {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  riskR: number;
  cluster: string;
  unrealizedR?: number;
}

const CLUSTER_COLORS: Record<string, string> = {
  AI_TECH: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  GROWTH: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  ENERGY: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  FINANCIALS: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  CRYPTO_BETA: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  CRYPTO_AI: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  CRYPTO_L1: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  CRYPTO_OTHER: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  OTHER: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

function inferCluster(symbol: string): string {
  const s = symbol.toUpperCase();
  if (/^(NVDA|AAPL|AMD|MSFT|META|GOOGL|QQQ|SOXL|TSLA)$/.test(s)) return 'AI_TECH';
  if (/^(IWM|ARKK|SHOP|SNOW|NET|PLTR)$/.test(s)) return 'GROWTH';
  if (/^(XOM|CVX|COP|XLE)$/.test(s)) return 'ENERGY';
  if (/^(JPM|BAC|GS|MS|XLF)$/.test(s)) return 'FINANCIALS';
  if (/^(BTC|ETH|SOL|AVAX|RNDR|FET|TAO|NEAR|APT|ARB|OP|SUI)$/.test(s)) return 'CRYPTO_BETA';
  if (/^(FET|RNDR|TAO|AGIX|OCEAN|GRT)$/.test(s)) return 'CRYPTO_AI';
  if (/^(ADA|DOT|ATOM|AVAX|SOL|NEAR)$/.test(s)) return 'CRYPTO_L1';
  // Check if it looks like crypto
  if (/^[A-Z]{2,6}$/.test(s) && !s.includes('.')) return 'CRYPTO_OTHER';
  return 'OTHER';
}

/**
 * Portfolio Correlation Matrix — visual display of open position clustering.
 * Shows directional exposure by cluster and highlights concentration risk.
 */
export default function CorrelationMatrix() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPositions() {
      try {
        const res = await fetch('/api/portfolio?view=positions', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const mapped: Position[] = (data?.positions ?? data ?? []).map((p: any) => ({
          symbol: String(p.symbol ?? p.ticker ?? '').toUpperCase(),
          direction: (p.direction ?? p.side ?? 'LONG').toUpperCase() as 'LONG' | 'SHORT',
          riskR: Number(p.risk_r ?? p.riskR ?? 0.5),
          cluster: inferCluster(String(p.symbol ?? p.ticker ?? '')),
          unrealizedR: p.unrealized_r ?? p.unrealizedR,
        }));
        setPositions(mapped);
      } catch {} finally {
        setLoading(false);
      }
    }
    void loadPositions();
    const interval = window.setInterval(() => { void loadPositions(); }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const clusters = useMemo(() => {
    const map: Record<string, { long: Position[]; short: Position[]; totalRiskR: number }> = {};
    for (const p of positions) {
      if (!map[p.cluster]) map[p.cluster] = { long: [], short: [], totalRiskR: 0 };
      if (p.direction === 'LONG') map[p.cluster].long.push(p);
      else map[p.cluster].short.push(p);
      map[p.cluster].totalRiskR += p.riskR;
    }
    return map;
  }, [positions]);

  const clusterEntries = Object.entries(clusters).sort((a, b) => b[1].totalRiskR - a[1].totalRiskR);
  const totalLong = positions.filter(p => p.direction === 'LONG').reduce((s, p) => s + p.riskR, 0);
  const totalShort = positions.filter(p => p.direction === 'SHORT').reduce((s, p) => s + p.riskR, 0);
  const netExposure = totalLong - totalShort;

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="text-xs text-slate-500">Loading correlation data...</div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Portfolio Correlation Matrix</div>
        <div className="text-xs text-slate-500">No open positions. Matrix will populate when positions are active.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Portfolio Correlation Matrix</div>
        <div className="flex gap-3 text-[10px]">
          <span className="text-emerald-400">Long: {totalLong.toFixed(1)}R</span>
          <span className="text-red-400">Short: {totalShort.toFixed(1)}R</span>
          <span className={netExposure > 0 ? 'text-emerald-300' : netExposure < 0 ? 'text-red-300' : 'text-slate-400'}>
            Net: {netExposure > 0 ? '+' : ''}{netExposure.toFixed(1)}R
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {clusterEntries.map(([cluster, data]) => {
          const maxCorrelated = 2;
          const longCount = data.long.length;
          const shortCount = data.short.length;
          const maxSameDir = Math.max(longCount, shortCount);
          const isConcentrated = maxSameDir >= maxCorrelated;

          return (
            <div key={cluster} className={`rounded-lg border p-3 ${isConcentrated ? 'border-red-500/40 bg-red-500/5' : 'border-slate-700 bg-slate-950/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${CLUSTER_COLORS[cluster] ?? CLUSTER_COLORS.OTHER}`}>
                    {cluster}
                  </span>
                  {isConcentrated && (
                    <span className="rounded border border-red-500/40 bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                      CONCENTRATED
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500">{data.totalRiskR.toFixed(1)}R total</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {data.long.map(p => (
                  <div key={p.symbol} className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span className="font-bold text-emerald-300">{p.symbol}</span>
                    <span className="text-emerald-500">{p.riskR.toFixed(1)}R</span>
                  </div>
                ))}
                {data.short.map(p => (
                  <div key={p.symbol} className="flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    <span className="font-bold text-red-300">{p.symbol}</span>
                    <span className="text-red-500">{p.riskR.toFixed(1)}R</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Direction Bar */}
      <div className="mt-3">
        <div className="text-[9px] uppercase text-slate-500 mb-1">Directional Balance</div>
        <div className="flex h-3 rounded-full overflow-hidden border border-slate-700">
          {totalLong > 0 && (
            <div
              className="bg-emerald-500/60"
              style={{ width: `${(totalLong / (totalLong + totalShort)) * 100}%` }}
            />
          )}
          {totalShort > 0 && (
            <div
              className="bg-red-500/60"
              style={{ width: `${(totalShort / (totalLong + totalShort)) * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
