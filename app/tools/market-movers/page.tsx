'use client';

import MoversView from '@/components/markets/MoversView';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { useAIPageContext } from '@/lib/ai/pageContext';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

interface Mover {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  asset_class: 'equity' | 'crypto';
  rsi14: number | null;
  ema200_dist: number | null;
  adx14: number | null;
  in_squeeze: boolean | null;
  rs_vs_index: number | null;
  momentum_accel: number | null;
  /** True when indicators_latest has a daily row (worker universe). */
  inUniverse?: boolean;
}

type AssetFilter = 'all' | 'equity' | 'crypto';
type SetupMode = 'breakout' | 'reversal' | 'momentum';
type Eligibility = 'eligible' | 'conditional' | 'blocked';
type Cluster = 'large_cap' | 'mid_cap' | 'small_cap' | 'microcap' | 'high_beta' | 'defensive';

export interface EvaluatedMover extends Mover {
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
  rsLabel?: string;
  accelLabel?: string;
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

export interface MoversData {
  timestamp: string;
  lastUpdated: string;
  /** Alpha Vantage `last_updated` for the equity lists. */
  equityAsOf?: string | null;
  equityFeed?: 'realtime' | 'end_of_day' | 'unavailable';
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percentile50(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

export default function MarketMoversPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { tier, isLoading: tierLoading } = useUserTier();
  const [data, setData] = useState<MoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MoverTab>('gainers');
  const [setupMode, setSetupMode] = useState<SetupMode>('breakout');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [upeBySymbol, setUpeBySymbol] = useState<Record<string, UpeMoverRow>>({});

  const { setPageData } = useAIPageContext();

  const fetchData = useCallback(async () => {
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
            equityAsOf: result.equityAsOf ?? null,
            equityFeed: result.equityFeed,
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
                price: parseFloat(g.price) || 0,
                change: parseFloat(g.change_amount) || 0,
                changePercent: parseFloat(g.change_percentage?.replace('%', '') || '0') || 0,
                volume: parseInt(g.volume, 10) || 0,
                asset_class: g.asset_class || 'crypto',
                rsi14: g.rsi14 ?? null,
                ema200_dist: g.ema200_dist ?? null,
                adx14: g.adx14 ?? null,
                in_squeeze: g.in_squeeze ?? null,
                rs_vs_index: g.rs_vs_index ?? null,
                momentum_accel: g.momentum_accel ?? null,
                inUniverse: g.in_universe === true,
              })) || [],
            topLosers:
              result.topLosers?.map((l: any) => ({
                ticker: l.ticker,
                price: parseFloat(l.price) || 0,
                change: parseFloat(l.change_amount) || 0,
                changePercent: parseFloat(l.change_percentage?.replace('%', '') || '0') || 0,
                volume: parseInt(l.volume, 10) || 0,
                asset_class: l.asset_class || 'crypto',
                rsi14: l.rsi14 ?? null,
                ema200_dist: l.ema200_dist ?? null,
                adx14: l.adx14 ?? null,
                in_squeeze: l.in_squeeze ?? null,
                rs_vs_index: l.rs_vs_index ?? null,
                momentum_accel: l.momentum_accel ?? null,
                inUniverse: l.in_universe === true,
              })) || [],
            mostActive:
              result.mostActive?.map((a: any) => ({
                ticker: a.ticker,
                price: parseFloat(a.price) || 0,
                change: parseFloat(a.change_amount) || 0,
                changePercent: parseFloat(a.change_percentage?.replace('%', '') || '0') || 0,
                volume: parseInt(a.volume, 10) || 0,
                asset_class: a.asset_class || 'crypto',
                rsi14: a.rsi14 ?? null,
                ema200_dist: a.ema200_dist ?? null,
                adx14: a.adx14 ?? null,
                in_squeeze: a.in_squeeze ?? null,
                rs_vs_index: a.rs_vs_index ?? null,
                momentum_accel: a.momentum_accel ?? null,
                inUniverse: a.in_universe === true,
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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, setPageData]);
  usePolling(fetchData, 5 * 60 * 1000);

  const rows = useMemo(
    () => {
      const tabRows = (activeTab === 'gainers' ? data?.topGainers : activeTab === 'losers' ? data?.topLosers : data?.mostActive) || [];
      if (assetFilter === 'all') return tabRows;
      return tabRows.filter((m) => m.asset_class === assetFilter);
    },
    [activeTab, data, assetFilter]
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
      breakoutPolicy: deploymentMode === 'NO' ? 'Weak' : deploymentMode === 'YES' ? 'Supportive' : 'Mixed',
      meanReversionPolicy:
        deploymentMode === 'NO'
          ? 'Supportive'
          : volatilityState === 'Elevated'
          ? 'Supportive'
          : 'Mixed',
      highBetaPolicy:
        deploymentMode === 'YES' && liquidityState !== 'Thin' && volatilityState !== 'Elevated'
          ? 'Mixed'
          : 'Weak',
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

        // Technical overlay bonus (0-15 points from RS + momentum accel)
        let techBonus = 0;
        if (mover.rs_vs_index != null && mover.rs_vs_index > 2) techBonus += 7; // outperforming index significantly
        if (mover.momentum_accel != null && mover.momentum_accel >= 40) techBonus += 8; // accelerating momentum

        const confluenceScore = Math.round(
          clamp(
            structurePoints * 0.27 +
              relVolPoints * 0.23 +
              liquidityPoints * 0.23 +
              moveQualityPoints * 0.17 +
              techBonus * 0.10 * 10,
            0, 100,
          )
        );

        const liquidityScore = Math.round(clamp((mover.volume / Math.max(1, environment.medianVol * 1.6)) * 100, 0, 100));

        // RS label
        const rsLabel = mover.rs_vs_index != null
          ? mover.rs_vs_index > 3 ? 'Strong' : mover.rs_vs_index > 0 ? 'Above' : mover.rs_vs_index > -3 ? 'Below' : 'Weak'
          : undefined;

        // Accel label
        const accelLabel = mover.momentum_accel != null
          ? mover.momentum_accel >= 60 ? 'High' : mover.momentum_accel >= 40 ? 'Rising' : mover.momentum_accel >= 20 ? 'Moderate' : 'Low'
          : undefined;

        const blockReasons: string[] = [];
        if (mover.volume < threshold.liquidityMin) blockReasons.push('Liquidity below adaptive threshold');
        if (relVolume < threshold.relVolMin * 0.85) blockReasons.push('Relative volume below threshold');
        if (confluenceScore < threshold.confluenceMin) blockReasons.push('Confluence below threshold');
        if (environment.marketMode === 'Risk-Off' && (cluster === 'microcap' || cluster === 'high_beta')) blockReasons.push('Cluster blocked in risk-off');
        if (environment.deploymentMode === 'NO' && setupMode === 'breakout') blockReasons.push('Breakouts blocked by analysis gate');

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
          rsLabel,
          accelLabel,
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
  const shownRows = evaluatedRows.filter((row) => Number.isFinite(row.changePercent) && row.relVolume.toFixed(2) !== '0.00');

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
          asset_class: row.asset_class,
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
          rsi14: row.rsi14,
          ema200_dist: row.ema200_dist != null ? Number(row.ema200_dist.toFixed(2)) : null,
          rs_vs_index: row.rs_vs_index != null ? Number(row.rs_vs_index.toFixed(2)) : null,
          momentum_accel: row.momentum_accel,
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

  if (tierLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessPortfolioInsights(tier)) return <>{!embedded && <ComplianceDisclaimer compact />}<UpgradeGate requiredTier="pro" feature="Market Movers" /></>;

  return <MoversView embedded={embedded} data={data} loading={loading} error={error} rows={shownRows} environment={environment} permissionedCount={permissionedCount} activeTab={activeTab} assetFilter={assetFilter} setupMode={setupMode} onTab={setActiveTab} onAsset={setAssetFilter} onSetup={setSetupMode} />;
}
