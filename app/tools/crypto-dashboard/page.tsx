'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier, canAccessCryptoCommandCenter } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import { useAIPageContext } from '@/lib/ai/pageContext';
import CryptoMorningDecisionCard from '@/components/CryptoMorningDecisionCard';
import DerivativesDecisionRow from '@/components/derivatives/DerivativesDecisionRow';
import DerivativesMarketStrip from '@/components/derivatives/DerivativesMarketStrip';
import DerivativesCoreGrid from '@/components/derivatives/DerivativesCoreGrid';
import TradeIdeasSection from '@/components/derivatives/TradeIdeasSection';
import DerivativesContextSection from '@/components/derivatives/DerivativesContextSection';
import type { DashboardData, DerivativesTradeIdea } from '@/components/derivatives/types';

export default function CryptoDashboard() {
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
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Use internal APIs that leverage CoinGecko commercial plan
      const [fundingRes, lsRes, oiRes, liqRes, heatmapRes] = await Promise.all([
        fetch('/api/funding-rates').then(r => r.json()).catch(() => null),
        fetch('/api/long-short-ratio').then(r => r.json()).catch(() => null),
        fetch('/api/crypto/open-interest').then(r => r.json()).catch(() => null),
        fetch('/api/crypto/liquidations').then(r => r.json()).catch(() => null),
        fetch('/api/crypto/heatmap').then(r => r.json()).catch(() => null),
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

      setData({
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
      });
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch crypto data:', error);
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
      <div className="min-h-screen bg-[#0B1120] text-white flex items-center justify-center">
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
        signals.push('⚠️ Funding elevated - longs paying shorts');
      } else if (data.fundingRates.avgRate < -0.01) {
        bullishScore += 1;
        signals.push('🟢 Negative funding - shorts paying longs');
      }
    }

    if (data.longShort) {
      if (data.longShort.overall === 'Bullish') {
        bullishScore += 1;
        signals.push('🟢 L/S ratio favors bulls');
      } else if (data.longShort.overall === 'Bearish') {
        bearishScore += 1;
        signals.push('🔴 L/S ratio favors bears');
      }
    }

    if (data.openInterest?.summary) {
      if (data.openInterest.summary.marketSignal === 'risk_on') {
        bullishScore += 1;
        signals.push('🟢 OI building - risk-on mode');
      } else if (data.openInterest.summary.marketSignal === 'risk_off') {
        bearishScore += 1;
        signals.push('🔴 OI declining - deleveraging');
      }
    }

    if (data.liquidations?.summary) {
      if (data.liquidations.summary.marketBias === 'shorts_liquidated') {
        bullishScore += 1;
        signals.push('🟢 Shorts getting liquidated - bullish');
      } else if (data.liquidations.summary.marketBias === 'longs_liquidated') {
        bearishScore += 1;
        signals.push('🔴 Longs getting liquidated - bearish');
      }
    }

    const totalSignals = bullishScore + bearishScore;
    const confidence = totalSignals > 0 ? Math.round((Math.max(bullishScore, bearishScore) / totalSignals) * 100) : 0;
    
    let bias: string;
    if (bullishScore > bearishScore + 1) bias = 'BULLISH';
    else if (bearishScore > bullishScore + 1) bias = 'BEARISH';
    else if (bullishScore > bearishScore) bias = 'LEAN BULLISH';
    else if (bearishScore > bullishScore) bias = 'LEAN BEARISH';
    else bias = 'NEUTRAL';

    return { bias, confidence: confidence || 50, signals, bullishScore, bearishScore };
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
          : 'Neutral';

  const permission = volRegime === 'Expansion' && liquidityState === 'Contracting' && marketBias.bearishScore >= marketBias.bullishScore
    ? 'No'
    : marketBias.confidence >= 67
      ? 'Yes'
      : 'Conditional';

  const playbook = permission === 'No'
    ? 'No-trade'
    : biasLabel.includes('Bearish')
      ? 'Fade pumps'
      : biasLabel.includes('Bullish') && volRegime === 'Expansion'
        ? 'Trend follow'
        : biasLabel.includes('Bullish')
          ? 'Mean reversion'
          : 'No-trade';

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
        : 'Liquidations balanced (no directional edge)'
    : 'Liquidation confirmation pending';

  const tradeIdeas: DerivativesTradeIdea[] = [
    {
      id: 'btc',
      symbol: 'BTC',
      direction: permission === 'No' ? 'Flat' : biasLabel.includes('Bearish') ? 'Short' : biasLabel.includes('Bullish') ? 'Long' : 'Flat',
      setupType: permission === 'No' ? 'No-trade' : biasLabel.includes('Bearish') ? 'Fade / short rallies' : biasLabel.includes('Bullish') ? 'Trend follow' : 'Mean reversion',
      trigger: permission === 'No'
        ? 'Vol expansion + contracting liquidity; wait for compression.'
        : biasLabel.includes('Bearish')
          ? 'OI rising + positive funding + long-liq pressure on failed bounce.'
          : 'OI building + squeeze risk + reclaim above intraday VWAP.',
      invalidation: biasLabel.includes('Bearish') ? 'Break and hold above prior local high.' : 'Lose VWAP and fail retest.',
      riskMode: permission === 'No' ? 'No-trade' : permission === 'Conditional' ? 'Reduced' : 'Normal',
    },
    {
      id: 'eth',
      symbol: 'ETH',
      direction: permission === 'No' ? 'Flat' : biasLabel.includes('Bearish') ? 'Short' : 'Long',
      setupType: biasLabel.includes('Bearish') ? 'Breakdown retest' : 'Trend follow',
      trigger: biasLabel.includes('Bearish')
        ? 'Breakdown retest failure with weak OI follow-through.'
        : 'Momentum continuation with supportive funding/OI alignment.',
      invalidation: biasLabel.includes('Bearish') ? 'Reclaim above retest zone.' : 'Rejection and close back below trend trigger.',
      riskMode: permission === 'No' ? 'No-trade' : permission === 'Conditional' ? 'Reduced' : 'Normal',
    },
    {
      id: 'sol',
      symbol: 'SOL',
      direction: permission === 'No' ? 'Flat' : volRegime === 'Expansion' ? 'Flat' : biasLabel.includes('Bearish') ? 'Short' : 'Long',
      setupType: volRegime === 'Expansion' ? 'Squeeze / whipsaw risk' : biasLabel.includes('Bearish') ? 'Fade' : 'Trend follow',
      trigger: volRegime === 'Expansion'
        ? 'Wait for volatility compression before directional entries.'
        : biasLabel.includes('Bearish')
          ? 'Short failed breakout with rising leverage.'
          : 'Long breakout with OI confirmation.',
      invalidation: volRegime === 'Expansion' ? 'N/A' : 'Reverse through setup origin level.',
      riskMode: permission === 'No' ? 'No-trade' : permission === 'Conditional' ? 'Reduced' : 'Normal',
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
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 md:px-6">
      {/* Page Header */}
      <div className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">₿ Crypto Derivatives Dashboard</h1>
            <p className="text-gray-400">Bias → Rotation → Volatility → Execution</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600"
              />
              Auto-refresh (60s)
            </label>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] disabled:opacity-50 transition-all"
            >
              {loading ? 'Refreshing Dashboard...' : '🔄 Refresh Dashboard'}
            </button>
          </div>
        </div>
        {lastUpdate && (
          <p className="text-xs text-gray-500 mt-2">Last updated: {lastUpdate.toLocaleTimeString()}</p>
        )}
      </div>

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
