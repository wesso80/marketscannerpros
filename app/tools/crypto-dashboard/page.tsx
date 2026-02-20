'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier, canAccessCryptoCommandCenter } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import { useAIPageContext } from '@/lib/ai/pageContext';
import TrendingCoinsWidget from '@/components/TrendingCoinsWidget';
import TopMoversWidget from '@/components/TopMoversWidget';
import CategoryHeatmapWidget from '@/components/CategoryHeatmapWidget';
import CryptoMorningDecisionCard from '@/components/CryptoMorningDecisionCard';

interface FundingRate {
  symbol: string;
  fundingRatePercent: number;
  annualized: number;
  sentiment: string;
}

interface LongShortRatio {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
}

interface OpenInterestCoin {
  symbol: string;
  openInterestValue: number;
  change24h: number;
  signal: string;
}

interface LiquidationCoin {
  symbol: string;
  longLiquidations: number;
  shortLiquidations: number;
  totalLiquidations: number;
  longValue: number;
  shortValue: number;
  totalValue: number;
  dominantSide: 'longs' | 'shorts' | 'balanced';
}

interface DashboardData {
  fundingRates: { coins: FundingRate[]; avgRate: number; sentiment: string } | null;
  longShort: { coins: LongShortRatio[]; overall: string; avgLong: number; avgShort: number } | null;
  openInterest: { summary: any; coins: OpenInterestCoin[] } | null;
  liquidations: { summary: any; coins: LiquidationCoin[] } | null;
  prices: { [key: string]: { price: number; change24h: number } };
}

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

  const tradeIdeas = [
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

      {/* Zone 1: Operator Decision Row */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 md:px-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {[
              ['Permission', permission],
              ['Bias', biasLabel],
              ['Rotation', rotation],
              ['Vol Regime', volRegime],
              ['Liquidity', liquidityState],
              ['Playbook', playbook],
            ].map(([label, value]) => (
              <div key={label} className="h-12 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="text-[11px] text-white/50">{label}</div>
                <div className="truncate text-sm font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="text-sm font-semibold text-white">Why</div>
            <div className="text-xs text-white/50">3 drivers behind today’s decision</div>
            <div className="mt-3 grid gap-2">
              {[fundingDriver, oiDriver, liquidationDriver].map((item, idx) => (
                <div key={idx} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                  • {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Zone 2: Market Strip */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {primarySymbols.map((coin) => {
          const priceData = data.prices[coin];
          const changeClass = priceData && priceData.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400';
          const oiDelta = oiBySymbol.get(coin) ?? 0;
          const fundingSkew = fundingBySymbol.get(coin) ?? 0;
          const miniVol = Math.abs(priceData?.change24h || 0) >= 3 ? 'Expansion' : Math.abs(priceData?.change24h || 0) >= 1.5 ? 'Normal' : 'Compression';
          return (
            <div key={coin} className="rounded-xl border border-white/10 bg-black/10 p-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{coin}</span>
                {priceData ? (
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      ${priceData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs ${changeClass}`}>
                      {priceData.change24h >= 0 ? '+' : ''}{priceData.change24h.toFixed(2)}%
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs">Refreshing...</div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  <div className="text-[11px] text-white/50">OI Δ</div>
                  <div className="text-xs font-semibold text-white/80">{oiDelta >= 0 ? '+' : ''}{oiDelta.toFixed(2)}%</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  <div className="text-[11px] text-white/50">Funding</div>
                  <div className="text-xs font-semibold text-white/80">{fundingSkew >= 0 ? '+' : ''}{fundingSkew.toFixed(3)}%</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                  <div className="text-[11px] text-white/50">Vol</div>
                  <div className="text-xs font-semibold text-white/80">{miniVol}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* Zone 3: Core Derivatives State */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Positioning / Leverage */}
        <div className="rounded-xl border border-white/10 bg-white/5">
          <div className="px-3 py-3 md:px-4">
            <div className="text-sm font-semibold text-white">Positioning</div>
            <div className="text-xs text-white/50">Funding + Long/Short + Open Interest</div>
          </div>
          <div className="grid gap-3 border-t border-white/10 p-3 md:p-4">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80 mb-2">Funding Rates</div>
              <div className="grid gap-2">
                {(data.fundingRates?.coins || []).slice(0, 6).map((fr) => (
                  <div key={fr.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-xs text-white/70">{fr.symbol}</div>
                    <div className="text-xs font-semibold text-white">{fr.fundingRatePercent.toFixed(4)}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80 mb-2">Long / Short Ratio</div>
              <div className="grid gap-2">
                {(data.longShort?.coins || []).slice(0, 6).map((ls) => (
                  <div key={ls.symbol} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{ls.symbol}</span>
                      <span className="text-white/60">{ls.longAccount.toFixed(1)} / {ls.shortAccount.toFixed(1)}</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded bg-black/30 overflow-hidden">
                      <div className="h-2 rounded bg-emerald-500/60" style={{ width: `${ls.longAccount}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80 mb-2">Open Interest (Δ 24h)</div>
              <div className="grid gap-2">
                {(data.openInterest?.coins || []).slice(0, 6).map((coin) => (
                  <div key={coin.symbol} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-xs text-white/70">{coin.symbol}</div>
                    <div className="text-xs font-semibold text-white">{coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stress / Liquidation / Vol */}
        <div className="rounded-xl border border-white/10 bg-white/5">
          <div className="px-3 py-3 md:px-4">
            <div className="text-sm font-semibold text-white">Stress</div>
            <div className="text-xs text-white/50">Liquidations + Volatility + Liquidity</div>
          </div>
          <div className="grid gap-3 border-t border-white/10 p-3 md:p-4">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="text-xs font-semibold text-white/80">Liquidations (24h)</div>
              <div className="text-[11px] text-white/50">Directional stress + confirmation</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-[11px] text-white/50">Longs</div>
                  <div className="mt-1 text-sm font-semibold text-white">${(((data.liquidations?.summary?.totalLongValue || 0) / 1e6)).toFixed(2)}M</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-[11px] text-white/50">Shorts</div>
                  <div className="mt-1 text-sm font-semibold text-white">${(((data.liquidations?.summary?.totalShortValue || 0) / 1e6)).toFixed(2)}M</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {(data.liquidations?.coins || []).slice(0, 5).map((coin) => (
                  <div key={coin.symbol} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{coin.symbol}</span>
                      <span className="text-white/60">L ${(coin.longValue / 1e6).toFixed(1)}M • S ${(coin.shortValue / 1e6).toFixed(1)}M</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="text-xs font-semibold text-white/80">Volatility Regime</div>
                <div className="mt-1 text-sm font-semibold text-white">{volRegime}</div>
                <div className="mt-1 text-xs text-white/50">
                  {volRegime === 'Expansion' ? 'Wicks likely — avoid chasing entries.' : 'Volatility is manageable for structured entries.'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="text-xs font-semibold text-white/80">Liquidity</div>
                <div className="mt-1 text-sm font-semibold text-white">{liquidityState}</div>
                <div className="mt-1 text-xs text-white/50">
                  {liquidityState === 'Contracting' ? 'Lower follow-through probability.' : 'Sufficient participation for cleaner setups.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zone 4: Trade Ideas */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <div className="text-sm font-semibold text-white">Today’s Permissioned Trades</div>
        <div className="text-xs text-white/50">Trade idea output aligned to shared state — max 3 cards.</div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {tradeIdeas.map((idea) => (
            <div key={idea.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">{idea.symbol}</div>
                <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-white/70">{idea.direction}</div>
              </div>

              <div className="mt-2 text-xs text-white/50">Setup</div>
              <div className="text-sm font-semibold text-white/80">{idea.setupType}</div>

              <div className="mt-3 text-xs text-white/50">Trigger</div>
              <div className="text-sm text-white/80">{idea.trigger}</div>

              <div className="mt-3 text-xs text-white/50">Invalidation</div>
              <div className="text-sm text-white/80">{idea.invalidation}</div>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-white/50">Risk mode</div>
                <div className="text-xs font-semibold text-white/80">{idea.riskMode}</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <a
                  href={`/tools/alerts?symbol=${encodeURIComponent(idea.symbol)}`}
                  className="h-9 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 flex items-center justify-center"
                >
                  Alert
                </a>
                <a
                  href={`/tools/watchlists?symbol=${encodeURIComponent(idea.symbol)}`}
                  className="h-9 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 flex items-center justify-center"
                >
                  Watch
                </a>
                <a
                  href={`/tools/journal?note=${encodeURIComponent(`Derivatives idea: ${idea.symbol} ${idea.direction}`)}`}
                  className="h-9 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-white/80 hover:bg-white/10 flex items-center justify-center"
                >
                  Journal
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zone 5: Context (collapsible) */}
      <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
        <summary className="cursor-pointer list-none px-3 py-3 md:px-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Context (Discovery)</div>
              <div className="text-xs text-white/50">Trending / Gainers / Sectors — non-core derivatives context</div>
            </div>
            <div className="text-xs font-semibold text-white/70">Toggle</div>
          </div>
        </summary>
        <div className="border-t border-white/10 p-3 md:p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <TrendingCoinsWidget />
            <TopMoversWidget />
            <CategoryHeatmapWidget />
          </div>
        </div>
      </details>
    </div>
  );
}
