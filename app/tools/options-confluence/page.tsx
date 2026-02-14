"use client";

import { useState, useMemo, useEffect } from "react";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { ProModeDashboard, ConfluenceMap, PhaseStrip } from "@/components/ProModeDashboard";
import { 
  calculateOptionsProbability, 
  OptionsSignals, 
  ProbabilityResult 
} from "@/lib/signals/probability-engine";
import { useAIPageContext } from "@/lib/ai/pageContext";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface StrikeRecommendation {
  strike: number;
  type: 'call' | 'put';
  reason: string;
  distanceFromPrice: number;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  estimatedDelta: number;
  confidenceScore: number;
  targetLevel: number;
}

interface ExpirationRecommendation {
  dte: number;
  expirationDate: string;
  reason: string;
  thetaRisk: 'low' | 'moderate' | 'high';
  timeframe: string;
  confidenceScore: number;
}

interface GreeksAdvice {
  deltaTarget: string;
  thetaWarning: string | null;
  vegaConsideration: string | null;
  gammaAdvice: string | null;
  overallAdvice: string;
}

interface EntryTimingAdvice {
  idealEntryWindow: string;
  urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
  reason: string;
  avoidWindows: string[];
  marketSession?: 'premarket' | 'regular' | 'afterhours' | 'closed';
}

interface HighOIStrike {
  strike: number;
  openInterest: number;
  type: 'call' | 'put';
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
}

interface OpenInterestAnalysis {
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;
  maxPainStrike: number | null;
  highOIStrikes: HighOIStrike[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentReason: string;
  expirationDate: string;
}

// PRO TRADER TYPES
interface IVAnalysis {
  currentIV: number;
  ivRank: number;
  ivPercentile: number;
  ivSignal: 'sell_premium' | 'buy_premium' | 'neutral';
  ivReason: string;
}

interface UnusualActivityStrike {
  strike: number;
  type: 'call' | 'put';
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  signal: 'bullish' | 'bearish';
  reason: string;
}

interface UnusualActivity {
  hasUnusualActivity: boolean;
  unusualStrikes: UnusualActivityStrike[];
  smartMoneyDirection: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  alertLevel: 'high' | 'moderate' | 'low' | 'none';
}

interface ExpectedMove {
  weekly: number;
  weeklyPercent: number;
  monthly: number;
  monthlyPercent: number;
  selectedExpiry: number;
  selectedExpiryPercent: number;
  calculation: string;
}

interface TradeLevels {
  entryZone: { low: number; high: number };
  stopLoss: number;
  stopLossPercent: number;
  target1: { price: number; reason: string; takeProfit: number };
  target2: { price: number; reason: string; takeProfit: number } | null;
  target3: { price: number; reason: string; takeProfit: number } | null;
  riskRewardRatio: number;
  reasoning: string;
}

// PRO TRADER: Composite Scoring Types
interface SignalComponent {
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;
  score: number;
  reason: string;
}

interface CompositeScore {
  finalDirection: 'bullish' | 'bearish' | 'neutral';
  directionScore: number;
  confidence: number;
  components: SignalComponent[];
  conflicts: string[];
  alignedCount: number;
  totalSignals: number;
}

interface StrategyRecommendation {
  strategy: string;
  strategyType: 'buy_premium' | 'sell_premium' | 'neutral';
  reason: string;
  strikes?: { long?: number; short?: number };
  riskProfile: 'defined' | 'undefined';
  maxRisk: string;
  maxReward: string;
}

// Candle Close Confluence - when multiple TFs close together
interface CandleCloseConfluence {
  closingNow: {
    count: number;
    timeframes: string[];
    highestTF: string | null;
    isRare: boolean;
  };
  closingSoon: {
    count: number;
    timeframes: { tf: string; minsAway: number; weight: number }[];
    peakConfluenceIn: number;
    peakCount: number;
  };
  specialEvents: {
    isMonthEnd: boolean;
    isWeekEnd: boolean;
    isQuarterEnd: boolean;
    isYearEnd: boolean;
    sessionClose: 'ny' | 'london' | 'asia' | 'none';
  };
  confluenceScore: number;
  confluenceRating: 'extreme' | 'high' | 'moderate' | 'low' | 'none';
  bestEntryWindow: {
    startMins: number;
    endMins: number;
    reason: string;
  };
}

interface OptionsSetup {
  symbol: string;
  currentPrice: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confluenceStack: number;
  decompressingTFs: string[];
  pullBias: number;
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  tradeQuality: 'A+' | 'A' | 'B' | 'C' | 'F';
  qualityReasons: string[];
  primaryStrike: StrikeRecommendation | null;
  alternativeStrikes: StrikeRecommendation[];
  primaryExpiration: ExpirationRecommendation | null;
  alternativeExpirations: ExpirationRecommendation[];
  openInterestAnalysis: OpenInterestAnalysis | null;
  greeksAdvice: GreeksAdvice;
  maxRiskPercent: number;
  stopLossStrategy: string;
  profitTargetStrategy: string;
  entryTiming: EntryTimingAdvice;
  // PRO TRADER FEATURES
  ivAnalysis: IVAnalysis | null;
  unusualActivity: UnusualActivity | null;
  expectedMove: ExpectedMove | null;
  tradeLevels: TradeLevels | null;
  compositeScore?: CompositeScore;
  strategyRecommendation?: StrategyRecommendation;
  candleCloseConfluence?: CandleCloseConfluence;
  aiMarketState?: AIMarketState;
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTITUTIONAL AI MARKET STATE TYPES (HEDGE FUND MODEL)
// ═══════════════════════════════════════════════════════════════════════════

type MarketRegimeType = 'TREND' | 'RANGE' | 'EXPANSION' | 'REVERSAL';

interface MarketRegime {
  regime: MarketRegimeType;
  confidence: number;
  reason: string;
  characteristics: string[];
}

interface EdgeAnalysis {
  directionEdge: {
    strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    score: number;
    bias: 'bullish' | 'bearish' | 'neutral';
    factors: string[];
  };
  volatilityEdge: {
    strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    score: number;
    signal: 'SELL_VOL' | 'BUY_VOL' | 'NEUTRAL';
    factors: string[];
  };
  timeEdge: {
    strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    score: number;
    factors: string[];
  };
}

interface TradeThesis {
  primaryEdge: string;
  thesis: string;
  keyFactors: string[];
  notEdge: string;
}

interface ScenarioMap {
  baseCase: {
    description: string;
    outcome: string;
    probability: number;
  };
  bullCase: {
    trigger: string;
    outcome: string;
    adjustment: string;
  };
  bearCase: {
    trigger: string;
    outcome: string;
    adjustment: string;
  };
}

interface AIMarketState {
  regime: MarketRegime;
  edges: EdgeAnalysis;
  thesis: TradeThesis;
  scenarios: ScenarioMap;
  strategyMatchScore: number;
  tradeQualityGate: 'HIGH' | 'MODERATE' | 'LOW' | 'WAIT';
}

type ScanModeType = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

const TIMEFRAME_OPTIONS: { value: ScanModeType; label: string; desc: string }[] = [
  { value: 'scalping', label: '⚡ Scalping (5-15m)', desc: '0-2 DTE' },
  { value: 'intraday_30m', label: '📊 30 Minute', desc: '1-3 DTE' },
  { value: 'intraday_1h', label: '📊 1 Hour', desc: '2-5 DTE' },
  { value: 'intraday_4h', label: '📊 4 Hour', desc: '3-7 DTE' },
  { value: 'swing_1d', label: '📅 Daily', desc: '5-14 DTE' },
  { value: 'swing_3d', label: '📅 3-Day', desc: '1-3 weeks' },
  { value: 'swing_1w', label: '📅 Weekly', desc: '2-4 weeks' },
  { value: 'macro_monthly', label: '🏛️ Monthly', desc: '30-60 DTE' },
  { value: 'macro_yearly', label: '🏛️ LEAPS', desc: '60+ DTE' },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ExpirationOption {
  date: string;
  label: string;
  dte: number;
  calls: number;
  puts: number;
  totalOI: number;
}

export default function OptionsConfluenceScanner() {
  const { tier, isAdmin } = useUserTier();
  const { setPageData } = useAIPageContext();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptionsSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTF, setSelectedTF] = useState<ScanModeType>('intraday_1h');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);
  
  // Expiration date selection
  const [expirations, setExpirations] = useState<ExpirationOption[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>(''); // Empty = auto-select
  const [loadingExpirations, setLoadingExpirations] = useState(false);
  const [lastSymbolFetched, setLastSymbolFetched] = useState('');
  const [showProMode, setShowProMode] = useState(true); // Toggle for Pro Mode dashboard

  // Push scan results to AI Copilot context
  useEffect(() => {
    if (result) {
      setPageData({
        skill: 'options',
        symbols: [result.symbol],
        data: {
          symbol: result.symbol,
          currentPrice: result.currentPrice,
          direction: result.direction,
          signalStrength: result.signalStrength,
          confluenceStack: result.confluenceStack,
          tradeQuality: result.tradeQuality,
          qualityReasons: result.qualityReasons,
          primaryStrike: result.primaryStrike,
          alternativeStrikes: result.alternativeStrikes,
          primaryExpiration: result.primaryExpiration,
          greeksAdvice: result.greeksAdvice,
          entryTiming: result.entryTiming,
          openInterestAnalysis: result.openInterestAnalysis,
          ivAnalysis: result.ivAnalysis,
          unusualActivity: result.unusualActivity,
          tradeLevels: result.tradeLevels,
          compositeScore: result.compositeScore,
          strategyRecommendation: result.strategyRecommendation,
          // INSTITUTIONAL AI MARKET STATE
          aiMarketState: result.aiMarketState,
        },
        summary: result.aiMarketState 
          ? `Options scan for ${result.symbol}: REGIME=${result.aiMarketState.regime.regime} | PRIMARY EDGE=${result.aiMarketState.thesis.primaryEdge} | STRATEGY MATCH=${result.aiMarketState.strategyMatchScore}% | QUALITY=${result.aiMarketState.tradeQualityGate}`
          : `Options scan for ${result.symbol} at $${result.currentPrice}: ${result.direction.toUpperCase()} bias (${result.tradeQuality}) with ${result.signalStrength} strength. Confluence: ${result.confluenceStack}/8.`,
      });
    }
  }, [result, setPageData]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PROBABILITY ENGINE - Institutional-Grade Win Probability Calculation
  // ═══════════════════════════════════════════════════════════════════════════
  const probabilityResult = useMemo<ProbabilityResult | null>(() => {
    if (!result) return null;
    
    // Build signals from the options analysis result
    const signals: OptionsSignals = {
      // Unusual Activity (Smart Money)
      unusualActivity: result.unusualActivity?.hasUnusualActivity ? {
        triggered: true,
        confidence: result.unusualActivity.alertLevel === 'high' ? 0.95 
          : result.unusualActivity.alertLevel === 'moderate' ? 0.75 
          : result.unusualActivity.alertLevel === 'low' ? 0.5 : 0.3,
        callPremium: result.unusualActivity.unusualStrikes
          .filter(s => s.type === 'call')
          .reduce((sum, s) => sum + s.volume * 100, 0), // Rough premium estimate
        putPremium: result.unusualActivity.unusualStrikes
          .filter(s => s.type === 'put')
          .reduce((sum, s) => sum + s.volume * 100, 0),
        alertLevel: result.unusualActivity.alertLevel,
      } : { triggered: false, confidence: 0 },
      
      // Put/Call Ratio
      putCallRatio: result.openInterestAnalysis ? {
        triggered: result.openInterestAnalysis.pcRatio < 0.7 || result.openInterestAnalysis.pcRatio > 1.0,
        confidence: Math.abs(result.openInterestAnalysis.pcRatio - 0.85) > 0.3 ? 0.8 : 0.5,
        ratio: result.openInterestAnalysis.pcRatio,
      } : { triggered: false, confidence: 0 },
      
      // Max Pain Distance
      maxPainDistance: result.openInterestAnalysis?.maxPainStrike ? {
        triggered: true,
        confidence: 0.6,
        maxPain: result.openInterestAnalysis.maxPainStrike,
        currentPrice: result.currentPrice,
      } : { triggered: false, confidence: 0 },
      
      // Time Confluence
      timeConfluence: {
        triggered: result.confluenceStack !== 0,
        confidence: Math.min(Math.abs(result.confluenceStack) / 5, 1),
        stack: result.confluenceStack,
        decompressing: result.decompressingTFs,
      },
      
      // IV Rank
      ivRank: result.ivAnalysis ? {
        triggered: result.ivAnalysis.ivRank <= 30 || result.ivAnalysis.ivRank >= 70,
        confidence: result.ivAnalysis.ivRank <= 20 || result.ivAnalysis.ivRank >= 80 ? 0.85 : 0.6,
        rank: result.ivAnalysis.ivRank,
        signal: result.ivAnalysis.ivSignal,
      } : { triggered: false, confidence: 0 },
      
      // Trend Alignment (using compositeScore if available)
      trendAlignment: result.compositeScore ? {
        triggered: result.compositeScore.finalDirection !== 'neutral',
        confidence: result.compositeScore.confidence / 100,
        ema200Direction: result.direction === 'bullish' ? 'above' : result.direction === 'bearish' ? 'below' : 'neutral',
      } : { triggered: false, confidence: 0 },
    };
    
    // Calculate probability with the R:R ratio from trade levels if available
    const rr = result.tradeLevels?.riskRewardRatio || 2.0;
    return calculateOptionsProbability(signals, result.direction, rr);
  }, [result]);

  // Determine market phase for phase strip
  const marketPhase = useMemo(() => {
    if (!result) return 'consolidation';
    if (result.direction === 'bullish' && result.signalStrength === 'strong') return 'bullish_trend';
    if (result.direction === 'bullish' && result.signalStrength === 'moderate') return 'bullish_pullback';
    if (result.direction === 'bearish' && result.signalStrength === 'strong') return 'bearish_trend';
    if (result.direction === 'bearish' && result.signalStrength === 'moderate') return 'bearish_pullback';
    return 'consolidation';
  }, [result]) as 'bearish_trend' | 'bearish_pullback' | 'consolidation' | 'bullish_pullback' | 'bullish_trend';

  // Pro Trader feature gate
  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)" }}>
        <header style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
          <span style={{ 
            background: "linear-gradient(135deg, #10B981, #3B82F6)", 
            padding: "4px 12px", 
            borderRadius: "999px", 
            fontSize: "11px", 
            fontWeight: "600",
            color: "#fff"
          }}>PRO TRADER</span>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 700, color: "#f1f5f9", margin: "12px 0 8px" }}>
            🎯 Options Confluence Scanner
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px" }}>Strike & Expiration Recommendations Based on Time Confluence</p>
        </header>
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "0 1rem 2rem" }}>
          <UpgradeGate requiredTier="pro_trader" feature="Options Confluence Scanner" />
        </main>
      </div>
    );
  }

  // Coming Soon gate for non-admins (options data requires commercial license)
  if (!isAdmin) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
        padding: '2rem',
        color: 'white'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ 
              background: "linear-gradient(135deg, #10B981, #3B82F6)", 
              padding: "4px 12px", 
              borderRadius: "999px", 
              fontSize: "11px", 
              fontWeight: "600",
              color: "#fff",
              display: 'inline-block',
              marginBottom: '1rem'
            }}>PRO TRADER</span>
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #10B981, #3B82F6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem'
            }}>
              🎯 Options Confluence Scanner
            </h1>
            <p style={{ color: '#94A3B8', maxWidth: '600px', margin: '0 auto' }}>
              Get intelligent strike & expiration recommendations based on Time Confluence analysis.
            </p>
          </div>

          <div style={{ 
            background: 'linear-gradient(145deg, rgba(16,185,129,0.08), rgba(30,41,59,0.5))',
            borderRadius: '24px',
            border: '1px solid rgba(16,185,129,0.3)',
            padding: '4rem 2rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>🚀</div>
            <h2 style={{ 
              fontSize: '2rem', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #10B981, #3B82F6, #10B981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem'
            }}>
              Coming Soon
            </h2>
            <p style={{ 
              color: '#94A3B8', 
              fontSize: '1.1rem',
              maxWidth: '500px',
              margin: '0 auto 2rem',
              lineHeight: '1.6'
            }}>
              We&apos;re upgrading our options data infrastructure to bring you even better real-time analysis with Greeks, IV tracking, and unusual activity detection.
            </p>
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginBottom: '2rem'
            }}>
              {["Strike Recommendations", "Expiration Analysis", "Greeks Integration", "Max Pain Levels", "Open Interest Flow", "IV Rank & Percentile", "Unusual Activity Alerts", "Time Confluence Signals"].map((feature) => (
                <span key={feature} style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  color: '#10B981'
                }}>
                  {feature}
                </span>
              ))}
            </div>
            <a href="/tools" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              color: '#fff',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '0.95rem'
            }}>
              ← Back to Tools
            </a>
          </div>

          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>💡</span>
            <div>
              <h4 style={{ color: '#3B82F6', marginBottom: '0.5rem', fontWeight: '600' }}>In the meantime...</h4>
              <p style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: '1.5' }}>
                You can still use the <strong style={{ color: '#F59E0B' }}>Golden Egg Deep Analysis</strong> for comprehensive technical analysis, 
                AI insights, news sentiment, and earnings data. Options flow data will be added there too once available.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fetch available expiration dates when symbol changes
  const fetchExpirations = async (sym: string) => {
    if (!sym.trim() || sym.trim() === lastSymbolFetched) return;
    
    setLoadingExpirations(true);
    setExpirations([]);
    setSelectedExpiry(''); // Reset to auto-select
    
    try {
      const response = await fetch(`/api/options/expirations?symbol=${encodeURIComponent(sym.trim())}`);
      const data = await response.json();
      
      if (data.success && data.expirations) {
        setExpirations(data.expirations);
        setLastSymbolFetched(sym.trim().toUpperCase());
      }
    } catch (err) {
      console.warn('Failed to fetch expirations:', err);
    } finally {
      setLoadingExpirations(false);
    }
  };

  const handleScan = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setIsCached(false);

    try {
      const response = await fetch('/api/options-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: symbol.trim(), 
          scanMode: selectedTF,
          expirationDate: selectedExpiry || undefined, // Only send if user selected one
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
      } else {
        setLastUpdated(data.timestamp ? new Date(data.timestamp) : new Date());
        setResult(data.data as OptionsSetup);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const gradeColor = (grade: string) => {
    switch (grade) {
      case 'A+': return '#10B981';
      case 'A': return '#22C55E';
      case 'B': return '#F59E0B';
      case 'C': return '#F97316';
      default: return '#EF4444';
    }
  };

  const gradeEmoji = (grade: string) => {
    switch (grade) {
      case 'A+': return '🏆';
      case 'A': return '✅';
      case 'B': return '⚡';
      case 'C': return '⚠️';
      default: return '❌';
    }
  };

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return '#10B981';
      case 'within_hour': return '#F59E0B';
      case 'wait': return '#6B7280';
      default: return '#EF4444';
    }
  };

  const urgencyEmoji = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return '🚀';
      case 'within_hour': return '⏰';
      case 'wait': return '⏳';
      default: return '🚫';
    }
  };

  const thetaColor = (risk: string) => {
    switch (risk) {
      case 'low': return '#10B981';
      case 'moderate': return '#F59E0B';
      default: return '#EF4444';
    }
  };

  return (
    <div className="options-page-container" style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
      padding: 'clamp(0.5rem, 3vw, 2rem)',
      color: 'white',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '0 0.25rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ 
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', 
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🎯 Options Confluence Scanner
          </h1>
          <p style={{ color: '#94A3B8', maxWidth: '600px', margin: '0 auto', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', padding: '0 1rem' }}>
            Get intelligent strike & expiration recommendations based on Time Confluence analysis.
            Uses 50% levels, decompression timing, and Greeks-aware risk assessment.
          </p>
        </div>

        {/* Input Section */}
        <div className="options-form-controls" style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '1.5rem'
        }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onBlur={() => fetchExpirations(symbol)}
            placeholder="SPY, AAPL, QQQ, TSLA..."
            style={{
              padding: '0.75rem 1.25rem',
              fontSize: '1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(16,185,129,0.3)',
              borderRadius: '12px',
              color: 'white',
              flex: '1 1 150px',
              maxWidth: '250px',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchExpirations(symbol);
                handleScan();
              }
            }}
          />
          
          <select
            value={selectedTF}
            onChange={(e) => setSelectedTF(e.target.value as ScanModeType)}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(59,130,246,0.5)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            {TIMEFRAME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.desc})
              </option>
            ))}
          </select>
          
          {/* Expiration Date Selector */}
          <select
            value={selectedExpiry}
            onChange={(e) => setSelectedExpiry(e.target.value)}
            disabled={loadingExpirations || expirations.length === 0}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: `2px solid ${expirations.length > 0 ? 'rgba(168,85,247,0.5)' : 'rgba(100,100,100,0.3)'}`,
              borderRadius: '12px',
              color: expirations.length > 0 ? 'white' : '#64748B',
              cursor: expirations.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '0.9rem',
              fontWeight: '600',
            }}
          >
            <option value="">
              {loadingExpirations ? '⏳ Loading...' : 
               expirations.length === 0 ? '📅 Enter symbol first' : 
               '📅 Auto-select expiry'}
            </option>
            {expirations.map(exp => (
              <option key={exp.date} value={exp.date}>
                {exp.label} • {exp.totalOI.toLocaleString()} OI
              </option>
            ))}
          </select>

          <button
            onClick={() => handleScan()}
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              background: loading 
                ? 'rgba(100,100,100,0.5)'
                : 'linear-gradient(135deg, #10B981, #3B82F6)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
          >
            {loading ? '🔄 Analyzing...' : '🎯 Scan for Options'}
          </button>

          {result && (
            <button
              onClick={() => handleScan()}
              disabled={loading}
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(100,100,100,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                color: '#94A3B8',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              🔄 Refresh
            </button>
          )}
        </div>

        {/* Status Bar */}
        {lastUpdated && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.8rem', color: '#64748B' }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
            {isCached && <span style={{ marginLeft: '8px', color: '#F59E0B' }}>(cached)</span>}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
            color: '#EF4444'
          }}>
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* 📘 EDUCATIONAL MODE BADGE - Compliance first */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1))',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '1.25rem' }}>📘</span>
              <div>
                <span style={{ 
                  color: '#60A5FA', 
                  fontWeight: '600',
                  fontSize: '0.85rem',
                }}>
                  EDUCATIONAL MODE ACTIVE
                </span>
                <span style={{ 
                  color: '#94A3B8', 
                  fontSize: '0.75rem',
                  marginLeft: '0.5rem',
                }}>
                  • Analysis for learning market structure. Not financial advice.
                </span>
              </div>
            </div>
            
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* 🧠 AI MARKET STATE - Institutional Decision Framework */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {result.aiMarketState && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.95))',
                border: '2px solid rgba(168,85,247,0.5)',
                borderRadius: '20px',
                padding: 'clamp(1rem, 3vw, 1.5rem)',
                boxShadow: '0 0 60px rgba(168,85,247,0.15)',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1.25rem',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid rgba(168,85,247,0.3)',
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: '1.75rem' }}>🧠</span>
                  <div>
                    <div style={{ 
                      color: '#E9D5FF', 
                      fontWeight: '700',
                      fontSize: 'clamp(1rem, 3vw, 1.25rem)',
                      letterSpacing: '0.5px',
                    }}>
                      AI MARKET STATE
                    </div>
                    <div style={{ color: '#A78BFA', fontSize: '0.75rem' }}>
                      Institutional Decision Framework (Educational)
                    </div>
                  </div>
                </div>
                
                {/* Main State Grid - The 4 Key Metrics */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}>
                  {/* Regime */}
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                    border: '1px solid rgba(168,85,247,0.3)',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#A78BFA', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      MARKET REGIME
                    </div>
                    <div style={{ 
                      fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', 
                      fontWeight: '800',
                      color: result.aiMarketState.regime.regime === 'TREND' ? '#10B981' :
                             result.aiMarketState.regime.regime === 'RANGE' ? '#F59E0B' :
                             result.aiMarketState.regime.regime === 'EXPANSION' ? '#EF4444' : '#8B5CF6',
                    }}>
                      {result.aiMarketState.regime.regime}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.25rem' }}>
                      {result.aiMarketState.regime.confidence.toFixed(0)}% confidence
                    </div>
                  </div>
                  
                  {/* Primary Edge */}
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                    border: '1px solid rgba(16,185,129,0.3)',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#6EE7B7', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      PRIMARY EDGE
                    </div>
                    <div style={{ 
                      fontSize: 'clamp(0.8rem, 3vw, 1rem)', 
                      fontWeight: '700',
                      color: '#10B981',
                      lineHeight: 1.3,
                    }}>
                      {result.aiMarketState.thesis.primaryEdge}
                    </div>
                  </div>
                  
                  {/* Strategy Match */}
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                    border: '1px solid rgba(59,130,246,0.3)',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#93C5FD', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      STRATEGY MATCH
                    </div>
                    <div style={{ 
                      fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', 
                      fontWeight: '800',
                      color: result.aiMarketState.strategyMatchScore >= 80 ? '#10B981' :
                             result.aiMarketState.strategyMatchScore >= 60 ? '#F59E0B' : '#EF4444',
                    }}>
                      {result.aiMarketState.strategyMatchScore.toFixed(0)}%
                    </div>
                  </div>
                  
                  {/* Trade Quality Gate */}
                  <div style={{
                    background: result.aiMarketState.tradeQualityGate === 'HIGH' ? 'rgba(16,185,129,0.15)' :
                               result.aiMarketState.tradeQualityGate === 'MODERATE' ? 'rgba(245,158,11,0.15)' :
                               result.aiMarketState.tradeQualityGate === 'LOW' ? 'rgba(249,115,22,0.15)' :
                               'rgba(239,68,68,0.15)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                    border: `1px solid ${
                      result.aiMarketState.tradeQualityGate === 'HIGH' ? 'rgba(16,185,129,0.5)' :
                      result.aiMarketState.tradeQualityGate === 'MODERATE' ? 'rgba(245,158,11,0.5)' :
                      result.aiMarketState.tradeQualityGate === 'LOW' ? 'rgba(249,115,22,0.5)' :
                      'rgba(239,68,68,0.5)'
                    }`,
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      TRADE QUALITY
                    </div>
                    <div style={{ 
                      fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', 
                      fontWeight: '800',
                      color: result.aiMarketState.tradeQualityGate === 'HIGH' ? '#10B981' :
                             result.aiMarketState.tradeQualityGate === 'MODERATE' ? '#F59E0B' :
                             result.aiMarketState.tradeQualityGate === 'LOW' ? '#FB923C' : '#EF4444',
                    }}>
                      {result.aiMarketState.tradeQualityGate}
                    </div>
                    {result.aiMarketState.tradeQualityGate === 'WAIT' && (
                      <div style={{ fontSize: '0.65rem', color: '#FCA5A5', marginTop: '0.25rem' }}>
                        Not recommended
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Edge Breakdown - Horizontal Bars */}
                <div style={{
                  background: 'rgba(15,23,42,0.8)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: '0.75rem', fontWeight: '600' }}>
                    EDGE ANALYSIS (Educational Insight)
                  </div>
                  
                  {/* Direction Edge */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        Direction Edge ({result.aiMarketState.edges.directionEdge.bias.toUpperCase()})
                      </span>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600',
                        color: result.aiMarketState.edges.directionEdge.strength === 'STRONG' ? '#10B981' :
                               result.aiMarketState.edges.directionEdge.strength === 'MODERATE' ? '#F59E0B' :
                               result.aiMarketState.edges.directionEdge.strength === 'WEAK' ? '#FB923C' : '#64748B',
                      }}>
                        {result.aiMarketState.edges.directionEdge.strength} ({result.aiMarketState.edges.directionEdge.score}%)
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(100,100,100,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${result.aiMarketState.edges.directionEdge.score}%`, 
                        height: '100%', 
                        background: result.aiMarketState.edges.directionEdge.bias === 'bullish' ? '#10B981' :
                                   result.aiMarketState.edges.directionEdge.bias === 'bearish' ? '#EF4444' : '#64748B',
                        borderRadius: '3px',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                  
                  {/* Volatility Edge */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        Volatility Edge ({result.aiMarketState.edges.volatilityEdge.signal.replace('_', ' ')})
                      </span>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600',
                        color: result.aiMarketState.edges.volatilityEdge.strength === 'STRONG' ? '#10B981' :
                               result.aiMarketState.edges.volatilityEdge.strength === 'MODERATE' ? '#F59E0B' :
                               result.aiMarketState.edges.volatilityEdge.strength === 'WEAK' ? '#FB923C' : '#64748B',
                      }}>
                        {result.aiMarketState.edges.volatilityEdge.strength} ({result.aiMarketState.edges.volatilityEdge.score}%)
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(100,100,100,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${result.aiMarketState.edges.volatilityEdge.score}%`, 
                        height: '100%', 
                        background: result.aiMarketState.edges.volatilityEdge.signal === 'SELL_VOL' ? '#A855F7' :
                                   result.aiMarketState.edges.volatilityEdge.signal === 'BUY_VOL' ? '#3B82F6' : '#64748B',
                        borderRadius: '3px',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                  
                  {/* Time Edge */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        Time Confluence Edge
                      </span>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600',
                        color: result.aiMarketState.edges.timeEdge.strength === 'STRONG' ? '#10B981' :
                               result.aiMarketState.edges.timeEdge.strength === 'MODERATE' ? '#F59E0B' :
                               result.aiMarketState.edges.timeEdge.strength === 'WEAK' ? '#FB923C' : '#64748B',
                      }}>
                        {result.aiMarketState.edges.timeEdge.strength} ({result.aiMarketState.edges.timeEdge.score.toFixed(0)}%)
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(100,100,100,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${result.aiMarketState.edges.timeEdge.score}%`, 
                        height: '100%', 
                        background: '#F59E0B',
                        borderRadius: '3px',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                </div>
                
                {/* Trade Thesis - WHY THIS TRADE EXISTS */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ 
                    fontSize: '0.8rem', 
                    color: '#6EE7B7', 
                    marginBottom: '0.75rem', 
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    ⭐ TRADE THESIS (Educational)
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#E2E8F0', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {result.aiMarketState.thesis.thesis}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                    Key factors observed:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.75rem', color: '#CBD5E1' }}>
                    {result.aiMarketState.thesis.keyFactors.map((factor, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>• {factor}</li>
                    ))}
                  </ul>
                  <div style={{ 
                    marginTop: '0.75rem', 
                    paddingTop: '0.75rem', 
                    borderTop: '1px solid rgba(100,100,100,0.3)',
                    fontSize: '0.7rem',
                    color: '#F87171',
                    fontStyle: 'italic',
                  }}>
                    ⚠️ {result.aiMarketState.thesis.notEdge}
                  </div>
                </div>
                
                {/* Scenario Map - Educational Only */}
                <details style={{ background: 'rgba(30,41,59,0.6)', borderRadius: '12px', padding: '0.75rem' }}>
                  <summary style={{ 
                    cursor: 'pointer', 
                    fontSize: '0.8rem', 
                    color: '#94A3B8',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    📊 Expected Scenario Map (Educational)
                  </summary>
                  <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
                    {/* Base Case */}
                    <div style={{ 
                      background: 'rgba(100,100,100,0.2)', 
                      borderRadius: '8px', 
                      padding: '0.75rem',
                      borderLeft: '3px solid #64748B',
                    }}>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '600', marginBottom: '0.25rem' }}>
                        BASE CASE ({result.aiMarketState.scenarios.baseCase.probability}% probability estimate)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        {result.aiMarketState.scenarios.baseCase.description}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#A78BFA', marginTop: '0.25rem' }}>
                        → {result.aiMarketState.scenarios.baseCase.outcome}
                      </div>
                    </div>
                    
                    {/* Bull Case */}
                    <div style={{ 
                      background: 'rgba(16,185,129,0.1)', 
                      borderRadius: '8px', 
                      padding: '0.75rem',
                      borderLeft: '3px solid #10B981',
                    }}>
                      <div style={{ fontSize: '0.7rem', color: '#6EE7B7', fontWeight: '600', marginBottom: '0.25rem' }}>
                        BULLISH SCENARIO
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        IF: {result.aiMarketState.scenarios.bullCase.trigger}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#A78BFA', marginTop: '0.25rem' }}>
                        → {result.aiMarketState.scenarios.bullCase.outcome}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                        Adjustment: {result.aiMarketState.scenarios.bullCase.adjustment}
                      </div>
                    </div>
                    
                    {/* Bear Case */}
                    <div style={{ 
                      background: 'rgba(239,68,68,0.1)', 
                      borderRadius: '8px', 
                      padding: '0.75rem',
                      borderLeft: '3px solid #EF4444',
                    }}>
                      <div style={{ fontSize: '0.7rem', color: '#FCA5A5', fontWeight: '600', marginBottom: '0.25rem' }}>
                        BEARISH SCENARIO
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                        IF: {result.aiMarketState.scenarios.bearCase.trigger}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#A78BFA', marginTop: '0.25rem' }}>
                        → {result.aiMarketState.scenarios.bearCase.outcome}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                        Adjustment: {result.aiMarketState.scenarios.bearCase.adjustment}
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* 🎯 DECISION ENGINE - The ONE card that answers "Should I trade this?" */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
              border: `3px solid ${gradeColor(result.tradeQuality)}`,
              borderRadius: '20px',
              padding: 'clamp(1rem, 3vw, 1.75rem)',
              boxShadow: `0 0 40px ${gradeColor(result.tradeQuality)}25`,
            }}>
              {/* Header Row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid rgba(148,163,184,0.2)',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{
                    background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                    padding: '6px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#fff',
                    letterSpacing: '0.5px',
                  }}>
                    🎯 DECISION ENGINE
                  </span>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>
                    {symbol.toUpperCase()} • ${result.currentPrice.toFixed(2)}
                  </span>
                </div>
                
                {/* Entry Status Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  background: result.entryTiming.urgency === 'immediate' || result.entryTiming.urgency === 'within_hour'
                    ? 'rgba(16,185,129,0.2)'
                    : result.entryTiming.urgency === 'wait'
                    ? 'rgba(245,158,11,0.2)'
                    : 'rgba(239,68,68,0.2)',
                  border: `1px solid ${urgencyColor(result.entryTiming.urgency)}50`,
                }}>
                  <span style={{ fontSize: '0.9rem' }}>{urgencyEmoji(result.entryTiming.urgency)}</span>
                  <span style={{ 
                    color: urgencyColor(result.entryTiming.urgency),
                    fontWeight: '700',
                    fontSize: '13px',
                    textTransform: 'uppercase',
                  }}>
                    {result.entryTiming.urgency === 'no_trade' ? 'NO TRADE' : result.entryTiming.urgency.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Main Decision Grid */}
              <div className="decision-grid-mobile" style={{
                marginBottom: '1.5rem',
              }}>
                {/* Trade Score - Weighted setup quality */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#64748B', 
                    marginBottom: '4px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                  }}>
                    Setup Quality
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                    fontWeight: '800',
                    color: gradeColor(result.tradeQuality),
                    lineHeight: 1,
                  }}>
                    {gradeEmoji(result.tradeQuality)} {result.tradeQuality}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '4px' }}>
                    Weighted Score
                  </div>
                </div>

                {/* Bias / Direction */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Bias
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.1rem, 4vw, 1.75rem)',
                    fontWeight: '700',
                    color: result.direction === 'bullish' ? '#10B981' 
                      : result.direction === 'bearish' ? '#EF4444' 
                      : '#F59E0B',
                  }}>
                    {result.direction === 'bullish' ? '🟢 BULLISH' 
                      : result.direction === 'bearish' ? '🔴 BEARISH' 
                      : '⚖️ NEUTRAL'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '4px' }}>
                    Pull: {result.pullBias > 0 ? '+' : ''}{result.pullBias.toFixed(1)}%
                  </div>
                </div>

                {/* Strategy */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Strategy
                  </div>
                  <div style={{
                    fontSize: 'clamp(0.9rem, 3vw, 1.25rem)',
                    fontWeight: '700',
                    color: result.strategyRecommendation?.strategyType === 'buy_premium' ? '#3B82F6'
                      : result.strategyRecommendation?.strategyType === 'sell_premium' ? '#8B5CF6'
                      : '#F59E0B',
                  }}>
                    {result.strategyRecommendation?.strategy || 
                      (result.direction === 'bullish' ? 'Buy Calls' : 
                       result.direction === 'bearish' ? 'Buy Puts' : 'Iron Condor')}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '4px' }}>
                    {result.strategyRecommendation?.riskProfile === 'defined' ? '✓ Defined Risk' : '⚠️ Undefined Risk'}
                  </div>
                </div>

                {/* Edge Score - Signal-based edge calculation */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    EDGE
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.1rem, 4vw, 1.75rem)',
                    fontWeight: '700',
                    color: probabilityResult?.winProbability && probabilityResult.winProbability >= 55 ? '#10B981' 
                      : probabilityResult?.winProbability && probabilityResult.winProbability >= 45 ? '#F59E0B' 
                      : '#6B7280',
                  }}>
                    {probabilityResult?.winProbability 
                      ? `${probabilityResult.winProbability.toFixed(0)}%`
                      : '—'}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '4px' }}>
                    Signal Edge
                  </div>
                </div>

                {/* Kelly Size - Shows optimal position or "No Edge" */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Kelly Size
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.1rem, 4vw, 1.75rem)',
                    fontWeight: '700',
                    color: probabilityResult?.kellySizePercent && probabilityResult.kellySizePercent > 0 ? '#10B981' : '#EF4444',
                  }}>
                    {probabilityResult 
                      ? (probabilityResult.kellySizePercent > 0 
                          ? `${probabilityResult.kellySizePercent.toFixed(1)}%`
                          : '0%')
                      : '—'}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '4px' }}>
                    {probabilityResult?.kellySizePercent && probabilityResult.kellySizePercent > 0 
                      ? 'Optimal Position' 
                      : 'No Edge (Skip)'}
                  </div>
                </div>

                {/* Risk/Reward - Graded: <0.75=poor, 0.75-1=weak, 1-1.5=acceptable, 1.5+=strong */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Risk/Reward
                  </div>
                  <div style={{
                    fontSize: 'clamp(1rem, 4vw, 1.75rem)',
                    fontWeight: '700',
                    color: result.tradeLevels 
                      ? result.tradeLevels.riskRewardRatio >= 1.5 ? '#10B981'  // Strong (green)
                      : result.tradeLevels.riskRewardRatio >= 1.0 ? '#F59E0B'  // Acceptable (amber)
                      : result.tradeLevels.riskRewardRatio >= 0.75 ? '#FB923C' // Weak (orange)
                      : '#EF4444'  // Poor (red)
                      : '#6B7280',
                  }}>
                    {result.tradeLevels ? `1:${result.tradeLevels.riskRewardRatio.toFixed(1)}` : '—'}
                  </div>
                  <div style={{ 
                    fontSize: '0.65rem', 
                    color: result.tradeLevels 
                      ? result.tradeLevels.riskRewardRatio >= 1.5 ? '#6EE7B7' 
                      : result.tradeLevels.riskRewardRatio >= 1.0 ? '#FCD34D'
                      : result.tradeLevels.riskRewardRatio >= 0.75 ? '#FDBA74'
                      : '#FCA5A5'
                      : '#64748B',
                    marginTop: '4px' 
                  }}>
                    {result.tradeLevels 
                      ? result.tradeLevels.riskRewardRatio >= 1.5 ? '✓ Strong' 
                      : result.tradeLevels.riskRewardRatio >= 1.0 ? 'Acceptable'
                      : result.tradeLevels.riskRewardRatio >= 0.75 ? '⚠ Weak'
                      : '✗ Poor'
                      : 'Calculating...'}
                  </div>
                </div>
              </div>

              {/* Conflicts Warning (if any) */}
              {(result.compositeScore?.conflicts?.length ?? 0) > 0 && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ 
                    fontWeight: '700', 
                    color: '#EF4444', 
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    ⚠️ SIGNAL CONFLICTS DETECTED
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#FCA5A5' }}>
                    {result.compositeScore?.conflicts?.map((conflict, i) => (
                      <div key={i} style={{ marginBottom: '4px' }}>• {conflict}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entry Window Info */}
              <div className="entry-timing-row" style={{
                background: 'rgba(59,130,246,0.1)',
                borderRadius: '12px',
                padding: '1rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginBottom: '4px', fontWeight: '600' }}>
                    ENTRY WINDOW
                  </div>
                  <div style={{ color: '#E2E8F0', fontWeight: '500' }}>
                    {result.entryTiming.idealEntryWindow}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginBottom: '4px', fontWeight: '600' }}>
                    SESSION
                  </div>
                  <div style={{ color: '#E2E8F0', fontWeight: '500' }}>
                    {result.entryTiming.marketSession === 'regular' ? '🟢 Market Open' :
                     result.entryTiming.marketSession === 'premarket' ? '🌅 Pre-Market' :
                     result.entryTiming.marketSession === 'afterhours' ? '🌙 After Hours' :
                     '🔒 Closed'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginBottom: '4px', fontWeight: '600' }}>
                    CONFLUENCE
                  </div>
                  <div style={{ color: '#E2E8F0', fontWeight: '500' }}>
                    {result.candleCloseConfluence 
                      ? `${result.candleCloseConfluence.confluenceRating.toUpperCase()} (${result.candleCloseConfluence.confluenceScore}%)`
                      : `${result.confluenceStack} TFs`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginBottom: '4px', fontWeight: '600' }}>
                    ALIGNMENT
                  </div>
                  <div style={{ 
                    color: result.compositeScore && result.compositeScore.confidence >= 70 ? '#10B981' 
                      : result.compositeScore && result.compositeScore.confidence >= 50 ? '#F59E0B' 
                      : '#94A3B8',
                    fontWeight: '600' 
                  }}>
                    {result.compositeScore ? `${result.compositeScore.confidence.toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>

              {/* Quality Reasons (collapsible summary) */}
              <details style={{ marginTop: '1rem' }}>
                <summary style={{ 
                  color: '#64748B', 
                  fontSize: '0.8rem', 
                  cursor: 'pointer',
                  padding: '0.5rem 0',
                }}>
                  📋 Quality Factors ({result.qualityReasons.length})
                </summary>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#94A3B8', 
                  paddingLeft: '1rem',
                  marginTop: '0.5rem',
                }}>
                  {result.qualityReasons.map((r, i) => (
                    <div key={i} style={{ marginBottom: '4px' }}>• {r}</div>
                  ))}
                </div>
              </details>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* 🏦 INSTITUTIONAL-GRADE PRO MODE DASHBOARD - PROBABILITY ENGINE */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {probabilityResult && (
              <div style={{ marginBottom: '1.5rem' }}>
                {/* Pro Mode Toggle */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{
                      background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#fff',
                      letterSpacing: '0.5px',
                    }}>
                      🏦 INSTITUTIONAL EDGE
                    </span>
                    <span style={{ color: '#94A3B8', fontSize: '13px' }}>
                      Probability-based analysis
                    </span>
                  </div>
                  <button
                    onClick={() => setShowProMode(!showProMode)}
                    style={{
                      background: showProMode ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.2)',
                      border: `1px solid ${showProMode ? 'rgba(16,185,129,0.5)' : 'rgba(100,116,139,0.5)'}`,
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: showProMode ? '#10B981' : '#94A3B8',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {showProMode ? '✓ Pro Mode' : 'Basic Mode'}
                  </button>
                </div>

                {showProMode && (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {/* Main Pro Dashboard */}
                    <ProModeDashboard
                      probability={probabilityResult}
                      tradeLevels={result.tradeLevels}
                      currentPrice={result.currentPrice}
                      symbol={symbol.toUpperCase()}
                    />

                    {/* Phase Strip + Confluence Map Row */}
                    <div className="card-grid-mobile">
                      {/* Market Phase */}
                      <PhaseStrip currentPhase={marketPhase} />
                      
                      {/* Signal Confluence Map */}
                      <ConfluenceMap components={probabilityResult.components} />
                    </div>

                    {/* Quick Action Buttons */}
                    <div style={{
                      display: 'flex',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}>
                      <a
                        href={`/tools/journal?symbol=${symbol.toUpperCase()}&type=${result.direction === 'bullish' ? 'call' : 'put'}&entry=${result.currentPrice}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.75rem 1.25rem',
                          background: 'linear-gradient(135deg, #10B981, #059669)',
                          borderRadius: '12px',
                          color: 'white',
                          textDecoration: 'none',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                        }}
                      >
                        📊 Log to Journal
                      </a>
                      <a
                        href={`/tools/backtest?symbol=${symbol.toUpperCase()}&direction=${result.direction}&strategy=${encodeURIComponent(result.strategyRecommendation?.strategy || '')}&from=options-scanner`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.75rem 1.25rem',
                          background: 'rgba(59,130,246,0.2)',
                          border: '1px solid rgba(59,130,246,0.5)',
                          borderRadius: '12px',
                          color: '#60A5FA',
                          textDecoration: 'none',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                        }}
                      >
                        📈 Backtest This Setup
                      </a>
                      <a
                        href={`/tools/deep-analysis?symbol=${symbol.toUpperCase()}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.75rem 1.25rem',
                          background: 'rgba(168,85,247,0.2)',
                          border: '1px solid rgba(168,85,247,0.5)',
                          borderRadius: '12px',
                          color: '#C084FC',
                          textDecoration: 'none',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                        }}
                      >
                        🥚 Deep Analysis
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PRO TRADER SECTION - Collapsible */}
            <details open style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(59,130,246,0.15) 100%)',
              border: '2px solid rgba(168,85,247,0.5)',
              borderRadius: '20px',
              padding: '1.5rem',
              marginBottom: '1rem',
            }}>
              <summary style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem', 
                marginBottom: '1.25rem',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(168,85,247,0.3)',
                paddingBottom: '0.75rem',
                listStyle: 'none',
              }}>
                <span style={{ fontSize: '1.5rem' }}>🎯</span>
                <h2 style={{ margin: 0, color: '#E9D5FF', fontSize: '1.25rem', flex: 1 }}>Pro Trader Insights</h2>
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: '#A78BFA',
                  background: 'rgba(168,85,247,0.2)',
                  padding: '4px 10px',
                  borderRadius: '8px',
                }}>
                  ▼ Show Details
                </span>
              </summary>

              {/* COMPOSITE SCORE & STRATEGY - TOP OF PRO SECTION */}
              {result.compositeScore && (
                <div style={{ marginBottom: '1.5rem' }}>
                  {/* Strategy Recommendation Banner */}
                  {result.strategyRecommendation && (
                    <div style={{
                      background: result.strategyRecommendation.strategyType === 'sell_premium' 
                        ? 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(249,115,22,0.2) 100%)'
                        : result.strategyRecommendation.strategyType === 'buy_premium'
                        ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(59,130,246,0.2) 100%)'
                        : 'linear-gradient(135deg, rgba(100,116,139,0.2) 0%, rgba(148,163,184,0.2) 100%)',
                      border: `2px solid ${
                        result.strategyRecommendation.strategyType === 'sell_premium' ? 'rgba(239,68,68,0.5)' :
                        result.strategyRecommendation.strategyType === 'buy_premium' ? 'rgba(16,185,129,0.5)' :
                        'rgba(100,116,139,0.5)'
                      }`,
                      borderRadius: '16px',
                      padding: '1.25rem',
                      marginBottom: '1rem'
                    }}>
                      <div className="trade-levels-row">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.25rem' }}>
                              {result.strategyRecommendation.strategyType === 'sell_premium' ? '💰' :
                               result.strategyRecommendation.strategyType === 'buy_premium' ? '📈' : '⚖️'}
                            </span>
                            <span style={{ 
                              fontSize: '1.4rem', 
                              fontWeight: 'bold',
                              color: result.strategyRecommendation.strategyType === 'sell_premium' ? '#F87171' :
                                     result.strategyRecommendation.strategyType === 'buy_premium' ? '#34D399' : '#94A3B8'
                            }}>
                              {result.strategyRecommendation.strategy}
                            </span>
                            <span style={{
                              background: result.strategyRecommendation.riskProfile === 'defined' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                              color: result.strategyRecommendation.riskProfile === 'defined' ? '#6EE7B7' : '#FCD34D',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '0.7rem',
                              fontWeight: '600'
                            }}>
                              {result.strategyRecommendation.riskProfile === 'defined' ? '✓ Defined Risk' : '⚠️ Undefined Risk'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#CBD5E1', marginBottom: '0.5rem' }}>
                            {result.strategyRecommendation.reason}
                          </div>
                          {result.strategyRecommendation.strikes && (
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                              {result.strategyRecommendation.strikes.long && (
                                <span>Long: ${result.strategyRecommendation.strikes.long} </span>
                              )}
                              {result.strategyRecommendation.strikes.short && (
                                <span>Short: ${result.strategyRecommendation.strikes.short}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Risk / Reward</div>
                          <div style={{ fontSize: '0.8rem', color: '#FCA5A5' }}>Max Risk: {result.strategyRecommendation.maxRisk}</div>
                          <div style={{ fontSize: '0.8rem', color: '#6EE7B7' }}>Max Reward: {result.strategyRecommendation.maxReward}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Composite Score Card */}
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    border: '1px solid rgba(168,85,247,0.4)',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1rem'
                  }}>
                    <div className="flex-wrap-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.25rem' }}>Composite Signal</div>
                        <div style={{ 
                          fontSize: 'clamp(1.1rem, 4vw, 1.75rem)', 
                          fontWeight: 'bold',
                          color: result.compositeScore.finalDirection === 'bullish' ? '#10B981' :
                                 result.compositeScore.finalDirection === 'bearish' ? '#EF4444' : '#F59E0B'
                        }}>
                          {result.compositeScore.finalDirection.toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-wrap-mobile" style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ 
                            fontSize: 'clamp(1rem, 3vw, 1.5rem)', 
                            fontWeight: 'bold',
                            color: result.compositeScore.directionScore > 0 ? '#10B981' : 
                                   result.compositeScore.directionScore < 0 ? '#EF4444' : '#F59E0B'
                          }}>
                            {result.compositeScore.directionScore > 0 ? '+' : ''}{result.compositeScore.directionScore.toFixed(0)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Score</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ 
                            fontSize: 'clamp(1rem, 3vw, 1.5rem)', 
                            fontWeight: 'bold',
                            color: result.compositeScore.confidence >= 70 ? '#10B981' :
                                   result.compositeScore.confidence >= 50 ? '#F59E0B' : '#EF4444'
                          }}>
                            {result.compositeScore.confidence.toFixed(0)}%
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Confidence</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)', fontWeight: 'bold', color: '#A855F7' }}>
                            {result.compositeScore.alignedCount}/{result.compositeScore.totalSignals}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Aligned</div>
                        </div>
                      </div>
                    </div>

                    {/* Signal Components - With weight % and proper color grading */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Signal Components (weighted):</div>
                      <div className="card-grid-mobile" style={{ gap: '0.5rem' }}>
                        {result.compositeScore.components.map((comp, idx) => {
                          // Color based on strength, not just direction
                          const isStrong = Math.abs(comp.score) >= 50;
                          const isMedium = Math.abs(comp.score) >= 25;
                          const barColor = comp.direction === 'neutral' ? '#64748B' 
                            : isStrong 
                              ? (comp.direction === 'bullish' ? '#10B981' : '#EF4444')
                              : isMedium 
                                ? (comp.direction === 'bullish' ? '#6EE7B7' : '#FCA5A5')
                                : '#94A3B8'; // Weak = grey
                          const bgColor = comp.direction === 'neutral' ? 'rgba(100,116,139,0.15)'
                            : isStrong
                              ? (comp.direction === 'bullish' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)')
                              : isMedium
                                ? (comp.direction === 'bullish' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)')
                                : 'rgba(100,116,139,0.08)'; // Weak = faded
                          
                          return (
                            <div key={idx} style={{
                              background: bgColor,
                              padding: '0.5rem 0.75rem',
                              borderRadius: '8px',
                              borderLeft: `3px solid ${barColor}`,
                              fontSize: '0.75rem',
                              opacity: isStrong ? 1 : isMedium ? 0.85 : 0.65,
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: '600', color: '#E2E8F0' }}>
                                  {comp.name}
                                  <span style={{ 
                                    fontSize: '0.6rem', 
                                    color: '#64748B',
                                    marginLeft: '4px',
                                    fontWeight: '400',
                                  }}>({(comp.weight * 100).toFixed(0)}%)</span>
                                </span>
                                <span style={{ 
                                  fontWeight: 'bold',
                                  color: barColor,
                                }}>
                                  {comp.direction === 'neutral' ? '—' : comp.direction === 'bullish' ? '↑' : '↓'}
                                  {' '}{Math.abs(comp.score).toFixed(0)}
                                </span>
                              </div>
                              <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>{comp.reason}</div>
                              <div style={{ 
                                marginTop: '0.25rem',
                                height: '4px',
                                background: 'rgba(100,116,139,0.3)',
                                borderRadius: '2px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${Math.min(Math.abs(comp.score), 100)}%`,
                                  height: '100%',
                                  background: barColor,
                                  borderRadius: '2px'
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conflicts Warning */}
                    {result.compositeScore.conflicts.length > 0 && (
                      <div style={{
                        background: 'rgba(239,68,68,0.15)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                      }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#FCA5A5', marginBottom: '0.5rem' }}>
                          ⚠️ Signal Conflicts Detected
                        </div>
                        {result.compositeScore.conflicts.map((conflict, idx) => (
                          <div key={idx} style={{ fontSize: '0.75rem', color: '#FDA4AF', marginBottom: '0.25rem' }}>
                            {conflict}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="card-grid-mobile" style={{ gap: '1rem' }}>
                
                {/* IV Analysis Card */}
                {result.ivAnalysis && (
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: '12px',
                    padding: '1rem',
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#A855F7', fontSize: '0.9rem' }}>📊 IV Rank / Percentile</h4>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontSize: '1.75rem', 
                          fontWeight: 'bold',
                          color: result.ivAnalysis.ivRank >= 70 ? '#EF4444' : result.ivAnalysis.ivRank <= 30 ? '#10B981' : '#F59E0B'
                        }}>
                          {result.ivAnalysis.ivRank}%
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>IV Rank</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#CBD5E1' }}>
                          {(result.ivAnalysis.currentIV * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Current IV</div>
                      </div>
                    </div>
                    <div style={{
                      background: result.ivAnalysis.ivSignal === 'sell_premium' ? 'rgba(239,68,68,0.2)' :
                                 result.ivAnalysis.ivSignal === 'buy_premium' ? 'rgba(16,185,129,0.2)' :
                                 'rgba(245,158,11,0.2)',
                      padding: '0.5rem',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      color: result.ivAnalysis.ivSignal === 'sell_premium' ? '#FCA5A5' :
                             result.ivAnalysis.ivSignal === 'buy_premium' ? '#6EE7B7' : '#FCD34D'
                    }}>
                      {result.ivAnalysis.ivSignal === 'sell_premium' ? '💰 SELL Premium' :
                       result.ivAnalysis.ivSignal === 'buy_premium' ? '📈 BUY Premium' : '⚖️ Neutral'}
                      <div style={{ fontSize: '0.65rem', marginTop: '0.25rem', opacity: 0.8 }}>
                        {result.ivAnalysis.ivReason}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expected Move Card */}
                {result.expectedMove && (
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: '12px',
                    padding: '1rem',
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#3B82F6', fontSize: '0.9rem' }}>📏 Expected Move</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Weekly (7 DTE):</span>
                        <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>
                          ±${result.expectedMove.weekly.toFixed(2)} ({result.expectedMove.weeklyPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Monthly (30 DTE):</span>
                        <span style={{ fontWeight: 'bold', color: '#60A5FA' }}>
                          ±${result.expectedMove.monthly.toFixed(2)} ({result.expectedMove.monthlyPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        background: 'rgba(59,130,246,0.2)', padding: '0.5rem', borderRadius: '6px', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#93C5FD' }}>Selected Expiry:</span>
                        <span style={{ fontWeight: 'bold', color: '#93C5FD' }}>
                          ±${result.expectedMove.selectedExpiry.toFixed(2)} ({result.expectedMove.selectedExpiryPercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.5rem' }}>
                      Based on 1 standard deviation (68% probability)
                    </div>
                  </div>
                )}

                {/* Unusual Activity Card */}
                {result.unusualActivity && (
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    border: `1px solid ${
                      result.unusualActivity.alertLevel === 'high' ? 'rgba(239,68,68,0.5)' :
                      result.unusualActivity.alertLevel === 'moderate' ? 'rgba(245,158,11,0.5)' :
                      'rgba(100,116,139,0.3)'
                    }`,
                    borderRadius: '12px',
                    padding: '1rem',
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#F59E0B', fontSize: '0.9rem' }}>
                      🔥 Unusual Activity
                      {result.unusualActivity.alertLevel === 'high' && (
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          background: 'rgba(239,68,68,0.3)', 
                          color: '#FCA5A5',
                          padding: '2px 8px', 
                          borderRadius: '999px', 
                          fontSize: '0.65rem' 
                        }}>
                          HIGH ALERT
                        </span>
                      )}
                    </h4>
                    
                    {result.unusualActivity.hasUnusualActivity ? (
                      <>
                        <div style={{ 
                          fontSize: '0.85rem', 
                          color: result.unusualActivity.smartMoneyDirection === 'bullish' ? '#10B981' :
                                 result.unusualActivity.smartMoneyDirection === 'bearish' ? '#EF4444' : '#94A3B8',
                          marginBottom: '0.5rem'
                        }}>
                          Smart Money: {result.unusualActivity.smartMoneyDirection.toUpperCase()}
                        </div>
                        <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                          {result.unusualActivity.unusualStrikes.slice(0, 3).map((strike, idx) => (
                            <div key={idx} style={{
                              background: strike.type === 'call' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              marginBottom: '0.4rem',
                              fontSize: '0.75rem'
                            }}>
                              <div style={{ 
                                fontWeight: 'bold', 
                                color: strike.type === 'call' ? '#10B981' : '#EF4444' 
                              }}>
                                ${strike.strike} {strike.type.toUpperCase()} - {strike.volumeOIRatio.toFixed(1)}x Vol/OI
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                                {strike.volume.toLocaleString()} vol / {strike.openInterest.toLocaleString()} OI
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: '#64748B', fontSize: '0.8rem' }}>
                        No unusual options activity detected
                      </div>
                    )}
                  </div>
                )}

                {/* Trade Levels Card */}
                {result.tradeLevels && (
                  <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '12px',
                    padding: '1rem',
                    gridColumn: 'span 1',
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#10B981', fontSize: '0.9rem' }}>
                      📍 Entry/Exit Levels
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        background: result.tradeLevels.riskRewardRatio >= 1.5 ? 'rgba(16,185,129,0.3)' 
                          : result.tradeLevels.riskRewardRatio >= 1.0 ? 'rgba(245,158,11,0.3)'
                          : result.tradeLevels.riskRewardRatio >= 0.75 ? 'rgba(251,146,60,0.3)'
                          : 'rgba(239,68,68,0.3)',
                        color: result.tradeLevels.riskRewardRatio >= 1.5 ? '#6EE7B7' 
                          : result.tradeLevels.riskRewardRatio >= 1.0 ? '#FCD34D'
                          : result.tradeLevels.riskRewardRatio >= 0.75 ? '#FDBA74'
                          : '#FCA5A5',
                        padding: '2px 8px', 
                        borderRadius: '999px', 
                        fontSize: '0.65rem' 
                      }}>
                        {result.tradeLevels.riskRewardRatio.toFixed(1)}:1 R:R
                      </span>
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#3B82F6' }}>📥 Entry Zone:</span>
                        <span style={{ color: '#93C5FD', fontWeight: 'bold' }}>
                          ${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#EF4444' }}>🛑 Stop Loss:</span>
                        <span style={{ color: '#FCA5A5', fontWeight: 'bold' }}>
                          ${result.tradeLevels.stopLoss.toFixed(2)} ({result.tradeLevels.stopLossPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#10B981' }}>🎯 Target 1 (50%):</span>
                        <span style={{ color: '#6EE7B7', fontWeight: 'bold' }}>
                          ${result.tradeLevels.target1.price.toFixed(2)}
                        </span>
                      </div>
                      {result.tradeLevels.target2 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#10B981' }}>🎯 Target 2 (30%):</span>
                          <span style={{ color: '#6EE7B7' }}>
                            ${result.tradeLevels.target2.price.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {result.tradeLevels.target3 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#10B981' }}>🎯 Target 3 (20%):</span>
                          <span style={{ color: '#6EE7B7' }}>
                            ${result.tradeLevels.target3.price.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.5rem', lineHeight: '1.4' }}>
                      {result.tradeLevels.reasoning}
                    </div>
                  </div>
                )}

              </div>
            </details>

            {/* Confluence Info - Collapsible */}
            <details style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(168,85,247,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <summary style={{ 
                margin: '0 0 1rem 0', 
                color: '#A78BFA', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                listStyle: 'none',
              }}>
                <span style={{ color: '#A855F7' }}>🔮</span>
                <span>Confluence Analysis</span>
                <span style={{ 
                  fontSize: '0.7rem',
                  marginLeft: 'auto',
                  color: '#64748B',
                }}>
                  {result.confluenceStack} TFs closing together • click to expand
                </span>
              </summary>
              <div className="confluence-info-row">
                <div style={{
                  background: result.confluenceStack >= 4 
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.3) 0%, rgba(168,85,247,0.2) 100%)'
                    : result.confluenceStack >= 2
                    ? 'rgba(168,85,247,0.2)'
                    : 'rgba(100,116,139,0.2)',
                  padding: '1rem',
                  borderRadius: '12px',
                  textAlign: 'center',
                  border: result.confluenceStack >= 4 ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent',
                }}>
                  <div style={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold', 
                    color: result.confluenceStack >= 4 ? '#10B981' : result.confluenceStack >= 2 ? '#A855F7' : '#64748B',
                  }}>
                    {result.confluenceStack}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                    {result.confluenceStack >= 4 ? 'TFs Closing Together 🔥' : 
                     result.confluenceStack >= 2 ? 'TFs Aligned' : 
                     result.confluenceStack === 1 ? 'TF Active' : 'No Clustering'}
                  </div>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                    {result.confluenceStack >= 2 ? 'Clustered Timeframes:' : 'Active Timeframes:'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {result.decompressingTFs.length > 0 ? result.decompressingTFs.map(tf => (
                      <span key={tf} style={{
                        background: 'rgba(168,85,247,0.3)',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        color: '#E9D5FF'
                      }}>
                        {tf}
                      </span>
                    )) : (
                      <span style={{ color: '#64748B', fontSize: '0.85rem' }}>No TFs actively aligned</span>
                    )}
                  </div>
                </div>
              </div>
            </details>

            {/* 🕐 CANDLE CLOSE CONFLUENCE - When multiple TFs close together */}
            {result.candleCloseConfluence && (
              <div style={{
                background: result.candleCloseConfluence.confluenceRating === 'extreme' 
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(168,85,247,0.15) 100%)'
                  : result.candleCloseConfluence.confluenceRating === 'high'
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(168,85,247,0.15) 100%)'
                  : 'rgba(30,41,59,0.6)',
                border: `2px solid ${
                  result.candleCloseConfluence.confluenceRating === 'extreme' ? 'rgba(239,68,68,0.5)' :
                  result.candleCloseConfluence.confluenceRating === 'high' ? 'rgba(245,158,11,0.5)' :
                  'rgba(168,85,247,0.3)'
                }`,
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#F59E0B' }}>
                    🕐 Candle Close Confluence
                    {result.candleCloseConfluence.confluenceRating === 'extreme' && (
                      <span style={{ marginLeft: '0.5rem', background: 'rgba(239,68,68,0.3)', color: '#FCA5A5', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600' }}>
                        🔥 EXTREME
                      </span>
                    )}
                    {result.candleCloseConfluence.confluenceRating === 'high' && (
                      <span style={{ marginLeft: '0.5rem', background: 'rgba(245,158,11,0.3)', color: '#FCD34D', padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600' }}>
                        ⚡ HIGH
                      </span>
                    )}
                  </h3>
                  <div style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 'bold',
                    color: result.candleCloseConfluence.confluenceScore >= 50 ? '#F59E0B' : '#94A3B8'
                  }}>
                    Score: {result.candleCloseConfluence.confluenceScore}%
                  </div>
                </div>

                <div className="card-grid-mobile">
                  {/* Closing Now */}
                  <div style={{
                    background: 'rgba(30,41,59,0.6)',
                    borderRadius: '12px',
                    padding: '1rem',
                    borderLeft: `3px solid ${result.candleCloseConfluence.closingNow.count >= 2 ? '#10B981' : '#64748B'}`
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Closing NOW (within 5 mins)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: result.candleCloseConfluence.closingNow.count >= 2 ? '#10B981' : '#E2E8F0' }}>
                      {result.candleCloseConfluence.closingNow.count} TFs
                    </div>
                    {result.candleCloseConfluence.closingNow.count > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                        {result.candleCloseConfluence.closingNow.timeframes.map(tf => (
                          <span key={tf} style={{
                            background: 'rgba(16,185,129,0.2)',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            color: '#6EE7B7'
                          }}>{tf}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Closing Soon */}
                  <div style={{
                    background: 'rgba(30,41,59,0.6)',
                    borderRadius: '12px',
                    padding: '1rem',
                    borderLeft: '3px solid #3B82F6'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Closing Soon (1-4 hours)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3B82F6' }}>
                      {result.candleCloseConfluence.closingSoon.count} TFs
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#93C5FD', marginTop: '0.25rem' }}>
                      Peak: {result.candleCloseConfluence.closingSoon.peakCount} TFs in {result.candleCloseConfluence.closingSoon.peakConfluenceIn}m
                    </div>
                  </div>

                  {/* Special Events */}
                  <div style={{
                    background: 'rgba(30,41,59,0.6)',
                    borderRadius: '12px',
                    padding: '1rem',
                    borderLeft: `3px solid ${
                      result.candleCloseConfluence.specialEvents.isYearEnd ? '#EF4444' :
                      result.candleCloseConfluence.specialEvents.isQuarterEnd ? '#F59E0B' :
                      result.candleCloseConfluence.specialEvents.isMonthEnd ? '#A855F7' :
                      '#64748B'
                    }`
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Special Events</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {result.candleCloseConfluence.specialEvents.isYearEnd && (
                        <span style={{ fontSize: '0.8rem', color: '#FCA5A5', fontWeight: '600' }}>📅 YEAR END</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.isQuarterEnd && (
                        <span style={{ fontSize: '0.8rem', color: '#FCD34D', fontWeight: '600' }}>📅 QUARTER END</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.isMonthEnd && (
                        <span style={{ fontSize: '0.8rem', color: '#E9D5FF', fontWeight: '600' }}>📅 Month End</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.isWeekEnd && (
                        <span style={{ fontSize: '0.8rem', color: '#CBD5E1' }}>📅 Week End (Friday)</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.sessionClose !== 'none' && (
                        <span style={{ fontSize: '0.8rem', color: '#93C5FD' }}>
                          🌍 {result.candleCloseConfluence.specialEvents.sessionClose.toUpperCase()} Session Close
                        </span>
                      )}
                      {!result.candleCloseConfluence.specialEvents.isYearEnd && 
                       !result.candleCloseConfluence.specialEvents.isQuarterEnd && 
                       !result.candleCloseConfluence.specialEvents.isMonthEnd && 
                       !result.candleCloseConfluence.specialEvents.isWeekEnd &&
                       result.candleCloseConfluence.specialEvents.sessionClose === 'none' && (
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>No special events</span>
                      )}
                    </div>
                  </div>

                  {/* Best Entry Window */}
                  <div style={{
                    background: 'rgba(30,41,59,0.6)',
                    borderRadius: '12px',
                    padding: '1rem',
                    borderLeft: '3px solid #10B981'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Best Entry Window</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10B981' }}>
                      {result.candleCloseConfluence.bestEntryWindow.startMins === 0 ? 'NOW' : `In ${result.candleCloseConfluence.bestEntryWindow.startMins}m`}
                      {' → '}{result.candleCloseConfluence.bestEntryWindow.endMins}m
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6EE7B7', marginTop: '0.25rem' }}>
                      {result.candleCloseConfluence.bestEntryWindow.reason}
                    </div>
                  </div>
                </div>

                {/* Closing Soon Timeline */}
                {result.candleCloseConfluence.closingSoon.timeframes.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(100,116,139,0.3)' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Upcoming Candle Closes:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {result.candleCloseConfluence.closingSoon.timeframes.slice(0, 8).map((item, idx) => (
                        <div key={idx} style={{
                          background: item.weight >= 10 ? 'rgba(239,68,68,0.15)' : item.weight >= 5 ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          border: `1px solid ${item.weight >= 10 ? 'rgba(239,68,68,0.3)' : item.weight >= 5 ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.3)'}`
                        }}>
                          <span style={{ fontWeight: '600', color: item.weight >= 10 ? '#FCA5A5' : item.weight >= 5 ? '#FCD34D' : '#CBD5E1' }}>{item.tf}</span>
                          <span style={{ color: '#94A3B8' }}> in {item.minsAway}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Strike & Expiration Recommendations */}
            {result.direction !== 'neutral' && (
              <div className="card-grid-mobile">
                
                {/* Strike Recommendation */}
                <div style={{
                  background: 'rgba(30,41,59,0.6)',
                  border: '2px solid rgba(16,185,129,0.4)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#10B981' }}>🎯 Recommended Strike</h3>
                  
                  {result.primaryStrike ? (
                    <>
                      <div style={{
                        background: result.primaryStrike.type === 'call' 
                          ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))'
                          : 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
                        padding: '1.25rem',
                        borderRadius: '12px',
                        marginBottom: '1rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{
                            fontSize: '1.75rem',
                            fontWeight: 'bold',
                            color: result.primaryStrike.type === 'call' ? '#10B981' : '#EF4444'
                          }}>
                            ${result.primaryStrike.strike} {result.primaryStrike.type.toUpperCase()}
                          </span>
                          <span style={{
                            background: result.primaryStrike.moneyness === 'ATM' ? 'rgba(245,158,11,0.3)' : 'rgba(100,100,100,0.3)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            {result.primaryStrike.moneyness}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.75rem' }}>
                          {result.primaryStrike.reason}
                        </div>
                        
                        <div className="grid-equal-2-col-responsive" style={{ gap: '0.75rem', fontSize: '0.8rem' }}>
                          <div>
                            <span style={{ color: '#64748B' }}>Est. Delta:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px', fontWeight: 'bold' }}>
                              {(result.primaryStrike.estimatedDelta * (result.primaryStrike.type === 'call' ? 1 : -1)).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Distance:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryStrike.distanceFromPrice > 0 ? '+' : ''}{result.primaryStrike.distanceFromPrice.toFixed(2)}%
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Target Level:</span>
                            <span style={{ color: '#10B981', marginLeft: '6px' }}>
                              ${formatPrice(result.primaryStrike.targetLevel)}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Confidence:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryStrike.confidenceScore.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {result.alternativeStrikes.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '0.5rem' }}>Alternative Strikes:</div>
                          {result.alternativeStrikes.map((s, i) => (
                            <div key={i} style={{
                              background: 'rgba(100,100,100,0.2)',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              marginBottom: '0.5rem',
                              fontSize: '0.85rem'
                            }}>
                              <span style={{ fontWeight: 'bold', color: s.type === 'call' ? '#10B981' : '#EF4444' }}>
                                ${s.strike} {s.type.toUpperCase()}
                              </span>
                              <span style={{ color: '#64748B', marginLeft: '8px' }}>({s.moneyness})</span>
                              <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: '4px' }}>{s.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>
                      No clear strike recommendation - wait for directional signal
                    </div>
                  )}
                </div>

                {/* Expiration Recommendation */}
                <div style={{
                  background: 'rgba(30,41,59,0.6)',
                  border: '2px solid rgba(59,130,246,0.4)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#3B82F6' }}>📅 Recommended Expiration</h3>
                  
                  {result.primaryExpiration ? (
                    <>
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05))',
                        padding: '1.25rem',
                        borderRadius: '12px',
                        marginBottom: '1rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3B82F6' }}>
                            {result.primaryExpiration.dte} DTE
                          </span>
                          <span style={{
                            background: `rgba(${thetaColor(result.primaryExpiration.thetaRisk).slice(1).match(/.{2}/g)?.map(hex => parseInt(hex, 16)).join(',') || '100,100,100'},0.3)`,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: thetaColor(result.primaryExpiration.thetaRisk)
                          }}>
                            {result.primaryExpiration.thetaRisk.toUpperCase()} THETA
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '1rem', color: '#E2E8F0', marginBottom: '0.5rem' }}>
                          📆 {result.primaryExpiration.expirationDate}
                        </div>
                        
                        <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.75rem' }}>
                          {result.primaryExpiration.reason}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                          <div>
                            <span style={{ color: '#64748B' }}>Timeframe:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryExpiration.timeframe}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Confidence:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryExpiration.confidenceScore.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {result.alternativeExpirations.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '0.5rem' }}>Alternative Expirations:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {result.alternativeExpirations.map((e, i) => (
                              <div key={i} style={{
                                background: 'rgba(100,100,100,0.2)',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem'
                              }}>
                                <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>{e.dte} DTE</span>
                                <span style={{ color: '#64748B', marginLeft: '6px' }}>({e.expirationDate})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>
                      No expiration recommendation available
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Open Interest Analysis */}
            {result.openInterestAnalysis ? (
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, color: '#8B5CF6' }}>📈 Open Interest Analysis</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ 
                      background: 'rgba(245,158,11,0.2)', 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem',
                      color: '#F59E0B'
                    }}>
                      📅 EOD Data
                    </span>
                    <span style={{ 
                      background: 'rgba(139,92,246,0.2)', 
                      padding: '4px 12px', 
                      borderRadius: '20px', 
                      fontSize: '0.85rem',
                      color: '#A78BFA'
                    }}>
                      Expiry: {result.openInterestAnalysis.expirationDate}
                    </span>
                  </div>
                </div>
                
                <div className="card-grid-mobile" style={{ marginBottom: '1rem' }}>
                  {/* P/C Ratio */}
                  <div style={{
                    background: 'rgba(139,92,246,0.15)',
                    padding: '1rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '4px' }}>Put/Call Ratio</div>
                    <div style={{ 
                      fontSize: '1.75rem', 
                      fontWeight: 'bold',
                      color: result.openInterestAnalysis.pcRatio > 1 ? '#EF4444' : result.openInterestAnalysis.pcRatio < 0.7 ? '#10B981' : '#F59E0B'
                    }}>
                      {result.openInterestAnalysis.pcRatio.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {result.openInterestAnalysis.pcRatio > 1 ? 'Bearish bias' : result.openInterestAnalysis.pcRatio < 0.7 ? 'Bullish bias' : 'Neutral'}
                    </div>
                  </div>
                  
                  {/* Max Pain */}
                  {result.openInterestAnalysis.maxPainStrike && (
                    <div style={{
                      background: 'rgba(245,158,11,0.15)',
                      padding: '1rem',
                      borderRadius: '12px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '4px' }}>Max Pain Strike</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#F59E0B' }}>
                        ${result.openInterestAnalysis.maxPainStrike}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {result.openInterestAnalysis.maxPainStrike > result.currentPrice ? 'Above price' : 'Below price'}
                      </div>
                    </div>
                  )}
                  
                  {/* O/I Sentiment */}
                  <div style={{
                    background: result.openInterestAnalysis.sentiment === 'bullish' 
                      ? 'rgba(16,185,129,0.15)' 
                      : result.openInterestAnalysis.sentiment === 'bearish' 
                        ? 'rgba(239,68,68,0.15)' 
                        : 'rgba(100,100,100,0.15)',
                    padding: '1rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '4px' }}>O/I Sentiment</div>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: result.openInterestAnalysis.sentiment === 'bullish' ? '#10B981' : result.openInterestAnalysis.sentiment === 'bearish' ? '#EF4444' : '#6B7280'
                    }}>
                      {result.openInterestAnalysis.sentiment === 'bullish' ? '🟢 BULLISH' : 
                       result.openInterestAnalysis.sentiment === 'bearish' ? '🔴 BEARISH' : '⚪ NEUTRAL'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {result.openInterestAnalysis.sentimentReason}
                    </div>
                  </div>
                </div>
                
                {/* O/I Volume Comparison */}
                <div className="grid-equal-2-col-responsive" style={{
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    background: 'rgba(16,185,129,0.1)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Call O/I</div>
                    <div style={{ fontWeight: 'bold', color: '#10B981' }}>
                      {(result.openInterestAnalysis.totalCallOI / 1000).toFixed(1)}K
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Put O/I</div>
                    <div style={{ fontWeight: 'bold', color: '#EF4444' }}>
                      {(result.openInterestAnalysis.totalPutOI / 1000).toFixed(1)}K
                    </div>
                  </div>
                </div>
                
                {/* High O/I Strikes with Greeks - Open by default */}
                {result.openInterestAnalysis.highOIStrikes.length > 0 && (
                  <details open style={{ marginTop: '0.5rem' }}>
                    <summary style={{ 
                      cursor: 'pointer', 
                      color: '#A78BFA', 
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      padding: '0.5rem 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      📊 Strike Analysis with Greeks ({result.openInterestAnalysis.highOIStrikes.length} strikes)
                    </summary>
                    <div style={{ marginTop: '0.75rem' }}>
                      <div className="greeks-table-container">
                        <table className="greeks-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(100,100,100,0.3)' }}>
                              <th style={{ textAlign: 'left', padding: '0.5rem', color: '#94A3B8', fontWeight: '500' }}>Strike</th>
                              <th style={{ textAlign: 'right', padding: '0.5rem', color: '#94A3B8', fontWeight: '500' }}>OI</th>
                              <th style={{ textAlign: 'right', padding: '0.5rem', color: '#94A3B8', fontWeight: '500' }}>IV</th>
                              <th style={{ textAlign: 'right', padding: '0.5rem', color: '#10B981', fontWeight: '500' }}>Δ</th>
                              <th style={{ textAlign: 'right', padding: '0.5rem', color: '#A855F7', fontWeight: '500' }}>Γ</th>
                              <th style={{ textAlign: 'right', padding: '0.5rem', color: '#EF4444', fontWeight: '500' }}>Θ</th>
                              <th style={{ textAlign: 'right', padding: '0.5rem', color: '#3B82F6', fontWeight: '500' }}>ν</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.openInterestAnalysis.highOIStrikes.slice(0, 6).map((s, i) => (
                              <tr key={i} style={{ 
                                borderBottom: '1px solid rgba(100,100,100,0.15)',
                                background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent'
                              }}>
                                <td style={{ padding: '0.5rem' }}>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: s.type === 'call' ? '#10B981' : '#EF4444',
                                    marginRight: '0.25rem'
                                  }}>
                                    ${s.strike}
                                  </span>
                                  <span style={{ 
                                    fontSize: '0.7rem',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: s.type === 'call' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                                    color: s.type === 'call' ? '#10B981' : '#EF4444'
                                  }}>
                                    {s.type === 'call' ? 'C' : 'P'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#CBD5E1' }}>
                                  {(s.openInterest / 1000).toFixed(1)}K
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#CBD5E1' }}>
                                  {s.iv ? `${(s.iv * 100).toFixed(0)}%` : '-'}
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#10B981' }}>
                                  {s.delta !== undefined ? s.delta.toFixed(2) : '-'}
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#A855F7' }}>
                                  {s.gamma !== undefined ? s.gamma.toFixed(3) : '-'}
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#EF4444' }}>
                                  {s.theta !== undefined ? s.theta.toFixed(3) : '-'}
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#3B82F6' }}>
                                  {s.vega !== undefined ? s.vega.toFixed(3) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.5rem', textAlign: 'right' }}>
                        Δ Delta • Γ Gamma • Θ Theta • ν Vega
                      </div>
                    </div>
                  </details>
                )}
                
                {/* Alignment Check */}
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: (result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                              (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish')
                    ? 'rgba(16,185,129,0.15)'
                    : result.openInterestAnalysis.sentiment === 'neutral' 
                      ? 'rgba(245,158,11,0.15)'
                      : 'rgba(239,68,68,0.15)',
                  border: (result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                          (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish')
                    ? '1px solid rgba(16,185,129,0.3)'
                    : result.openInterestAnalysis.sentiment === 'neutral'
                      ? '1px solid rgba(245,158,11,0.3)'
                      : '1px solid rgba(239,68,68,0.3)',
                  fontSize: '0.85rem'
                }}>
                  {(result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                   (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish') ? (
                    <span style={{ color: '#10B981' }}>
                      ✅ O/I sentiment CONFIRMS confluence direction — higher confidence trade
                    </span>
                  ) : result.openInterestAnalysis.sentiment === 'neutral' ? (
                    <span style={{ color: '#F59E0B' }}>
                      ⚠️ O/I sentiment neutral — rely on confluence signals
                    </span>
                  ) : (
                    <span style={{ color: '#EF4444' }}>
                      ⚠️ O/I sentiment DIVERGES from confluence — proceed with caution
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* No Options Data Available - Show Placeholder */
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#8B5CF6' }}>📈 Open Interest Analysis</h3>
                  <span style={{ 
                    background: 'rgba(245,158,11,0.2)', 
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem',
                    color: '#F59E0B'
                  }}>
                    ⚠️ Data Unavailable
                  </span>
                </div>
                
                <div style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>�</div>
                  <div style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    Options Data Loading Issue
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    End-of-day options data is temporarily unavailable. This may be due to 
                    API rate limits, market hours, or the symbol not having options available.
                  </div>
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '0.75rem', 
                    background: 'rgba(16,185,129,0.1)', 
                    borderRadius: '8px',
                    color: '#10B981',
                    fontSize: '0.85rem'
                  }}>
                    ✅ Strike & Expiration recommendations still work based on price action confluence!
                  </div>
                </div>
              </div>
            )}

            {/* Greeks Advice - Collapsible (advanced) */}
            <details style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <summary style={{ 
                margin: '0 0 1rem 0', 
                color: '#F59E0B', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                listStyle: 'none',
                fontWeight: '600',
              }}>
                📊 Greeks & Risk Advice
                <span style={{ 
                  fontSize: '0.7rem', 
                  color: '#64748B',
                  marginLeft: 'auto',
                  fontWeight: '400',
                }}>
                  ▼ Show advanced data
                </span>
              </summary>
              
              <div className="card-grid-mobile">
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Target Delta</div>
                  <div style={{ color: '#E2E8F0', fontWeight: 'bold' }}>{result.greeksAdvice.deltaTarget}</div>
                </div>
                
                {result.greeksAdvice.thetaWarning && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Theta Warning</div>
                    <div style={{ color: '#F97316', fontSize: '0.85rem' }}>{result.greeksAdvice.thetaWarning}</div>
                  </div>
                )}
                
                {result.greeksAdvice.gammaAdvice && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Gamma Advice</div>
                    <div style={{ color: '#E2E8F0', fontSize: '0.85rem' }}>{result.greeksAdvice.gammaAdvice}</div>
                  </div>
                )}
                
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Overall Strategy</div>
                  <div style={{ color: '#E2E8F0' }}>{result.greeksAdvice.overallAdvice}</div>
                </div>
              </div>
            </details>

            {/* Risk Management - Collapsible (advanced) */}
            <details style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <summary style={{ 
                margin: '0 0 1rem 0', 
                color: '#EF4444', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                listStyle: 'none',
                fontWeight: '600',
              }}>
                ⚠️ Risk Management
                <span style={{ 
                  fontSize: '0.7rem', 
                  color: '#64748B',
                  marginLeft: 'auto',
                  fontWeight: '400',
                }}>
                  {result.maxRiskPercent}% max risk • ▼ Show details
                </span>
              </summary>
              
              <div className="card-grid-mobile">
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  padding: '1rem',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#EF4444' }}>
                    {result.maxRiskPercent}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Max Position Risk</div>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>🛑 Stop Loss Strategy</div>
                    <div style={{ color: '#E2E8F0', fontSize: '0.85rem' }}>{result.stopLossStrategy}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>🎯 Profit Target Strategy</div>
                    <div style={{ color: '#10B981', fontSize: '0.85rem' }}>{result.profitTargetStrategy}</div>
                  </div>
                </div>
              </div>
            </details>

            {/* Summary Trade Setup */}
            {result.primaryStrike && result.primaryExpiration && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))',
                border: '2px solid rgba(16,185,129,0.5)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#10B981' }}>📋 Trade Summary</h3>
                
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  fontFamily: 'monospace',
                  fontSize: '1rem'
                }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Symbol:</span>
                    <span style={{ color: '#E2E8F0', marginLeft: '8px', fontWeight: 'bold' }}>{result.symbol}</span>
                    <span style={{ color: '#64748B', marginLeft: '16px' }}>@</span>
                    <span style={{ color: '#3B82F6', marginLeft: '8px' }}>${formatPrice(result.currentPrice)}</span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Action:</span>
                    <span style={{ 
                      color: result.primaryStrike.type === 'call' ? '#10B981' : '#EF4444', 
                      marginLeft: '8px',
                      fontWeight: 'bold'
                    }}>
                      BUY {result.primaryStrike.type.toUpperCase()}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Strike:</span>
                    <span style={{ color: '#F59E0B', marginLeft: '8px', fontWeight: 'bold' }}>${result.primaryStrike.strike}</span>
                    <span style={{ color: '#64748B', marginLeft: '8px' }}>({result.primaryStrike.moneyness})</span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Expiration:</span>
                    <span style={{ color: '#3B82F6', marginLeft: '8px', fontWeight: 'bold' }}>{result.primaryExpiration.expirationDate}</span>
                    <span style={{ color: '#64748B', marginLeft: '8px' }}>({result.primaryExpiration.dte} DTE)</span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Quality:</span>
                    <span style={{ color: gradeColor(result.tradeQuality), marginLeft: '8px', fontWeight: 'bold' }}>
                      {gradeEmoji(result.tradeQuality)} {result.tradeQuality}
                    </span>
                    <span style={{ color: '#64748B', marginLeft: '8px' }}>|</span>
                    <span style={{ color: urgencyColor(result.entryTiming.urgency), marginLeft: '8px' }}>
                      {urgencyEmoji(result.entryTiming.urgency)} {result.entryTiming.urgency.toUpperCase()}
                    </span>
                  </div>
                  
                  <div style={{ 
                    borderTop: '1px solid rgba(255,255,255,0.1)', 
                    paddingTop: '0.75rem', 
                    marginTop: '0.75rem',
                    color: '#94A3B8',
                    fontSize: '0.85rem'
                  }}>
                    Target: ${formatPrice(result.primaryStrike.targetLevel)} (50% level) | 
                    Max Risk: {result.maxRiskPercent}% of portfolio
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Help Section */}
        {!result && !loading && (
          <div style={{
            background: 'rgba(30,41,59,0.4)',
            border: '1px solid rgba(100,100,100,0.3)',
            borderRadius: '16px',
            padding: '2rem',
            marginTop: '2rem'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: '#E2E8F0' }}>How It Works</h3>
            
            <div className="card-grid-mobile" style={{ gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔮</div>
                <div style={{ fontWeight: 'bold', color: '#A855F7', marginBottom: '0.5rem' }}>Time Confluence</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Scans multiple timeframes for decompression events - when candles are gravitating toward their 50% levels.
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎯</div>
                <div style={{ fontWeight: 'bold', color: '#10B981', marginBottom: '0.5rem' }}>Strike Selection</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Recommends strikes based on 50% level clusters and target zones from decompressing timeframes.
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📅</div>
                <div style={{ fontWeight: 'bold', color: '#3B82F6', marginBottom: '0.5rem' }}>Expiration Logic</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Matches expiration to your trading timeframe - scalping gets 0-2 DTE, swing trading gets weekly/monthly options.
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
                <div style={{ fontWeight: 'bold', color: '#F59E0B', marginBottom: '0.5rem' }}>Greeks-Aware</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Provides delta targets, theta decay warnings, and gamma considerations based on your chosen timeframe.
                </div>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '2rem', 
              padding: '1rem', 
              background: 'rgba(245,158,11,0.1)', 
              borderRadius: '12px',
              color: '#F59E0B',
              fontSize: '0.85rem'
            }}>
              ⚠️ <strong>Risk Warning:</strong> Options trading involves significant risk. This tool provides confluence-based analysis, not financial advice. 
              Always manage position sizes and use stops. Paper trade first!
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
