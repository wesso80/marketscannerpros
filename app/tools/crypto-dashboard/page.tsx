'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import DataComingSoon from '@/components/DataComingSoon';

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
  const { tier, isAdmin } = useUserTier();
  
  // OKX liquidation data - admin-only testing while negotiating commercial licenses
  if (!isAdmin) {
    return <DataComingSoon toolName="📊 Crypto Derivatives Dashboard" description="Real-time funding rates, long/short ratios, open interest, and liquidation data" />;
  }
  
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
      const [fundingRes, lsRes, oiRes, liqRes, btcRes, ethRes, solRes] = await Promise.all([
        fetch('/api/funding-rates').then(r => r.json()).catch(() => null),
        fetch('/api/long-short-ratio').then(r => r.json()).catch(() => null),
        fetch('/api/crypto/open-interest').then(r => r.json()).catch(() => null),
        fetch('/api/crypto/liquidations').then(r => r.json()).catch(() => null),
        fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT').then(r => r.json()).catch(() => null),
        fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT').then(r => r.json()).catch(() => null),
        fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT').then(r => r.json()).catch(() => null),
      ]);

      const prices: { [key: string]: { price: number; change24h: number } } = {};
      if (btcRes) prices['BTC'] = { price: parseFloat(btcRes.lastPrice), change24h: parseFloat(btcRes.priceChangePercent) };
      if (ethRes) prices['ETH'] = { price: parseFloat(ethRes.lastPrice), change24h: parseFloat(ethRes.priceChangePercent) };
      if (solRes) prices['SOL'] = { price: parseFloat(solRes.lastPrice), change24h: parseFloat(solRes.priceChangePercent) };

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

  const getMarketBias = (): { bias: string; confidence: number; signals: string[] } => {
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

    return { bias, confidence: confidence || 50, signals };
  };

  const marketBias = getMarketBias();

  const getBiasClasses = () => {
    if (marketBias.bias.includes('BULLISH')) return 'bg-green-900/20 border-green-500';
    if (marketBias.bias.includes('BEARISH')) return 'bg-red-900/20 border-red-500';
    return 'bg-gray-800/50 border-gray-600';
  };

  const getBiasEmoji = () => {
    if (marketBias.bias.includes('BULLISH')) return '🟢';
    if (marketBias.bias.includes('BEARISH')) return '🔴';
    return '⚪';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">₿ Crypto Derivatives Dashboard</h1>
            <p className="text-gray-400">Real-time funding, open interest, liquidations & positioning data</p>
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
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>
        {lastUpdate && (
          <p className="text-xs text-gray-500 mt-2">Last updated: {lastUpdate.toLocaleTimeString()}</p>
        )}
      </div>

      {/* Price Ticker */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {['BTC', 'ETH', 'SOL'].map((coin) => {
          const priceData = data.prices[coin];
          const changeClass = priceData && priceData.change24h >= 0 ? 'text-green-400' : 'text-red-400';
          return (
            <div key={coin} className="bg-[#1E293B] rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{coin}</span>
                {priceData ? (
                  <div className="text-right">
                    <div className="text-lg font-mono">
                      ${priceData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-sm ${changeClass}`}>
                      {priceData.change24h >= 0 ? '+' : ''}{priceData.change24h.toFixed(2)}%
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500">Loading...</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Market Bias Summary */}
      <div className={`mb-8 p-6 rounded-xl border-2 ${getBiasClasses()}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-sm text-gray-400 mb-1">COMBINED DERIVATIVES SIGNAL</h2>
            <div className="text-3xl font-bold">{getBiasEmoji()} {marketBias.bias}</div>
            <div className="text-sm text-gray-400 mt-1">{marketBias.confidence}% signal alignment</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {marketBias.signals.map((signal, i) => (
              <span key={i} className="text-xs bg-black/30 px-3 py-1 rounded-full">{signal}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Funding Rates */}
        <div className="bg-[#1E293B] rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">💰 Funding Rates</h3>
            {data.fundingRates && (
              <span className={`text-xs px-2 py-1 rounded ${
                data.fundingRates.avgRate > 0.01 ? 'bg-red-500/20 text-red-400' :
                data.fundingRates.avgRate < -0.01 ? 'bg-green-500/20 text-green-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                Avg: {data.fundingRates.avgRate.toFixed(4)}%
              </span>
            )}
          </div>
          {data.fundingRates ? (
            <div className="space-y-2">
              {data.fundingRates.coins.slice(0, 6).map((fr) => (
                <div key={fr.symbol} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <span className="font-medium">{fr.symbol}</span>
                  <div className="text-right">
                    <span className={`font-mono ${
                      fr.fundingRatePercent > 0.01 ? 'text-red-400' :
                      fr.fundingRatePercent < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {fr.fundingRatePercent.toFixed(4)}%
                    </span>
                    <span className="text-xs text-gray-500 ml-2">({fr.annualized.toFixed(1)}% APR)</span>
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 bg-black/30 rounded-lg text-xs text-gray-400">
                <strong>💡 Trading Insight:</strong>{' '}
                {data.fundingRates.avgRate > 0.05 
                  ? 'Extreme positive funding - longs overleveraged. Consider shorting or waiting.'
                  : data.fundingRates.avgRate < -0.01
                  ? 'Negative funding - shorts paying. Bullish signal, shorts may get squeezed.'
                  : 'Funding neutral - no clear directional bias.'}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Loading funding rates...</div>
          )}
        </div>

        {/* Long/Short Ratio */}
        <div className="bg-[#1E293B] rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">📊 Long/Short Ratio</h3>
            {data.longShort && (
              <span className={`text-xs px-2 py-1 rounded ${
                data.longShort.overall === 'Bullish' ? 'bg-green-500/20 text-green-400' :
                data.longShort.overall === 'Bearish' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {data.longShort.overall}
              </span>
            )}
          </div>
          {data.longShort ? (
            <div className="space-y-3">
              {data.longShort.coins.slice(0, 6).map((ls) => (
                <div key={ls.symbol} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{ls.symbol}</span>
                    <span className="text-gray-400">
                      {ls.longAccount.toFixed(1)}% L / {ls.shortAccount.toFixed(1)}% S
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: `${ls.longAccount}%` }} />
                    <div className="bg-red-500 h-full" style={{ width: `${ls.shortAccount}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 bg-black/30 rounded-lg text-xs text-gray-400">
                <strong>💡 Trading Insight:</strong>{' '}
                {data.longShort.overall === 'Bullish'
                  ? 'More accounts long - bullish sentiment. Be cautious of overcrowded trades.'
                  : data.longShort.overall === 'Bearish'
                  ? 'More accounts short - bearish sentiment. Watch for short squeezes.'
                  : 'Balanced positioning - no clear retail bias.'}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Loading L/S ratios...</div>
          )}
        </div>

        {/* Open Interest */}
        <div className="bg-[#1E293B] rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">📈 Open Interest</h3>
            {data.openInterest?.summary && (
              <span className={`text-xs px-2 py-1 rounded ${
                data.openInterest.summary.marketSignal === 'risk_on' ? 'bg-green-500/20 text-green-400' :
                data.openInterest.summary.marketSignal === 'risk_off' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {data.openInterest.summary.totalFormatted} Total
              </span>
            )}
          </div>
          {data.openInterest ? (
            <div className="space-y-2">
              {data.openInterest.coins.slice(0, 6).map((coin) => (
                <div key={coin.symbol} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div>
                    <span className="font-medium">{coin.symbol}</span>
                    <span className={`ml-2 text-xs ${
                      coin.signal === 'longs_building' ? 'text-green-400' :
                      coin.signal === 'deleveraging' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {coin.signal.replace('_', ' ')}
                    </span>
                  </div>
                  <span className={`font-mono ${
                    coin.change24h > 0 ? 'text-green-400' :
                    coin.change24h < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                  </span>
                </div>
              ))}
              <div className="mt-4 p-3 bg-black/30 rounded-lg text-xs text-gray-400">
                <strong>💡 Trading Insight:</strong> {data.openInterest.summary.interpretation}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Loading open interest...</div>
          )}
        </div>

        {/* Liquidations */}
        <div className="bg-[#1E293B] rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">💥 Liquidations (Real Data)</h3>
            {data.liquidations?.summary && (
              <span className={`text-xs px-2 py-1 rounded ${
                data.liquidations.summary.marketBias === 'shorts_liquidated' ? 'bg-green-500/20 text-green-400' :
                data.liquidations.summary.marketBias === 'longs_liquidated' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {data.liquidations.summary.stressLevel} stress
              </span>
            )}
          </div>
          {data.liquidations ? (
            <div className="space-y-3">
              <div className="p-3 mb-3 rounded-lg bg-black/30 text-sm">
                {data.liquidations.summary.interpretation}
              </div>
              {/* Totals Row */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                  <div className="text-red-400 text-lg font-bold">
                    ${(data.liquidations.summary.totalLongValue / 1000000).toFixed(2)}M
                  </div>
                  <div className="text-xs text-gray-400">Longs Liquidated</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 text-center">
                  <div className="text-green-400 text-lg font-bold">
                    ${(data.liquidations.summary.totalShortValue / 1000000).toFixed(2)}M
                  </div>
                  <div className="text-xs text-gray-400">Shorts Liquidated</div>
                </div>
              </div>
              {data.liquidations.coins.slice(0, 5).map((coin: LiquidationCoin) => (
                <div key={coin.symbol} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{coin.symbol}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      coin.dominantSide === 'longs' ? 'bg-red-500/20 text-red-400' :
                      coin.dominantSide === 'shorts' ? 'bg-green-500/20 text-green-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {coin.dominantSide === 'longs' ? '🔴 Longs' : coin.dominantSide === 'shorts' ? '🟢 Shorts' : '⚪ Balanced'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono text-gray-300">
                      ${(coin.totalValue / 1000).toFixed(0)}K
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      ({coin.totalLiquidations} liqs)
                    </span>
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 bg-black/30 rounded-lg text-xs text-gray-400">
                <strong>💡 Source:</strong> {data.liquidations.summary.note || 'Real liquidation data from OKX'}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Loading liquidation data...</div>
          )}
        </div>
      </div>

      {/* Trading Signals Summary */}
      <div className="bg-[#1E293B] rounded-xl p-6 border border-gray-700 mb-8">
        <h3 className="text-lg font-bold mb-4">🎯 Combined Trading Signals</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-black/30 rounded-lg p-4">
            <h4 className="text-sm text-gray-400 mb-2">SCALP (1-4h)</h4>
            <div className="text-xl font-bold mb-2">
              {data.liquidations?.summary.marketBias === 'shorts_liquidated' ? '🟢 BULLISH' :
               data.liquidations?.summary.marketBias === 'longs_liquidated' ? '🔴 BEARISH' : '⚪ NEUTRAL'}
            </div>
            <p className="text-xs text-gray-500">Based on real liquidation data</p>
          </div>
          <div className="bg-black/30 rounded-lg p-4">
            <h4 className="text-sm text-gray-400 mb-2">SWING (1-7d)</h4>
            <div className="text-xl font-bold mb-2">
              {data.openInterest?.summary.marketSignal === 'risk_on' ? '🟢 BULLISH' :
               data.openInterest?.summary.marketSignal === 'risk_off' ? '🔴 BEARISH' : '⚪ NEUTRAL'}
            </div>
            <p className="text-xs text-gray-500">Based on OI trends and positioning</p>
          </div>
          <div className="bg-black/30 rounded-lg p-4">
            <h4 className="text-sm text-gray-400 mb-2">FADE SIGNAL</h4>
            <div className="text-xl font-bold mb-2">
              {data.fundingRates && data.fundingRates.avgRate > 0.05 ? '🔴 FADE LONGS' :
               data.fundingRates && data.fundingRates.avgRate < -0.02 ? '🟢 FADE SHORTS' : '⚪ NO FADE'}
            </div>
            <p className="text-xs text-gray-500">Contrarian signal from extreme funding</p>
          </div>
        </div>
      </div>

      {/* Educational Footer */}
      <div className="p-6 bg-gray-800/30 rounded-xl border border-gray-700">
        <h4 className="text-sm font-bold text-gray-400 mb-3">📚 Understanding Crypto Derivatives</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-500">
          <div>
            <strong className="text-gray-400">Funding Rates:</strong> Periodic payments between longs and shorts. 
            Positive = longs pay shorts (bullish crowd). Negative = shorts pay longs (bearish crowd). 
            Extreme rates often precede reversals.
          </div>
          <div>
            <strong className="text-gray-400">Open Interest:</strong> Total value of outstanding futures contracts. 
            Rising OI + rising price = new money entering longs. Falling OI = positions closing (deleveraging).
          </div>
          <div>
            <strong className="text-gray-400">Long/Short Ratio:</strong> Shows what percentage of accounts are long vs short. 
            Useful for gauging retail sentiment, but smart money often fades extremes.
          </div>
          <div>
            <strong className="text-gray-400">Liquidations:</strong> Forced position closures. 
            Large long liquidations create selling pressure. Large short liquidations create short squeezes.
          </div>
        </div>
      </div>
    </div>
  );
}
