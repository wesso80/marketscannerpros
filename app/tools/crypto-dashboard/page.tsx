'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserTier, canAccessCryptoCommandCenter } from '@/lib/useUserTier';
import { fireAutoLog } from '@/lib/autoLog';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { useAIPageContext } from '@/lib/ai/pageContext';
import CryptoMorningDecisionCard from '@/components/CryptoMorningDecisionCard';
import DerivativesDecisionRow from '@/components/derivatives/DerivativesDecisionRow';
import DerivativesMarketStrip from '@/components/derivatives/DerivativesMarketStrip';
import DerivativesCoreGrid from '@/components/derivatives/DerivativesCoreGrid';
import TradeIdeasSection from '@/components/derivatives/TradeIdeasSection';
import DerivativesContextSection from '@/components/derivatives/DerivativesContextSection';
import type { DashboardData, DerivativesTradeIdea } from '@/components/derivatives/types';
import { PageHero } from '@/components/ui';

export default function CryptoDashboard({ embeddedInDashboard = false }: { embeddedInDashboard?: boolean } = {}) {
  const { tier } = useUserTier();
  const [data, setData] = useState<DashboardData>({
    fundingRates: null,
    longShort: null,
    openInterest: null,
    liquidations: null,
    prices: {},
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchErrors([]);
    try {
      const [fundingRes, lsRes, oiRes, liqRes, heatmapRes] = await Promise.all([
        fetch('/api/funding-rates').then(r => r.ok ? r.json() : Promise.reject(`Funding ${r.status}`)).catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        fetch('/api/long-short-ratio').then(r => r.ok ? r.json() : Promise.reject(`Long/Short ${r.status}`)).catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        fetch('/api/crypto/open-interest').then(r => r.ok ? r.json() : Promise.reject(`OI ${r.status}`)).catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        fetch('/api/crypto/liquidations').then(r => r.ok ? r.json() : Promise.reject(`Liquidations ${r.status}`)).catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        fetch('/api/crypto/heatmap').then(r => r.ok ? r.json() : Promise.reject(`Heatmap ${r.status}`)).catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
      ]);

      // Extract BTC, ETH, SOL prices from heatmap (uses CoinGecko)
      const prices: { [key: string]: { price: number; change24h: number } } = {};
      if (heatmapRes?.cryptos) {
        for (const coin of heatmapRes.cryptos) {
          if (['BTC', 'ETH', 'SOL'].includes(coin.symbol)) {
            prices[coin.symbol] = { price: coin.price, change24h: coin.changePercent };
          }
        }
      }

      const newData: DashboardData = {
        fundingRates: fundingRes?.coins ? { 
          coins: fundingRes.coins, 
          avgRate: parseFloat(fundingRes.average?.fundingRatePercent || '0'), 
          sentiment: fundingRes.average?.sentiment || 'Neutral' 
        } : null,
        longShort: lsRes?.coins ? { 
          coins: lsRes.coins, 
          overall: lsRes.average?.sentiment || 'Neutral',
          avgLong: parseFloat(lsRes.average?.longPercent || '50'),
          avgShort: parseFloat(lsRes.average?.shortPercent || '50'),
        } : null,
        openInterest: oiRes?.summary ? oiRes : null,
        liquidations: liqRes?.summary ? liqRes : null,
        prices,
      };
      setData(newData);
      // Only stamp lastUpdate when at least one data source returned real data
      const hasData = newData.fundingRates || newData.longShort || newData.openInterest || newData.liquidations || Object.keys(prices).length > 0;
      if (hasData) setLastUpdate(new Date());
    } catch (error) {
      setFetchErrors(prev => [...prev, String(error)]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      interval = setInterval(fetchData, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  // ── Auto-log crypto research observations to the paper-trade journal context ──
  const cryptoAutoLogRef = useRef<string>('');
  useEffect(() => {
    if (!data.prices.BTC) return; // data not loaded yet
    // Only log when 24h move is meaningful (≥ 1%) to avoid noise from sub-tick moves
    const ideas = [
      { sym: 'BTC', dir: (data.prices.BTC?.change24h || 0) > 0 ? 'Long' : 'Short', price: data.prices.BTC?.price, change: data.prices.BTC?.change24h || 0 },
      { sym: 'ETH', dir: (data.prices.ETH?.change24h || 0) > 0 ? 'Long' : 'Short', price: data.prices.ETH?.price, change: data.prices.ETH?.change24h || 0 },
      { sym: 'SOL', dir: (data.prices.SOL?.change24h || 0) > 0 ? 'Long' : 'Short', price: data.prices.SOL?.price, change: data.prices.SOL?.change24h || 0 },
    ].filter(i => i.price && i.price > 0 && Math.abs(i.change) >= 1.0);
    for (const idea of ideas) {
      const key = `${idea.sym}:${idea.dir}`;
      if (cryptoAutoLogRef.current.includes(key)) continue;
      cryptoAutoLogRef.current += key + ',';
      fireAutoLog({
        symbol: `${idea.sym}-USD`,
          conditionType: 'crypto_derivatives_observation',
        conditionMet: `${idea.dir.toUpperCase()}_DERIVATIVES`,
        triggerPrice: idea.price!,
        source: 'crypto_dashboard',
        assetClass: 'crypto',
        atr: null,
      }).catch(() => {});
    }
  }, [data.prices]);

  // AI Page Context - share derivatives data with copilot
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    if (data.fundingRates || data.longShort || data.openInterest) {
      const symbols = [
        ...(data.fundingRates?.coins.map(c => c.symbol) || []),
        ...(data.longShort?.coins.map(c => c.symbol) || []),
      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);

      setPageData({
        skill: 'derivatives',
        symbols,
        data: {
          fundingRates: data.fundingRates ? {
            avgRate: data.fundingRates.avgRate,
            sentiment: data.fundingRates.sentiment,
            topCoins: data.fundingRates.coins.slice(0, 5),
          } : null,
          longShort: data.longShort ? {
            overall: data.longShort.overall,
            avgLong: data.longShort.avgLong,
            avgShort: data.longShort.avgShort,
          } : null,
          openInterest: data.openInterest?.summary || null,
          prices: data.prices,
        },
        summary: `Crypto Derivatives: Funding ${data.fundingRates?.sentiment || 'N/A'}, L/S ${data.longShort?.overall || 'N/A'}, OI ${data.openInterest?.summary?.marketSignal || 'N/A'}`,
      });
    }
  }, [data, setPageData]);
  
  // Gate for Pro+ users
  // Must be after ALL hooks to comply with React rules
  if (!canAccessCryptoCommandCenter(tier)) {
    return (
      <div className={`${embeddedInDashboard ? 'min-h-[16rem]' : 'min-h-screen'} bg-[var(--msp-bg)] text-white flex items-center justify-center`}>
        <UpgradeGate feature="Crypto Derivatives Dashboard" requiredTier="pro" />
      </div>
    );
  }

  const getMarketBias = (): { bias: string; confidence: number; signals: string[]; bullishScore: number; bearishScore: number } => {
    const signals: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    if (data.fundingRates) {
      if (data.fundingRates.avgRate > 0.01) {
        bearishScore += 1;
        signals.push('WARN Funding elevated - longs paying shorts');
      } else if (data.fundingRates.avgRate < -0.01) {
        bullishScore += 1;
        signals.push('BULL Negative funding - shorts paying longs');
      }
    }

    if (data.longShort) {
      if (data.longShort.overall === 'Bullish') {
        bullishScore += 1;
        signals.push('BULL L/S ratio favors bulls');
      } else if (data.longShort.overall === 'Bearish') {
        bearishScore += 1;
        signals.push('BEAR L/S ratio favors bears');
      }
    }

    if (data.openInterest?.summary) {
      if (data.openInterest.summary.marketSignal === 'risk_on') {
        bullishScore += 1;
        signals.push('BULL OI building - risk-on mode');
      } else if (data.openInterest.summary.marketSignal === 'risk_off') {
        bearishScore += 1;
        signals.push('BEAR OI declining - deleveraging');
      }
    }

    if (data.liquidations?.summary) {
      if (data.liquidations.summary.marketBias === 'shorts_liquidated') {
        bullishScore += 1;
        signals.push('BULL Shorts getting liquidated - bullish');
      } else if (data.liquidations.summary.marketBias === 'longs_liquidated') {
        bearishScore += 1;
        signals.push('BEAR Longs getting liquidated - bearish');
      }
    }

    const totalSignals = bullishScore + bearishScore;
    const margin = bullishScore - bearishScore;
    const hasOpposing = bullishScore > 0 && bearishScore > 0;
    // Net-conviction confidence: reflects the MARGIN over total evidence, not
    // max/total (which turned a thin 2-1 tally into a misleading 67%). A single
    // opposing signal now visibly reduces conviction.
    const confidence = totalSignals > 0 ? Math.round((Math.abs(margin) / totalSignals) * 100) : 0;

    let bias: string;
    if (margin >= 2) bias = 'BULLISH';
    else if (margin <= -2) bias = 'BEARISH';
    else if (hasOpposing) bias = 'MIXED'; // opposing evidence with a thin (≤1) margin → conflicting, not a lean
    else if (margin === 1) bias = 'LEAN BULLISH';
    else if (margin === -1) bias = 'LEAN BEARISH';
    else bias = 'NEUTRAL';

    return { bias, confidence, signals, bullishScore, bearishScore };
  };

  const marketBias = getMarketBias();

  const primarySymbols = ['BTC', 'ETH', 'SOL'];

  const oiBySymbol = new Map((data.openInterest?.coins || []).map((item) => [item.symbol, item.change24h]));
  const fundingBySymbol = new Map((data.fundingRates?.coins || []).map((item) => [item.symbol, item.fundingRatePercent]));

  const volatilityProxy = Math.max(
    ...primarySymbols.map((symbol) => Math.abs(data.prices[symbol]?.change24h || 0)),
    0
  );

  const volRegime = volatilityProxy >= 3 ? 'Expansion' : volatilityProxy >= 1.5 ? 'Normal' : 'Compression';
  const liquidityState = data.openInterest?.summary?.marketSignal === 'risk_on'
    ? 'Expanding'
    : data.openInterest?.summary?.marketSignal === 'risk_off'
      ? 'Contracting'
      : 'Stable';

  const rotation = (() => {
    const btc = data.prices.BTC?.change24h || 0;
    const eth = data.prices.ETH?.change24h || 0;
    const sol = data.prices.SOL?.change24h || 0;
    if (btc >= eth && btc >= sol && btc > 0.4) return 'BTC-led';
    if (sol >= btc && sol >= eth && sol > 1.2) return 'Meme-led';
    if (eth >= btc && eth >= sol && eth > 0.4) return 'DeFi-led';
    if (eth > btc || sol > btc) return 'Alts-led';
    return 'Mixed';
  })();

  const biasLabel = marketBias.bias === 'LEAN BULLISH'
    ? 'Lean Bullish'
    : marketBias.bias === 'LEAN BEARISH'
      ? 'Lean Bearish'
      : marketBias.bias === 'BULLISH'
        ? 'Bullish'
        : marketBias.bias === 'BEARISH'
          ? 'Bearish'
          : marketBias.bias === 'MIXED'
            ? 'Mixed / Conflicting'
            : 'Neutral';

  const permission = volRegime === 'Expansion' && liquidityState === 'Contracting' && marketBias.bearishScore >= marketBias.bullishScore
    ? 'No'
    : marketBias.confidence >= 67
      ? 'Yes'
      : 'Conditional';

  const playbook = permission === 'No'
    ? 'No scenario'
    : biasLabel.includes('Bearish')
      ? 'Fade pumps'
      : biasLabel.includes('Bullish') && volRegime === 'Expansion'
        ? 'Trend follow'
        : biasLabel.includes('Bullish')
          ? 'Mean reversion'
          : 'No scenario';

  const fundingDriver = data.fundingRates
    ? data.fundingRates.avgRate > 0.01
      ? 'Funding elevated (longs paying)'
      : data.fundingRates.avgRate < -0.01
        ? 'Funding negative (shorts paying)'
        : 'Funding neutral across majors'
    : 'Funding data pending';

  const oiDriver = data.openInterest?.summary
    ? data.openInterest.summary.marketSignal === 'risk_on'
      ? 'OI building (leverage increasing)'
      : data.openInterest.summary.marketSignal === 'risk_off'
        ? 'OI unwinding (deleveraging)'
        : 'OI mixed across exchanges'
    : 'OI trend pending';

  const liquidationDriver = data.liquidations?.summary
    ? data.liquidations.summary.marketBias === 'longs_liquidated'
      ? 'Liquidations skewed to longs (downside confirmation)'
      : data.liquidations.summary.marketBias === 'shorts_liquidated'
        ? 'Liquidations skewed to shorts (squeeze risk)'
        : 'Liquidations balanced (no directional bias)'
    : 'Liquidation confirmation pending';

  const tradeIdeas: DerivativesTradeIdea[] = [
    {
      id: 'btc',
      symbol: 'BTC',
      direction: permission === 'No' ? 'Flat' : biasLabel.includes('Bearish') ? 'Short' : biasLabel.includes('Bullish') ? 'Long' : 'Flat',
      setupType: permission === 'No' ? 'No scenario' : biasLabel.includes('Bearish') ? 'Failed-bounce study' : biasLabel.includes('Bullish') ? 'Trend-continuation study' : 'Mean-reversion study',
      trigger: permission === 'No'
        ? 'Vol expansion + contracting liquidity; wait for compression evidence.'
        : biasLabel.includes('Bearish')
          ? 'OI rising + positive funding + long-liq pressure around failed-bounce conditions.'
          : 'OI building + squeeze risk + reclaim conditions around intraday VWAP.',
      invalidation: biasLabel.includes('Bearish') ? 'Break and hold above prior local high.' : 'Lose VWAP and fail retest.',
      riskMode: permission === 'No' ? 'High scenario risk' : permission === 'Conditional' ? 'Conditional scenario' : 'Normal scenario risk',
    },
    {
      id: 'eth',
      symbol: 'ETH',
      direction: permission === 'No' ? 'Flat' : biasLabel.includes('Bearish') ? 'Short' : biasLabel.includes('Bullish') ? 'Long' : 'Flat',
      setupType: biasLabel.includes('Bearish') ? 'Breakdown-retest study' : biasLabel.includes('Bullish') ? 'Trend-continuation study' : 'No directional scenario',
      trigger: biasLabel.includes('Bearish')
        ? 'Breakdown-retest failure conditions with weak OI follow-through.'
        : 'Momentum-continuation conditions with supportive funding/OI alignment.',
      invalidation: biasLabel.includes('Bearish') ? 'Reclaim above retest zone.' : 'Rejection and close back below trend trigger.',
      riskMode: permission === 'No' ? 'High scenario risk' : permission === 'Conditional' ? 'Conditional scenario' : 'Normal scenario risk',
    },
    {
      id: 'sol',
      symbol: 'SOL',
      direction: permission === 'No' ? 'Flat' : volRegime === 'Expansion' ? 'Flat' : biasLabel.includes('Bearish') ? 'Short' : biasLabel.includes('Bullish') ? 'Long' : 'Flat',
      setupType: volRegime === 'Expansion' ? 'Squeeze / whipsaw risk' : biasLabel.includes('Bearish') ? 'Failed-rally study' : biasLabel.includes('Bullish') ? 'Trend-continuation study' : 'No directional scenario',
      trigger: volRegime === 'Expansion'
        ? 'Wait for volatility compression before directional scenario review.'
        : biasLabel.includes('Bearish')
          ? 'Failed-breakout conditions with rising leverage.'
          : 'Breakout conditions with OI confirmation.',
      invalidation: volRegime === 'Expansion' ? 'N/A' : 'Reverse through setup origin level.',
      riskMode: permission === 'No' ? 'High scenario risk' : permission === 'Conditional' ? 'Conditional scenario' : 'Normal scenario risk',
    },
  ];

  const marketStripItems = primarySymbols.map((coin) => {
    const priceData = data.prices[coin];
    const oiDelta = oiBySymbol.get(coin) ?? 0;
    const fundingSkew = fundingBySymbol.get(coin) ?? 0;
    const volLabel = Math.abs(priceData?.change24h || 0) >= 3 ? 'Expansion' : Math.abs(priceData?.change24h || 0) >= 1.5 ? 'Normal' : 'Compression';

    return {
      symbol: coin,
      price: priceData?.price,
      change24h: priceData?.change24h,
      oiDelta,
      fundingSkew,
      volLabel,
    };
  });

  const decisionDrivers = [fundingDriver, oiDriver, liquidationDriver];

  return (
    <div className={`mx-auto w-full max-w-none ${embeddedInDashboard ? 'px-0 pb-6 pt-0' : 'px-4 pb-24 pt-6 md:px-6'}`}>
      {/* Page Header */}
      {embeddedInDashboard ? (
        <div className="mb-3">
        <PageHero
          ariaLabel="Crypto Derivatives command header"
          eyebrow="Derivatives lens"
          badges={[
            { label: `Permission ${permission}`, tone: permission === 'Yes' ? 'bull' : permission === 'Conditional' ? 'warn' : 'bear' },
            { label: rotation },
            { label: `Vol ${volRegime}` },
          ]}
          title="Bias, rotation, and volatility for the morning derivatives review."
          subtitle="Funding, open interest, and liquidations compressed into a single bias gate. Educational only; not a trade signal."
          actions={[
            { label: loading ? 'Refreshing…' : 'Refresh data', variant: 'primary', onClick: () => fetchData(), disabled: loading },
            { label: 'Open Options', variant: 'secondary', href: '/tools/options' },
            { label: 'Open Scanner', variant: 'ghost', href: '/tools/scanner' },
          ]}
          metrics={[
            { label: 'Bias', value: biasLabel, tone: biasLabel.includes('Bullish') ? 'bull' : biasLabel.includes('Bearish') ? 'bear' : 'neutral', detail: `Confidence ${marketBias.confidence}%` },
            { label: 'Liquidity', value: liquidityState, tone: liquidityState === 'Expanding' ? 'bull' : liquidityState === 'Contracting' ? 'bear' : 'neutral', detail: oiDriver, title: oiDriver },
            { label: 'Funding', value: data.fundingRates ? `${data.fundingRates.avgRate.toFixed(3)}%` : 'Pending', tone: data.fundingRates ? (data.fundingRates.avgRate > 0.01 ? 'warn' : data.fundingRates.avgRate < -0.01 ? 'bull' : 'neutral') : 'neutral', detail: fundingDriver, title: fundingDriver },
            { label: 'Next check', value: playbook, tone: permission === 'No' ? 'bear' : 'warn', detail: liquidationDriver, title: liquidationDriver },
          ]}
        />
        {lastUpdate && (
          <p className="mt-2 text-[11px] text-slate-500">Last updated {lastUpdate.toLocaleTimeString()}</p>
        )}
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-xl overflow-hidden"><img src="/assets/platform-tools/crypto-derivatives.png" alt="" className="h-full w-full object-contain p-0.5" /></div>
                <div>
                  <h1 className="text-3xl mb-2 font-bold text-white">Crypto Derivatives Dashboard</h1>
                  <p className="text-gray-400">Bias, rotation, volatility, and scenario review.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                  aria-label="Toggle auto-refresh"
                />
                Auto-refresh (60s)
              </label>
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#059669] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
          {lastUpdate && (
            <p className="text-xs text-gray-500 mt-2">Last updated: {lastUpdate.toLocaleTimeString()}</p>
          )}
        </div>
      )}

      <div className="mb-4">
        <ComplianceDisclaimer compact={embeddedInDashboard} variant="cryptoDerivatives" />
      </div>

      {fetchErrors.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <span className="font-semibold">Some data feeds unavailable:</span>{' '}
          {fetchErrors.join(' · ')}. Displayed values may be incomplete or from a prior snapshot.
        </div>
      )}

      {/* Zone 0: keep state anchor */}
      <div className="mb-4">
        <CryptoMorningDecisionCard />
      </div>

      <DerivativesDecisionRow
        permission={permission}
        biasLabel={biasLabel}
        rotation={rotation}
        volRegime={volRegime}
        liquidityState={liquidityState}
        playbook={playbook}
        drivers={decisionDrivers}
      />

      <DerivativesMarketStrip items={marketStripItems} />

      <DerivativesCoreGrid
        data={data}
        volRegime={volRegime}
        liquidityState={liquidityState}
      />

      <TradeIdeasSection ideas={tradeIdeas} />

      <DerivativesContextSection />
    </div>
  );
}
