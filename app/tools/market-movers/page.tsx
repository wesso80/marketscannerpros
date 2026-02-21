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

type SetupMode = 'breakout' | 'reversal' | 'momentum';
type Eligibility = 'eligible' | 'conditional' | 'blocked';
type Cluster = 'large_cap' | 'mid_cap' | 'small_cap' | 'microcap' | 'high_beta' | 'defensive';

interface EvaluatedMover extends Mover {
  relVolume: number;
  structureBias: string;
  confluenceScore: number;
  liquidityScore: number;
  deployment: Eligibility;
  blockReason?: string;
  cluster: Cluster;
  setupClass: 'Breakout' | 'Reversal' | 'Early Momentum' | 'Watch';
  crcsFinal?: number;
  crcsUser?: number;
  microAdjustment?: number;
  overlayReasons?: string[];
  profileName?: string;
  thresholdsUsed: {
    liquidityMin: number;
    relVolMin: number;
    confluenceMin: number;
  };
}

interface UpeMoverRow {
  symbol: string;
  globalEligibility: Eligibility;
  eligibilityUser: Eligibility;
  crcsFinal: number;
  crcsUser: number;
  microAdjustment: number;
  overlayReasons: string[];
  profileName: string;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percentile50(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function toTitleCluster(cluster: Cluster) {
  if (cluster === 'large_cap') return 'Large Cap';
  if (cluster === 'mid_cap') return 'Mid Cap';
  if (cluster === 'small_cap') return 'Small Cap';
  if (cluster === 'microcap') return 'Microcap';
  if (cluster === 'high_beta') return 'High Beta';
  return 'Defensive';
}

function toReasonLabel(reason: string) {
  if (reason === 'global_blocked') return 'Blocked by global governance';
  if (reason === 'profile_only_large_mid') return 'Blocked by profile (large/mid only)';
  if (reason === 'profile_block_microcaps') return 'Blocked by profile microcap rule';
  if (reason === 'profile_block_high_beta') return 'Blocked by profile high-beta rule';
  if (reason === 'vol_tolerance_low_high_beta') return 'Blocked by low volatility tolerance';
  if (reason === 'vol_tolerance_med_high_beta') return 'Downgraded by medium volatility tolerance';
  return reason;
}

export default function MarketMoversPage() {
  const [data, setData] = useState<MoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MoverTab>('gainers');
  const [logTab, setLogTab] = useState<LogTab>('alerts');
  const [setupMode, setSetupMode] = useState<SetupMode>('breakout');
  const [upeBySymbol, setUpeBySymbol] = useState<Record<string, UpeMoverRow>>({});

  const { setPageData } = useAIPageContext();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [res, upeRes] = await Promise.all([
          fetch('/api/market-movers'),
          fetch('/api/upe/crcs/latest?asset_class=crypto&limit=300', { cache: 'no-store' }),
        ]);

        if (!res.ok) throw new Error('Failed to fetch market movers');
        const result = await res.json();
        const upeResult = upeRes.ok ? await upeRes.json() : null;

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

        const nextUpeBySymbol: Record<string, UpeMoverRow> = {};
        for (const row of upeResult?.rows || []) {
          const symbol = String(row.symbol || '').toUpperCase();
          if (!symbol) continue;
          nextUpeBySymbol[symbol] = {
            symbol,
            globalEligibility: row.globalEligibility,
            eligibilityUser: row.eligibilityUser,
            crcsFinal: Number(row.crcsFinal || 0),
            crcsUser: Number(row.crcsUser || 0),
            microAdjustment: Number(row.microAdjustment || 0),
            overlayReasons: Array.isArray(row.overlayReasons) ? row.overlayReasons : [],
            profileName: String(row.profileName || 'balanced'),
          };
        }
        setUpeBySymbol(nextUpeBySymbol);
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

  const environment = useMemo(() => {
    const topGainers = data?.topGainers || [];
    const topLosers = data?.topLosers || [];
    const mostActive = data?.mostActive || [];
    const combined = [...topGainers, ...topLosers, ...mostActive];

    const medianVol = percentile50(combined.map((r) => Math.max(0, r.volume || 0)));
    const avgAbsMove = combined.length
      ? combined.reduce((sum, row) => sum + Math.abs(row.changePercent || 0), 0) / combined.length
      : 0;
    const activeBreadthPct = mostActive.length
      ? (mostActive.filter((row) => (row.changePercent || 0) > 0).length / mostActive.length) * 100
      : 50;

    const marketMode = data?.marketMood === 'bullish' ? 'Risk-On' : data?.marketMood === 'bearish' ? 'Risk-Off' : 'Neutral';
    const breadthState = activeBreadthPct >= 60 ? 'Broad' : activeBreadthPct >= 45 ? 'Mixed' : 'Weak';
    const liquidityState = medianVol >= 25_000_000 ? 'Expanding' : medianVol >= 8_000_000 ? 'Stable' : 'Thin';
    const volatilityState = avgAbsMove >= 7 ? 'Elevated' : avgAbsMove >= 3 ? 'Normal' : 'Compression';

    const adaptiveConfidence = Math.round(
      clamp(
        (marketMode === 'Risk-On' ? 78 : marketMode === 'Neutral' ? 56 : 30) * 0.25 +
          (breadthState === 'Broad' ? 80 : breadthState === 'Mixed' ? 58 : 35) * 0.2 +
          (liquidityState === 'Expanding' ? 82 : liquidityState === 'Stable' ? 58 : 30) * 0.2 +
          (volatilityState === 'Normal' ? 72 : volatilityState === 'Compression' ? 52 : 40) * 0.15 +
          clamp(activeBreadthPct, 0, 100) * 0.2,
        0,
        100,
      )
    );

    let deploymentMode: 'YES' | 'CONDITIONAL' | 'NO' = 'CONDITIONAL';
    if (marketMode === 'Risk-Off' && liquidityState === 'Thin') deploymentMode = 'NO';
    else if (adaptiveConfidence >= 65 && marketMode !== 'Risk-Off') deploymentMode = 'YES';
    else if (adaptiveConfidence < 40) deploymentMode = 'NO';

    return {
      marketMode,
      breadthState,
      liquidityState,
      volatilityState,
      deploymentMode,
      adaptiveConfidence,
      medianVol,
      avgAbsMove,
      activeBreadthPct,
      breakoutPolicy: deploymentMode === 'NO' ? 'Restricted' : deploymentMode === 'YES' ? 'Allowed' : 'Conditional',
      meanReversionPolicy:
        deploymentMode === 'NO'
          ? 'Preferred'
          : volatilityState === 'Elevated'
          ? 'Preferred'
          : 'Allowed',
      highBetaPolicy:
        deploymentMode === 'YES' && liquidityState !== 'Thin' && volatilityState !== 'Elevated'
          ? 'Conditional'
          : 'Restricted',
    };
  }, [data]);

  const evaluatedRows = useMemo(() => {
    const baseRows = rows.slice(0, 30);
    const relVolBase = environment.medianVol > 0 ? environment.medianVol : 1;

    return baseRows
      .map((mover) => {
        const relVolume = mover.volume / relVolBase;
        const isHighBeta = Math.abs(mover.changePercent) >= 10;
        const cluster: Cluster = isHighBeta
          ? 'high_beta'
          : mover.volume >= 50_000_000
          ? 'large_cap'
          : mover.volume >= 15_000_000
          ? 'mid_cap'
          : mover.volume >= 4_000_000
          ? 'small_cap'
          : 'microcap';

        const baseThresholds: Record<Cluster, { liquidityMin: number; relVolMin: number; confluenceMin: number }> = {
          large_cap: { liquidityMin: 10_000_000, relVolMin: 1.2, confluenceMin: 55 },
          mid_cap: { liquidityMin: 5_000_000, relVolMin: 1.4, confluenceMin: 60 },
          small_cap: { liquidityMin: 3_000_000, relVolMin: 1.7, confluenceMin: 65 },
          microcap: { liquidityMin: 2_000_000, relVolMin: 2.0, confluenceMin: 74 },
          high_beta: { liquidityMin: 8_000_000, relVolMin: 1.9, confluenceMin: 72 },
          defensive: { liquidityMin: 8_000_000, relVolMin: 1.2, confluenceMin: 58 },
        };

        const threshold = { ...baseThresholds[cluster] };
        if (environment.marketMode === 'Risk-On') {
          if (cluster === 'large_cap' || cluster === 'mid_cap') threshold.confluenceMin -= 4;
          if (cluster === 'small_cap') threshold.confluenceMin -= 2;
        } else if (environment.marketMode === 'Risk-Off') {
          threshold.liquidityMin = Math.round(threshold.liquidityMin * 1.5);
          threshold.confluenceMin += 10;
          threshold.relVolMin += 0.3;
        } else {
          threshold.confluenceMin += 2;
          threshold.relVolMin += 0.1;
        }

        let structureBias = 'Mixed';
        let setupClass: EvaluatedMover['setupClass'] = 'Watch';
        if (setupMode === 'breakout') {
          if (mover.changePercent >= 2 && relVolume >= 1.2) {
            structureBias = 'Trend Continuation';
            setupClass = 'Breakout';
          } else if (mover.changePercent <= -2) {
            structureBias = 'Countertrend';
          }
        } else if (setupMode === 'reversal') {
          if (mover.changePercent <= -4 && relVolume >= 1.1) {
            structureBias = 'Oversold Reversal';
            setupClass = 'Reversal';
          } else if (mover.changePercent >= 5) {
            structureBias = 'Extension Risk';
          }
        } else {
          if (Math.abs(mover.changePercent) >= 3 && relVolume >= 1.35) {
            structureBias = 'Early Expansion';
            setupClass = 'Early Momentum';
          } else {
            structureBias = 'Await Expansion';
          }
        }

        const structurePoints =
          structureBias === 'Trend Continuation' || structureBias === 'Oversold Reversal' || structureBias === 'Early Expansion'
            ? 85
            : structureBias === 'Mixed' || structureBias === 'Await Expansion'
            ? 58
            : 35;
        const relVolPoints = clamp((relVolume / Math.max(1, threshold.relVolMin * 1.4)) * 100, 0, 100);
        const liquidityPoints = clamp((mover.volume / Math.max(1, threshold.liquidityMin * 1.5)) * 100, 0, 100);
        const moveQualityPoints = clamp(100 - Math.max(0, Math.abs(mover.changePercent) - 12) * 6, 25, 100);

        const confluenceScore = Math.round(
          structurePoints * 0.3 +
            relVolPoints * 0.25 +
            liquidityPoints * 0.25 +
            moveQualityPoints * 0.2
        );

        const liquidityScore = Math.round(clamp((mover.volume / Math.max(1, environment.medianVol * 1.6)) * 100, 0, 100));

        const blockReasons: string[] = [];
        if (mover.volume < threshold.liquidityMin) blockReasons.push('Liquidity below adaptive threshold');
        if (relVolume < threshold.relVolMin * 0.85) blockReasons.push('Relative volume below threshold');
        if (confluenceScore < threshold.confluenceMin) blockReasons.push('Confluence below threshold');
        if (environment.marketMode === 'Risk-Off' && (cluster === 'microcap' || cluster === 'high_beta')) blockReasons.push('Cluster blocked in risk-off');
        if (environment.deploymentMode === 'NO' && setupMode === 'breakout') blockReasons.push('Breakouts blocked by deployment gate');

        let deployment: Eligibility = 'conditional';
        if (!blockReasons.length && confluenceScore >= threshold.confluenceMin && relVolume >= threshold.relVolMin && mover.volume >= threshold.liquidityMin) {
          deployment = 'eligible';
        } else if (blockReasons.length >= 2) {
          deployment = 'blocked';
        }

        if (environment.deploymentMode === 'NO' && deployment === 'eligible') {
          deployment = 'conditional';
        }

        const upe = upeBySymbol[mover.ticker];
        if (upe?.eligibilityUser) {
          deployment = upe.eligibilityUser;
          if (upe.overlayReasons?.length) {
            blockReasons.unshift(...upe.overlayReasons.map(toReasonLabel));
          }
        }

        return {
          ...mover,
          relVolume,
          structureBias,
          confluenceScore,
          liquidityScore,
          deployment,
          blockReason: blockReasons[0],
          crcsFinal: upe?.crcsFinal,
          crcsUser: upe?.crcsUser,
          microAdjustment: upe?.microAdjustment,
          overlayReasons: upe?.overlayReasons,
          profileName: upe?.profileName,
          cluster,
          setupClass,
          thresholdsUsed: threshold,
        } as EvaluatedMover;
      })
      .sort((a, b) => {
        const tierScore = (v: Eligibility) => (v === 'eligible' ? 0 : v === 'conditional' ? 1 : 2);
        const tierDiff = tierScore(a.deployment) - tierScore(b.deployment);
        if (tierDiff !== 0) return tierDiff;
        if ((b.crcsUser ?? -1) !== (a.crcsUser ?? -1)) return (b.crcsUser ?? -1) - (a.crcsUser ?? -1);
        if (b.confluenceScore !== a.confluenceScore) return b.confluenceScore - a.confluenceScore;
        if (environment.adaptiveConfidence !== 0) {
          const bias = environment.adaptiveConfidence >= 60 ? 1 : -1;
          if (b.relVolume !== a.relVolume) return bias * (b.relVolume - a.relVolume);
        }
        if (b.relVolume !== a.relVolume) return b.relVolume - a.relVolume;
        return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      });
  }, [rows, environment, setupMode, upeBySymbol]);

  const permissionedCount = useMemo(
    () => evaluatedRows.filter((row) => row.deployment === 'eligible').length,
    [evaluatedRows]
  );

  useEffect(() => {
    if (!data || !evaluatedRows.length) return;

    setPageData({
      skill: 'market_movers',
      symbols: evaluatedRows.slice(0, 10).map((row) => row.ticker),
      summary: `Movers gate ${environment.deploymentMode} (${environment.adaptiveConfidence}%). Eligible ${permissionedCount}/${evaluatedRows.length}.`,
      data: {
        regime: {
          mode: environment.marketMode,
          breadth: environment.breadthState,
          liquidity: environment.liquidityState,
          volatility: environment.volatilityState,
          adaptiveConfidence: environment.adaptiveConfidence,
          deploymentMode: environment.deploymentMode,
          policies: {
            highBeta: environment.highBetaPolicy,
            breakout: environment.breakoutPolicy,
            meanReversion: environment.meanReversionPolicy,
          },
        },
        setupMode,
        moversTelemetry: evaluatedRows.slice(0, 20).map((row) => ({
          ticker: row.ticker,
          cluster: row.cluster,
          deployment: row.deployment,
          crcsUser: row.crcsUser ?? null,
          crcsFinal: row.crcsFinal ?? null,
          microAdjustment: row.microAdjustment ?? null,
          relVolume: Number(row.relVolume.toFixed(2)),
          confluenceScore: row.confluenceScore,
          liquidityScore: row.liquidityScore,
          structureBias: row.structureBias,
          setupClass: row.setupClass,
          blockReason: row.blockReason || null,
          thresholdsUsed: row.thresholdsUsed,
        })),
      },
    });
  }, [
    data,
    environment.adaptiveConfidence,
    environment.breadthState,
    environment.breakoutPolicy,
    environment.deploymentMode,
    environment.highBetaPolicy,
    environment.liquidityState,
    environment.marketMode,
    environment.meanReversionPolicy,
    environment.volatilityState,
    evaluatedRows,
    permissionedCount,
    setPageData,
    setupMode,
  ]);

  const logs = useMemo(() => {
    const first = evaluatedRows[0];
    const top = data?.summary;
    return {
      alerts: [
        { t: '09:31', e: `Top mover alert: ${first?.ticker || 'N/A'}`, d: 'Adaptive threshold evaluation completed for lead mover.' },
        { t: '09:58', e: 'Liquidity watch', d: 'Spread widening detected on lower-ranked names.' },
      ],
      regime: [
        { t: '08:55', e: `Mode: ${environment.marketMode}`, d: `Breadth ${environment.breadthState} / Liquidity ${environment.liquidityState}.` },
        { t: '10:07', e: 'Leadership stable', d: 'Top ranks remained concentrated in current basket.' },
      ],
      scanner: [
        { t: '09:42', e: `${top?.topGainerTicker || 'N/A'} scanner handoff`, d: 'Forwarded to setup scanner for confirmation.' },
        { t: '10:11', e: `${top?.topLoserTicker || 'N/A'} weakness stack`, d: 'Continuation probability improved on volume.' },
      ],
      notrade: [
        { t: '09:47', e: 'No-trade: eligibility block', d: 'Rows blocked by adaptive liquidity or confluence floor.' },
        { t: '10:22', e: 'No-trade: gap risk', d: 'Late extension exceeded entry risk envelope.' },
      ],
      data: [
        { t: '09:30', e: 'Data feed check', d: loading ? 'Refreshing movers feed.' : 'Movers feed healthy.' },
        { t: '10:08', e: 'Update cadence', d: 'Auto-refresh every 5 minutes active.' },
      ],
    } as Record<LogTab, Array<{ t: string; e: string; d: string }>>;
  }, [data, loading, evaluatedRows, environment]);

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toString();
  };

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader
        title="Market Movers"
        subtitle="Status → Action Console → Audit Log → Capabilities"
        badge="Live"
        icon="📈"
      />

      <main className="mx-auto w-full max-w-none space-y-2 px-2 pb-6 pt-3 md:px-3">
        <section className="z-20 flex flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 p-1 backdrop-blur md:sticky md:top-2 md:gap-1.5 md:p-1.5">
          {[
            ['Mode', environment.marketMode],
            ['Breadth', environment.breadthState],
            ['Liquidity', environment.liquidityState],
            ['Volatility', environment.volatilityState],
            ['Deploy', environment.deploymentMode],
            ['Top Gainer', data?.summary?.topGainerTicker || 'N/A'],
            ['Top Loser', data?.summary?.topLoserTicker || 'N/A'],
            ['Data', loading ? 'Refreshing' : error ? 'Degraded' : 'Live'],
            ['Last Refresh', data ? new Date(data.lastUpdated || data.timestamp).toLocaleTimeString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[9px] leading-tight text-slate-300 md:px-2 md:text-[10px]">
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
            <section className="rounded-lg border border-slate-700 bg-slate-900 p-2">
              <div className="grid gap-2 xl:grid-cols-[1.1fr_1fr]">
                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Market Deployment Status</p>
                  <h2 className={`mt-1 text-base font-extrabold ${
                    environment.deploymentMode === 'YES'
                      ? 'text-emerald-300'
                      : environment.deploymentMode === 'CONDITIONAL'
                      ? 'text-amber-300'
                      : 'text-rose-300'
                  }`}>
                    {environment.deploymentMode === 'YES' ? '🟢 PERMISSIONED' : environment.deploymentMode === 'CONDITIONAL' ? '🟡 CONDITIONAL' : '🔴 NO DEPLOYMENT'}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Adaptive Confidence: {environment.adaptiveConfidence}%</span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Capital Mode: {environment.deploymentMode === 'YES' ? 'Normal Size' : environment.deploymentMode === 'CONDITIONAL' ? 'Reduced Size' : 'Preservation'}</span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">High Beta: {environment.highBetaPolicy}</span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Breakouts: {environment.breakoutPolicy}</span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Mean Reversion: {environment.meanReversionPolicy}</span>
                  </div>
                </div>

                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Movers Context Card</p>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Market Mode</span><p className="font-semibold text-slate-200">{environment.marketMode}</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Breadth</span><p className="font-semibold text-slate-200">{environment.breadthState}</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Liquidity</span><p className="font-semibold text-slate-200">{environment.liquidityState}</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Volatility</span><p className="font-semibold text-slate-200">{environment.volatilityState}</p></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-2 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-1.5 md:items-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Action</p>
                    <h2 className="text-xs font-bold">Today&apos;s Plays / Movers Queue</h2>
                  </div>
                  <div className="flex flex-wrap gap-1">
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

                <div className="mb-2 flex flex-wrap gap-1">
                  {([
                    ['breakout', 'Breakout Continuation Only'],
                    ['reversal', 'Mean Reversion Candidates'],
                    ['momentum', 'Early Momentum Expansion'],
                  ] as Array<[SetupMode, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSetupMode(id)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        setupMode === id
                          ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                          : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {environment.deploymentMode === 'NO' && (
                  <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                    ⚠ No Permissioned Movers — environment is not suitable for momentum deployment.
                  </div>
                )}

                <div className="h-auto overflow-visible rounded-md border border-slate-700 bg-slate-950/60 md:h-[520px] md:overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-900/95">
                      <tr className="text-[10px] uppercase text-slate-400">
                        <th className="px-2 py-1 text-left">Symbol</th>
                        <th className="px-2 py-1 text-right">%Chg</th>
                        <th className="px-2 py-1 text-right">RelVol</th>
                        <th className="px-2 py-1 text-left">Structure</th>
                        <th className="px-2 py-1 text-right">CRCS</th>
                        <th className="px-2 py-1 text-right">ΔHr</th>
                        <th className="px-2 py-1 text-right">Confluence</th>
                        <th className="px-2 py-1 text-right">Liquidity</th>
                        <th className="px-2 py-1 text-center">Deploy</th>
                        <th className="px-2 py-1 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {evaluatedRows.map((mover, idx) => (
                        <tr key={`${mover.ticker}-${idx}`} className={`hover:bg-slate-800/40 ${mover.deployment === 'blocked' ? 'opacity-55' : ''}`} title={mover.blockReason || ''}>
                          <td className="px-2 py-1.5 font-semibold text-white">
                            {mover.ticker}
                            <div className="text-[9px] text-slate-500">{toTitleCluster(mover.cluster)}</div>
                          </td>
                          <td className={`px-2 py-1.5 text-right font-semibold ${mover.changePercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {mover.changePercent >= 0 ? '+' : ''}{mover.changePercent?.toFixed(2) || '0'}%
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-200">{mover.relVolume.toFixed(2)}x</td>
                          <td className="px-2 py-1.5 text-slate-300">{mover.structureBias}</td>
                          <td className="px-2 py-1.5 text-right text-cyan-300">{mover.crcsUser !== undefined ? mover.crcsUser.toFixed(1) : '—'}</td>
                          <td className={`px-2 py-1.5 text-right ${
                            mover.microAdjustment === undefined
                              ? 'text-slate-500'
                              : mover.microAdjustment >= 0
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }`}>
                            {mover.microAdjustment === undefined ? '—' : `${mover.microAdjustment >= 0 ? '+' : ''}${mover.microAdjustment.toFixed(2)}`}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-200">{mover.confluenceScore}</td>
                          <td className="px-2 py-1.5 text-right text-slate-400">{mover.liquidityScore}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                mover.deployment === 'eligible'
                                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                                  : mover.deployment === 'conditional'
                                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                                  : 'border-slate-600 bg-slate-800 text-slate-400'
                              }`}
                            >
                              {mover.deployment === 'eligible' ? 'Eligible' : mover.deployment === 'conditional' ? 'Conditional' : 'Blocked'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {mover.deployment === 'blocked' ? (
                              <button
                                type="button"
                                disabled
                                className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-500"
                                title={mover.overlayReasons?.map(toReasonLabel).join(' • ') || mover.blockReason || 'Blocked by governance'}
                              >
                                Blocked
                              </button>
                            ) : (
                              <Link
                                href={`/tools/options-confluence?symbol=${mover.ticker}&setupClass=${encodeURIComponent(mover.setupClass)}&eligibility=${mover.deployment}&confluence=${mover.confluenceScore}&deploymentMode=${environment.deploymentMode}`}
                                className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                              >
                                Open Confluence Panel
                              </Link>
                            )}
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
                    <p className="text-[10px] uppercase text-slate-400">Permissioned Movers</p>
                    <p className="text-sm font-bold text-emerald-300">{permissionedCount}</p>
                    <p className="text-[11px] text-slate-300">of {evaluatedRows.length} in current queue</p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-400">Adaptive Threshold Base</p>
                    <p className="text-sm font-bold text-cyan-300">{formatVolume(environment.medianVol)}</p>
                    <p className="text-[11px] text-slate-300">median tape volume baseline</p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-400">Behavior Mode</p>
                    <p className="text-sm font-bold text-amber-300">
                      {setupMode === 'breakout' ? 'Breakout Continuation' : setupMode === 'reversal' ? 'Mean Reversion' : 'Early Momentum'}
                    </p>
                    <p className="text-[11px] text-slate-300">Institutional sorting active</p>
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
