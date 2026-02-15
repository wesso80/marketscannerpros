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
import CapitalFlowCard from "@/components/CapitalFlowCard";
import StateMachineTraderEyeCard from "@/components/StateMachineTraderEyeCard";
import EvolutionStatusCard from "@/components/EvolutionStatusCard";

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

// Data quality tracking from backend
interface DataQuality {
  optionsChainSource: 'alpha_vantage' | 'cboe' | 'none';
  freshness: 'REALTIME' | 'DELAYED' | 'EOD' | 'STALE';
  hasGreeksFromAPI: boolean;
  hasMeaningfulOI: boolean;
  contractsCount: { calls: number; puts: number };
  availableStrikes: number[];
  lastUpdated: string;
}

// AI Market State from backend
interface AIMarketState {
  regime: {
    type: 'trending' | 'ranging' | 'breakout' | 'reversal' | 'uncertain';
    confidence: number;
    description: string;
  };
  edges: {
    primaryEdge: string | null;
    edgeStrength: number;
    edgeType: 'momentum' | 'mean_reversion' | 'volatility' | 'structural' | 'none';
  };
  thesis: {
    summary: string;
    invalidationLevel: number | null;
    timeHorizon: string;
  };
  scenarios: {
    bull: { probability: number; target: number; catalyst: string };
    bear: { probability: number; target: number; catalyst: string };
    base: { probability: number; target: number; catalyst: string };
  };
}

interface ProfessionalStackLayer {
  label: string;
  state: string;
  score: number;
  status: 'ready' | 'caution' | 'waiting';
  reason: string;
}

interface ProfessionalTradeStack {
  structureState: ProfessionalStackLayer;
  liquidityContext: ProfessionalStackLayer;
  timeEdge: ProfessionalStackLayer;
  optionsEdge: ProfessionalStackLayer;
  executionPlan: ProfessionalStackLayer;
  overallEdgeScore: number;
  overallState: 'A+' | 'A' | 'B' | 'C' | 'WAIT';
}

type EdgeVerdict = 'BULLISH_EDGE' | 'BEARISH_EDGE' | 'WAIT';

interface LocationContext {
  regime: 'TREND' | 'RANGE' | 'REVERSAL' | 'UNKNOWN';
  keyZones: Array<{
    type: 'demand' | 'supply' | 'liquidity_high' | 'liquidity_low' | 'support' | 'resistance';
    level: number;
    strength: 'strong' | 'moderate' | 'weak';
    reason: string;
  }>;
  patterns: Array<{
    name: string;
    bias: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reason: string;
  }>;
  reflection: {
    nearest: number | null;
    reason: string;
  };
}

interface TradeSnapshot {
  verdict: EdgeVerdict;
  setupGrade: 'A+' | 'A' | 'B' | 'C' | 'F';
  oneLine: string;
  why: string[];
  risk: {
    invalidationLevel: number | null;
    invalidationReason: string;
  };
  action: {
    entryTrigger: string;
    entryZone?: { low: number; high: number };
    targets?: { price: number; reason: string }[];
  };
  timing: {
    urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
    catalyst: string;
  };
}

interface OptionsSetup {
  symbol: string;
  currentPrice: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  assetType?: 'equity' | 'crypto' | 'index' | 'etf' | 'forex';
  confluenceStack: number;
  decompressingTFs: string[];
  pullBias: number;
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  tradeQuality: 'A+' | 'A' | 'B' | 'C' | 'F';
  qualityReasons: string[];
  // Options quality (separate from confluence grade)
  optionsQualityScore?: number;
  optionsGrade?: 'A+' | 'A' | 'B' | 'C' | 'F';
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
  // INSTITUTIONAL AI MARKET STATE
  aiMarketState?: AIMarketState | null;
  professionalTradeStack?: ProfessionalTradeStack | null;
  tradeSnapshot?: TradeSnapshot;
  locationContext?: LocationContext | null;
  // DATA QUALITY & COMPLIANCE
  dataQuality?: DataQuality;
  executionNotes?: string[];
  dataConfidenceCaps?: string[];
  disclaimerFlags?: string[];
  institutionalFilter?: {
    finalScore: number;
    finalGrade: string;
    recommendation: 'TRADE_READY' | 'CAUTION' | 'NO_TRADE';
    noTrade: boolean;
    filters: Array<{
      label: string;
      status: 'pass' | 'warn' | 'block';
      reason: string;
    }>;
  };
  capitalFlow?: {
    market_mode: 'pin' | 'launch' | 'chop';
    gamma_state: 'Positive' | 'Negative' | 'Mixed';
    bias: 'bullish' | 'bearish' | 'neutral';
    conviction: number;
    dominant_expiry: '0DTE' | 'weekly' | 'monthly' | 'long_dated' | 'unknown';
    pin_strike: number | null;
    key_strikes: Array<{ strike: number; gravity: number; type: 'call-heavy' | 'put-heavy' | 'mixed' }>;
    flip_zones: Array<{ level: number; direction: 'bullish_above' | 'bearish_below' }>;
    liquidity_levels: Array<{ level: number; label: string; prob: number }>;
    most_likely_path: string[];
    risk: string[];
  };
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

type TraderStyleBias = 'momentum' | 'mean_reversion' | 'breakout' | 'options_flow' | 'macro_swing';
type TraderRiskDNA = 'aggressive' | 'balanced' | 'defensive';
type TraderTiming = 'early' | 'confirmation' | 'late_momentum';
type TraderEnvironment = 'trend' | 'range' | 'reversal' | 'unknown';

interface PersonalityJournalEntry {
  id: number;
  date: string;
  exitDate?: string;
  strategy?: string;
  setup?: string;
  notes?: string;
  tags?: string[];
  outcome?: 'win' | 'loss' | 'breakeven' | 'open';
  isOpen?: boolean;
  pl?: number;
  plPercent?: number;
  rMultiple?: number;
}

interface AdaptiveProfile {
  sampleSize: number;
  wins: number;
  styleBias: TraderStyleBias;
  riskDNA: TraderRiskDNA;
  decisionTiming: TraderTiming;
  environmentRates: Record<TraderEnvironment, number>;
}

export default function OptionsConfluenceScanner() {
  const { tier } = useUserTier();
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
  const [personalityEntries, setPersonalityEntries] = useState<PersonalityJournalEntry[]>([]);
  const [personalityLoaded, setPersonalityLoaded] = useState(false);

  const normalizeOptionsSetup = (payload: any): OptionsSetup => {
    const safeTradeLevels = payload?.tradeLevels
      && payload.tradeLevels.entryZone
      && Number.isFinite(Number(payload.tradeLevels.entryZone.low))
      && Number.isFinite(Number(payload.tradeLevels.entryZone.high))
      ? payload.tradeLevels
      : null;

    const safeInstitutionalFilter = payload?.institutionalFilter
      ? {
          ...payload.institutionalFilter,
          finalScore: Number(payload.institutionalFilter.finalScore ?? 0),
          filters: Array.isArray(payload.institutionalFilter.filters) ? payload.institutionalFilter.filters : [],
        }
      : undefined;

    const safeCapitalFlow = payload?.capitalFlow
      ? {
          ...payload.capitalFlow,
          key_strikes: Array.isArray(payload.capitalFlow.key_strikes) ? payload.capitalFlow.key_strikes : [],
          flip_zones: Array.isArray(payload.capitalFlow.flip_zones) ? payload.capitalFlow.flip_zones : [],
          liquidity_levels: Array.isArray(payload.capitalFlow.liquidity_levels) ? payload.capitalFlow.liquidity_levels : [],
          most_likely_path: Array.isArray(payload.capitalFlow.most_likely_path) ? payload.capitalFlow.most_likely_path : [],
          risk: Array.isArray(payload.capitalFlow.risk) ? payload.capitalFlow.risk : [],
        }
      : undefined;

    return {
      ...payload,
      tradeLevels: safeTradeLevels,
      institutionalFilter: safeInstitutionalFilter,
      capitalFlow: safeCapitalFlow,
    } as OptionsSetup;
  };

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
          professionalTradeStack: result.professionalTradeStack,
          tradeSnapshot: result.tradeSnapshot,
          locationContext: result.locationContext,
        },
        summary: `Options scan for ${result.symbol} at $${result.currentPrice}: ${result.direction.toUpperCase()} bias (${result.tradeQuality}) with ${result.signalStrength} strength. Confluence: ${result.confluenceStack}/8.`,
      });
    }
  }, [result, setPageData]);

  useEffect(() => {
    let mounted = true;
    const loadJournalForPersonality = async () => {
      try {
        const response = await fetch('/api/journal', { method: 'GET' });
        if (!response.ok) return;
        const data = await response.json();
        if (!mounted) return;
        setPersonalityEntries(Array.isArray(data?.entries) ? data.entries : []);
      } catch {
      } finally {
        if (mounted) setPersonalityLoaded(true);
      }
    };
    loadJournalForPersonality();
    return () => { mounted = false; };
  }, []);

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
    
    // Only calculate probability when trade levels exist (avoid synthetic edge from fallback R:R)
    if (!result.tradeLevels) return null;
    const rr = result.tradeLevels.riskRewardRatio;
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
        setResult(normalizeOptionsSetup(data.data));
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

  const patternBiasColor = (bias: 'bullish' | 'bearish' | 'neutral') => {
    switch (bias) {
      case 'bullish': return '#10B981';
      case 'bearish': return '#EF4444';
      default: return '#F59E0B';
    }
  };

  const patternConfidenceLabel = (confidence: number) => {
    if (confidence >= 75) return 'HIGH';
    if (confidence >= 55) return 'MEDIUM';
    return 'LOW';
  };

  const bestPattern = result?.locationContext?.patterns
    ?.slice()
    .sort((a, b) => b.confidence - a.confidence)?.[0] ?? null;
  const hasConfirmedPattern = !!bestPattern && bestPattern.confidence >= 55;
  const hasPatternData = (result?.locationContext?.patterns?.length ?? 0) > 0;

  const marketStateLabel = result
    ? result.aiMarketState?.regime?.type === 'trending'
      ? `${result.direction === 'bearish' ? 'Bearish' : result.direction === 'bullish' ? 'Bullish' : 'Neutral'} Trend`
      : result.aiMarketState?.regime?.type === 'ranging'
      ? 'Range / Rotation'
      : result.aiMarketState?.regime?.type === 'breakout'
      ? 'Breakout Regime'
      : result.aiMarketState?.regime?.type === 'reversal'
      ? 'Reversal Regime'
      : 'Uncertain Regime'
    : null;

  const thesisDirection = result?.compositeScore?.finalDirection || result?.direction || 'neutral';
  const isCountertrend = !!(result && bestPattern && bestPattern.bias !== 'neutral' && thesisDirection !== 'neutral' && bestPattern.bias !== thesisDirection);
  const setupLabel = result
    ? isCountertrend
      ? 'Countertrend Bounce'
      : (hasConfirmedPattern ? 'Trend Continuation' : 'Awaiting Confirmation')
    : null;

  const dataHealth = result?.dataQuality?.freshness || (isCached ? 'CACHED' : 'LIVE');

  type LadderState = 'valid' | 'partial' | 'fail';
  const stateVisual = (state: LadderState) => {
    if (state === 'valid') return { label: 'VALID', color: '#10B981', bg: 'rgba(16,185,129,0.16)', border: 'rgba(16,185,129,0.42)', icon: '✔' };
    if (state === 'partial') return { label: 'PARTIAL', color: '#F59E0B', bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.42)', icon: '⚠' };
    return { label: 'FAIL', color: '#EF4444', bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.42)', icon: '✖' };
  };

  const ladderSteps = result ? (() => {
    const sessionClosed = result.entryTiming.marketSession === 'closed';
    const dataIsFresh = dataHealth === 'REALTIME' || dataHealth === 'LIVE';
    const dataIsUsable = dataIsFresh || dataHealth === 'DELAYED' || dataHealth === 'CACHED';
    const regimeKnown = result.aiMarketState?.regime?.type && result.aiMarketState.regime.type !== 'uncertain';

    const marketState: LadderState = (!dataIsUsable || sessionClosed)
      ? 'fail'
      : (regimeKnown ? 'valid' : 'partial');

    const setupConfidence = result.compositeScore?.confidence ?? 0;
    const setupValidation: LadderState = hasConfirmedPattern && setupConfidence >= 60
      ? 'valid'
      : (hasPatternData || setupConfidence >= 45 ? 'partial' : 'fail');

    const unusual = result.unusualActivity?.hasUnusualActivity;
    const oiSentiment = result.openInterestAnalysis?.sentiment;
    const direction = result.direction;
    const oiAligned = oiSentiment
      ? (oiSentiment === 'neutral' || oiSentiment === direction)
      : false;
    const flowConfirmation: LadderState = unusual && oiAligned
      ? 'valid'
      : ((unusual || oiSentiment) ? 'partial' : 'fail');

    const hasExecutionLevels = !!result.tradeLevels;
    const hasEntryZone = !!result.tradeLevels?.entryZone;
    const isNoTrade = result.entryTiming.urgency === 'no_trade';
    const executionZone: LadderState = (isNoTrade || !hasExecutionLevels)
      ? 'fail'
      : (hasEntryZone ? 'valid' : 'partial');

    const hasManagementHooks = !!(result.tradeSnapshot || result.executionNotes?.length || result.candleCloseConfluence);
    const management: LadderState = hasManagementHooks ? 'valid' : 'partial';

    return [
      {
        title: 'Market State',
        state: marketState,
        detail: `${marketStateLabel || 'Unknown'} • ${dataHealth} • ${result.entryTiming.marketSession || 'session n/a'}`,
      },
      {
        title: 'Setup Validation',
        state: setupValidation,
        detail: `${hasConfirmedPattern ? (bestPattern?.name || 'Pattern confirmed') : 'Pattern pending'} • ${setupConfidence.toFixed(0)}% alignment`,
      },
      {
        title: 'Options Flow',
        state: flowConfirmation,
        detail: `${unusual ? 'Unusual activity present' : 'No unusual flow'} • OI ${oiSentiment || 'n/a'}`,
      },
      {
        title: 'Execution Zone',
        state: executionZone,
        detail: result.tradeLevels
          ? `Entry ${result.tradeLevels.entryZone.low.toFixed(2)}-${result.tradeLevels.entryZone.high.toFixed(2)} • Stop ${result.tradeLevels.stopLoss.toFixed(2)}`
          : 'No clear execution map yet',
      },
      {
        title: 'Management',
        state: management,
        detail: result.tradeSnapshot?.timing?.catalyst || 'Monitoring + outcome tagging active',
      },
    ];
  })() : [];

  const pipelineComplete = ladderSteps.filter((step) => step.state === 'valid').length;
  const pipelineStatus: 'READY' | 'WAITING' | 'NO_TRADE' = pipelineComplete >= 4
    ? 'READY'
    : ladderSteps[0]?.state === 'fail'
      ? 'NO_TRADE'
      : 'WAITING';

  const trendStrength = !result
    ? 'WEAK'
    : (result.compositeScore?.confidence ?? 0) >= 70
      ? 'STRONG'
      : (result.compositeScore?.confidence ?? 0) >= 50
        ? 'MODERATE'
        : 'WEAK';

  const executionState = !result
    ? 'WAIT'
    : result.entryTiming.urgency === 'no_trade'
      ? 'NO TRADE'
      : result.tradeLevels
        ? 'READY'
        : 'WAIT';

  const heatSignalStrip = result ? [
    {
      label: 'TREND',
      state: thesisDirection === 'bullish' ? '🟢' : thesisDirection === 'bearish' ? '🔴' : '🟡',
      value: thesisDirection.toUpperCase(),
    },
    {
      label: 'FLOW',
      state: result.unusualActivity?.hasUnusualActivity ? '🟢' : '🟡',
      value: result.unusualActivity?.hasUnusualActivity ? 'ACTIVE' : 'QUIET',
    },
    {
      label: 'VOL',
      state: result.expectedMove && result.expectedMove.selectedExpiryPercent > 4 ? '🔴' : result.expectedMove ? '🟡' : '⚪',
      value: result.expectedMove ? `${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A',
    },
    {
      label: 'LIQ',
      state: result.openInterestAnalysis?.highOIStrikes?.length ? '🟢' : '🟡',
      value: result.openInterestAnalysis?.highOIStrikes?.length ? 'SUPPORTED' : 'THIN',
    },
    {
      label: 'EXEC',
      state: executionState === 'READY' ? '🟢' : executionState === 'WAIT' ? '🟡' : '❌',
      value: executionState,
    },
  ] : [];

  const commandStatus: 'ACTIVE' | 'WAIT' | 'NO TRADE' = !result
    ? 'WAIT'
    : result.entryTiming.urgency === 'no_trade'
      ? 'NO TRADE'
      : (result.tradeLevels && (result.compositeScore?.confidence ?? 0) >= 60)
        ? 'ACTIVE'
        : 'WAIT';

  const commandStatusColor = commandStatus === 'ACTIVE' ? '#10B981' : commandStatus === 'WAIT' ? '#F59E0B' : '#EF4444';
  const commandUpdatedAgo = lastUpdated
    ? Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000))
    : null;

  const decisionReasons = result
    ? [
        ...(result.tradeSnapshot?.why || []),
        ...(result.compositeScore?.conflicts || []),
        ...(result.qualityReasons || []),
      ].filter(Boolean).slice(0, 3)
    : [];

  const decisionTrigger = result
    ? (result.tradeSnapshot?.action?.entryTrigger
      || (result.tradeLevels
        ? (result.direction === 'bullish'
          ? `Price > ${result.tradeLevels.entryZone.high.toFixed(2)}`
          : result.direction === 'bearish'
            ? `Price < ${result.tradeLevels.entryZone.low.toFixed(2)}`
            : `Break ${result.tradeLevels.entryZone.low.toFixed(2)}-${result.tradeLevels.entryZone.high.toFixed(2)}`)
        : 'Await cleaner trigger + liquidity confirmation'))
    : 'Await trigger';

  const riskState = !result
    ? 'UNKNOWN'
    : (result.maxRiskPercent <= 2 ? 'NORMAL' : result.maxRiskPercent <= 4 ? 'ELEVATED' : 'HIGH');

  const liveLatencySeconds = result?.dataQuality?.lastUpdated
    ? Math.max(0, (Date.now() - new Date(result.dataQuality.lastUpdated).getTime()) / 1000)
    : null;

  const primaryWhyItems = decisionReasons.length
    ? decisionReasons
    : [
        `${trendStrength} trend alignment`,
        `${result?.unusualActivity?.hasUnusualActivity ? 'Options flow confirms direction' : 'Options flow not confirming yet'}`,
        `${result?.expectedMove ? 'Volatility expansion detected' : 'Volatility expansion not detected'}`,
      ];

  const adaptiveProfile: AdaptiveProfile | null = (() => {
    const closed = personalityEntries.filter((trade) => !trade.isOpen && trade.outcome !== 'open');
    if (closed.length < 6) return null;

    const isWin = (trade: PersonalityJournalEntry) => trade.outcome === 'win' || ((trade.pl ?? 0) > 0);
    const wins = closed.filter(isWin);
    const safeWins = wins.length ? wins : closed;

    const textOf = (trade: PersonalityJournalEntry) => {
      return `${trade.strategy || ''} ${trade.setup || ''} ${trade.notes || ''} ${(trade.tags || []).join(' ')}`.toLowerCase();
    };

    const styleCounts: Record<TraderStyleBias, number> = {
      momentum: 0,
      mean_reversion: 0,
      breakout: 0,
      options_flow: 0,
      macro_swing: 0,
    };

    const timingCounts: Record<TraderTiming, number> = {
      early: 0,
      confirmation: 0,
      late_momentum: 0,
    };

    const envWins: Record<TraderEnvironment, number> = { trend: 0, range: 0, reversal: 0, unknown: 0 };
    const envTotal: Record<TraderEnvironment, number> = { trend: 0, range: 0, reversal: 0, unknown: 0 };

    const inferEnvironment = (trade: PersonalityJournalEntry): TraderEnvironment => {
      const txt = textOf(trade);
      if (/trend|momentum|continuation|breakout/.test(txt)) return 'trend';
      if (/range|chop|mean|reversion|pullback/.test(txt)) return 'range';
      if (/reversal|fade|exhaust/.test(txt)) return 'reversal';
      return 'unknown';
    };

    safeWins.forEach((trade) => {
      const txt = textOf(trade);
      if (/breakout|break/.test(txt)) styleCounts.breakout += 1;
      if (/pullback|mean|reversion|dip|bounce/.test(txt)) styleCounts.mean_reversion += 1;
      if (/momentum|trend|continuation/.test(txt)) styleCounts.momentum += 1;
      if (/flow|oi|options|gamma|delta/.test(txt)) styleCounts.options_flow += 1;
      if (/macro|swing|position|weekly|monthly|leaps/.test(txt)) styleCounts.macro_swing += 1;

      if (/early|anticipat|pre-break/.test(txt)) timingCounts.early += 1;
      if (/confirm|confirmation|retest/.test(txt)) timingCounts.confirmation += 1;
      if (/late|chase|follow-through/.test(txt)) timingCounts.late_momentum += 1;
    });

    closed.forEach((trade) => {
      const env = inferEnvironment(trade);
      envTotal[env] += 1;
      if (isWin(trade)) envWins[env] += 1;
    });

    const pickTop = <T extends string>(map: Record<T, number>, fallback: T): T => {
      const entries = Object.entries(map) as Array<[T, number]>;
      const best = entries.sort((a, b) => b[1] - a[1])[0];
      return best && best[1] > 0 ? best[0] : fallback;
    };

    const styleBias = pickTop(styleCounts, 'momentum');
    const decisionTiming = pickTop(timingCounts, 'confirmation');

    const avgAbsR = closed
      .map((trade) => Math.abs(Number(trade.rMultiple ?? 0)))
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((sum, value, _, arr) => sum + value / arr.length, 0);

    const avgAbsPct = closed
      .map((trade) => Math.abs(Number(trade.plPercent ?? 0)))
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((sum, value, _, arr) => sum + value / arr.length, 0);

    const riskDNA: TraderRiskDNA = (avgAbsR >= 2 || avgAbsPct >= 6)
      ? 'aggressive'
      : (avgAbsR >= 1.1 || avgAbsPct >= 3)
        ? 'balanced'
        : 'defensive';

    const environmentRates: Record<TraderEnvironment, number> = {
      trend: envTotal.trend > 0 ? (envWins.trend / envTotal.trend) * 100 : 50,
      range: envTotal.range > 0 ? (envWins.range / envTotal.range) * 100 : 50,
      reversal: envTotal.reversal > 0 ? (envWins.reversal / envTotal.reversal) * 100 : 50,
      unknown: envTotal.unknown > 0 ? (envWins.unknown / envTotal.unknown) * 100 : 50,
    };

    return {
      sampleSize: closed.length,
      wins: wins.length,
      styleBias,
      riskDNA,
      decisionTiming,
      environmentRates,
    };
  })();

  const adaptiveMatch = (() => {
    if (!result) return null;

    const baseSignalScore = result.compositeScore?.confidence ?? 50;
    if (!adaptiveProfile) {
      return {
        hasProfile: false,
        personalityMatch: 50,
        adaptiveScore: baseSignalScore,
        reasons: ['Build profile: close at least 6 journal trades for adaptive matching'],
        noTradeBias: false,
      };
    }

    const currentStyle: TraderStyleBias = (() => {
      const patternName = (bestPattern?.name || '').toLowerCase();
      if (/breakout|break/.test(patternName)) return 'breakout';
      if (isCountertrend || /pullback|reversion|mean/.test(patternName)) return 'mean_reversion';
      if (result.unusualActivity?.hasUnusualActivity) return 'options_flow';
      if (selectedTF.startsWith('macro_') || selectedTF === 'swing_1w') return 'macro_swing';
      return 'momentum';
    })();

    const currentRisk: TraderRiskDNA = result.maxRiskPercent > 4
      ? 'aggressive'
      : result.maxRiskPercent > 2
        ? 'balanced'
        : 'defensive';

    const currentTiming: TraderTiming = result.entryTiming.urgency === 'immediate'
      ? 'early'
      : result.entryTiming.urgency === 'within_hour'
        ? 'confirmation'
        : 'late_momentum';

    const currentEnvironment: TraderEnvironment = result.aiMarketState?.regime?.type === 'trending'
      ? 'trend'
      : result.aiMarketState?.regime?.type === 'ranging'
        ? 'range'
        : result.aiMarketState?.regime?.type === 'reversal'
          ? 'reversal'
          : 'unknown';

    const styleScore = adaptiveProfile.styleBias === currentStyle
      ? 95
      : ((adaptiveProfile.styleBias === 'momentum' && currentStyle === 'breakout') || (adaptiveProfile.styleBias === 'breakout' && currentStyle === 'momentum'))
        ? 78
        : 45;

    const riskDistance = Math.abs(
      (adaptiveProfile.riskDNA === 'defensive' ? 0 : adaptiveProfile.riskDNA === 'balanced' ? 1 : 2) -
      (currentRisk === 'defensive' ? 0 : currentRisk === 'balanced' ? 1 : 2)
    );
    const riskScore = riskDistance === 0 ? 92 : riskDistance === 1 ? 68 : 42;

    const timingScore = adaptiveProfile.decisionTiming === currentTiming ? 90 : 55;
    const envWinRate = adaptiveProfile.environmentRates[currentEnvironment] ?? 50;
    const environmentScore = Math.max(30, Math.min(95, envWinRate));

    const personalityMatch = Math.round(
      (styleScore * 0.35) +
      (riskScore * 0.2) +
      (timingScore * 0.2) +
      (environmentScore * 0.25)
    );

    const adaptiveScore = Math.round((baseSignalScore * 0.6) + (personalityMatch * 0.4));

    const styleLabel: Record<TraderStyleBias, string> = {
      momentum: 'momentum continuation',
      mean_reversion: 'pullback / mean reversion',
      breakout: 'breakout expansion',
      options_flow: 'options flow-following',
      macro_swing: 'macro swing',
    };

    const reasons: string[] = [];
    if (styleScore >= 70) {
      reasons.push(`Matches your ${styleLabel[adaptiveProfile.styleBias]} win profile`);
    }
    if (riskScore >= 70) {
      reasons.push(`Risk profile aligns with your ${adaptiveProfile.riskDNA} execution DNA`);
    }
    if (timingScore >= 70) {
      reasons.push(`Entry timing fits your ${adaptiveProfile.decisionTiming.replace('_', ' ')} profile`);
    }
    reasons.push(`Similar ${currentEnvironment} conditions: ${envWinRate.toFixed(0)}% historical win rate`);

    const noTradeBias = adaptiveProfile.sampleSize >= 8 && environmentScore < 40;

    return {
      hasProfile: true,
      personalityMatch,
      adaptiveScore,
      reasons: reasons.slice(0, 3),
      noTradeBias,
      sampleSize: adaptiveProfile.sampleSize,
      wins: adaptiveProfile.wins,
    };
  })();

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

        {/* Command Strip */}
        {result && (
          <div style={{
            position: 'sticky',
            top: '0.4rem',
            zIndex: 40,
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96))',
            border: `2px solid ${result.direction === 'bullish' ? 'rgba(16,185,129,0.6)' : result.direction === 'bearish' ? 'rgba(239,68,68,0.6)' : 'rgba(245,158,11,0.6)'}`,
            borderRadius: '12px',
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(6px)',
            padding: '0.58rem 0.75rem',
          }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.65rem',
              alignItems: 'center',
              fontSize: '0.76rem',
              lineHeight: 1.25,
            }}>
              <span style={{ color: '#E2E8F0', fontWeight: 800 }}>{result.symbol}</span>
              <span style={{ color: '#64748B' }}>│</span>
              <span style={{ color: '#CBD5E1' }}>BIAS:</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{thesisDirection.toUpperCase()}</span>
              <span style={{ color: '#64748B' }}>│</span>
              <span style={{ color: '#CBD5E1' }}>STATUS:</span>
              <span style={{
                background: `${commandStatusColor}25`,
                border: `1px solid ${commandStatusColor}70`,
                color: commandStatusColor,
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: 800,
                textTransform: 'uppercase',
              }}>
                {commandStatus}
              </span>
              <span style={{ color: '#64748B' }}>│</span>
              <span style={{ color: '#CBD5E1' }}>CONF:</span>
              <span style={{
                color: (result.compositeScore?.confidence ?? 0) >= 70 ? '#10B981' : (result.compositeScore?.confidence ?? 0) >= 50 ? '#F59E0B' : '#EF4444',
                fontWeight: 800,
              }}>
                {(result.compositeScore?.confidence ?? 0).toFixed(0)}%
              </span>
              <span style={{ color: '#64748B' }}>│</span>
              <span style={{ color: '#CBD5E1' }}>DATA:</span>
              <span style={{
                color: dataHealth === 'REALTIME' || dataHealth === 'LIVE' ? '#10B981' : dataHealth === 'DELAYED' || dataHealth === 'CACHED' ? '#F59E0B' : '#EF4444',
                fontWeight: 700,
              }}>
                {dataHealth} {(dataHealth === 'REALTIME' || dataHealth === 'LIVE') ? '✔' : ''}
              </span>
              <span style={{ color: '#64748B' }}>│</span>
              <span style={{ color: '#93C5FD', fontWeight: 700 }}>LIVE BX + FMV OPTIONS</span>
              {commandUpdatedAgo !== null && (
                <>
                  <span style={{ color: '#64748B' }}>•</span>
                  <span style={{ color: '#94A3B8' }}>Updated {commandUpdatedAgo}s ago</span>
                </>
              )}
            </div>
          </div>
        )}

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
            {loading ? '🔄 Finding Best Options Setup...' : '🎯 Find Best Options Setup'}
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

            {/* Primary Intelligence Panel (Cognitive Anchor) */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,41,59,0.92))',
              border: `2px solid ${commandStatusColor}`,
              borderRadius: '18px',
              padding: '1.1rem 1.2rem',
              minHeight: 'clamp(220px, 32vh, 380px)',
              boxShadow: `0 0 36px ${commandStatusColor}2A`,
              display: 'grid',
              gap: '0.8rem',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                <div style={{ color: '#F8FAFC', fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.4px' }}>
                  ⭐ MSP AI SIGNAL
                </div>
                <div style={{
                  fontSize: '0.72rem',
                  color: '#93C5FD',
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontWeight: 700,
                }}>
                  Powered by Nasdaq BX + FMV Options (LIVE)
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.5rem',
                alignItems: 'start',
              }}>
                <div style={{ color: '#CBD5E1', fontSize: '0.83rem', lineHeight: 1.5 }}>
                  <div><span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Market Mode:</span> <span style={{ color: '#F8FAFC', fontWeight: 800 }}>{marketStateLabel || 'Unknown'} {thesisDirection === 'bullish' ? '↑' : thesisDirection === 'bearish' ? '↓' : '→'}</span></div>
                  <div><span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Setup Type:</span> <span style={{ color: '#F8FAFC', fontWeight: 800 }}>{setupLabel || 'Awaiting Confirmation'}</span></div>
                </div>
                <div style={{
                  justifySelf: 'end',
                  textAlign: 'right',
                  background: `${commandStatusColor}1F`,
                  border: `1px solid ${commandStatusColor}55`,
                  borderRadius: '10px',
                  padding: '0.45rem 0.6rem',
                  minWidth: '190px',
                }}>
                  <div style={{ color: '#64748B', textTransform: 'uppercase', fontSize: '0.66rem', fontWeight: 700 }}>Confidence Score</div>
                  <div style={{ color: commandStatusColor, fontWeight: 900, fontSize: '1.15rem' }}>{(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div>
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, rgba(2,132,199,0.12), rgba(16,185,129,0.1))',
                border: '1px solid rgba(56,189,248,0.35)',
                borderRadius: '12px',
                padding: '0.72rem',
                display: 'grid',
                gap: '0.45rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ color: '#67E8F9', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
                    MSP AI Personality Match
                  </div>
                  {adaptiveMatch?.hasProfile && (
                    <div style={{
                      color: adaptiveMatch.noTradeBias ? '#EF4444' : '#10B981',
                      fontWeight: 800,
                      fontSize: '0.74rem',
                      textTransform: 'uppercase',
                    }}>
                      {adaptiveMatch.noTradeBias ? 'NO-TRADE FILTER ACTIVE' : 'PROFILE ALIGNED'}
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '0.4rem',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem', textTransform: 'uppercase', fontWeight: 700 }}>Setup Fit Score</div>
                    <div style={{ color: '#F8FAFC', fontSize: '1.02rem', fontWeight: 900 }}>
                      {adaptiveMatch?.personalityMatch ?? 50}%
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem', textTransform: 'uppercase', fontWeight: 700 }}>Adaptive Confidence</div>
                    <div style={{
                      color: (adaptiveMatch?.adaptiveScore ?? 50) >= 70 ? '#10B981' : (adaptiveMatch?.adaptiveScore ?? 50) >= 50 ? '#F59E0B' : '#EF4444',
                      fontSize: '1.02rem',
                      fontWeight: 900,
                    }}>
                      {adaptiveMatch?.adaptiveScore ?? (result.compositeScore?.confidence ?? 50)}%
                    </div>
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.72rem', textAlign: 'right' }}>
                    {adaptiveMatch?.hasProfile
                      ? `Profile from ${adaptiveMatch.sampleSize} closed trades (${adaptiveMatch.wins} wins)`
                      : (personalityLoaded ? 'Profile warming up from Journal data' : 'Loading Journal profile...')}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  {(adaptiveMatch?.reasons || ['Build profile by logging and closing trades in Trade Journal']).map((reason, idx) => (
                    <div key={idx} style={{ color: '#E2E8F0', fontSize: '0.78rem' }}>✔ {reason}</div>
                  ))}
                </div>
              </div>

              {result.institutionalFilter && (
                <div style={{
                  background: 'rgba(2,6,23,0.28)',
                  border: `1px solid ${result.institutionalFilter.noTrade ? 'rgba(239,68,68,0.45)' : 'rgba(148,163,184,0.35)'}`,
                  borderRadius: '12px',
                  padding: '0.65rem 0.72rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                    <div style={{ color: '#93C5FD', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>
                      Institutional Filters
                    </div>
                    <div style={{
                      color: result.institutionalFilter.noTrade ? '#EF4444' : '#10B981',
                      fontWeight: 800,
                      fontSize: '0.76rem',
                    }}>
                      FINAL QUALITY: {result.institutionalFilter.finalGrade} ({Number(result.institutionalFilter.finalScore ?? 0).toFixed(0)})
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '0.2rem' }}>
                    {(result.institutionalFilter.filters || []).slice(0, 4).map((filter, idx) => (
                      <div key={idx} style={{ color: '#CBD5E1', fontSize: '0.74rem' }}>
                        {filter.status === 'pass' ? '✔' : filter.status === 'warn' ? '⚠' : '✖'} {filter.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <CapitalFlowCard flow={result.capitalFlow} compact />
              <StateMachineTraderEyeCard
                symbol={result.symbol}
                direction={result.direction === 'bearish' ? 'short' : 'long'}
                playbook={result.strategyRecommendation?.strategy?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'momentum_pullback'}
                compact
              />
              <EvolutionStatusCard compact />

              <div style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: '12px',
                padding: '0.75rem',
              }}>
                <div style={{ color: '#A7F3D0', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.45rem' }}>
                  Why This Exists
                </div>
                <div style={{ display: 'grid', gap: '0.32rem' }}>
                  {primaryWhyItems.slice(0, 3).map((reason, idx) => (
                    <div key={idx} style={{ color: '#E2E8F0', fontSize: '0.8rem' }}>✔ {reason}</div>
                  ))}
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.5rem',
                alignItems: 'center',
              }}>
                <div style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>
                  <span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Risk State:</span>{' '}
                  <span style={{ color: riskState === 'NORMAL' ? '#10B981' : riskState === 'ELEVATED' ? '#F59E0B' : '#EF4444', fontWeight: 800 }}>{riskState}</span>
                </div>
                <div style={{ color: '#CBD5E1', fontSize: '0.8rem', textAlign: 'right' }}>
                  <span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Primary Action:</span>{' '}
                  <span style={{ color: '#F8FAFC', fontWeight: 800 }}>{decisionTrigger.toUpperCase()}</span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.72rem',
              }}>
                <div style={{ color: '#A7F3D0' }}>LIVE DATA STATUS: Nasdaq BX ✔ • FMV Options ✔</div>
                <div style={{ color: '#94A3B8' }}>
                  {liveLatencySeconds !== null ? `Latency: ${liveLatencySeconds.toFixed(1)}s` : 'Latency: n/a'}
                </div>
              </div>
            </div>

            {/* Decision Ladder - Institutional validation pipeline */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.90))',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: '14px',
              padding: '0.9rem 1rem',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
                marginBottom: '0.8rem',
              }}>
                <div style={{ color: '#E2E8F0', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.4px' }}>
                  🪜 DECISION LADDER
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.74rem',
                }}>
                  <span style={{ color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Trade Pipeline:</span>
                  <span style={{ color: '#E2E8F0', fontWeight: 800 }}>{pipelineComplete} / {ladderSteps.length} Complete</span>
                  <span style={{ color: '#64748B' }}>•</span>
                  <span style={{
                    color: pipelineStatus === 'READY' ? '#10B981' : pipelineStatus === 'WAITING' ? '#F59E0B' : '#EF4444',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}>
                    {pipelineStatus}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {ladderSteps.map((step, index) => {
                  const visual = stateVisual(step.state);
                  return (
                    <div key={step.title} style={{ display: 'grid', gap: '0.45rem' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        background: visual.bg,
                        border: `1px solid ${visual.border}`,
                        borderRadius: '10px',
                        padding: '0.55rem 0.7rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                          <span style={{ color: visual.color, fontSize: '0.85rem', fontWeight: 800 }}>{visual.icon}</span>
                          <span style={{ color: '#E2E8F0', fontSize: '0.78rem', fontWeight: 700 }}>{step.title}</span>
                        </div>
                        <span style={{ color: visual.color, fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{visual.label}</span>
                      </div>
                      <div style={{ color: '#94A3B8', fontSize: '0.74rem', paddingLeft: '0.35rem' }}>{step.detail}</div>
                      {index < ladderSteps.length - 1 && (
                        <div style={{ color: '#64748B', fontSize: '0.74rem', paddingLeft: '0.35rem' }}>↓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trader Eye Path Layout (Z-Flow) */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.86))',
              border: '1px solid rgba(59,130,246,0.35)',
              borderRadius: '16px',
              padding: '1rem',
              display: 'grid',
              gap: '0.9rem',
            }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ color: '#E2E8F0', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.4px' }}>
                  👁️ TRADER EYE PATH
                </div>
                <div style={{ color: '#64748B', fontSize: '0.72rem' }}>Left → Center → Right → Down</div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.45rem',
              }}>
                {heatSignalStrip.map((item) => (
                  <div key={item.label} style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(148,163,184,0.25)',
                    borderRadius: '8px',
                    padding: '0.42rem 0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.45rem',
                    fontSize: '0.7rem',
                  }}>
                    <span style={{ color: '#94A3B8', fontWeight: 700 }}>{item.label}</span>
                    <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{item.state} {item.value}</span>
                  </div>
                ))}
              </div>

              {/* Z-Flow 2x2: info-left/action-right */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.7rem',
              }}>
                {/* Top Left: Bias / Regime / Trend */}
                <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '10px', padding: '0.65rem' }}>
                  <div style={{ color: '#93C5FD', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.45rem', textTransform: 'uppercase' }}>Top Left • Market Condition</div>
                  <div style={{ color: '#F8FAFC', fontWeight: 900, fontSize: '1rem', marginBottom: '0.3rem' }}>
                    {result.symbol} — {thesisDirection.toUpperCase()} BIAS
                  </div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.78rem', lineHeight: 1.45 }}>
                    <div>Regime: {marketStateLabel || 'Unknown'}</div>
                    <div>Trend Alignment: {trendStrength}</div>
                    <div>Session: {result.entryTiming.marketSession || 'n/a'}</div>
                  </div>
                </div>

                {/* Top Right: Setup Status */}
                <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '10px', padding: '0.65rem' }}>
                  <div style={{ color: '#FCD34D', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.45rem', textTransform: 'uppercase' }}>Top Right • Setup Status</div>
                  <div style={{
                    background: `${commandStatusColor}20`,
                    border: `1px solid ${commandStatusColor}66`,
                    borderRadius: '10px',
                    padding: '0.55rem 0.65rem',
                    marginBottom: '0.4rem',
                  }}>
                    <div style={{ color: commandStatusColor, fontWeight: 900, fontSize: '1rem' }}>{commandStatus}</div>
                    <div style={{ color: '#CBD5E1', fontSize: '0.76rem' }}>Pipeline {pipelineComplete}/{ladderSteps.length} complete</div>
                  </div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.76rem' }}>
                    Confidence {(result.compositeScore?.confidence ?? 0).toFixed(0)}% • Data {dataHealth}
                  </div>
                </div>

                {/* Bottom Left: Pattern + Confluence */}
                <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '10px', padding: '0.65rem' }}>
                  <div style={{ color: '#A7F3D0', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.45rem', textTransform: 'uppercase' }}>Bottom Left • Pattern + Confluence</div>
                  <div style={{ color: '#E2E8F0', fontSize: '0.78rem', lineHeight: 1.45 }}>
                    <div>Pattern: {hasConfirmedPattern && bestPattern ? bestPattern.name : 'No clean pattern'}</div>
                    <div>HTF: {result.confluenceStack >= 3 ? 'Aligned' : 'Mixed'}</div>
                    <div>Confluence: {(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div>
                    <div>Direction Score: {result.compositeScore?.directionScore?.toFixed(0) ?? '0'}</div>
                  </div>
                </div>

                {/* Bottom Right: Execution + Risk */}
                <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '10px', padding: '0.65rem' }}>
                  <div style={{ color: '#C4B5FD', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.45rem', textTransform: 'uppercase' }}>Bottom Right • Execution + Risk</div>
                  <div style={{ color: '#E2E8F0', fontSize: '0.77rem', lineHeight: 1.45 }}>
                    <div>ENTRY: {result.tradeLevels ? `${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}` : 'WAIT'}</div>
                    <div>STOP: {result.tradeLevels ? result.tradeLevels.stopLoss.toFixed(2) : 'N/A'}</div>
                    <div>R:R: {result.tradeLevels ? `${result.tradeLevels.riskRewardRatio.toFixed(1)}:1` : 'N/A'}</div>
                    <div>Expected Move: {result.expectedMove ? `${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Dominant Trader Decision Block */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.88))',
                border: `2px solid ${commandStatusColor}`,
                boxShadow: `0 0 28px ${commandStatusColor}33`,
                borderRadius: '12px',
                padding: '0.8rem 0.9rem',
              }}>
                <div style={{ color: '#94A3B8', fontSize: '0.69rem', textTransform: 'uppercase', letterSpacing: '0.45px', marginBottom: '0.3rem' }}>
                  Trader Decision
                </div>
                <div style={{ color: commandStatusColor, fontWeight: 900, fontSize: '1.05rem', marginBottom: '0.45rem' }}>
                  SETUP STATUS: {commandStatus}
                </div>

                <div style={{ color: '#CBD5E1', fontSize: '0.77rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#F8FAFC', fontWeight: 700 }}>Reason:</span>
                </div>
                <div style={{ display: 'grid', gap: '0.25rem', marginBottom: '0.55rem' }}>
                  {(decisionReasons.length ? decisionReasons : ['Momentum divergence', 'Liquidity below ideal threshold', 'Confluence below activation threshold']).map((reason, idx) => (
                    <div key={idx} style={{ color: '#CBD5E1', fontSize: '0.76rem' }}>• {reason}</div>
                  ))}
                </div>

                <div style={{ color: '#CBD5E1', fontSize: '0.77rem' }}>
                  <span style={{ color: '#F8FAFC', fontWeight: 700 }}>Next Trigger:</span> {decisionTrigger}
                </div>
                <div style={{ color: '#93C5FD', fontSize: '0.72rem', marginTop: '0.45rem' }}>
                  Powered by Nasdaq BX + FMV Options (LIVE)
                </div>
              </div>

              {/* Lower Why Panel */}
              <div style={{
                background: 'rgba(0,0,0,0.18)',
                border: '1px solid rgba(148,163,184,0.24)',
                borderRadius: '10px',
                padding: '0.65rem',
              }}>
                <div style={{ color: '#C4B5FD', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.4rem', textTransform: 'uppercase' }}>🧠 Why Panel</div>
                <div style={{ color: '#CBD5E1', fontSize: '0.76rem', lineHeight: 1.5 }}>
                  {(result.tradeSnapshot?.why && result.tradeSnapshot.why.length > 0)
                    ? result.tradeSnapshot.why.slice(0, 4).join(' • ')
                    : `${result.unusualActivity?.hasUnusualActivity ? 'Unusual activity detected' : 'No unusual options flow'} • OI sentiment ${result.openInterestAnalysis?.sentiment || 'neutral'} • ${hasConfirmedPattern && bestPattern ? `Pattern ${bestPattern.name}` : 'Pattern not confirmed'} • ${result.aiMarketState?.thesis?.summary || 'Awaiting stronger thesis confirmation'}`}
                </div>
              </div>
            </div>
            
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* ⚠️ CRITICAL WARNINGS (Earnings, FOMC, Data Quality) */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {(result.disclaimerFlags && result.disclaimerFlags.length > 0) && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))',
                border: '2px solid #EF4444',
                borderRadius: '16px',
                padding: '1rem 1.25rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🚨</span>
                  <span style={{ 
                    color: '#EF4444', 
                    fontWeight: '700', 
                    fontSize: '0.9rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Critical Risk Events
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {result.disclaimerFlags.map((flag, idx) => (
                    <div key={idx} style={{ 
                      color: '#FCA5A5', 
                      fontSize: '0.875rem',
                      padding: '8px 12px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      fontWeight: '500',
                    }}>
                      {flag}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Data Quality & Execution Notes */}
            {((result.executionNotes && result.executionNotes.length > 0) || 
              (result.dataConfidenceCaps && result.dataConfidenceCaps.length > 0)) && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(217,119,6,0.08))',
                border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: '12px',
                padding: '0.875rem 1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>📋</span>
                  <span style={{ 
                    color: '#F59E0B', 
                    fontWeight: '600', 
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                  }}>
                    Execution Notes
                  </span>
                  {result.dataQuality && (
                    <span style={{
                      marginLeft: 'auto',
                      background: result.dataQuality.freshness === 'REALTIME' ? 'rgba(16,185,129,0.2)' :
                                  result.dataQuality.freshness === 'DELAYED' ? 'rgba(245,158,11,0.2)' :
                                  'rgba(239,68,68,0.2)',
                      color: result.dataQuality.freshness === 'REALTIME' ? '#10B981' :
                             result.dataQuality.freshness === 'DELAYED' ? '#F59E0B' : '#EF4444',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                    }}>
                      {result.dataQuality.freshness} DATA
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {result.dataConfidenceCaps?.map((cap, idx) => (
                    <span key={`cap-${idx}`} style={{ 
                      color: '#FBBF24', 
                      fontSize: '0.75rem',
                      padding: '4px 8px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                    }}>
                      ⚠️ {cap}
                    </span>
                  ))}
                  {result.executionNotes?.map((note, idx) => (
                    <span key={`note-${idx}`} style={{ 
                      color: '#94A3B8', 
                      fontSize: '0.75rem',
                      padding: '4px 8px',
                      background: 'rgba(0,0,0,0.15)',
                      borderRadius: '6px',
                    }}>
                      💡 {note}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 3-SECOND VIEW - Trade Snapshot */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(59,130,246,0.10))',
              border: `2px solid ${result.direction === 'bullish' ? '#10B981' : result.direction === 'bearish' ? '#EF4444' : '#F59E0B'}`,
              borderRadius: '16px',
              padding: '1rem 1.1rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.20)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ color: '#E2E8F0', fontWeight: '800', fontSize: '0.95rem', letterSpacing: '0.4px' }}>
                  🚨 TRADE SNAPSHOT (3-SECOND VIEW)
                </div>
                <div style={{
                  color: result.direction === 'bullish' ? '#10B981' : result.direction === 'bearish' ? '#EF4444' : '#F59E0B',
                  fontWeight: '800',
                  fontSize: '0.9rem',
                }}>
                  {result.symbol} — {result.tradeSnapshot?.verdict ? result.tradeSnapshot.verdict.replace('_', ' ') : (result.direction === 'bullish' ? 'BULLISH EDGE' : result.direction === 'bearish' ? 'BEARISH EDGE' : 'WAIT / NEUTRAL')} ({result.tradeSnapshot?.setupGrade || result.tradeQuality})
                </div>
              </div>

              {((result.tradeSnapshot?.timing?.catalyst && result.tradeSnapshot.timing.catalyst.length > 0) ||
                (result.candleCloseConfluence && result.candleCloseConfluence.bestEntryWindow.endMins > 0)) && (
                <div style={{
                  marginBottom: '0.75rem',
                  color: '#FBBF24',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  background: 'rgba(251,191,36,0.10)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  borderRadius: '10px',
                  padding: '0.45rem 0.6rem',
                }}>
                  🔥 {result.tradeSnapshot?.timing?.catalyst || (`TIME EDGE ACTIVE: ${result.candleCloseConfluence?.bestEntryWindow.startMins === 0 ? 'NOW' : `${result.candleCloseConfluence?.bestEntryWindow.startMins} min`} until TF compression release`)}
                </div>
              )}

              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {result.tradeSnapshot?.oneLine && (
                  <div style={{ color: '#E2E8F0', fontSize: '0.87rem' }}>
                    <span style={{ color: '#A7F3D0', fontWeight: '700' }}>WHAT:</span>{' '}
                    {result.tradeSnapshot.oneLine}
                  </div>
                )}

                <div style={{ color: '#E2E8F0', fontSize: '0.87rem' }}>
                  <span style={{ color: '#93C5FD', fontWeight: '700' }}>WHY:</span>{' '}
                  {result.tradeSnapshot?.why?.length
                    ? result.tradeSnapshot.why.join(' • ')
                    : result.professionalTradeStack
                      ? `${result.professionalTradeStack.structureState.state} + ${result.professionalTradeStack.liquidityContext.state} + ${result.professionalTradeStack.timeEdge.state} + ${result.professionalTradeStack.optionsEdge.state}`
                      : `${result.signalStrength.toUpperCase()} signal with ${result.confluenceStack} TF confluence and ${result.openInterestAnalysis?.sentiment || 'neutral'} options sentiment`}
                </div>

                <div style={{ color: '#E2E8F0', fontSize: '0.87rem' }}>
                  <span style={{ color: '#FCA5A5', fontWeight: '700' }}>RISK:</span>{' '}
                  {result.tradeSnapshot?.risk?.invalidationReason
                    ? result.tradeSnapshot.risk.invalidationReason
                    : result.tradeLevels
                    ? `Lose $${result.tradeLevels.stopLoss.toFixed(2)} → setup invalid`
                    : result.aiMarketState?.thesis?.invalidationLevel
                      ? `Lose $${result.aiMarketState.thesis.invalidationLevel.toFixed(2)} → setup invalid`
                      : 'Directional invalidation not clear yet — reduce size / wait'}
                </div>

                <div style={{ color: '#E2E8F0', fontSize: '0.87rem' }}>
                  <span style={{ color: '#6EE7B7', fontWeight: '700' }}>ACTION:</span>{' '}
                  {result.tradeSnapshot?.action?.entryTrigger
                    ? `${result.tradeSnapshot.action.entryTrigger}${result.tradeSnapshot.action.targets?.[0] ? ` • Target ${result.tradeSnapshot.action.targets[0].price.toFixed(2)}` : ''}`
                    : result.tradeLevels
                    ? result.direction === 'bullish'
                      ? `Entry above $${result.tradeLevels.entryZone.high.toFixed(2)} • Target $${result.tradeLevels.target1.price.toFixed(2)}`
                      : result.direction === 'bearish'
                        ? `Entry below $${result.tradeLevels.entryZone.low.toFixed(2)} • Target $${result.tradeLevels.target1.price.toFixed(2)}`
                        : `Wait for breakout from $${result.tradeLevels.entryZone.low.toFixed(2)} - $${result.tradeLevels.entryZone.high.toFixed(2)}`
                    : 'Wait for cleaner trigger, then execute with defined invalidation'}
                </div>
              </div>
            </div>
            
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

            {/* 📈 PATTERN CONFIRMATION - Core decision driver */}
            {(() => {
              const confirmationColor = hasConfirmedPattern && bestPattern
                ? patternBiasColor(bestPattern.bias)
                : '#F59E0B';
              const biasAligned = !!bestPattern && (
                bestPattern.bias === 'neutral' ||
                bestPattern.bias === result.direction
              );
              const volumeAligned = !!bestPattern && /volume|vol\.?\s*/i.test(bestPattern.reason);
              const trendStateLabel = isCountertrend
                ? 'Countertrend Bounce'
                : `${result.direction === 'bullish' ? 'Bullish' : result.direction === 'bearish' ? 'Bearish' : 'Neutral'} Macro`;

              return (
                <div style={{
                  background: hasConfirmedPattern
                    ? `linear-gradient(135deg, ${bestPattern?.bias === 'bullish' ? 'rgba(16,185,129,0.24)' : bestPattern?.bias === 'bearish' ? 'rgba(239,68,68,0.24)' : 'rgba(245,158,11,0.22)'}, rgba(15,23,42,0.95))`
                    : 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(15,23,42,0.95))',
                  border: `2px solid ${confirmationColor}`,
                  borderRadius: '16px',
                  padding: '1rem 1.1rem',
                  boxShadow: `0 0 28px ${confirmationColor}42`,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                  }}>
                    <div style={{ color: '#E2E8F0', fontWeight: '900', fontSize: '0.95rem', letterSpacing: '0.4px' }}>
                      🧩 PATTERN FORMATION
                    </div>
                    <span style={{
                      background: hasConfirmedPattern ? `${confirmationColor}30` : 'rgba(245,158,11,0.25)',
                      border: `1px solid ${hasConfirmedPattern ? confirmationColor : '#F59E0B'}90`,
                      color: hasConfirmedPattern ? confirmationColor : '#FCD34D',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                    }}>
                      {hasConfirmedPattern ? '✔ Core Driver Confirmed' : '⚠ Awaiting Confirmation'}
                    </span>
                  </div>

                  <div style={{
                    background: 'rgba(0,0,0,0.20)',
                    border: `1px solid ${confirmationColor}55`,
                    borderRadius: '10px',
                    padding: '0.55rem 0.65rem',
                    marginBottom: '0.6rem',
                    color: '#E2E8F0',
                    fontSize: '0.83rem',
                  }}>
                    <span style={{ color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Trend State:</span>{' '}
                    <span style={{ color: isCountertrend ? '#F59E0B' : '#10B981', fontWeight: 800 }}>{trendStateLabel}</span>
                  </div>

                  {hasConfirmedPattern && bestPattern ? (
                    <>
                      <div style={{
                        color: confirmationColor,
                        fontSize: '1.1rem',
                        fontWeight: '900',
                        marginBottom: '0.45rem',
                        textTransform: 'uppercase',
                      }}>
                        {bestPattern.name}
                      </div>
                      <div className="decision-grid-mobile" style={{ gap: '0.6rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                          <div style={{ color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pattern Strength</div>
                          <div style={{ color: '#E2E8F0', fontWeight: '800', fontSize: '0.9rem' }}>
                            {bestPattern.confidence.toFixed(0)}%
                          </div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                          <div style={{ color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Bias Align</div>
                          <div style={{ color: biasAligned ? '#10B981' : '#F59E0B', fontWeight: '700', fontSize: '0.85rem' }}>
                            {biasAligned ? 'YES' : 'MIXED'}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                          <div style={{ color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Volume Align</div>
                          <div style={{ color: volumeAligned ? '#10B981' : '#94A3B8', fontWeight: '700', fontSize: '0.85rem' }}>
                            {volumeAligned ? 'YES' : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div style={{ color: '#CBD5E1', fontSize: '0.82rem', marginTop: '0.55rem' }}>
                        {bestPattern.reason}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      background: 'rgba(0,0,0,0.22)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      borderRadius: '10px',
                      padding: '0.7rem 0.75rem',
                      color: '#FCD34D',
                      fontSize: '0.84rem',
                    }}>
                      {hasPatternData
                        ? 'Pattern signals are present but confidence is below confirmation threshold. Wait for cleaner structure before sizing up.'
                        : 'No clear structure pattern detected yet. Keep focus on direction, timing, and risk until pattern confirmation appears.'}
                    </div>
                  )}
                </div>
              );
            })()}

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
