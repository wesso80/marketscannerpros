'use client';

import { useEffect, useState } from 'react';

interface LSData {
  average: {
    longShortRatio: string;
    longPercent: string;
    shortPercent: string;
    sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  };
  coins: Array<{
    symbol: string;
    longShortRatio: number;
    longAccount: number;
    shortAccount: number;
  }>;
}

interface FundingData {
  average: {
    fundingRatePercent: string;
    annualized: string;
    sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  };
  nextFunding: {
    timeUntilFormatted: string | null;
  };
  coins: Array<{
    symbol: string;
    fundingRatePercent: number;
    sentiment: string;
  }>;
}

interface DerivativesWidgetProps {
  compact?: boolean;
  className?: string;
}

// Crowding Risk Meter calculation
function getCrowdingRisk(lsRatio: number, fundingRate: number): {
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  color: string;
  bgColor: string;
  description: string;
} {
  let score = 0;
  
  // L/S ratio scoring (1.0 = neutral)
  const lsDeviation = Math.abs(lsRatio - 1);
  if (lsDeviation > 0.3) score += 3; // Very skewed
  else if (lsDeviation > 0.15) score += 2; // Moderately skewed
  else if (lsDeviation > 0.05) score += 1; // Slightly skewed
  
  // Funding rate scoring
  const absRate = Math.abs(fundingRate);
  if (absRate > 0.05) score += 3; // Extreme funding
  else if (absRate > 0.02) score += 2; // Elevated funding
  else if (absRate > 0.01) score += 1; // Noticeable funding
  
  // Combined leverage signal (high L/S + high funding = very crowded)
  if (lsDeviation > 0.2 && absRate > 0.03) score += 2;
  
  if (score >= 6) return { 
    level: 'EXTREME', 
    color: 'text-red-400', 
    bgColor: 'bg-red-500',
    description: 'High squeeze risk'
  };
  if (score >= 4) return { 
    level: 'HIGH', 
    color: 'text-orange-400', 
    bgColor: 'bg-orange-500',
    description: 'Position crowding'
  };
  if (score >= 2) return { 
    level: 'MODERATE', 
    color: 'text-yellow-400', 
    bgColor: 'bg-yellow-500',
    description: 'Some imbalance'
  };
  return { 
    level: 'LOW', 
    color: 'text-green-400', 
    bgColor: 'bg-green-500',
    description: 'Balanced market'
  };
}

// Get directional insight based on positioning
function getPositioningInsight(lsRatio: number, fundingRate: number): {
  icon: string;
  text: string;
  color: string;
} {
  const isLongCrowded = lsRatio > 1.15;
  const isShortCrowded = lsRatio < 0.85;
  const highPositiveFunding = fundingRate > 0.03;
  const highNegativeFunding = fundingRate < -0.03;
  
  if (isLongCrowded && highPositiveFunding) {
    return { icon: '⚠️', text: 'Longs crowded — squeeze down risk', color: 'text-red-400' };
  }
  if (isShortCrowded && highNegativeFunding) {
    return { icon: '⚠️', text: 'Shorts crowded — squeeze up risk', color: 'text-green-400' };
  }
  if (isLongCrowded) {
    return { icon: '📊', text: 'Long bias — watching for exhaustion', color: 'text-yellow-400' };
  }
  if (isShortCrowded) {
    return { icon: '📊', text: 'Short bias — contrarian long potential', color: 'text-yellow-400' };
  }
  if (highPositiveFunding) {
    return { icon: '💰', text: 'Longs paying premium — bullish sentiment', color: 'text-green-400' };
  }
  if (highNegativeFunding) {
    return { icon: '💰', text: 'Shorts paying premium — bearish sentiment', color: 'text-red-400' };
  }
  return { icon: '⚖️', text: 'Neutral positioning — no crowding', color: 'text-slate-400' };
}

export default function DerivativesWidget({
  compact = false,
  className = ''
}: DerivativesWidgetProps) {
  const [lsData, setLsData] = useState<LSData | null>(null);
  const [fundingData, setFundingData] = useState<FundingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLsTooltip, setShowLsTooltip] = useState(false);
  const [showFundingTooltip, setShowFundingTooltip] = useState(false);

  const lsTooltipText = `Long/Short Ratio = Ratio of long vs short traders.

🟢 Ratio > 1: More longs than shorts (bullish positioning)
🔴 Ratio < 1: More shorts than longs (bearish positioning)

⚠️ Contrarian signal: Extreme ratios often precede reversals!
Very high L/S → Crowded long trade → Vulnerable to long squeeze
Very low L/S → Crowded short trade → Vulnerable to short squeeze`;

  const fundingTooltipText = `Funding Rate = Fee paid between long/short traders every 8 hours.

🟢 Positive: Longs pay shorts (bullish market, longs paying premium)
🔴 Negative: Shorts pay longs (bearish market, shorts paying premium)

💡 Trading insight:
• High positive funding → Market overheated, correction risk
• Deep negative funding → Oversold, bounce potential
• Near 0% → Balanced market, no strong directional bias`;

  useEffect(() => {
    Promise.all([
      fetch('/api/long-short-ratio').then(r => r.json()),
      fetch('/api/funding-rates').then(r => r.json())
    ])
      .then(([ls, funding]) => {
        if (!ls.error) setLsData(ls);
        if (!funding.error) setFundingData(funding);
      })
      .finally(() => setLoading(false));
  }, []);

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'Bullish') return 'text-green-400';
    if (sentiment === 'Bearish') return 'text-red-400';
    return 'text-slate-400';
  };

  const getSentimentEmoji = (sentiment: string) => {
    if (sentiment === 'Bullish') return '🟢';
    if (sentiment === 'Bearish') return '🔴';
    return '⚪';
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-lg ${compact ? 'p-3 h-20' : 'p-6 h-48'} ${className}`}>
        <div className="h-4 bg-slate-700 rounded w-1/2 mb-3"></div>
        <div className="h-6 bg-slate-700 rounded w-1/3"></div>
      </div>
    );
  }

  if (!lsData && !fundingData) return null;

  // Compact version
  if (compact) {
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 relative ${className}`}>
        <div className="flex items-center justify-between gap-4">
          {/* Long/Short Ratio */}
          {lsData && (
            <div className="flex items-center gap-2 flex-1 relative">
              <span className="text-sm">{getSentimentEmoji(lsData.average.sentiment)}</span>
              <div>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  L/S Ratio
                  <button
                    onClick={() => { setShowLsTooltip(!showLsTooltip); setShowFundingTooltip(false); }}
                    className="ml-1 w-4 h-4 rounded-full bg-slate-600 hover:bg-emerald-500 text-[10px] text-white font-bold flex items-center justify-center transition-colors"
                    title="What is this?"
                  >
                    ?
                  </button>
                </div>
                <div className="font-bold text-white">
                  {lsData.average.longShortRatio}
                  <span className={`ml-1 text-xs ${getSentimentColor(lsData.average.sentiment)}`}>
                    ({lsData.average.longPercent}% L)
                  </span>
                </div>
              </div>
              {/* L/S Tooltip */}
              {showLsTooltip && (
                <div className="absolute top-full left-0 mt-2 p-3 bg-slate-900 border border-slate-600 rounded-lg z-50 text-xs text-slate-300 whitespace-pre-line shadow-xl w-64">
                  <button
                    onClick={() => setShowLsTooltip(false)}
                    className="absolute top-2 right-2 text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                  {lsTooltipText}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="w-px h-8 bg-slate-700"></div>

          {/* Funding Rate */}
          {fundingData && (
            <div className="flex items-center gap-2 flex-1 relative">
              <span className="text-sm">💰</span>
              <div>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  Funding
                  {fundingData.nextFunding.timeUntilFormatted && (
                    <span className="text-slate-500 ml-1">
                      ({fundingData.nextFunding.timeUntilFormatted})
                    </span>
                  )}
                  <button
                    onClick={() => { setShowFundingTooltip(!showFundingTooltip); setShowLsTooltip(false); }}
                    className="ml-1 w-4 h-4 rounded-full bg-slate-600 hover:bg-emerald-500 text-[10px] text-white font-bold flex items-center justify-center transition-colors"
                    title="What is this?"
                  >
                    ?
                  </button>
                </div>
                <div className="font-bold">
                  <span className={parseFloat(fundingData.average.fundingRatePercent) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {parseFloat(fundingData.average.fundingRatePercent) >= 0 ? '+' : ''}
                    {fundingData.average.fundingRatePercent}%
                  </span>
                </div>
              </div>
              {/* Funding Tooltip */}
              {showFundingTooltip && (
                <div className="absolute top-full right-0 mt-2 p-3 bg-slate-900 border border-slate-600 rounded-lg z-50 text-xs text-slate-300 whitespace-pre-line shadow-xl w-72">
                  <button
                    onClick={() => setShowFundingTooltip(false)}
                    className="absolute top-2 right-2 text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                  {fundingTooltipText}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full version
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span>📈</span>
        Derivatives Sentiment
      </h3>

      {/* Crowding Risk Meter */}
      {lsData && fundingData && (() => {
        const lsRatio = parseFloat(lsData.average.longShortRatio);
        const fundingRate = parseFloat(fundingData.average.fundingRatePercent);
        const crowding = getCrowdingRisk(lsRatio, fundingRate);
        const insight = getPositioningInsight(lsRatio, fundingRate);
        
        return (
          <div className="mb-4 p-4 bg-slate-900/70 rounded-lg border border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Crowding Risk</span>
              <span className={`font-bold ${crowding.color}`}>{crowding.level}</span>
            </div>
            {/* Risk meter bar */}
            <div className="flex gap-1 mb-2">
              <div className={`h-2 flex-1 rounded-l ${crowding.level === 'LOW' || crowding.level === 'MODERATE' || crowding.level === 'HIGH' || crowding.level === 'EXTREME' ? 'bg-green-500' : 'bg-slate-600'}`} />
              <div className={`h-2 flex-1 ${crowding.level === 'MODERATE' || crowding.level === 'HIGH' || crowding.level === 'EXTREME' ? 'bg-yellow-500' : 'bg-slate-600'}`} />
              <div className={`h-2 flex-1 ${crowding.level === 'HIGH' || crowding.level === 'EXTREME' ? 'bg-orange-500' : 'bg-slate-600'}`} />
              <div className={`h-2 flex-1 rounded-r ${crowding.level === 'EXTREME' ? 'bg-red-500' : 'bg-slate-600'}`} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-3">
              <span>LOW</span>
              <span>MOD</span>
              <span>HIGH</span>
              <span>EXTREME</span>
            </div>
            {/* Insight */}
            <div className={`text-sm flex items-center gap-2 ${insight.color}`}>
              <span>{insight.icon}</span>
              <span>{insight.text}</span>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Long/Short Ratio */}
        {lsData && (
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-2">Long/Short Ratio</div>
            <div className="text-2xl font-bold text-white mb-1">
              {lsData.average.longShortRatio}
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-green-400">{lsData.average.longPercent}% Long</span>
              <span className="text-slate-500">|</span>
              <span className="text-red-400">{lsData.average.shortPercent}% Short</span>
            </div>
            {/* Visual bar */}
            <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-slate-700">
              <div 
                className="bg-green-500" 
                style={{ width: `${lsData.average.longPercent}%` }}
              />
              <div 
                className="bg-red-500" 
                style={{ width: `${lsData.average.shortPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Funding Rate */}
        {fundingData && (
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-2">
              Avg Funding Rate
              {fundingData.nextFunding.timeUntilFormatted && (
                <span className="text-slate-500 ml-1">
                  (next: {fundingData.nextFunding.timeUntilFormatted})
                </span>
              )}
            </div>
            <div className={`text-2xl font-bold mb-1 ${parseFloat(fundingData.average.fundingRatePercent) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(fundingData.average.fundingRatePercent) >= 0 ? '+' : ''}
              {fundingData.average.fundingRatePercent}%
            </div>
            <div className="text-sm text-slate-400">
              ≈ {fundingData.average.annualized}% annualized
            </div>
          </div>
        )}
      </div>

      {/* Top coins breakdown */}
      {lsData && lsData.coins.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-slate-400 mb-2">By Coin</div>
          <div className="grid grid-cols-2 gap-2">
            {lsData.coins.slice(0, 6).map(coin => {
              const funding = fundingData?.coins.find(f => f.symbol === coin.symbol);
              const lsArrow = coin.longShortRatio > 1.1 ? '↑' : coin.longShortRatio < 0.9 ? '↓' : '';
              const lsColor = coin.longShortRatio > 1.1 ? 'text-green-400' : coin.longShortRatio < 0.9 ? 'text-red-400' : 'text-white';
              return (
                <div key={coin.symbol} className="flex items-center justify-between py-1 px-2 bg-slate-900/30 rounded">
                  <span className="font-medium text-white">{coin.symbol}</span>
                  <div className="flex gap-3 text-xs">
                    <span className="text-slate-400">
                      L/S: <span className={lsColor}>{lsArrow}{coin.longShortRatio.toFixed(2)}</span>
                    </span>
                    {funding && (
                      <span className={funding.fundingRatePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {funding.fundingRatePercent >= 0 ? '+' : ''}{funding.fundingRatePercent.toFixed(4)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interpretation */}
      <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
        <p className="text-xs text-slate-400">
          💡 <strong className="text-slate-300">L/S &gt; 1.2</strong> = Crowded longs, squeeze risk down.
          <strong className="text-slate-300"> Positive funding</strong> = Longs pay shorts (bullish bias).
        </p>
      </div>
    </div>
  );
}
