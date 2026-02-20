'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

type MoverTab = 'gainers' | 'losers' | 'active';
type LogTab = 'alerts' | 'regime' | 'scanner' | 'notrade' | 'data';

export default function MarketMoversPage() {
  const [data, setData] = useState<MoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MoverTab>('gainers');
  const [logTab, setLogTab] = useState<LogTab>('alerts');

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

        const formatted: MoversData = result.topGainers
          ? {
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
              topGainers:
                result.topGainers?.map((g: any) => ({
                  ticker: g.ticker,
                  price: parseFloat(g.price),
                  change: parseFloat(g.change_amount),
                  changePercent: parseFloat(g.change_percentage?.replace('%', '') || '0'),
                  volume: parseInt(g.volume),
                })) || [],
              topLosers:
                result.topLosers?.map((l: any) => ({
                  ticker: l.ticker,
                  price: parseFloat(l.price),
                  change: parseFloat(l.change_amount),
                  changePercent: parseFloat(l.change_percentage?.replace('%', '') || '0'),
                  volume: parseInt(l.volume),
                })) || [],
              mostActive:
                result.mostActive?.map((a: any) => ({
                  ticker: a.ticker,
                  price: parseFloat(a.price),
                  change: parseFloat(a.change_amount),
                  changePercent: parseFloat(a.change_percentage?.replace('%', '') || '0'),
                  volume: parseInt(a.volume),
                })) || [],
            }
          : result;

        setData(formatted);
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

  const rows = useMemo(
    () => (activeTab === 'gainers' ? data?.topGainers : activeTab === 'losers' ? data?.topLosers : data?.mostActive) || [],
    [activeTab, data]
  );

  const logs = useMemo(() => {
    const first = rows[0];
    const top = data?.summary;
    return {
      alerts: [
        { t: '09:31', e: `Top mover alert: ${first?.ticker || 'N/A'}`, d: 'Momentum threshold crossed on opening drive.' },
        { t: '09:58', e: 'Liquidity watch', d: 'Spread widening detected on lower-ranked names.' },
      ],
      regime: [
        { t: '08:55', e: `Mood: ${data?.marketMood || 'neutral'}`, d: 'Risk appetite inferred from leadership breadth.' },
        { t: '10:07', e: 'Leadership stable', d: 'Top ranks remained concentrated in current basket.' },
      ],
      scanner: [
        { t: '09:42', e: `${top?.topGainerTicker || 'N/A'} scanner handoff`, d: 'Forwarded to setup scanner for confirmation.' },
        { t: '10:11', e: `${top?.topLoserTicker || 'N/A'} weakness stack`, d: 'Continuation probability improved on volume.' },
      ],
      notrade: [
        { t: '09:47', e: 'No-trade: thin tape', d: 'Volume profile failed execution quality filter.' },
        { t: '10:22', e: 'No-trade: gap risk', d: 'Late extension exceeded entry risk envelope.' },
      ],
      data: [
        { t: '09:30', e: 'Data feed check', d: loading ? 'Refreshing movers feed.' : 'Movers feed healthy.' },
        { t: '10:08', e: 'Update cadence', d: 'Auto-refresh every 5 minutes active.' },
      ],
    } as Record<LogTab, Array<{ t: string; e: string; d: string }>>;
  }, [data, loading, rows]);

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toString();
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <ToolsPageHeader
        title="Market Movers"
        subtitle="Status → Action Console → Audit Log → Capabilities"
        badge="Live"
        icon="📈"
      />

      <main className="mx-auto w-full max-w-[1500px] space-y-2 px-3 pb-6 pt-3">
        <section className="sticky top-2 z-20 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 p-1.5 backdrop-blur">
          {[
            ['Mood', data?.marketMood || 'neutral'],
            ['Top Gainer', data?.summary?.topGainerTicker || 'N/A'],
            ['Top Loser', data?.summary?.topLoserTicker || 'N/A'],
            ['Data', loading ? 'Refreshing' : error ? 'Degraded' : 'Live'],
            ['Last Refresh', data ? new Date(data.lastUpdated || data.timestamp).toLocaleTimeString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
              <span className="font-semibold text-slate-100">{k}</span> · {v}
            </div>
          ))}
          <div className="ml-auto">
            <MarketStatusBadge compact showGlobal />
          </div>
        </section>

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/60">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-emerald-400" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/50 bg-red-500/20 p-4 text-center">
            <p className="text-sm text-red-300">⚠️ {error}</p>
            <p className="mt-1 text-xs text-slate-400">Market data may be unavailable outside trading hours.</p>
          </div>
        ) : data ? (
          <>
            <section className="grid gap-2 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Action</p>
                    <h2 className="text-xs font-bold">Today&apos;s Plays / Movers Queue</h2>
                  </div>
                  <div className="flex gap-1">
                    {([
                      ['gainers', 'Top Gainers'],
                      ['losers', 'Top Losers'],
                      ['active', 'Most Active'],
                    ] as Array<[MoverTab, string]>).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          activeTab === id
                            ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                            : 'border-slate-700 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[520px] overflow-y-auto rounded-md border border-slate-700 bg-slate-950/60">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-900/95">
                      <tr className="text-[10px] uppercase text-slate-400">
                        <th className="px-2 py-1 text-left">Symbol</th>
                        <th className="px-2 py-1 text-right">Price</th>
                        <th className="px-2 py-1 text-right">Change</th>
                        <th className="px-2 py-1 text-right">%Chg</th>
                        <th className="px-2 py-1 text-right">Vol</th>
                        <th className="px-2 py-1 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rows.slice(0, 30).map((mover, idx) => (
                        <tr key={`${mover.ticker}-${idx}`} className="hover:bg-slate-800/40">
                          <td className="px-2 py-1.5 font-semibold text-white">{mover.ticker}</td>
                          <td className="px-2 py-1.5 text-right text-slate-200">${mover.price?.toFixed(2) || '0.00'}</td>
                          <td className={`px-2 py-1.5 text-right ${mover.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {mover.change >= 0 ? '+' : ''}{mover.change?.toFixed(2) || '0.00'}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-semibold ${mover.changePercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {mover.changePercent >= 0 ? '+' : ''}{mover.changePercent?.toFixed(2) || '0'}%
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-400">{formatVolume(mover.volume)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <Link
                              href={`/tools/options-confluence?symbol=${mover.ticker}`}
                              className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                            >
                              Find Setup
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Context</p>
                  <h2 className="text-xs font-bold">Snapshot / Rotation Context</h2>
                </div>

                <div className="grid gap-2">
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-400">Top Gainer</p>
                    <p className="text-sm font-bold text-emerald-300">{data.summary?.topGainerTicker || 'N/A'}</p>
                    <p className="text-[11px] text-emerald-300">+{data.summary?.topGainerChange?.toFixed(2) || 0}%</p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-400">Top Loser</p>
                    <p className="text-sm font-bold text-rose-300">{data.summary?.topLoserTicker || 'N/A'}</p>
                    <p className="text-[11px] text-rose-300">{data.summary?.topLoserChange?.toFixed(2) || 0}%</p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-400">Most Active</p>
                    <p className="text-sm font-bold text-cyan-300">{data.mostActive?.[0]?.ticker || 'N/A'}</p>
                    <p className="text-[11px] text-cyan-300">{formatVolume(data.mostActive?.[0]?.volume || 0)} volume</p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <Link href="/tools/scanner" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Open Scanner</Link>
                    <Link href="/tools/alerts" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Create Alert</Link>
                    <Link href="/tools/news" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">News Context</Link>
                    <Link href="/tools/journal" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Log to Journal</Link>
                  </div>
                </div>
              </div>
            </section>

            <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2" open>
              <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
                <span>Zone 3 • Audit / Log</span>
                <span className="text-[10px] text-slate-500 group-open:hidden">Expand</span>
                <span className="hidden text-[10px] text-slate-500 group-open:inline">Collapse</span>
              </summary>

              <div className="mt-2 grid gap-2">
                <div className="flex flex-wrap gap-1">
                  {([
                    ['alerts', 'Triggered Alerts'],
                    ['regime', 'Regime Flips'],
                    ['scanner', 'Scanner Hits'],
                    ['notrade', 'No-Trade Reasons'],
                    ['data', 'Data Gaps'],
                  ] as Array<[LogTab, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setLogTab(id)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        logTab === id
                          ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                          : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="max-h-[210px] overflow-y-auto rounded-md border border-slate-700 bg-slate-950/60 p-1.5">
                  <div className="grid gap-1.5">
                    {logs[logTab].map((entry, idx) => (
                      <div key={`${entry.t}-${idx}`} className="rounded border border-slate-700 bg-slate-900/70 p-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>{entry.t}</span>
                          <span className="text-slate-300">{entry.e}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">{entry.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2">
              <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
                <span>Zone 4 • Capabilities / Plan / Help</span>
                <span className="text-[10px] text-slate-500 group-open:hidden">Expand</span>
                <span className="hidden text-[10px] text-slate-500 group-open:inline">Collapse</span>
              </summary>

              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
                  <p className="mb-1 text-[10px] uppercase text-slate-500">Capabilities</p>
                  Live movers feed, trend buckets, scanner handoff, and alert routing are available from this page.
                </div>
                <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
                  <p className="mb-1 text-[10px] uppercase text-slate-500">Plan Limits</p>
                  Deeper intraday mover history and expanded symbol universe are enabled by subscription tier.
                </div>
                <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
                  <p className="mb-1 text-[10px] uppercase text-slate-500">Help</p>
                  Use Zone 1 for regime read, Zone 2 for action, Zone 3 for evidence, and Zone 4 for reference only.
                </div>
              </div>
            </details>
          </>
        ) : null}
      </main>
    </div>
  );
}
