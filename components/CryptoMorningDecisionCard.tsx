'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ConditionVerdict = 'ALIGNED' | 'CONDITIONAL' | 'NOT ALIGNED';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getDominanceValue(dominance: Array<{ symbol: string; dominance: number }> | undefined, symbol: string): number {
  if (!Array.isArray(dominance)) return 0;
  const row = dominance.find((entry) => entry.symbol?.toUpperCase() === symbol.toUpperCase());
  return typeof row?.dominance === 'number' ? row.dominance : 0;
}

function conditionColor(verdict: ConditionVerdict): string {
  if (verdict === 'ALIGNED') return 'text-emerald-300';
  if (verdict === 'CONDITIONAL') return 'text-amber-300';
  return 'text-red-300';
}

function conditionBadge(verdict: ConditionVerdict): string {
  if (verdict === 'ALIGNED') return '🟢';
  if (verdict === 'CONDITIONAL') return '🟡';
  return '🔴';
}

export default function CryptoMorningDecisionCard() {
  const [marketData, setMarketData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchGateData = useCallback(async () => {
    try {
      const [marketRes, trendingRes, fundingRes, oiRes] = await Promise.all([
        fetch('/api/crypto/market-overview').then((r) => r.json()).catch(() => null),
        fetch('/api/crypto/trending').then((r) => r.json()).catch(() => null),
        fetch('/api/funding-rates').then((r) => r.json()).catch(() => null),
        fetch('/api/open-interest').then((r) => r.json()).catch(() => null),
      ]);

      setMarketData({ market: marketRes?.data, trending: trendingRes, funding: fundingRes, oi: oiRes });
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch crypto gate data:', error);
    }
  }, []);

  useEffect(() => {
    fetchGateData();
    const interval = setInterval(fetchGateData, 300000);
    return () => clearInterval(interval);
  }, [fetchGateData]);

  const decision = useMemo(() => {
    const market = marketData?.market;
    const trendingCoins = marketData?.trending?.coins || [];
    const trendingCategories = marketData?.trending?.categories || [];
    const funding = marketData?.funding;
    const oi = marketData?.oi;

    const capMove = typeof market?.marketCapChange24h === 'number' ? market.marketCapChange24h : 0;
    const dominance = Array.isArray(market?.dominance) ? market.dominance : [];
    const btcDominance = getDominanceValue(dominance, 'BTC');
    const usdtDominance = getDominanceValue(dominance, 'USDT');
    const usdcDominance = getDominanceValue(dominance, 'USDC');
    const stableDominance = usdtDominance + usdcDominance;

    const trendingPositive = trendingCoins.filter((coin: any) => (coin?.change24h ?? 0) > 0).length;
    const breadthTop50 = trendingCoins.length ? (trendingPositive / trendingCoins.length) * 100 : 50;

    const categoryPositive = trendingCategories.filter((cat: any) => (cat?.change1h ?? 0) > 0).length;
    const sectorBreadth = trendingCategories.length ? (categoryPositive / trendingCategories.length) * 100 : breadthTop50;

    const volume = typeof market?.totalVolume === 'number' ? market.totalVolume : 0;
    const totalCap = typeof market?.totalMarketCap === 'number' ? market.totalMarketCap : 0;
    const volumeToCap = totalCap > 0 ? volume / totalCap : 0;

    const oiChange = Number(oi?.total?.change24h ?? 0);
    const altOiDominance = Number(oi?.total?.altDominance ?? 0);
    const fundingAvg = Number(funding?.average?.fundingRatePercent ?? 0);

    const sparkline = Array.isArray(market?.sparkline) ? market.sparkline : [];
    const latestCap = sparkline.length ? Number(sparkline[sparkline.length - 1]?.value ?? 0) : 0;
    const avgCap = sparkline.length
      ? sparkline.reduce((sum: number, point: any) => sum + Number(point?.value ?? 0), 0) / sparkline.length
      : 0;
    const isBelowTrend = avgCap > 0 && latestCap > 0 ? latestCap < avgCap : false;

    let riskState: 'Risk-On' | 'Neutral' | 'Risk-Off' = 'Neutral';
    const riskScoreRaw = clampScore(
      50 +
        capMove * 8 +
        (altOiDominance - 45) * 0.8 +
        oiChange * 1.5 -
        Math.max(0, btcDominance - 55) * 1.3 -
        Math.max(0, stableDominance - 7) * 2,
    );
    if (riskScoreRaw >= 65) riskState = 'Risk-On';
    else if (riskScoreRaw <= 40) riskState = 'Risk-Off';

    let leadership: 'Large Caps Leading' | 'Alts Leading' | 'Defensive Rotation' | 'Fragmented' = 'Fragmented';
    if (btcDominance >= 56 && breadthTop50 < 40) leadership = 'Defensive Rotation';
    else if (btcDominance <= 53 && breadthTop50 >= 55) leadership = 'Alts Leading';
    else if (capMove > 0.5 && btcDominance > 53 && btcDominance < 56) leadership = 'Large Caps Leading';

    let liquidity: 'Expanding' | 'Stable' | 'Contracting' = 'Stable';
    if (oiChange > 2 && volumeToCap > 0.04 && stableDominance < 8) liquidity = 'Expanding';
    else if (oiChange < -2 || volumeToCap < 0.03 || stableDominance > 9) liquidity = 'Contracting';

    let volatility: 'Compression' | 'Expansion' | 'Dislocation' | 'Chop' = 'Chop';
    const absCapMove = Math.abs(capMove);
    if (absCapMove < 1) volatility = 'Compression';
    else if (absCapMove >= 1 && absCapMove < 3) volatility = 'Expansion';
    else if (absCapMove >= 5) volatility = 'Dislocation';

    const breadthScore = Math.round((breadthTop50 * 0.7) + (sectorBreadth * 0.3));
    const breadthLabel = breadthScore >= 65 ? 'Broad' : breadthScore >= 40 ? 'Mixed' : 'Weak';

    const hardBlocksLong: string[] = [];
    const hardBlocksShort: string[] = [];

    if (btcDominance >= 56 && breadthTop50 < 30) hardBlocksLong.push('BTC dominance surge with weak alt breadth');
    if (liquidity === 'Contracting' && oiChange < -2) hardBlocksLong.push('Liquidity and OI both contracting');
    if (fundingAvg > 0.04 && capMove < 0) hardBlocksLong.push('Crowded longs with momentum divergence');
    if (isBelowTrend) hardBlocksLong.push('Total market cap below 30D trend');

    if (breadthScore > 65 && liquidity === 'Expanding') hardBlocksShort.push('Broad expansion with liquidity inflow');
    if (volatility === 'Compression' && capMove > 0.8) hardBlocksShort.push('Post-expansion compression not ideal for shorts');

    const longsAllowed = hardBlocksLong.length === 0;
    const shortsAllowed = hardBlocksShort.length === 0;
    const hardBlockTriggered = (riskState === 'Risk-Off' && liquidity === 'Contracting') || (!longsAllowed && !shortsAllowed);

    const riskWeight = riskState === 'Risk-On' ? 90 : riskState === 'Neutral' ? 55 : 20;
    const leadershipWeight =
      leadership === 'Alts Leading' ? 85 : leadership === 'Large Caps Leading' ? 70 : leadership === 'Fragmented' ? 45 : 30;
    const liquidityWeight = liquidity === 'Expanding' ? 85 : liquidity === 'Stable' ? 55 : 20;
    const volatilityWeight = volatility === 'Expansion' ? 75 : volatility === 'Compression' ? 55 : volatility === 'Chop' ? 40 : 20;

    const adaptiveConfidence = Math.round(
      (riskWeight * 0.25) +
      (leadershipWeight * 0.2) +
      (liquidityWeight * 0.2) +
      (volatilityWeight * 0.15) +
      (breadthScore * 0.2),
    );

    let verdict: ConditionVerdict = 'CONDITIONAL';
    if (hardBlockTriggered) verdict = 'NOT ALIGNED';
    else if (adaptiveConfidence >= 65) verdict = 'ALIGNED';
    else if (adaptiveConfidence < 40) verdict = 'NOT ALIGNED';
    else verdict = 'CONDITIONAL';

    if (verdict === 'ALIGNED' && (!longsAllowed || !shortsAllowed)) verdict = 'CONDITIONAL';

    const riskContext = verdict === 'ALIGNED' ? 'Standard review' : verdict === 'CONDITIONAL' ? 'Reduced conviction' : 'Observation';

    const subClusters = [
      {
        name: 'Large Caps',
        condition: riskState === 'Risk-Off' ? 'Unfavorable' : leadership === 'Defensive Rotation' ? 'Mixed' : 'Favorable',
      },
      {
        name: 'Mid/Alts',
        condition: !longsAllowed || breadthScore < 45 ? 'Unfavorable' : breadthScore >= 60 ? 'Favorable' : 'Mixed',
      },
      {
        name: 'Meme/High Beta',
        condition: verdict === 'ALIGNED' && liquidity === 'Expanding' && volatility !== 'Dislocation' ? 'Favorable' : 'Unfavorable',
      },
      {
        name: 'DeFi',
        condition: liquidity === 'Expanding' && breadthScore >= 50 ? 'Favorable' : liquidity === 'Contracting' ? 'Unfavorable' : 'Mixed',
      },
    ];

    return {
      verdict,
      adaptiveConfidence,
      hardBlocks: [...hardBlocksLong, ...hardBlocksShort],
      longsAllowed,
      shortsAllowed,
      riskContext,
      riskState,
      leadership,
      liquidity,
      volatility,
      breadthScore,
      breadthLabel,
      subClusters,
    };
  }, [marketData]);

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-2">
      <div className="mb-2 grid gap-2 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Crypto Review Gate</p>
            <span className="text-[11px] text-slate-500">{lastUpdate ? lastUpdate.toLocaleTimeString() : 'Loading'}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl">{conditionBadge(decision.verdict)}</span>
            <h2 className={`text-base font-extrabold ${conditionColor(decision.verdict)}`}>REVIEW: {decision.verdict}</h2>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Confluence Score: {decision.adaptiveConfidence}%</span>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Risk Context: {decision.riskContext}</span>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Long Evidence: {decision.longsAllowed ? 'Clear' : 'Limited'}</span>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">Short Evidence: {decision.shortsAllowed ? 'Clear' : 'Limited'}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {decision.subClusters.map((cluster) => (
              <div key={cluster.name} className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px]">
                <p className="text-slate-500">{cluster.name}</p>
                <p className={`font-semibold ${cluster.condition === 'Favorable' ? 'text-emerald-300' : cluster.condition === 'Mixed' ? 'text-amber-300' : 'text-red-300'}`}>{cluster.condition}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Environment Breakdown (5 Inputs)</p>
          <div className="mt-1 grid gap-1 text-[11px]">
            <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">
              <span className="text-slate-500">Risk State</span>
              <p className="font-semibold text-slate-200">{decision.riskState}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">
              <span className="text-slate-500">Leadership</span>
              <p className="font-semibold text-slate-200">{decision.leadership}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">
              <span className="text-slate-500">Liquidity</span>
              <p className="font-semibold text-slate-200">{decision.liquidity}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">
              <span className="text-slate-500">Volatility Regime</span>
              <p className="font-semibold text-slate-200">{decision.volatility}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">
              <span className="text-slate-500">Breadth</span>
              <p className="font-semibold text-slate-200">{decision.breadthLabel} ({decision.breadthScore}%)</p>
            </div>
          </div>
          <div className="mt-2 rounded border border-slate-700 bg-slate-900/70 p-1.5 text-[11px] text-slate-400">
            Hard Blocks: {decision.hardBlocks.length ? decision.hardBlocks.join(' • ') : 'None'}
          </div>
        </div>
      </div>
    </section>
  );
}
