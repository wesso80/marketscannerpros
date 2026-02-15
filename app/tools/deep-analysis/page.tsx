"use client";

import { useState, useEffect } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { useAIPageContext } from "@/lib/ai/pageContext";

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume: number;
  quoteVolume?: number;
}

interface Indicators {
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  sma20?: number;
  sma50?: number;
  ema12?: number;
  ema26?: number;
  stochK?: number;
  stochD?: number;
  atr?: number;
  volumeRatio?: number;
  priceVsSma20?: number;
  priceVsSma50?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  adx?: number;
}

interface Company {
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: string;
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  targetPrice: number | null;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  sentiment: string;
  sentimentScore: number;
  url: string;
  publishedAt: string;
}

interface CryptoData {
  fearGreed: {
    value: number;
    classification: string;
  };
  marketData?: {
    marketCapRank: number;
    marketCap: number;
    totalVolume: number;
    circulatingSupply: number;
    maxSupply: number;
    ath: number;
    athChangePercent: number;
    atl: number;
  };
}

interface Signals {
  signal: string;
  score: number;
  reasons: string[];
  bullishCount?: number;
  bearishCount?: number;
}

interface EarningsQuarter {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercent: number | null;
  beat: boolean | null;
}

interface EarningsData {
  nextEarningsDate: string | null;
  lastReportedDate: string | null;
  lastReportedEPS: number | null;
  lastEstimatedEPS: number | null;
  lastSurprise: number | null;
  lastSurprisePercent: number | null;
  lastBeat: boolean | null;
  beatRate: number | null;
  recentQuarters: EarningsQuarter[];
  annualEPS: { fiscalYear: string; eps: number | null }[];
}

interface OptionsStrike {
  strike: number;
  openInterest: number;
  volume: number;
  impliedVolatility: number;
  lastPrice: number;
  // Greeks
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
}

interface OptionsData {
  expiryDate: string;
  expiryFormatted: string;
  currentPrice: number;
  highestOICall: OptionsStrike | null;
  highestOIPut: OptionsStrike | null;
  totalCallOI: number;
  totalPutOI: number;
  totalVolume?: number;
  putCallRatio: number;
  maxPain: number;
  keyLevels: { support: number[]; resistance: number[] };
  // New fields
  avgIV?: number;
  ivRank?: number;
  volumeOIRatio?: number;
  callVolumeOIRatio?: number;
  putVolumeOIRatio?: number;
  unusualActivity?: 'Very High' | 'Elevated' | 'Normal';
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
}

interface AnalysisResult {
  success: boolean;
  symbol: string;
  assetType: 'crypto' | 'forex' | 'commodity' | 'stock';
  timestamp: string;
  responseTime: string;
  price: PriceData;
  indicators: Indicators;
  company: Company | null;
  news: NewsItem[] | null;
  cryptoData: CryptoData | null;
  earnings: EarningsData | null;
  optionsData: OptionsData | null;
  signals: Signals;
  aiAnalysis: string | null;
  error?: string;
}

function formatNumber(num: number | null | undefined, decimals: number = 2): string {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatLargeNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function getSignalColor(signal: string): string {
  if (signal.includes('BUY')) return '#10B981';
  if (signal.includes('SELL')) return '#EF4444';
  return '#F59E0B';
}

function getSentimentColor(sentiment: string): string {
  const s = sentiment.toLowerCase();
  if (s.includes('bullish')) return '#10B981';
  if (s.includes('bearish')) return '#EF4444';
  return '#94A3B8';
}

function getRSIColor(rsi: number | undefined): string {
  if (rsi === undefined) return '#94A3B8';
  if (rsi < 30) return '#10B981';
  if (rsi > 70) return '#EF4444';
  return '#F59E0B';
}

// Cap extreme percentages for trust/UX
function capPercentage(value: number | undefined, max: number = 300): string {
  if (value === undefined || value === null) return '—';
  const capped = Math.min(Math.abs(value), max);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${capped.toFixed(0)}%${Math.abs(value) > max ? '+' : ''}`;
}

// Format metric with loading/insufficient data state
function formatMetric(value: number | null | undefined, format: 'number' | 'percent' | 'price' = 'number', decimals: number = 2): { value: string; isLoading: boolean } {
  if (value === null || value === undefined || isNaN(value)) {
    return { value: '—', isLoading: true };
  }
  if (format === 'percent') return { value: `${value.toFixed(decimals)}%`, isLoading: false };
  if (format === 'price') return { value: `$${value.toFixed(decimals)}`, isLoading: false };
  return { value: value.toFixed(decimals), isLoading: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHTED SIGNAL CALCULATION - Track A/Track B Approach
// Track A: Direction (BUY vs SELL) 
// Track B: Quality (Confidence %)
// ═══════════════════════════════════════════════════════════════════════════

interface SignalFactor {
  name: string;
  weight: number;
  result: 'bullish' | 'bearish' | 'neutral';
  score: number; // -100 to +100
}

function calculateWeightedSignal(indicators: any, optionsData: any, news: any[] | null, cryptoData: any): { factors: SignalFactor[]; confidence: number; bias: 'BUY' | 'SELL' | 'HOLD' } {
  const factors: SignalFactor[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════
  // REGIME DETECTION (ADX-based) - determines how to interpret other signals
  // ═══════════════════════════════════════════════════════════════════════
  
  let regime: 'trending' | 'ranging' | 'weak' = 'ranging';
  let trendMultiplier = 1.0;
  let meanReversionMultiplier = 1.0;
  
  if (indicators?.adx !== undefined) {
    if (indicators.adx >= 40) {
      regime = 'trending';
      trendMultiplier = 1.3;      // Trust trend signals more
      meanReversionMultiplier = 0.5; // RSI mean-reversion less reliable
    } else if (indicators.adx >= 25) {
      regime = 'trending';
      trendMultiplier = 1.15;
      meanReversionMultiplier = 0.7;
    } else if (indicators.adx >= 15) {
      regime = 'ranging';
      trendMultiplier = 0.8;
      meanReversionMultiplier = 1.2; // RSI works better in ranges
    } else {
      regime = 'weak';
      trendMultiplier = 0.6;       // Don't trust trend signals in chop
      meanReversionMultiplier = 0.8;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // TRACK A: DIRECTION SCORE (determines BUY/SELL/HOLD)
  // ═══════════════════════════════════════════════════════════════════════
  
  let directionScore = 0;
  let directionWeight = 0;

  // 1. TREND STRUCTURE (35% of direction) - Multi-feature, not just SMA cross
  if (indicators?.sma20 && indicators?.sma50) {
    let trendScore = 0;
    let trendConfirmations = 0;
    
    // Feature 1: SMA20 vs SMA50 (direction) - max ±25
    const smaStackBullish = indicators.sma20 > indicators.sma50;
    const smaStackBearish = indicators.sma20 < indicators.sma50;
    if (smaStackBullish) { trendScore += 25; trendConfirmations++; }
    else if (smaStackBearish) { trendScore -= 25; trendConfirmations++; }
    
    // Feature 2: Price vs SMA50 (confirmation) - max ±20
    if (indicators.priceVsSma50 > 2) { trendScore += 20; trendConfirmations++; }
    else if (indicators.priceVsSma50 > 0) { trendScore += 10; }
    else if (indicators.priceVsSma50 < -2) { trendScore -= 20; trendConfirmations++; }
    else if (indicators.priceVsSma50 < 0) { trendScore -= 10; }
    
    // Feature 3: Price vs SMA20 (short-term confirmation) - max ±15
    if (indicators.priceVsSma20 > 1) { trendScore += 15; trendConfirmations++; }
    else if (indicators.priceVsSma20 > 0) { trendScore += 7; }
    else if (indicators.priceVsSma20 < -1) { trendScore -= 15; trendConfirmations++; }
    else if (indicators.priceVsSma20 < 0) { trendScore -= 7; }
    
    // Cap at ±60 unless multiple confirmations (then allow up to ±75)
    const maxTrendScore = trendConfirmations >= 3 ? 75 : 60;
    trendScore = Math.max(-maxTrendScore, Math.min(maxTrendScore, trendScore));
    
    // Apply regime multiplier
    trendScore *= trendMultiplier;
    trendScore = Math.max(-100, Math.min(100, trendScore));
    
    const trendResult = trendScore > 15 ? 'bullish' : trendScore < -15 ? 'bearish' : 'neutral';
    factors.push({ name: 'Trend Structure', weight: 35, result: trendResult, score: trendScore });
    
    directionScore += trendScore * 0.35;
    directionWeight += 35;
  }

  // 2. OPTIONS FLOW (35% of direction) - with baseline normalization and min gating
  if (optionsData?.putCallRatio !== undefined) {
    const pcr = optionsData.putCallRatio;
    
    // Use baseline-relative scoring (assume 0.85 is neutral)
    const baseline = 0.85;
    const deviation = pcr - baseline;
    
    // Smooth mapping: each 0.1 deviation = ~20 points
    let flowScore = -deviation * 200; // Negative because high P/C = bearish
    
    // Min volume gating: reduce score if volume is low
    const totalOI = (optionsData.callOI || 0) + (optionsData.putOI || 0);
    const volumeMultiplier = totalOI > 50000 ? 1.0 : totalOI > 10000 ? 0.7 : 0.4;
    flowScore *= volumeMultiplier;
    
    // Cap at ±80 (never full conviction from flow alone)
    flowScore = Math.max(-80, Math.min(80, flowScore));
    
    // Dead zone: if within 0.1 of baseline, treat as neutral
    if (Math.abs(deviation) < 0.1) {
      flowScore = 0;
    }
    
    const flowResult = flowScore > 15 ? 'bullish' : flowScore < -15 ? 'bearish' : 'neutral';
    const volumeNote = volumeMultiplier < 1 ? ' (low vol)' : '';
    factors.push({ name: 'Options Flow', weight: 35, result: flowResult, score: flowScore });
    
    directionScore += flowScore * 0.35;
    directionWeight += 35;
  }

  // 3. NEWS SENTIMENT (15% of direction) - Capped with sample size adjustment
  let newsProcessed = false;
  if (news && news.length > 0) {
    const bullishNews = news.filter(n => n.sentiment?.toLowerCase() === 'bullish').length;
    const bearishNews = news.filter(n => n.sentiment?.toLowerCase() === 'bearish').length;
    const totalNews = news.length;
    
    // Sample size multiplier: <10 articles = 30% weight, 10-30 = normal, 30+ = full
    let sampleMultiplier = 1.0;
    if (totalNews < 10) sampleMultiplier = 0.3;
    else if (totalNews < 30) sampleMultiplier = 0.7;
    
    // Calculate net sentiment ratio
    const netSentiment = (bullishNews - bearishNews) / Math.max(1, totalNews);
    
    // Map to score: each 10% net = ~20 points, capped at ±50
    let newsScore = netSentiment * 200;
    newsScore = Math.max(-50, Math.min(50, newsScore)); // Cap at ±50 (not ±70)
    newsScore *= sampleMultiplier;
    
    const newsResult = newsScore > 10 ? 'bullish' : newsScore < -10 ? 'bearish' : 'neutral';
    factors.push({ name: 'News Sentiment', weight: 15, result: newsResult, score: newsScore });
    
    directionScore += newsScore * 0.15;
    directionWeight += 15;
    newsProcessed = true;
  } else if (cryptoData?.fearGreed) {
    const fg = cryptoData.fearGreed.value;
    // Contrarian: Extreme fear = bullish opportunity, extreme greed = bearish warning
    // But cap the impact
    let fgScore = 0;
    if (fg < 25) fgScore = 50; // Extreme fear = bullish
    else if (fg < 40) fgScore = 25;
    else if (fg > 75) fgScore = -50; // Extreme greed = bearish
    else if (fg > 60) fgScore = -25;
    // else neutral
    
    const fgResult = fgScore > 10 ? 'bullish' : fgScore < -10 ? 'bearish' : 'neutral';
    factors.push({ name: 'Market Sentiment', weight: 15, result: fgResult, score: fgScore });
    
    directionScore += fgScore * 0.15;
    directionWeight += 15;
    newsProcessed = true;
  }

  // 4. MOMENTUM / RSI (15% of direction) - TREND-CONDITIONED
  if (indicators?.rsi !== undefined) {
    const rsi = indicators.rsi;
    let rsiScore = 0;
    
    // Determine trend direction from trend structure
    const inUptrend = indicators.priceVsSma50 > 0 && indicators.priceVsSma20 > 0;
    const inDowntrend = indicators.priceVsSma50 < 0 && indicators.priceVsSma20 < 0;
    
    if (inUptrend) {
      // UPTREND: RSI pullbacks are buying opportunities
      if (rsi < 30) rsiScore = 60 * meanReversionMultiplier; // Strong pullback = bullish
      else if (rsi < 40) rsiScore = 40 * meanReversionMultiplier; // Mild pullback = bullish
      else if (rsi > 80) rsiScore = -30; // Overbought warning
      else if (rsi > 70) rsiScore = -10; // Getting stretched
      else rsiScore = 10; // Healthy momentum
    } else if (inDowntrend) {
      // DOWNTREND: RSI <40 is NOT bullish, it's continuation
      if (rsi < 30) rsiScore = 20 * meanReversionMultiplier; // Only mildly bullish (dead cat)
      else if (rsi < 40) rsiScore = 0; // Neutral in downtrend - NOT bullish
      else if (rsi > 70) rsiScore = -60 * meanReversionMultiplier; // Overbought in downtrend = sell
      else if (rsi > 60) rsiScore = -40 * meanReversionMultiplier;
      else rsiScore = -10; // Weak momentum
    } else {
      // RANGING: Mean reversion works best
      if (rsi < 30) rsiScore = 70 * meanReversionMultiplier; // Oversold = bullish
      else if (rsi < 40) rsiScore = 35 * meanReversionMultiplier;
      else if (rsi > 70) rsiScore = -70 * meanReversionMultiplier; // Overbought = bearish
      else if (rsi > 60) rsiScore = -35 * meanReversionMultiplier;
      else rsiScore = 0;
    }
    
    rsiScore = Math.max(-100, Math.min(100, rsiScore));
    
    const rsiResult = rsiScore > 15 ? 'bullish' : rsiScore < -15 ? 'bearish' : 'neutral';
    factors.push({ name: 'Momentum (RSI)', weight: 15, result: rsiResult, score: rsiScore });
    
    directionScore += rsiScore * 0.15;
    directionWeight += 15;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRACK B: QUALITY SCORE (determines Confidence %)
  // ═══════════════════════════════════════════════════════════════════════
  
  let qualityScore = 0;
  
  // 1. Regime Clarity (40% of quality) - How clear is the market regime?
  let regimeScore = 50; // Default neutral
  if (indicators?.adx !== undefined) {
    if (indicators.adx >= 40) regimeScore = 95; // Very clear trending
    else if (indicators.adx >= 30) regimeScore = 80;
    else if (indicators.adx >= 25) regimeScore = 70;
    else if (indicators.adx >= 20) regimeScore = 55;
    else if (indicators.adx >= 15) regimeScore = 45;
    else regimeScore = 30; // Very choppy, low confidence
  }
  qualityScore += regimeScore * 0.40;
  
  // 2. Signal Agreement (35% of quality) - Do directional signals agree?
  const directionalFactors = factors.filter(f => f.result !== 'neutral');
  const finalDirection = directionScore > 15 ? 'bullish' : directionScore < -15 ? 'bearish' : 'neutral';
  
  let alignedStrength = 0;
  let totalStrength = 0;
  
  for (const factor of directionalFactors) {
    const strength = Math.abs(factor.score) / 100;
    const weight = factor.weight / 100;
    totalStrength += weight * strength;
    
    if (factor.result === finalDirection) {
      alignedStrength += weight * strength;
    }
  }
  
  const agreementScore = totalStrength > 0 
    ? (alignedStrength / totalStrength) * 100 
    : 50;
  qualityScore += agreementScore * 0.35;
  
  // 3. Overextension Check (25% of quality) - Is price stretched from MA?
  let extensionScore = 70; // Default reasonable
  if (indicators?.priceVsSma50 !== undefined) {
    const distanceFromMA = Math.abs(indicators.priceVsSma50);
    if (distanceFromMA > 15) extensionScore = 30; // Very stretched = risky
    else if (distanceFromMA > 10) extensionScore = 50;
    else if (distanceFromMA > 5) extensionScore = 70;
    else extensionScore = 90; // Close to MA = good entry
  }
  qualityScore += extensionScore * 0.25;
  
  // ═══════════════════════════════════════════════════════════════════════
  // FINAL OUTPUTS
  // ═══════════════════════════════════════════════════════════════════════
  
  // Normalize direction score
  const normalizedDirection = directionWeight > 0 
    ? directionScore / (directionWeight / 100) 
    : 0;
  
  // Determine bias from direction only
  const bias: 'BUY' | 'SELL' | 'HOLD' = normalizedDirection > 20 ? 'BUY' : normalizedDirection < -20 ? 'SELL' : 'HOLD';
  
  // Confidence from quality score (not direction magnitude)
  const confidence = Math.min(95, Math.max(15, qualityScore));
  
  // Add regime info as a factor for display
  factors.push({ 
    name: 'Market Regime', 
    weight: 0, // Display only, not in direction calculation
    result: regime === 'trending' ? 'bullish' : 'neutral', 
    score: regimeScore 
  });

  return { factors, confidence, bias };
}

// News impact classification
function getNewsImpact(title: string, summary: string): { tag: string; color: string; emoji: string } {
  const text = (title + ' ' + summary).toLowerCase();
  
  // High impact (red)
  if (text.includes('earnings') || text.includes('quarterly report') || text.includes('guidance')) {
    return { tag: 'Earnings', color: '#EF4444', emoji: '🔴' };
  }
  if (text.includes('sec') || text.includes('lawsuit') || text.includes('investigation') || text.includes('regulatory')) {
    return { tag: 'Regulatory', color: '#F59E0B', emoji: '🟡' };
  }
  if (text.includes('fed') || text.includes('interest rate') || text.includes('inflation') || text.includes('fomc')) {
    return { tag: 'Macro', color: '#EF4444', emoji: '🔴' };
  }
  
  // Medium impact (yellow)
  if (text.includes('upgrade') || text.includes('downgrade') || text.includes('price target')) {
    return { tag: 'Analyst', color: '#F59E0B', emoji: '🟡' };
  }
  if (text.includes('acquisition') || text.includes('merger') || text.includes('buyout')) {
    return { tag: 'M&A', color: '#F59E0B', emoji: '🟡' };
  }
  if (text.includes('partnership') || text.includes('contract') || text.includes('deal')) {
    return { tag: 'Catalyst', color: '#10B981', emoji: '🟢' };
  }
  
  // Low impact (green/gray)
  if (text.includes('product') || text.includes('launch') || text.includes('release')) {
    return { tag: 'Product', color: '#10B981', emoji: '🟢' };
  }
  
  return { tag: 'News', color: '#64748B', emoji: '⚪' };
}

export default function DeepAnalysisPage() {
  const { tier } = useUserTier();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");

  // AI Page Context - share analysis results with copilot
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    if (result) {
      setPageData({
        skill: 'deep_analysis',
        symbols: [result.symbol],
        data: {
          symbol: result.symbol,
          assetType: result.assetType,
          price: result.price,
          indicators: result.indicators,
          signals: result.signals,
          optionsData: result.optionsData ? {
            putCallRatio: result.optionsData.putCallRatio,
            maxPain: result.optionsData.maxPain,
            totalCallOI: result.optionsData.totalCallOI,
            totalPutOI: result.optionsData.totalPutOI,
          } : null,
          cryptoData: result.cryptoData,
        },
        summary: `Deep Analysis ${result.symbol}: ${result.signals?.signal || 'N/A'}, Score ${result.signals?.score || 0}/100, RSI ${result.indicators?.rsi?.toFixed(1) || 'N/A'}`,
      });
    }
  }, [result, setPageData]);

  // Pro Trader feature gate
  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)" }}>
        <ToolsPageHeader badge="PRO TRADER" title="Golden Egg Deep Analysis" subtitle="Find AI-powered market context with structured multi-factor analysis" icon="🥚" />
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1rem" }}>
          <UpgradeGate requiredTier="pro_trader" feature="Deep Analysis" />
        </main>
      </div>
    );
  }

  const handleAnalyze = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`/api/deep-analysis?symbol=${encodeURIComponent(symbol.trim())}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Analysis failed");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)" }}>
      <ToolsPageHeader badge="PRO TRADER" title="Golden Egg Deep Analysis" subtitle="Find AI-powered market context with structured multi-factor analysis" icon="🥚" />
      
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Hero Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "clamp(2.5rem, 8vw, 4rem)", marginBottom: "0.5rem" }}>🥚</div>
          <h1 style={{ 
            fontSize: "clamp(1.5rem, 6vw, 2.5rem)", 
            fontWeight: "bold", 
            background: "linear-gradient(135deg, #F59E0B, #FBBF24, #F59E0B)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "0.5rem"
          }}>
            The Golden Egg
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "clamp(0.9rem, 3vw, 1.1rem)" }}>
            Complete market analysis • Any asset • One search
          </p>
        </div>

        {/* Search Box */}
        <div style={{ 
          background: "linear-gradient(145deg, rgba(245,158,11,0.1), rgba(30,41,59,0.8))", 
          borderRadius: "20px", 
          border: "2px solid rgba(245,158,11,0.3)", 
          padding: "1.5rem",
          marginBottom: "2rem",
          boxShadow: "0 8px 32px rgba(245,158,11,0.1)"
        }}>
          <div className="options-form-controls" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="Enter symbol: AAPL, BTC, EURUSD..."
              style={{
                flex: 1,
                padding: "0.875rem 1.25rem",
                borderRadius: "12px",
                border: "2px solid rgba(245,158,11,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#fff",
                fontSize: "1rem",
                outline: "none"
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                padding: "0.875rem 1.5rem",
                borderRadius: "12px",
                border: "none",
                background: loading ? "rgba(245,158,11,0.5)" : "linear-gradient(135deg, #F59E0B, #D97706)",
                color: "#000",
                fontSize: "1rem",
                fontWeight: "bold",
                cursor: loading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexShrink: 0
              }}
            >
              {loading ? (
                <>⏳ Finding Market Edge...</>
              ) : (
                <>🔍 Find Market Edge</>
              )}
            </button>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {['AAPL', 'BTC', 'TSLA', 'ETH', 'NVDA', 'EURUSD', 'GOLD'].map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); }}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(245,158,11,0.3)",
                  background: symbol === s ? "rgba(245,158,11,0.2)" : "transparent",
                  color: "#F59E0B",
                  fontSize: "0.85rem",
                  cursor: "pointer"
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ 
            background: "rgba(239,68,68,0.1)", 
            border: "1px solid rgba(239,68,68,0.3)", 
            borderRadius: "12px", 
            padding: "1rem", 
            marginBottom: "1.5rem",
            color: "#EF4444",
            textAlign: "center"
          }}>
            ❌ {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem", animation: "pulse 1s infinite" }}>🥚</div>
            <p style={{ color: "#F59E0B", fontSize: "1.2rem" }}>Hatching your golden analysis...</p>
            <p style={{ color: "#64748B", fontSize: "0.9rem", marginTop: "0.5rem" }}>
              Fetching price data, technical indicators, news sentiment, and AI insights...
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            
            {/* Main Signal Banner */}
            <div style={{ 
              background: `linear-gradient(145deg, ${getSignalColor(result.signals.signal)}20, rgba(30,41,59,0.8))`,
              borderRadius: "20px",
              border: `2px solid ${getSignalColor(result.signals.signal)}50`,
              padding: "2rem",
              textAlign: "center"
            }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                <span style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
                  {result.assetType === 'crypto' ? '₿' : result.assetType === 'forex' ? '💱' : '📈'}
                </span>
                <div>
                  <h2 style={{ fontSize: "clamp(1.5rem, 6vw, 2.5rem)", fontWeight: "bold", color: "#fff", margin: 0 }}>
                    {result.symbol}
                  </h2>
                  <span style={{ 
                    fontSize: "0.9rem", 
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em"
                  }}>
                    {result.assetType} • {result.company?.name || result.symbol}
                  </span>
                </div>
              </div>
              
              <div style={{ 
                fontSize: "clamp(1.8rem, 8vw, 3rem)", 
                fontWeight: "bold", 
                color: result.price.changePercent >= 0 ? "#10B981" : "#EF4444",
                marginBottom: "0.5rem",
                wordBreak: "break-word"
              }}>
                ${formatNumber(result.price.price, result.assetType === 'crypto' ? 4 : 2)}
              </div>
              
              <div style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                background: result.price.changePercent >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"
              }}>
                <span style={{ color: result.price.changePercent >= 0 ? "#10B981" : "#EF4444", fontWeight: "bold" }}>
                  {result.price.changePercent >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(result.price.changePercent))}%
                </span>
                <span style={{ color: "#64748B" }}>24h</span>
              </div>
              
              {/* Signal Badge */}
              <div style={{ marginTop: "1.5rem" }}>
                <div style={{
                  display: "inline-block",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "12px",
                  background: getSignalColor(result.signals.signal),
                  color: "#000",
                  fontWeight: "bold",
                  fontSize: "clamp(1.1rem, 4vw, 1.5rem)"
                }}>
                  {result.signals.signal}
                </div>
                <div style={{ marginTop: "0.75rem", color: "#94A3B8", fontSize: "0.9rem" }}>
                  Score: {result.signals.score > 0 ? '+' : ''}{result.signals.score} • {result.signals.bullishCount || 0} bullish / {result.signals.bearishCount || 0} bearish signals
                </div>
              </div>
            </div>
            
            {/* Key Takeaways Section */}
            <div style={{ 
              background: "linear-gradient(145deg, rgba(245,158,11,0.15), rgba(30,41,59,0.9))",
              borderRadius: "16px",
              border: "1px solid rgba(245,158,11,0.4)",
              padding: "1.5rem"
            }}>
              <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>⚡</span>
                Quick Summary
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.75rem" }}>
                {/* Technical Stance */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "rgba(30,41,59,0.5)", borderRadius: "10px" }}>
                  <span style={{ fontSize: "1.5rem" }}>📊</span>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Technical Stance</div>
                    <div style={{ fontSize: "1rem", fontWeight: "600", color: "#fff" }}>
                      {result.indicators?.rsi !== null && result.indicators?.rsi !== undefined
                        ? (result.indicators.rsi < 30 ? 'Oversold' : result.indicators.rsi > 70 ? 'Overbought' : result.indicators.rsi < 45 ? 'Bearish Bias' : result.indicators.rsi > 55 ? 'Bullish Bias' : 'Neutral')
                        : 'N/A'}
                    </div>
                  </div>
                </div>
                
                {/* Price Position */}
                {result.company?.week52Low && result.company?.week52High && result.price?.price && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "rgba(30,41,59,0.5)", borderRadius: "10px" }}>
                    <span style={{ fontSize: "1.5rem" }}>📍</span>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>52W Position</div>
                      <div style={{ fontSize: "1rem", fontWeight: "600", color: "#fff" }}>
                        {(() => {
                          const pos = ((result.price.price - result.company.week52Low) / (result.company.week52High - result.company.week52Low)) * 100;
                          if (pos > 90) return 'Near Highs';
                          if (pos > 70) return 'Upper Range';
                          if (pos > 30) return 'Mid Range';
                          if (pos > 10) return 'Lower Range';
                          return 'Near Lows';
                        })()}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Analyst View */}
                {result.company?.targetPrice && result.price?.price && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "rgba(30,41,59,0.5)", borderRadius: "10px" }}>
                    <span style={{ fontSize: "1.5rem" }}>🎯</span>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Analyst Target</div>
                      <div style={{ fontSize: "1rem", fontWeight: "600", color: result.company.targetPrice > result.price.price ? "#10B981" : "#EF4444" }}>
                        {((result.company.targetPrice - result.price.price) / result.price.price * 100).toFixed(0)}% {result.company.targetPrice > result.price.price ? 'Upside' : 'Downside'}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Trend Strength */}
                {result.indicators?.adx !== undefined && result.indicators?.adx !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "rgba(30,41,59,0.5)", borderRadius: "10px" }}>
                    <span style={{ fontSize: "1.5rem" }}>📈</span>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Trend Strength</div>
                      <div style={{ fontSize: "1rem", fontWeight: "600", color: result.indicators.adx > 25 ? "#10B981" : "#F59E0B" }}>
                        {result.indicators.adx > 50 ? 'Very Strong' : result.indicators.adx > 25 ? 'Trending' : 'Weak/Ranging'}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Crypto Fear/Greed */}
                {result.cryptoData?.fearGreed && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "rgba(30,41,59,0.5)", borderRadius: "10px" }}>
                    <span style={{ fontSize: "1.5rem" }}>{result.cryptoData.fearGreed.value < 40 ? '😨' : result.cryptoData.fearGreed.value > 60 ? '🤑' : '😐'}</span>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Market Sentiment</div>
                      <div style={{ fontSize: "1rem", fontWeight: "600", color: "#fff" }}>
                        {result.cryptoData.fearGreed.classification} ({result.cryptoData.fearGreed.value})
                      </div>
                    </div>
                  </div>
                )}
                
                {/* News Sentiment */}
                {result.news && result.news.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "rgba(30,41,59,0.5)", borderRadius: "10px" }}>
                    <span style={{ fontSize: "1.5rem" }}>📰</span>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>News Sentiment</div>
                      <div style={{ fontSize: "1rem", fontWeight: "600", color: "#fff" }}>
                        {(() => {
                          const positive = result.news.filter((n: any) => n.sentiment === 'Bullish').length;
                          const negative = result.news.filter((n: any) => n.sentiment === 'Bearish').length;
                          if (positive > negative * 2) return 'Very Positive';
                          if (positive > negative) return 'Positive';
                          if (negative > positive * 2) return 'Very Negative';
                          if (negative > positive) return 'Negative';
                          return 'Mixed';
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Two Column Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.5rem" }}>
              
              {/* Technical Indicators */}
              {result.indicators && (
                <div style={{ 
                  background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                  borderRadius: "16px",
                  border: "1px solid rgba(51,65,85,0.8)",
                  padding: "1.5rem"
                }}>
                  <h3 style={{ color: "#10B981", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ background: "linear-gradient(135deg, #10B981, #059669)", borderRadius: "6px", padding: "4px 6px" }}>📊</span>
                    Technical Indicators
                  </h3>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(45%, 130px), 1fr))", gap: "0.75rem" }}>
                    {/* RSI */}
                    <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>RSI (14)</div>
                      {result.indicators.rsi !== undefined && result.indicators.rsi !== null ? (
                        <>
                          <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: getRSIColor(result.indicators.rsi) }}>
                            {result.indicators.rsi.toFixed(1)}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                            {result.indicators.rsi < 30 ? 'Oversold' : result.indicators.rsi > 70 ? 'Overbought' : 'Neutral'}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "0.9rem", color: "#64748B", padding: "0.5rem 0" }}>Insufficient data</div>
                      )}
                    </div>
                    
                    {/* MACD */}
                    <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>MACD</div>
                      {result.indicators.macd !== undefined && result.indicators.macd !== null ? (
                        <>
                          <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: result.indicators.macd > 0 ? "#10B981" : "#EF4444" }}>
                            {result.indicators.macd.toFixed(4)}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                            {result.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "0.9rem", color: "#64748B", padding: "0.5rem 0" }}>Insufficient data</div>
                      )}
                    </div>
                    
                    {/* SMA20 */}
                    <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>SMA 20</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#fff" }}>
                        ${formatNumber(result.indicators.sma20)}
                      </div>
                      {result.indicators.priceVsSma20 !== undefined && (
                        <div style={{ fontSize: "0.7rem", color: result.indicators.priceVsSma20 > 0 ? "#10B981" : "#EF4444" }}>
                          {result.indicators.priceVsSma20 > 0 ? '+' : ''}{result.indicators.priceVsSma20.toFixed(1)}% vs price
                        </div>
                      )}
                    </div>
                    
                    {/* SMA50 */}
                    {result.indicators.sma50 !== undefined && result.indicators.sma50 !== null && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>SMA 50</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#fff" }}>
                          ${formatNumber(result.indicators.sma50)}
                        </div>
                        {result.price?.price && (
                          <div style={{ fontSize: "0.7rem", color: result.price.price > result.indicators.sma50 ? "#10B981" : "#EF4444" }}>
                            {result.price.price > result.indicators.sma50 ? 'Above' : 'Below'} trend
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Stochastic */}
                    {result.indicators.stochK !== undefined && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Stochastic</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: result.indicators.stochK < 20 ? "#10B981" : result.indicators.stochK > 80 ? "#EF4444" : "#F59E0B" }}>
                          K: {result.indicators.stochK.toFixed(1)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                          {result.indicators.stochK < 20 ? 'Oversold' : result.indicators.stochK > 80 ? 'Overbought' : 'Neutral'}
                        </div>
                      </div>
                    )}
                    
                    {/* Volume Ratio */}
                    {result.indicators.volumeRatio !== undefined && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Volume Ratio</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: result.indicators.volumeRatio > 1.5 ? "#10B981" : "#94A3B8" }}>
                          {result.indicators.volumeRatio.toFixed(2)}x
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>vs 20d avg</div>
                      </div>
                    )}
                    
                    {/* ATR */}
                    {result.indicators.atr !== undefined && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>ATR (14)</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#8B5CF6" }}>
                          ${result.indicators.atr.toFixed(2)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>Volatility</div>
                      </div>
                    )}
                    
                    {/* ADX */}
                    {result.indicators.adx !== undefined && result.indicators.adx !== null && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>ADX (14)</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: result.indicators.adx > 25 ? "#10B981" : "#94A3B8" }}>
                          {result.indicators.adx.toFixed(1)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                          {result.indicators.adx > 50 ? 'Strong Trend' : result.indicators.adx > 25 ? 'Trending' : 'Ranging'}
                        </div>
                      </div>
                    )}
                    
                    {/* Bollinger Band Position */}
                    {result.indicators.bbUpper && result.indicators.bbLower && result.indicators.bbMiddle && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center", gridColumn: "span 2" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase", marginBottom: "0.5rem" }}>Bollinger Bands</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
                          <span style={{ color: "#EF4444" }}>${result.indicators.bbLower.toFixed(2)}</span>
                          <span style={{ color: "#64748B" }}>${result.indicators.bbMiddle.toFixed(2)}</span>
                          <span style={{ color: "#10B981" }}>${result.indicators.bbUpper.toFixed(2)}</span>
                        </div>
                        <div style={{ 
                          height: "8px", 
                          background: "linear-gradient(90deg, #EF4444, #F59E0B, #10B981)", 
                          borderRadius: "4px", 
                          marginTop: "0.5rem",
                          position: "relative"
                        }}>
                          {result.price?.price && (
                            <div style={{
                              position: "absolute",
                              left: `${Math.min(100, Math.max(0, ((result.price.price - result.indicators.bbLower) / (result.indicators.bbUpper - result.indicators.bbLower)) * 100))}%`,
                              top: "-4px",
                              transform: "translateX(-50%)",
                              width: "16px",
                              height: "16px",
                              background: "#fff",
                              borderRadius: "50%",
                              border: "2px solid #0F172A"
                            }} />
                          )}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.5rem" }}>
                          Lower • Middle • Upper
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Signal Reasons - Weighted Probability Engine */}
              <div style={{ 
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(51,65,85,0.8)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>🎯</span>
                  Signal Breakdown
                </h3>
                
                {/* Confidence Meter */}
                {(() => {
                  const weighted = calculateWeightedSignal(result.indicators, result.optionsData, result.news, result.cryptoData);
                  return (
                    <>
                      {/* Confidence Bar */}
                      <div style={{ marginBottom: "1.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "0.8rem", color: "#94A3B8", fontWeight: "500" }}>Trade Bias Confidence</span>
                          <span style={{ 
                            fontSize: "1.1rem", 
                            fontWeight: "700", 
                            color: weighted.confidence > 70 ? "#10B981" : weighted.confidence > 50 ? "#F59E0B" : "#EF4444"
                          }}>
                            {weighted.confidence.toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ 
                          height: "12px", 
                          background: "rgba(30,41,59,0.8)", 
                          borderRadius: "6px", 
                          overflow: "hidden",
                          position: "relative"
                        }}>
                          <div style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            height: "100%",
                            width: `${weighted.confidence}%`,
                            background: weighted.confidence > 70 
                              ? "linear-gradient(90deg, #10B981, #34D399)" 
                              : weighted.confidence > 50 
                                ? "linear-gradient(90deg, #F59E0B, #FBBF24)" 
                                : "linear-gradient(90deg, #EF4444, #F87171)",
                            borderRadius: "6px",
                            transition: "width 0.5s ease"
                          }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem", fontSize: "0.65rem", color: "#64748B" }}>
                          <span>Low</span>
                          <span>Medium</span>
                          <span>High</span>
                        </div>
                      </div>

                      {/* Weighted Factors Table */}
                      <div style={{ 
                        background: "rgba(30,41,59,0.3)", 
                        borderRadius: "10px", 
                        overflow: "hidden",
                        marginBottom: "1rem"
                      }}>
                        <div className="factor-grid-mobile" style={{ 
                          padding: "0.75rem 1rem",
                          background: "rgba(30,41,59,0.5)",
                          borderBottom: "1px solid rgba(51,65,85,0.5)",
                          fontSize: "0.7rem",
                          color: "#64748B",
                          fontWeight: "600",
                          textTransform: "uppercase"
                        }}>
                          <span>Factor</span>
                          <span style={{ textAlign: "center" }}>Weight</span>
                          <span style={{ textAlign: "right" }}>Result</span>
                        </div>
                        {weighted.factors.map((factor, idx) => (
                          <div key={idx} className="factor-grid-mobile" style={{ 
                            padding: "0.6rem 1rem",
                            borderBottom: idx < weighted.factors.length - 1 ? "1px solid rgba(51,65,85,0.3)" : "none",
                            fontSize: "0.85rem"
                          }}>
                            <span style={{ color: "#E2E8F0" }}>{factor.name}</span>
                            <span style={{ textAlign: "center", color: "#94A3B8" }}>{factor.weight}%</span>
                            <span style={{ 
                              textAlign: "right", 
                              fontWeight: "600",
                              color: factor.result === 'bullish' ? "#10B981" : factor.result === 'bearish' ? "#EF4444" : "#F59E0B"
                            }}>
                              {factor.result === 'bullish' ? '🟢 Bullish' : factor.result === 'bearish' ? '🔴 Bearish' : '🟡 Neutral'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Final Bias */}
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        gap: "1rem",
                        padding: "1rem",
                        background: weighted.bias === 'BUY' ? "rgba(16,185,129,0.15)" : weighted.bias === 'SELL' ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                        borderRadius: "10px",
                        border: `1px solid ${weighted.bias === 'BUY' ? "rgba(16,185,129,0.4)" : weighted.bias === 'SELL' ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`
                      }}>
                        <span style={{ fontSize: "1.5rem" }}>
                          {weighted.bias === 'BUY' ? '📈' : weighted.bias === 'SELL' ? '📉' : '⚖️'}
                        </span>
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "#94A3B8", textTransform: "uppercase" }}>Final Bias</div>
                          <div style={{ 
                            fontSize: "1.25rem", 
                            fontWeight: "700", 
                            color: weighted.bias === 'BUY' ? "#10B981" : weighted.bias === 'SELL' ? "#EF4444" : "#F59E0B"
                          }}>
                            {weighted.bias} ({weighted.confidence.toFixed(0)}% confidence)
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Original Signal Reasons */}
                {result.signals.reasons.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: "0.5rem", textTransform: "uppercase" }}>Additional Signals</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {result.signals.reasons.slice(0, 5).map((reason, idx) => (
                        <div key={idx} style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "0.5rem",
                          padding: "0.4rem 0.6rem",
                          background: "rgba(30,41,59,0.3)",
                          borderRadius: "6px",
                          fontSize: "0.8rem"
                        }}>
                          <span style={{ color: reason.toLowerCase().includes('bullish') || reason.toLowerCase().includes('oversold') || reason.toLowerCase().includes('buy') ? "#10B981" : 
                                              reason.toLowerCase().includes('bearish') || reason.toLowerCase().includes('overbought') || reason.toLowerCase().includes('sell') ? "#EF4444" : "#F59E0B" }}>
                            {reason.toLowerCase().includes('bullish') || reason.toLowerCase().includes('oversold') || reason.toLowerCase().includes('buy') ? "🟢" : 
                             reason.toLowerCase().includes('bearish') || reason.toLowerCase().includes('overbought') || reason.toLowerCase().includes('sell') ? "🔴" : "🟡"}
                          </span>
                          <span style={{ color: "#CBD5E1" }}>{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Company / Crypto Data */}
            {(result.company || result.cryptoData) && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(51,65,85,0.8)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#8B5CF6", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", borderRadius: "6px", padding: "4px 6px" }}>🏢</span>
                  {result.company ? 'Company Overview' : 'Market Data'}
                </h3>
                
                {/* Company Name & Description */}
                {result.company && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#fff" }}>{result.company.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "#64748B", padding: "2px 8px", background: "rgba(30,41,59,0.5)", borderRadius: "4px" }}>
                        {result.company.industry || result.company.sector}
                      </span>
                    </div>
                    {result.company.description && (
                      <p style={{ fontSize: "0.85rem", color: "#94A3B8", lineHeight: "1.5", margin: 0 }}>
                        {result.company.description.length > 300 
                          ? result.company.description.slice(0, 300) + '...' 
                          : result.company.description}
                      </p>
                    )}
                  </div>
                )}
                
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(45%, 100px), 1fr))", gap: "0.75rem" }}>
                  {result.company && (
                    <>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Sector</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{result.company.sector || 'N/A'}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Market Cap</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{formatLargeNumber(parseFloat(result.company.marketCap))}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>P/E Ratio</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{result.company.peRatio?.toFixed(1) || 'N/A'}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>EPS</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: result.company.eps && result.company.eps > 0 ? "#10B981" : "#EF4444" }}>
                          ${result.company.eps?.toFixed(2) || 'N/A'}
                        </div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Target Price</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#3B82F6" }}>${result.company.targetPrice?.toFixed(2) || 'N/A'}</div>
                        {result.company.targetPrice && result.price?.price && (
                          <div style={{ fontSize: "0.7rem", color: result.company.targetPrice > result.price.price ? "#10B981" : "#EF4444" }}>
                            {((result.company.targetPrice - result.price.price) / result.price.price * 100) > 0 ? '+' : ''}
                            {((result.company.targetPrice - result.price.price) / result.price.price * 100).toFixed(1)}% {result.company.targetPrice > result.price.price ? 'upside' : 'downside'}
                          </div>
                        )}
                      </div>
                      
                      {/* 52-Week Range Visual Bar */}
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center", gridColumn: "span 2" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase", marginBottom: "0.5rem" }}>52-Week Position</div>
                        {result.company.week52Low && result.company.week52High && result.price?.price && (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                              <span style={{ color: "#EF4444" }}>Low: ${result.company.week52Low.toFixed(0)}</span>
                              <span style={{ color: "#F59E0B", fontWeight: "bold" }}>
                                {(((result.price.price - result.company.week52Low) / (result.company.week52High - result.company.week52Low)) * 100).toFixed(0)}%
                              </span>
                              <span style={{ color: "#10B981" }}>High: ${result.company.week52High.toFixed(0)}</span>
                            </div>
                            <div style={{ 
                              height: "10px", 
                              background: "linear-gradient(90deg, #EF4444, #F59E0B, #10B981)", 
                              borderRadius: "5px",
                              position: "relative"
                            }}>
                              <div style={{
                                position: "absolute",
                                left: `${Math.min(100, Math.max(0, ((result.price.price - result.company.week52Low) / (result.company.week52High - result.company.week52Low)) * 100))}%`,
                                top: "-3px",
                                transform: "translateX(-50%)",
                                width: "16px",
                                height: "16px",
                                background: "#fff",
                                borderRadius: "50%",
                                border: "3px solid #0F172A",
                                boxShadow: "0 0 8px rgba(245,158,11,0.5)"
                              }} />
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "#94A3B8", marginTop: "0.5rem" }}>
                              Current: ${result.price.price.toFixed(2)}
                            </div>
                          </>
                        )}
                      </div>
                      
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Div Yield</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#8B5CF6" }}>
                          {result.company.dividendYield?.toFixed(2) || '0'}%
                        </div>
                      </div>
                    </>
                  )}
                  
                  {result.cryptoData && (
                    <>
                      <div style={{ 
                        background: result.cryptoData.fearGreed.value < 30 ? "rgba(239,68,68,0.15)" : 
                                   result.cryptoData.fearGreed.value > 70 ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                        borderRadius: "10px", 
                        padding: "0.75rem", 
                        textAlign: "center",
                        gridColumn: "span 2"
                      }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Fear & Greed Index</div>
                        <div style={{ 
                          fontSize: "1.5rem", 
                          fontWeight: "bold", 
                          color: result.cryptoData.fearGreed.value < 30 ? "#EF4444" : 
                                 result.cryptoData.fearGreed.value > 70 ? "#10B981" : "#F59E0B"
                        }}>
                          {result.cryptoData.fearGreed.value}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{result.cryptoData.fearGreed.classification}</div>
                      </div>
                      
                      {result.cryptoData.marketData && (
                        <>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Rank</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: "600", color: "#F59E0B" }}>#{result.cryptoData.marketData.marketCapRank}</div>
                          </div>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Market Cap</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{formatLargeNumber(result.cryptoData.marketData.marketCap)}</div>
                          </div>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>ATH</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#10B981" }}>${formatNumber(result.cryptoData.marketData.ath)}</div>
                          </div>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>From ATH</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#EF4444" }}>{result.cryptoData.marketData.athChangePercent?.toFixed(1)}%</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                
                {/* Analyst Ratings Bar (for stocks) */}
                {result.company && (result.company.strongBuy + result.company.buy + result.company.hold + result.company.sell + result.company.strongSell) > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                      Analyst Ratings ({result.company.strongBuy + result.company.buy + result.company.hold + result.company.sell + result.company.strongSell} analysts)
                    </div>
                    <div style={{ display: "flex", height: "20px", borderRadius: "4px", overflow: "hidden" }}>
                      {result.company.strongBuy > 0 && <div style={{ flex: result.company.strongBuy, background: "#059669" }} />}
                      {result.company.buy > 0 && <div style={{ flex: result.company.buy, background: "#10B981" }} />}
                      {result.company.hold > 0 && <div style={{ flex: result.company.hold, background: "#F59E0B" }} />}
                      {result.company.sell > 0 && <div style={{ flex: result.company.sell, background: "#F87171" }} />}
                      {result.company.strongSell > 0 && <div style={{ flex: result.company.strongSell, background: "#DC2626" }} />}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Options Flow - Show data for admins, Coming Soon for others */}
            {result.assetType === 'stock' && (result.optionsData ? (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(168,85,247,0.08), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(168,85,247,0.3)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#A855F7", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #A855F7, #7C3AED)", borderRadius: "6px", padding: "4px 6px" }}>📊</span>
                  Options Flow (Weekly Expiry)
                  <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "rgba(16,185,129,0.2)", padding: "2px 8px", borderRadius: "10px", color: "#10B981" }}>ADMIN PREVIEW</span>
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "1rem" }}>
                  <div style={{ textAlign: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "10px" }}>
                    <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Put/Call Ratio</div>
                    <div style={{ color: result.optionsData.putCallRatio > 1 ? "#EF4444" : "#10B981", fontSize: "1.25rem", fontWeight: "bold" }}>
                      {result.optionsData.putCallRatio?.toFixed(2) || "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "10px" }}>
                    <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Max Pain</div>
                    <div style={{ color: "#F59E0B", fontSize: "1.25rem", fontWeight: "bold" }}>
                      {result.optionsData.maxPain ? `$${result.optionsData.maxPain.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "10px" }}>
                    <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Avg IV</div>
                    <div style={{ color: "#3B82F6", fontSize: "1.25rem", fontWeight: "bold" }}>
                      {result.optionsData.avgIV ? `${capPercentage(result.optionsData.avgIV * 100, 300)}` : "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "10px" }}>
                    <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Sentiment</div>
                    <div style={{ color: result.optionsData.sentiment === 'Bullish' ? "#10B981" : result.optionsData.sentiment === 'Bearish' ? "#EF4444" : "#F59E0B", fontSize: "1rem", fontWeight: "bold" }}>
                      {result.optionsData.sentiment || "—"}
                    </div>
                  </div>
                </div>
                {result.optionsData.unusualActivity && result.optionsData.unusualActivity !== 'Normal' && (
                  <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(245,158,11,0.1)", borderRadius: "8px", fontSize: "0.85rem", color: "#F59E0B" }}>
                    ⚠️ Unusual Activity: {result.optionsData.unusualActivity}
                  </div>
                )}
                
                {/* Highest OI Strikes with Greeks */}
                {(result.optionsData.highestOICall || result.optionsData.highestOIPut) && (
                  <div className="grid-equal-2-col-responsive" style={{ marginTop: "1.5rem" }}>
                    {/* Highest OI Call */}
                    {result.optionsData.highestOICall && (
                      <div className="greeks-card" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <div style={{ color: "#10B981", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          📈 Highest OI Call
                          <span style={{ background: "rgba(16,185,129,0.2)", padding: "2px 8px", borderRadius: "8px", fontSize: "0.75rem" }}>
                            ${result.optionsData.highestOICall.strike}
                          </span>
                        </div>
                        <div className="grid-2col-stack" style={{ fontSize: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>OI:</span>
                            <span style={{ color: "#CBD5E1" }}>{result.optionsData.highestOICall.openInterest?.toLocaleString() || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>IV:</span>
                            <span style={{ color: "#CBD5E1" }}>{result.optionsData.highestOICall.impliedVolatility ? `${capPercentage(result.optionsData.highestOICall.impliedVolatility * 100, 300)}` : '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Δ Delta:</span>
                            <span style={{ color: "#10B981" }}>{result.optionsData.highestOICall.delta?.toFixed(3) || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Γ Gamma:</span>
                            <span style={{ color: "#A855F7" }}>{result.optionsData.highestOICall.gamma?.toFixed(4) || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Θ Theta:</span>
                            <span style={{ color: "#EF4444" }}>{result.optionsData.highestOICall.theta?.toFixed(3) || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>ν Vega:</span>
                            <span style={{ color: "#3B82F6" }}>{result.optionsData.highestOICall.vega?.toFixed(4) || '—'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Highest OI Put */}
                    {result.optionsData.highestOIPut && (
                      <div className="greeks-card" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                        <div style={{ color: "#EF4444", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          📉 Highest OI Put
                          <span style={{ background: "rgba(239,68,68,0.2)", padding: "2px 8px", borderRadius: "8px", fontSize: "0.75rem" }}>
                            ${result.optionsData.highestOIPut.strike}
                          </span>
                        </div>
                        <div className="grid-2col-stack" style={{ fontSize: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>OI:</span>
                            <span style={{ color: "#CBD5E1" }}>{result.optionsData.highestOIPut.openInterest?.toLocaleString() || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>IV:</span>
                            <span style={{ color: "#CBD5E1" }}>{result.optionsData.highestOIPut.impliedVolatility ? `${capPercentage(result.optionsData.highestOIPut.impliedVolatility * 100, 300)}` : '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Δ Delta:</span>
                            <span style={{ color: "#EF4444" }}>{result.optionsData.highestOIPut.delta?.toFixed(3) || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Γ Gamma:</span>
                            <span style={{ color: "#A855F7" }}>{result.optionsData.highestOIPut.gamma?.toFixed(4) || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Θ Theta:</span>
                            <span style={{ color: "#EF4444" }}>{result.optionsData.highestOIPut.theta?.toFixed(3) || '—'}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>ν Vega:</span>
                            <span style={{ color: "#3B82F6" }}>{result.optionsData.highestOIPut.vega?.toFixed(4) || '—'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(168,85,247,0.08), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(168,85,247,0.3)",
                padding: "1.5rem",
                position: "relative",
                overflow: "hidden"
              }}>
                <h3 style={{ color: "#A855F7", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #A855F7, #7C3AED)", borderRadius: "6px", padding: "4px 6px" }}>📊</span>
                  Options Flow (Weekly Expiry)
                </h3>
                
                {/* Coming Soon Overlay */}
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "3rem 2rem",
                  textAlign: "center"
                }}>
                  <div style={{ 
                    fontSize: "3rem", 
                    marginBottom: "1rem",
                    animation: "pulse 2s ease-in-out infinite"
                  }}>
                    🚀
                  </div>
                  <div style={{ 
                    fontSize: "1.5rem", 
                    fontWeight: "bold",
                    background: "linear-gradient(135deg, #A855F7, #7C3AED, #A855F7)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    marginBottom: "0.5rem"
                  }}>
                    Coming Soon
                  </div>
                  <p style={{ 
                    color: "#94A3B8", 
                    fontSize: "0.9rem",
                    maxWidth: "400px",
                    lineHeight: "1.5"
                  }}>
                    Real-time options flow data including Put/Call ratios, Max Pain, IV analysis, Greeks, and unusual activity detection.
                  </p>
                  <div style={{
                    marginTop: "1rem",
                    display: "flex",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    justifyContent: "center"
                  }}>
                    {["Put/Call Ratio", "Max Pain", "Greeks", "IV Rank", "Open Interest"].map((feature) => (
                      <span 
                        key={feature}
                        style={{
                          padding: "0.4rem 0.8rem",
                          background: "rgba(168,85,247,0.15)",
                          border: "1px solid rgba(168,85,247,0.3)",
                          borderRadius: "20px",
                          fontSize: "0.75rem",
                          color: "#A855F7"
                        }}
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Earnings Data (for stocks) */}
            {result.earnings && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(245,158,11,0.08), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(245,158,11,0.3)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>📅</span>
                  Earnings Report
                </h3>
                
                {/* Next Earnings Date */}
                {result.earnings.nextEarningsDate && (
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "1rem", 
                    padding: "1rem",
                    background: "rgba(245,158,11,0.1)",
                    borderRadius: "10px",
                    marginBottom: "1rem"
                  }}>
                    <div style={{ fontSize: "2rem" }}>📆</div>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#94A3B8", textTransform: "uppercase" }}>Next Earnings Report</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#F59E0B" }}>
                        {new Date(result.earnings.nextEarningsDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Last Report Summary */}
                {result.earnings.lastReportedEPS !== null && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: "0.5rem", textTransform: "uppercase" }}>Last Report</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(45%, 90px), 1fr))", gap: "0.5rem" }}>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Reported EPS</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result.earnings.lastReportedEPS >= 0 ? "#10B981" : "#EF4444" }}>
                          ${result.earnings.lastReportedEPS?.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Estimated EPS</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#94A3B8" }}>
                          ${result.earnings.lastEstimatedEPS?.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ 
                        background: result.earnings.lastBeat ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", 
                        borderRadius: "10px", 
                        padding: "0.75rem", 
                        textAlign: "center",
                        border: `1px solid ${result.earnings.lastBeat ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`
                      }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Result</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result.earnings.lastBeat ? "#10B981" : "#EF4444" }}>
                          {result.earnings.lastBeat ? "✅ BEAT" : "❌ MISS"}
                        </div>
                        {result.earnings.lastSurprisePercent !== null && (
                          <div style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
                            {result.earnings.lastSurprisePercent > 0 ? '+' : ''}{result.earnings.lastSurprisePercent.toFixed(1)}%
                          </div>
                        )}
                      </div>
                      {result.earnings.beatRate !== null && (
                        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                          <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Beat Rate (4Q)</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result.earnings.beatRate >= 75 ? "#10B981" : result.earnings.beatRate >= 50 ? "#F59E0B" : "#EF4444" }}>
                            {result.earnings.beatRate.toFixed(0)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Recent Quarters History */}
                {result.earnings.recentQuarters && result.earnings.recentQuarters.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: "0.5rem", textTransform: "uppercase" }}>Recent Quarters</div>
                    <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                      {result.earnings.recentQuarters.map((q, idx) => (
                        <div key={idx} style={{ 
                          minWidth: "100px",
                          background: "rgba(30,41,59,0.5)", 
                          borderRadius: "8px", 
                          padding: "0.5rem",
                          textAlign: "center",
                          borderTop: `3px solid ${q.beat ? "#10B981" : q.beat === false ? "#EF4444" : "#64748B"}`
                        }}>
                          <div style={{ fontSize: "0.65rem", color: "#64748B" }}>
                            {q.fiscalDateEnding?.split('-').slice(0, 2).join('-')}
                          </div>
                          <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#fff" }}>
                            ${q.reportedEPS?.toFixed(2) || 'N/A'}
                          </div>
                          <div style={{ fontSize: "0.65rem", color: q.beat ? "#10B981" : q.beat === false ? "#EF4444" : "#64748B" }}>
                            {q.beat ? "Beat" : q.beat === false ? "Miss" : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* News Sentiment */}
            {result.news && result.news.length > 0 && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(51,65,85,0.8)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#3B82F6", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #3B82F6, #1D4ED8)", borderRadius: "6px", padding: "4px 6px" }}>📰</span>
                  Latest News & Sentiment
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {result.news.map((item, idx) => (
                    <a 
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ 
                        display: "block",
                        padding: "1rem",
                        background: "rgba(30,41,59,0.5)",
                        borderRadius: "10px",
                        textDecoration: "none",
                        borderLeft: `4px solid ${getSentimentColor(item.sentiment)}`,
                        transition: "background 0.2s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.5rem" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#E2E8F0", fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.25rem", lineHeight: "1.4" }}>
                            {item.title}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#64748B", fontSize: "0.75rem" }}>
                            <span style={{ fontWeight: "500" }}>{item.source}</span>
                            {item.publishedAt && (
                              <>
                                <span>•</span>
                                <span>{new Date(item.publishedAt.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                          {/* Impact Tag */}
                          {(() => {
                            const impact = getNewsImpact(item.title, item.summary || '');
                            return (
                              <span style={{ 
                                padding: "0.25rem 0.6rem", 
                                borderRadius: "6px", 
                                background: `${impact.color}20`,
                                color: impact.color,
                                fontSize: "0.65rem",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.25rem"
                              }}>
                                {impact.emoji} {impact.tag}
                              </span>
                            );
                          })()}
                          {/* Sentiment Badge */}
                          <span style={{ 
                            padding: "0.25rem 0.75rem", 
                            borderRadius: "6px", 
                            background: `${getSentimentColor(item.sentiment)}20`,
                            color: getSentimentColor(item.sentiment),
                            fontSize: "0.7rem",
                            fontWeight: "700",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap"
                          }}>
                            {item.sentiment}
                          </span>
                        </div>
                      </div>
                      {item.summary && (
                        <p style={{ 
                          color: "#94A3B8", 
                          fontSize: "0.85rem", 
                          lineHeight: "1.5", 
                          margin: 0,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as const
                        }}>
                          {item.summary.slice(0, 200)}{item.summary.length > 200 ? '...' : ''}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {result.aiAnalysis && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(245,158,11,0.1), rgba(30,41,59,0.8))",
                borderRadius: "16px",
                border: "2px solid rgba(245,158,11,0.3)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>🤖</span>
                  AI Deep Analysis
                </h3>
                
                <div style={{ 
                  color: "#E2E8F0", 
                  fontSize: "0.95rem", 
                  lineHeight: "1.8",
                  whiteSpace: "pre-wrap"
                }}>
                  {result.aiAnalysis}
                </div>
              </div>
            )}

            {/* Footer Meta */}
            <div style={{ 
              display: "flex", 
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between", 
              alignItems: "center",
              gap: "0.5rem",
              padding: "1rem",
              background: "rgba(30,41,59,0.3)",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: "#64748B"
            }}>
              <span>Analysis generated at {new Date(result.timestamp).toLocaleString()}</span>
              <span>Response time: {result.responseTime}</span>
            </div>

            {/* Legal Disclaimer */}
            <div style={{ 
              marginTop: "1rem",
              padding: "1rem 1.25rem",
              background: "rgba(15,23,42,0.8)",
              borderRadius: "10px",
              border: "1px solid rgba(71,85,105,0.5)",
              fontSize: "0.7rem",
              color: "#64748B",
              lineHeight: "1.6"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.9rem" }}>⚠️</span>
                <div>
                  <strong style={{ color: "#94A3B8" }}>Disclaimer:</strong> The Golden Egg analysis is for educational and informational purposes only and does not constitute investment advice, financial advice, trading advice, or any other type of advice. 
                  Options trading involves substantial risk of loss and is not suitable for all investors. Past performance does not guarantee future results. 
                  Always conduct your own research and consult with a licensed financial advisor before making any investment decisions. 
                  MarketScanner Pros is not a registered investment advisor.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !result && !error && (
          <div style={{ 
            textAlign: "center", 
            padding: "4rem 2rem",
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: "16px",
            border: "1px solid rgba(51,65,85,0.5)"
          }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🥚✨</div>
            <h3 style={{ color: "#fff", marginBottom: "0.5rem", fontSize: "1.5rem" }}>Enter any ticker to begin</h3>
            <p style={{ color: "#64748B", maxWidth: "500px", margin: "0 auto" }}>
              Supports stocks (AAPL, TSLA), crypto (BTC, ETH), forex (EURUSD), and commodities (GOLD).
              Get complete technical analysis, AI insights, news sentiment, and trading signals in one view.
            </p>
          </div>
        )}
      </main>
      
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
