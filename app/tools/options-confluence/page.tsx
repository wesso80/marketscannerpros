"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { 
  calculateOptionsProbability, 
  OptionsSignals, 
  ProbabilityResult 
} from "@/lib/signals/probability-engine";
import { useAIPageContext } from "@/lib/ai/pageContext";
import CapitalFlowCard from "@/components/CapitalFlowCard";
import StateMachineTraderEyeCard from "@/components/StateMachineTraderEyeCard";
import EvolutionStatusCard from "@/components/EvolutionStatusCard";
import { deriveCopilotPresence } from "@/lib/copilot/derive-copilot-presence";
import type { OptionsSetup as AnalyzerOptionsSetup } from "@/lib/options-confluence-analyzer";
import TerminalShell from "@/components/terminal/TerminalShell";
import CommandStrip, { type TerminalDensity } from "@/components/terminal/CommandStrip";
import DecisionCockpit from "@/components/terminal/DecisionCockpit";
import SignalRail from "@/components/terminal/SignalRail";
import Pill from "@/components/terminal/Pill";
import { writeOperatorState } from "@/lib/operatorState";
import { createWorkflowEvent, emitWorkflowEvents } from "@/lib/workflow/client";
import { createDecisionPacketFromScan } from "@/lib/workflow/decisionPacket";
import type { AssetClass, CandidateEvaluation, DecisionPacket, TradePlan, UnifiedSignal } from "@/lib/workflow/types";

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
  calendarDte: number;
  expirationDate: string;
  reason: string;
  thetaRisk: 'low' | 'moderate' | 'high';
  timeframe: 'scalping' | 'intraday' | 'swing' | 'position';
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

type InstitutionalIntentState =
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'LIQUIDITY_HUNT_UP'
  | 'LIQUIDITY_HUNT_DOWN'
  | 'TRAP_UP'
  | 'TRAP_DOWN'
  | 'REPRICE_TREND';

interface InstitutionalIntentOutput {
  engine: 'institutional_intent_engine';
  version: '1.0';
  symbol: string;
  timeframe: string;
  asof: string;
  features: {
    sbq: number;
    srs: number;
    ces: number;
    ops: number;
    pwp: number;
    rc: number;
  };
  intent_probabilities: Record<InstitutionalIntentState, number>;
  primary_intent: InstitutionalIntentState | 'UNKNOWN';
  intent_confidence: number;
  expected_path: 'expand' | 'mean-revert' | 'chop' | 'expansion_continuation';
  permission_bias: 'LONG' | 'SHORT' | 'NONE';
  key_levels: {
    liquidity_pools: string[];
    oi_walls: Array<{ strike: number; side: 'CALL' | 'PUT' | 'MIXED'; strength: number }>;
    invalidation: string;
  };
  notes: string[];
  reason?: 'DATA_INSUFFICIENT';
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
  institutionalIntent?: InstitutionalIntentOutput | null;
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

type InstitutionalLensMode = 'OBSERVE' | 'WATCH' | 'ARMED' | 'EXECUTE';
type MRIRegime = 'TREND_EXPANSION' | 'ROTATIONAL_RANGE' | 'VOLATILITY_EXPANSION' | 'CHAOTIC_NEWS';
type AdaptiveConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
type OperatorViewMode = 'guided' | 'advanced';
type TrapDoorKey = 'evidence' | 'contracts' | 'narrative' | 'logs';

export default function OptionsConfluenceScanner() {
  const { tier, isLoading: isTierLoading } = useUserTier();
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
  const [personalityEntries, setPersonalityEntries] = useState<PersonalityJournalEntry[]>([]);
  const [personalityLoaded, setPersonalityLoaded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [density, setDensity] = useState<TerminalDensity>('normal');
  const [deskFeedIndex, setDeskFeedIndex] = useState(0);
  const [operatorViewMode, setOperatorViewMode] = useState<OperatorViewMode>('advanced');
  const [operatorModeHydrated, setOperatorModeHydrated] = useState(false);
  const [trapDoors, setTrapDoors] = useState<Record<TrapDoorKey, boolean>>({
    evidence: true,
    contracts: false,
    narrative: false,
    logs: false,
  });
  const sectionAnchorsRef = useRef<Record<TrapDoorKey, HTMLDivElement | null>>({
    evidence: null,
    contracts: null,
    narrative: null,
    logs: null,
  });
  const lastWorkflowEventKeyRef = useRef('');

  const activateSection = (key: TrapDoorKey) => {
    setTrapDoors((previousState) => ({ ...previousState, [key]: true }));

    const scrollToAnchor = () => {
      sectionAnchorsRef.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    requestAnimationFrame(() => {
      setTimeout(scrollToAnchor, 40);
    });
  };

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
    if (typeof window === 'undefined') return;
    const urlSymbol = new URLSearchParams(window.location.search).get('symbol');
    if (!urlSymbol) return;
    const normalized = urlSymbol.trim().toUpperCase();
    if (!normalized) return;
    setSymbol(normalized);
  }, []);

  useEffect(() => {
    if (!result) return;

    const signalStrengthScore = typeof result.signalStrength === 'number'
      ? result.signalStrength
      : result.signalStrength === 'strong'
      ? 75
      : result.signalStrength === 'moderate'
      ? 60
      : result.signalStrength === 'weak'
      ? 40
      : 50;
    const edge = Math.max(1, Math.min(99, Math.round(result.compositeScore?.confidence ?? signalStrengthScore)));
    const bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = result.direction === 'bullish'
      ? 'BULLISH'
      : result.direction === 'bearish'
      ? 'BEARISH'
      : 'NEUTRAL';

    const action: 'WAIT' | 'PREP' | 'EXECUTE' = result.entryTiming.urgency === 'no_trade'
      ? 'WAIT'
      : result.tradeLevels && edge >= 60
      ? 'EXECUTE'
      : 'PREP';

    const expectedMoveRisk = result.expectedMove?.selectedExpiryPercent ?? 0;
    const risk: 'LOW' | 'MODERATE' | 'HIGH' = result.institutionalFilter?.noTrade
      ? 'HIGH'
      : expectedMoveRisk >= 4
      ? 'HIGH'
      : expectedMoveRisk >= 2
      ? 'MODERATE'
      : 'LOW';

    const next = result.entryTiming.urgency === 'no_trade'
      ? (result.entryTiming.reason || 'Wait for cleaner options structure')
      : (result.tradeSnapshot?.action?.entryTrigger || result.entryTiming.reason || 'Execute with defined levels');

    writeOperatorState({
      symbol: result.symbol,
      edge,
      bias,
      action,
      risk,
      next,
      mode: 'EVALUATE',
    });
  }, [result]);

  useEffect(() => {
    if (!result) return;

    const symbolKey = result.symbol.toUpperCase();
    const dateKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const workflowId = `wf_options_${symbolKey}_${dateKey}`;

    const confidence = Math.max(
      1,
      Math.min(
        99,
        Math.round(
          result.compositeScore?.confidence
            ?? (result.signalStrength === 'strong'
              ? 78
              : result.signalStrength === 'moderate'
              ? 62
              : result.signalStrength === 'weak'
              ? 45
              : 50)
        )
      )
    );

    const eventKey = `${workflowId}:${symbolKey}:${selectedTF}:${confidence}:${result.direction}`;
    if (lastWorkflowEventKeyRef.current === eventKey) return;
    lastWorkflowEventKeyRef.current = eventKey;

    const signalId = `sig_opt_${symbolKey}_${Date.now()}`;
    const candidateId = `cand_opt_${symbolKey}_${Date.now()}`;
    const planId = `plan_opt_${symbolKey}_${Date.now()}`;

    const bias: DecisionPacket['bias'] = result.direction === 'bullish'
      ? 'bullish'
      : result.direction === 'bearish'
      ? 'bearish'
      : 'neutral';

    const direction: UnifiedSignal['direction'] = bias === 'bullish'
      ? 'long'
      : bias === 'bearish'
      ? 'short'
      : 'neutral';

    const entryMid = result.tradeLevels
      ? (Number(result.tradeLevels.entryZone.low) + Number(result.tradeLevels.entryZone.high)) / 2
      : result.currentPrice;

    const riskScore = Math.max(
      1,
      Math.min(99, Math.round((result.expectedMove?.selectedExpiryPercent ?? 2) * 20))
    );

    const candidateOutcome: CandidateEvaluation['result'] = confidence >= 70
      ? 'pass'
      : confidence >= 55
      ? 'watch'
      : 'fail';

    const decisionPacket = createDecisionPacketFromScan({
      symbol: symbolKey,
      market: 'options',
      signalSource: 'options.confluence',
      signalScore: confidence,
      bias,
      timeframeBias: [selectedTF],
      entryZone: entryMid,
      invalidation: result.tradeLevels?.stopLoss,
      targets: [
        result.tradeLevels?.target1?.price,
        result.tradeLevels?.target2?.price,
        result.tradeLevels?.target3?.price,
      ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      riskScore,
      volatilityRegime: (result.ivAnalysis?.ivRank ?? 50) >= 70 ? 'high' : (result.ivAnalysis?.ivRank ?? 50) <= 30 ? 'low' : 'moderate',
      status: 'candidate',
    });

    const signalEvent = createWorkflowEvent<UnifiedSignal>({
      eventType: 'signal.created',
      workflowId,
      route: '/tools/options-confluence',
      module: 'options_confluence',
      entity: {
        entity_type: 'signal',
        entity_id: signalId,
        symbol: symbolKey,
        asset_class: 'options' as AssetClass,
      },
      payload: {
        signal_id: signalId,
        created_at: new Date().toISOString(),
        symbol: symbolKey,
        asset_class: 'options',
        timeframe: selectedTF,
        signal_type: 'options_confluence',
        direction,
        confidence,
        quality_tier: confidence >= 75 ? 'A' : confidence >= 62 ? 'B' : confidence >= 48 ? 'C' : 'D',
        source: {
          module: 'options_confluence',
          submodule: 'scan',
          strategy: result.strategyRecommendation?.strategy || 'options_flow',
        },
        evidence: {
          trade_quality: result.tradeQuality,
          confluence_stack: result.confluenceStack,
          iv_rank: result.ivAnalysis?.ivRank,
          unusual_activity: result.unusualActivity?.hasUnusualActivity || false,
        },
      },
    });

    const candidateEvent = createWorkflowEvent<CandidateEvaluation & { decision_packet: DecisionPacket }>({
      eventType: 'candidate.created',
      workflowId,
      parentEventId: signalEvent.event_id,
      route: '/tools/options-confluence',
      module: 'options_confluence',
      entity: {
        entity_type: 'candidate',
        entity_id: candidateId,
        symbol: symbolKey,
        asset_class: 'options' as AssetClass,
      },
      payload: {
        candidate_id: candidateId,
        signal_id: signalId,
        evaluated_at: new Date().toISOString(),
        result: candidateOutcome,
        confidence_delta: 0,
        final_confidence: confidence,
        checks: [
          {
            name: 'options_confidence',
            status: confidence >= 70 ? 'pass' : confidence >= 55 ? 'warn' : 'fail',
            detail: `Composite confidence ${confidence}`,
          },
          {
            name: 'entry_defined',
            status: result.tradeLevels ? 'pass' : 'warn',
            detail: result.tradeLevels ? 'Trade levels present' : 'Trade levels missing',
          },
        ],
        notes: result.tradeSnapshot?.oneLine || result.entryTiming.reason,
        decision_packet: decisionPacket,
      },
    });

    if (candidateOutcome === 'pass') {
      const tradePlanEvent = createWorkflowEvent<TradePlan>({
        eventType: 'trade.plan.created',
        workflowId,
        parentEventId: candidateEvent.event_id,
        route: '/tools/options-confluence',
        module: 'options_confluence',
        entity: {
          entity_type: 'trade_plan',
          entity_id: planId,
          symbol: symbolKey,
          asset_class: 'options' as AssetClass,
        },
        payload: {
          plan_id: planId,
          created_at: new Date().toISOString(),
          symbol: symbolKey,
          asset_class: 'options',
          direction,
          timeframe: selectedTF,
          setup: {
            source: 'options.confluence',
            signal_type: 'options_confluence',
            confidence,
            decision_packet_id: decisionPacket.id,
            strategy: result.strategyRecommendation?.strategy,
          },
          entry: {
            zone: entryMid,
            low: result.tradeLevels?.entryZone.low,
            high: result.tradeLevels?.entryZone.high,
            current_price: result.currentPrice,
          },
          risk: {
            invalidation: result.tradeLevels?.stopLoss,
            targets: decisionPacket.targets,
            risk_score: decisionPacket.riskScore,
            volatility_regime: decisionPacket.volatilityRegime,
          },
          links: {
            candidate_id: candidateId,
            signal_id: signalId,
          },
        },
      });

      void emitWorkflowEvents([signalEvent, candidateEvent, tradePlanEvent]);
      return;
    }

    void emitWorkflowEvents([signalEvent, candidateEvent]);
  }, [result, selectedTF]);

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

  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => {
      setDeskFeedIndex((prev) => prev + 1);
    }, 180000);
    return () => clearInterval(timer);
  }, [result?.symbol]);

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

  const gradeClass = (grade: string) => {
    switch (grade) {
      case 'A+': return 'text-emerald-500';
      case 'A': return 'text-green-500';
      case 'B': return 'text-amber-500';
      case 'C': return 'text-orange-500';
      default: return 'text-red-500';
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

  const urgencyClass = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return 'text-emerald-500';
      case 'within_hour': return 'text-amber-500';
      case 'wait': return 'text-gray-500';
      default: return 'text-red-500';
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
    if (state === 'valid') return { label: 'VALID', icon: '✔', containerClass: 'border border-emerald-500/40 bg-emerald-500/15', textClass: 'text-emerald-500' };
    if (state === 'partial') return { label: 'PARTIAL', icon: '⚠', containerClass: 'border border-amber-500/40 bg-amber-500/15', textClass: 'text-amber-500' };
    return { label: 'FAIL', icon: '✖', containerClass: 'border border-red-500/40 bg-red-500/15', textClass: 'text-red-500' };
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

  const institutionalFlowState = !result
    ? 'UNKNOWN'
    : result.capitalFlow?.bias
      ? `${result.capitalFlow.bias.toUpperCase()} • ${result.capitalFlow.market_mode.toUpperCase()}`
      : (result.unusualActivity?.smartMoneyDirection || 'neutral').toUpperCase();

  const institutionalMarketRegime = !result
    ? 'UNKNOWN'
    : (marketStateLabel || 'Uncertain Regime').toUpperCase();

  const tradePermission = !result
    ? 'WAIT'
    : result.institutionalFilter?.noTrade
      ? 'BLOCKED'
      : (commandStatus === 'ACTIVE' ? 'ALLOWED' : 'WAIT');

  const tradeabilityState: 'EXECUTABLE' | 'CONDITIONAL' | 'AVOID' = !result
    ? 'CONDITIONAL'
    : (commandStatus === 'ACTIVE' && tradePermission === 'ALLOWED')
      ? 'EXECUTABLE'
      : (commandStatus === 'NO TRADE' || tradePermission === 'BLOCKED')
        ? 'AVOID'
        : 'CONDITIONAL';

  const tradeabilityToneClass = tradeabilityState === 'EXECUTABLE'
    ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
    : tradeabilityState === 'CONDITIONAL'
      ? 'border-amber-500/45 bg-amber-500/15 text-amber-300'
      : 'border-red-500/45 bg-red-500/15 text-red-300';

  const isGuidedMode = operatorViewMode === 'guided';
  const narrativeVisible = !isGuidedMode && trapDoors.narrative;
  const diagnosticsVisible = !isGuidedMode && trapDoors.logs;

  const commandStatusClass = commandStatus === 'ACTIVE' ? 'text-emerald-500' : commandStatus === 'WAIT' ? 'text-amber-500' : 'text-red-500';
  const commandStatusToneCardClass = commandStatus === 'ACTIVE'
    ? 'border border-emerald-500/35 bg-emerald-500/15'
    : commandStatus === 'WAIT'
      ? 'border border-amber-500/35 bg-amber-500/15'
      : 'border border-red-500/35 bg-red-500/15';
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

  const hasActiveTradeForSymbol = useMemo(() => {
    if (!result || !personalityEntries.length) return false;
    const upperSymbol = result.symbol.toUpperCase();
    return personalityEntries.some((trade) => {
      if (!trade.isOpen) return false;
      const textBlob = `${trade.strategy || ''} ${trade.setup || ''} ${trade.notes || ''} ${(trade.tags || []).join(' ')}`.toUpperCase();
      return textBlob.includes(upperSymbol);
    });
  }, [personalityEntries, result]);

  const marketRegimeIntel = useMemo(() => {
    if (!result) return null;

    const ivRank = result.ivAnalysis?.ivRank ?? 50;
    const movePct = result.expectedMove?.selectedExpiryPercent ?? 0;
    const directionScoreAbs = Math.abs(result.compositeScore?.directionScore ?? 0);
    const confidenceScore = result.compositeScore?.confidence ?? 0;
    const unusualLevel = result.unusualActivity?.alertLevel ?? 'none';
    const noTradeFlag = !!result.institutionalFilter?.noTrade;
    const freshness = result.dataQuality?.freshness ?? 'DELAYED';
    const hasCriticalFlag = (result.disclaimerFlags || []).some((flag) =>
      /earnings|fomc|fed|cpi|news|event|halt|gap/i.test(flag)
    );
    const flowAlignment = (result.unusualActivity?.smartMoneyDirection || result.openInterestAnalysis?.sentiment || 'neutral') as 'bullish' | 'bearish' | 'neutral' | 'mixed';
    const flowMatchesDirection = flowAlignment === 'neutral' || flowAlignment === 'mixed' || flowAlignment === result.direction;

    const volatilityState: 'normal' | 'elevated' | 'extreme' =
      ivRank >= 85 || movePct >= 7 || unusualLevel === 'high'
        ? 'extreme'
        : ivRank >= 70 || movePct >= 4.5 || unusualLevel === 'moderate'
          ? 'elevated'
          : 'normal';

    const trendExpansionSignal = directionScoreAbs >= 35 && confidenceScore >= 65 && flowMatchesDirection;
    const volatilityExpansionSignal = volatilityState !== 'normal';
    const chaoticSignal = noTradeFlag && (hasCriticalFlag || volatilityState === 'extreme' || freshness === 'STALE');

    let regime: MRIRegime = 'ROTATIONAL_RANGE';
    if (chaoticSignal) regime = 'CHAOTIC_NEWS';
    else if (volatilityExpansionSignal) regime = 'VOLATILITY_EXPANSION';
    else if (trendExpansionSignal) regime = 'TREND_EXPANSION';

    const confidencePct =
      regime === 'CHAOTIC_NEWS'
        ? Math.max(70, confidenceScore)
        : regime === 'TREND_EXPANSION'
          ? Math.min(95, Math.max(55, confidenceScore + 10))
          : regime === 'VOLATILITY_EXPANSION'
            ? Math.min(90, Math.max(50, confidenceScore + 5))
            : Math.max(40, Math.min(80, confidenceScore));

    const riskModifier =
      regime === 'TREND_EXPANSION' ? 1.1 :
      regime === 'ROTATIONAL_RANGE' ? 0.95 :
      regime === 'VOLATILITY_EXPANSION' ? 0.75 : 0;

    return {
      regime,
      confidence: Number((confidencePct / 100).toFixed(2)),
      volatility_state: volatilityState,
      flow_alignment: flowAlignment,
      risk_modifier: riskModifier,
    };
  }, [result]);

  const institutionalProbability = result
    ? (probabilityResult?.winProbability ?? result.compositeScore?.confidence ?? 0)
    : 0;
  const adaptiveConfidenceScore = result
    ? (adaptiveMatch?.adaptiveScore ?? institutionalProbability)
    : 0;
  const adaptiveConfidenceBand: AdaptiveConfidenceBand = adaptiveConfidenceScore < 40
    ? 'LOW'
    : adaptiveConfidenceScore < 65
      ? 'MEDIUM'
      : adaptiveConfidenceScore < 80
        ? 'HIGH'
        : 'EXTREME';
  const flowDirection = result?.unusualActivity?.smartMoneyDirection || result?.openInterestAnalysis?.sentiment || 'neutral';
  const flowAligned = !!result && (
    flowDirection === 'neutral' ||
    flowDirection === 'mixed' ||
    flowDirection === result.direction
  );

  useEffect(() => {
    if (operatorModeHydrated) return;
    try {
      const storedMode = window.localStorage.getItem('msp_options_operator_mode_v1');
      if (storedMode === 'guided' || storedMode === 'advanced') {
        setOperatorViewMode(storedMode);
      } else {
        setOperatorViewMode(tier === 'pro_trader' ? 'advanced' : 'guided');
      }
    } catch {
      setOperatorViewMode(tier === 'pro_trader' ? 'advanced' : 'guided');
    } finally {
      setOperatorModeHydrated(true);
    }
  }, [operatorModeHydrated, tier]);

  useEffect(() => {
    if (!operatorModeHydrated) return;
    try {
      window.localStorage.setItem('msp_options_operator_mode_v1', operatorViewMode);
    } catch {
    }
  }, [operatorViewMode, operatorModeHydrated]);
  const riskGovernorAllows = !!result && (
    tradePermission === 'ALLOWED' &&
    !result.institutionalFilter?.noTrade &&
    !adaptiveMatch?.noTradeBias
  );
  const watchThreshold = 55;

  const institutionalLensMode: InstitutionalLensMode = !result
    ? 'OBSERVE'
    : hasActiveTradeForSymbol
      ? 'EXECUTE'
      : marketRegimeIntel?.regime === 'CHAOTIC_NEWS'
        ? 'OBSERVE'
        : adaptiveConfidenceBand === 'LOW'
          ? 'OBSERVE'
          : adaptiveConfidenceBand === 'MEDIUM'
            ? 'WATCH'
            : adaptiveConfidenceBand === 'HIGH'
              ? (flowAligned && riskGovernorAllows ? 'ARMED' : 'WATCH')
              : (flowAligned && riskGovernorAllows ? 'EXECUTE' : ((result.compositeScore?.confidence ?? 0) >= watchThreshold ? 'WATCH' : 'OBSERVE'));

  const lensDisplayMode = institutionalLensMode === 'EXECUTE' && !hasActiveTradeForSymbol
    ? 'EXECUTE_FOCUS'
    : institutionalLensMode;

  const modeAccentClass = institutionalLensMode === 'ARMED'
    ? 'text-emerald-500'
    : institutionalLensMode === 'EXECUTE'
      ? 'text-orange-500'
      : institutionalLensMode === 'WATCH'
        ? 'text-amber-500'
        : marketRegimeIntel?.regime === 'CHAOTIC_NEWS'
          ? 'text-red-500'
          : 'text-[var(--msp-accent)]';

  const modeAccentBorderClass = institutionalLensMode === 'ARMED'
    ? 'border-l-emerald-500'
    : institutionalLensMode === 'EXECUTE'
      ? 'border-l-orange-500'
      : institutionalLensMode === 'WATCH'
        ? 'border-l-amber-500'
        : marketRegimeIntel?.regime === 'CHAOTIC_NEWS'
          ? 'border-l-red-500'
          : 'border-l-[var(--msp-accent)]';

  const confluenceRadar = result ? (() => {
    const clampScore = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

    const trendScore = clampScore(
      ((result.compositeScore?.confidence ?? 45) * 0.65) +
      (Math.abs(result.compositeScore?.directionScore ?? 0) * 0.35)
    );

    const flowAlignment = result.unusualActivity?.smartMoneyDirection || result.openInterestAnalysis?.sentiment || 'neutral';
    const directionAligned = flowAlignment === 'neutral' || flowAlignment === 'mixed' || flowAlignment === result.direction;
    const flowScore = clampScore(
      (result.unusualActivity?.alertLevel === 'high' ? 82 :
       result.unusualActivity?.alertLevel === 'moderate' ? 68 :
       result.unusualActivity?.hasUnusualActivity ? 54 : 36) +
      (directionAligned ? 12 : -10)
    );

    const momentumScore = clampScore(
      (result.signalStrength === 'strong' ? 84 :
       result.signalStrength === 'moderate' ? 66 :
       result.signalStrength === 'weak' ? 48 : 30) +
      Math.min(14, Math.max(0, result.confluenceStack * 2))
    );

    const movePct = result.expectedMove?.selectedExpiryPercent ?? 0;
    const ivRank = result.ivAnalysis?.ivRank ?? 50;
    const volatilityScore = clampScore((movePct * 11) + (Math.abs(ivRank - 50) * 0.9) + 26);

    const sentimentScore = clampScore(
      (result.openInterestAnalysis?.sentiment === 'bullish' || result.openInterestAnalysis?.sentiment === 'bearish' ? 62 : 44) +
      (result.capitalFlow?.conviction ? Math.min(28, result.capitalFlow.conviction * 0.28) : 8)
    );

    const axes = [
      { key: 'TREND', value: Math.round(trendScore) },
      { key: 'FLOW', value: Math.round(flowScore) },
      { key: 'MOMENTUM', value: Math.round(momentumScore) },
      { key: 'VOLATILITY', value: Math.round(volatilityScore) },
      { key: 'SENTIMENT', value: Math.round(sentimentScore) },
    ];

    const size = 220;
    const center = size / 2;
    const radius = 78;
    const levels = [20, 40, 60, 80, 100];
    const angleStep = (Math.PI * 2) / axes.length;

    const pointAt = (axisIndex: number, normalized: number) => {
      const angle = -Math.PI / 2 + (axisIndex * angleStep);
      const r = radius * normalized;
      return {
        x: center + Math.cos(angle) * r,
        y: center + Math.sin(angle) * r,
      };
    };

    const ringPolygons = levels.map((level) => {
      const norm = level / 100;
      return axes.map((_, axisIndex) => {
        const point = pointAt(axisIndex, norm);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      }).join(' ');
    });

    const dataPolygon = axes.map((axis, axisIndex) => {
      const point = pointAt(axisIndex, axis.value / 100);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(' ');

    const axisLines = axes.map((_, axisIndex) => {
      const point = pointAt(axisIndex, 1);
      return { x1: center, y1: center, x2: point.x, y2: point.y };
    });

    const axisLabels = axes.map((axis, axisIndex) => {
      const point = pointAt(axisIndex, 1.17);
      return { ...axis, x: point.x, y: point.y };
    });

    const composite = Math.round(axes.reduce((sum, axis) => sum + axis.value, 0) / axes.length);

    return {
      axes,
      composite,
      size,
      center,
      ringPolygons,
      dataPolygon,
      axisLines,
      axisLabels,
    };
  })() : null;

  const terminalSignalStack = result ? [
    {
      label: 'Trend Structure',
      score: Math.round(Math.max(0, Math.min(100, ((result.compositeScore?.confidence ?? 45) * 0.6) + (Math.abs(result.compositeScore?.directionScore ?? 0) * 0.4)))),
      state: trendStrength,
      summary: `${thesisDirection.toUpperCase()} bias • ${result.compositeScore?.confidence?.toFixed(0) || '0'}% confidence`,
    },
    {
      label: 'Momentum',
      score: result.signalStrength === 'strong' ? 84 : result.signalStrength === 'moderate' ? 66 : result.signalStrength === 'weak' ? 48 : 30,
      state: result.signalStrength.toUpperCase(),
      summary: `${result.confluenceStack} TFs aligned • ${result.entryTiming.urgency.replace('_', ' ')}`,
    },
    {
      label: 'Options Flow',
      score: result.unusualActivity?.alertLevel === 'high' ? 86 : result.unusualActivity?.alertLevel === 'moderate' ? 68 : result.unusualActivity?.hasUnusualActivity ? 52 : 34,
      state: (result.unusualActivity?.smartMoneyDirection || result.openInterestAnalysis?.sentiment || 'neutral').toUpperCase(),
      summary: `PCR ${result.openInterestAnalysis?.pcRatio?.toFixed(2) || 'n/a'} • ${result.unusualActivity?.alertLevel || 'none'} alert`,
    },
    {
      label: 'Volatility Regime',
      score: Math.round(Math.max(0, Math.min(100, ((result.expectedMove?.selectedExpiryPercent ?? 0) * 11) + (Math.abs((result.ivAnalysis?.ivRank ?? 50) - 50) * 0.8) + 24))),
      state: `${result.ivAnalysis?.ivRank != null ? `IV ${result.ivAnalysis.ivRank}%` : 'IV N/A'}`,
      summary: result.expectedMove ? `Expected ±${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'Expected move unavailable',
    },
    {
      label: 'Sentiment',
      score: result.capitalFlow?.conviction ? Math.max(35, Math.min(100, Math.round(result.capitalFlow.conviction))) : 52,
      state: (result.capitalFlow?.bias || result.openInterestAnalysis?.sentiment || 'neutral').toUpperCase(),
      summary: `${result.capitalFlow?.market_mode || 'market mode n/a'} • ${result.institutionalFilter?.recommendation || 'no filter'}`,
    },
  ] : [];

  const terminalDecisionCard = result ? {
    direction: thesisDirection.toUpperCase(),
    conviction: Math.round(adaptiveConfidenceScore),
    setup: result.strategyRecommendation?.strategy || (result.direction === 'bullish' ? 'Call Debit Spread' : result.direction === 'bearish' ? 'Put Debit Spread' : 'WAIT'),
    trigger: decisionTrigger,
    invalidation: result.tradeLevels?.stopLoss ? `${result.tradeLevels.stopLoss.toFixed(2)}` : (result.tradeSnapshot?.risk?.invalidationReason || 'Await cleaner invalidation'),
    expectedMove: result.expectedMove ? `±${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A',
  } : null;

  type AdaptiveTerminalMode = 'TREND_MODE' | 'CHOP_RANGE_MODE' | 'HIGH_VOL_EVENT_MODE' | 'TRANSITION_MODE';

  const adaptiveTerminalMode: AdaptiveTerminalMode = !result
    ? 'TRANSITION_MODE'
    : (() => {
      const directionScoreAbs = Math.abs(result.compositeScore?.directionScore ?? 0);
      const confidence = result.compositeScore?.confidence ?? 0;
      const movePct = result.expectedMove?.selectedExpiryPercent ?? 0;
      const ivRank = result.ivAnalysis?.ivRank ?? 50;
      const flowBurst = result.unusualActivity?.alertLevel === 'high';
      const hasEventFlag = (result.disclaimerFlags || []).some((flag) => /earnings|fomc|fed|cpi|news|event|halt|gap/i.test(flag));
      const conflictCount = result.compositeScore?.conflicts?.length ?? 0;

      const highVol = movePct >= 4.8 || ivRank >= 72 || flowBurst || hasEventFlag;
      const trendStrong = result.direction !== 'neutral' && directionScoreAbs >= 35 && confidence >= 62 && result.confluenceStack >= 3;
      const chop = result.direction === 'neutral' || directionScoreAbs < 22 || conflictCount >= 2 || result.signalStrength === 'no_signal';

      if (highVol) return 'HIGH_VOL_EVENT_MODE';
      if (trendStrong) return 'TREND_MODE';
      if (chop) return 'CHOP_RANGE_MODE';
      return 'TRANSITION_MODE';
    })();

  const adaptiveModeMeta = {
    TREND_MODE: {
      label: 'TREND ACCELERATION',
      accentTextClass: 'text-emerald-500',
      accentBorderClass: 'border-l-emerald-500',
      reason: 'Directional structure + confluence alignment dominate.',
      layout: {
        columnsClass: '[grid-template-columns:minmax(240px,0.95fr)_minmax(360px,1.5fr)_minmax(240px,1fr)]',
        signalOrderClass: 'order-1',
        marketOrderClass: 'order-2',
        execOrderClass: 'order-3',
        execOpacityClass: 'opacity-100',
      },
    },
    CHOP_RANGE_MODE: {
      label: 'CHOP / RANGE',
      accentTextClass: 'text-amber-500',
      accentBorderClass: 'border-l-amber-500',
      reason: 'Low directional edge; prioritize boundaries and risk control.',
      layout: {
        columnsClass: '[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]',
        signalOrderClass: 'order-1',
        marketOrderClass: 'order-2',
        execOrderClass: 'order-3',
        execOpacityClass: 'opacity-[0.78]',
      },
    },
    HIGH_VOL_EVENT_MODE: {
      label: 'VOLATILITY EXPANSION',
      accentTextClass: 'text-red-500',
      accentBorderClass: 'border-l-red-500',
      reason: 'IV/expected-move expansion detected; risk and flow prioritized.',
      layout: {
        columnsClass: '[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]',
        signalOrderClass: 'order-1',
        marketOrderClass: 'order-3',
        execOrderClass: 'order-2',
        execOpacityClass: 'opacity-100',
      },
    },
    TRANSITION_MODE: {
      label: 'REGIME TRANSITION',
      accentTextClass: 'text-sky-400',
      accentBorderClass: 'border-l-sky-400',
      reason: 'Momentum/flow shift underway; confirmation sequencing in focus.',
      layout: {
        columnsClass: '[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]',
        signalOrderClass: 'order-2',
        marketOrderClass: 'order-1',
        execOrderClass: 'order-3',
        execOpacityClass: 'opacity-100',
      },
    },
  }[adaptiveTerminalMode];

  const copilotDerived = result
    ? deriveCopilotPresence(result as unknown as AnalyzerOptionsSetup)
    : null;

  const copilotPresence = result && copilotDerived ? (() => {
    const watching = [copilotDerived.focus.primary, copilotDerived.focus.secondary].filter(Boolean).join(' + ');

    const notices = copilotDerived.events.slice(0, 3).map((event) => ({
      level: event.type === 'WARNING' || event.type === 'RISK_SPIKE'
        ? 'warn'
        : event.type === 'OPPORTUNITY'
          ? 'action'
          : 'info',
      title: event.title,
      message: event.message,
    }));

    const suggestion = copilotDerived.attentionState === 'RISK'
      ? {
          action: 'Favor reduced size or defined-risk structure',
          reason: 'Attention state is RISK — preserve optionality until edge improves.',
        }
      : copilotDerived.attentionState === 'ACTIVE'
        ? {
            action: 'Execution window open — follow trigger + invalidation strictly',
            reason: 'Edge and confidence are aligned in ACTIVE state.',
          }
        : {
            action: 'Wait for additional confirmation before scaling risk',
            reason: `Attention state ${copilotDerived.attentionState} indicates setup is still forming.`,
          };

    const focusMap: Record<string, string> = {
      FLOW: 'Options Flow',
      CHART: 'Trend Structure',
      STRUCTURE: 'Trend Structure',
      VOLATILITY: 'Volatility Regime',
      EXECUTION: 'Momentum',
      LEVELS: 'Sentiment',
      TIMING: 'Momentum',
      NEWS: 'Volatility Regime',
    };

    const watchSet = [copilotDerived.focus.primary, copilotDerived.focus.secondary]
      .filter(Boolean)
      .map((target) => focusMap[String(target)] || 'Momentum');

    return {
      confidence: Math.round(copilotDerived.focus.intensity),
      watching,
      notices,
      suggestion,
      watchSet,
      statusLine: copilotDerived.statusLine,
      notes: copilotDerived.notes,
    };
  })() : null;

  // Avoid premature gating while tier is still resolving
  if (isTierLoading) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)]">
        <main className="max-w-none px-4 py-8 text-slate-200">
          <h1 className="mb-2 text-[clamp(1.25rem,3vw,1.75rem)] font-bold">
            🎯 Loading Options Confluence Scanner...
          </h1>
          <p className="text-sm text-slate-400">
            Checking account access and initializing scanner state.
          </p>
        </main>
      </div>
    );
  }

  // Pro Trader feature gate
  if (!canAccessBacktest(tier)) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)]">
        <header className="max-w-none px-4 py-8 text-center">
          <span className="inline-flex rounded-full border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 py-1 text-[11px] font-semibold text-[var(--msp-accent)]">PRO TRADER</span>
          <h1 className="my-3 text-[clamp(1.5rem,4vw,2rem)] font-bold text-slate-100">
            🎯 Options Confluence Scanner
          </h1>
          <p className="text-sm text-slate-400">Strike & Expiration Recommendations Based on Time Confluence</p>
        </header>
        <main className="max-w-none px-4 pb-8">
          <UpgradeGate requiredTier="pro_trader" feature="Options Confluence Scanner" />
        </main>
      </div>
    );
  }

  return (
    <TerminalShell
      title="🎯 Options Confluence Scanner"
      subtitle="Get intelligent strike & expiration recommendations based on Time Confluence analysis. Uses 50% levels, decompression timing, and Greeks-aware risk assessment."
    >

        {/* Command Strip */}
        {result && (
          <CommandStrip
            symbol={result.symbol}
            status={commandStatus}
            confidence={result.compositeScore?.confidence ?? 0}
            dataHealth={`${dataHealth}${(dataHealth === 'REALTIME' || dataHealth === 'LIVE') ? ' ✔' : ''}`}
            mode={adaptiveModeMeta.label}
            density={density}
            onDensityChange={setDensity}
            rightSlot={
              <button
                type="button"
                onClick={() => setFocusMode((prev) => !prev)}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${focusMode ? 'border-[var(--msp-border-strong)] bg-[var(--msp-panel)] text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
              >
                {focusMode ? 'Focus On' : 'Focus'}
              </button>
            }
          />
        )}

        {result && (
          <DecisionCockpit
            left={<div className="grid gap-1 text-sm"><div className="font-bold text-[var(--msp-text)]">{result.symbol} • {thesisDirection.toUpperCase()}</div><div className="msp-muted">Regime: {institutionalMarketRegime || 'UNKNOWN'}</div><div className="msp-muted">Session: {(result.entryTiming.marketSession || 'n/a').toUpperCase()}</div></div>}
            center={<div className="grid gap-1 text-sm"><Pill tone="accent">{commandStatus}</Pill><div className="msp-muted">Pipeline: {pipelineComplete}/{ladderSteps.length}</div><div className="msp-muted">Confidence: {(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div></div>}
            right={<div className="grid gap-1 text-sm"><div className="msp-muted">Trigger: <span className="font-bold text-[var(--msp-text)]">{decisionTrigger}</span></div><div className="msp-muted">Risk: {(result.expectedMove?.selectedExpiryPercent ?? 0) >= 4 ? 'HIGH' : (result.expectedMove?.selectedExpiryPercent ?? 0) >= 2 ? 'MODERATE' : 'LOW'}</div><div className="msp-muted">Data: {dataHealth}</div></div>}
          />
        )}

        {result && (
          <SignalRail
            items={[
              { label: 'Confluence', value: `${result.confluenceStack} TF`, tone: result.confluenceStack >= 3 ? 'bull' : 'warn' },
              { label: 'Flow', value: (result.openInterestAnalysis?.sentiment || 'neutral').toUpperCase(), tone: result.openInterestAnalysis?.sentiment === 'bullish' ? 'bull' : result.openInterestAnalysis?.sentiment === 'bearish' ? 'bear' : 'neutral' },
              { label: 'Expected Move', value: result.expectedMove ? `${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A', tone: (result.expectedMove?.selectedExpiryPercent ?? 0) >= 4 ? 'bear' : (result.expectedMove?.selectedExpiryPercent ?? 0) >= 2 ? 'warn' : 'bull' },
              { label: 'Trade Permission', value: tradePermission, tone: tradePermission === 'ALLOWED' ? 'bull' : tradePermission === 'BLOCKED' ? 'bear' : 'warn' },
              { label: 'Mode', value: adaptiveModeMeta.label, tone: 'accent' },
              { label: 'Updated', value: commandUpdatedAgo !== null ? `${commandUpdatedAgo}s` : 'n/a', tone: 'neutral' },
            ]}
          />
        )}

        {result && (() => {
          const riskState = (result.expectedMove?.selectedExpiryPercent ?? 0) >= 4
            ? 'HIGH'
            : (result.expectedMove?.selectedExpiryPercent ?? 0) >= 2
            ? 'MODERATE'
            : 'LOW';
          const breadth = result.direction === 'bullish' ? 'RISK ON' : result.direction === 'bearish' ? 'RISK OFF' : 'MIXED';
          const regimeLabel = institutionalMarketRegime || 'UNKNOWN';

          const stripTag = (label: string, value: string, type: 'bull' | 'bear' | 'warn' | 'accent' | 'neutral' = 'neutral') => {
            const colorMap: Record<'bull' | 'bear' | 'warn' | 'accent' | 'neutral', string> = {
              bull: 'text-msp-bull bg-msp-panel border-msp-borderStrong',
              bear: 'text-msp-bear bg-msp-panel border-msp-borderStrong',
              warn: 'text-msp-warn bg-msp-panel border-msp-borderStrong',
              accent: 'text-msp-accent bg-msp-panel border-msp-borderStrong',
              neutral: 'text-msp-neutral bg-msp-panel border-msp-border',
            };
            return (
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${colorMap[type]}`}>
              <span className="text-msp-faint uppercase">{label}</span>
              <span>{value}</span>
            </div>
            );
          };

          return (
            <div className="msp-panel mb-3 flex flex-wrap items-center gap-2 px-2.5 py-2">
              {stripTag('Regime', regimeLabel, regimeLabel.includes('TREND') ? 'bull' : 'warn')}
              {stripTag('Global Risk', riskState, riskState === 'HIGH' ? 'bear' : riskState === 'MODERATE' ? 'warn' : 'bull')}
              {stripTag('Breadth', breadth, breadth === 'RISK ON' ? 'bull' : breadth === 'RISK OFF' ? 'bear' : 'warn')}
              {stripTag('Event Risk', 'NONE', 'accent')}
              {stripTag('Session', (result.entryTiming.marketSession || 'n/a').toUpperCase(), 'neutral')}
            </div>
          );
        })()}

        {result && copilotPresence && (
          <div className="msp-panel -mt-1 mb-3 rounded-lg border border-[var(--msp-border)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold text-[var(--msp-text)]">AI Co-Pilot</span>
              <span className="msp-muted">•</span>
              <span className="font-extrabold text-[var(--msp-accent)]">Market State: {adaptiveModeMeta.label}</span>
              <span className="msp-muted">•</span>
              <span className="msp-muted">Confidence: {copilotPresence.confidence}%</span>
              <span className="msp-muted">•</span>
              <span className="msp-muted">Watching: {copilotPresence.watching}</span>
            </div>
            {copilotPresence.statusLine && (
              <div className="msp-muted mt-1 text-[11px]">
                {copilotPresence.statusLine}
                {copilotPresence.notes?.length ? ` • ${copilotPresence.notes[0]}` : ''}
              </div>
            )}
          </div>
        )}

        {result && (() => {
          const messages = [
            `${result.direction === 'bullish' ? 'Buying' : result.direction === 'bearish' ? 'Selling' : 'Two-way'} pressure near key structure — watch confirmation trigger.`,
            `${result.candleCloseConfluence?.bestEntryWindow?.startMins === 0 ? 'Time cluster active now' : `Time cluster in ${result.candleCloseConfluence?.bestEntryWindow?.startMins ?? 'n/a'}m`} — prepare execution plan.`,
            `${result.unusualActivity?.hasUnusualActivity ? 'Unusual options flow detected' : 'Flow remains moderate'} — keep invalidation discipline.`
          ];
          const msg = messages[deskFeedIndex % messages.length];

          return (
            <div className="msp-panel -mt-2 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--msp-border)] px-3 py-2">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">
                🧠 AI Desk Feed
              </div>
              <div className="msp-muted flex-1 text-xs">{msg}</div>
            </div>
          );
        })()}

        {/* Operator Panel */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 py-2">
          <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">
            Operator Panel
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.05em] text-slate-500">View Mode</span>
            <button
              type="button"
              onClick={() => setOperatorViewMode('guided')}
              className={`rounded-full border px-2.5 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.04em] ${operatorViewMode === 'guided' ? 'border-[var(--msp-border-strong)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
            >
              Guided
            </button>
            <button
              type="button"
              onClick={() => setOperatorViewMode('advanced')}
              className={`rounded-full border px-2.5 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.04em] ${operatorViewMode === 'advanced' ? 'border-[var(--msp-border-strong)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
            >
              Advanced
            </button>
          </div>
        </div>

        <div className="options-form-controls mb-6 flex flex-wrap justify-center gap-3">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onBlur={() => fetchExpirations(symbol)}
            placeholder="SPY, AAPL, QQQ, TSLA..."
            className="max-w-[250px] flex-[1_1_150px] rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] px-5 py-3 text-base text-[var(--msp-text)] outline-none"
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
            className="cursor-pointer rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] px-4 py-3 text-base font-semibold text-[var(--msp-text)]"
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
            className={`rounded-xl border bg-[var(--msp-panel)] px-4 py-3 text-[0.9rem] font-semibold ${expirations.length > 0 ? 'cursor-pointer border-[var(--msp-border-strong)] text-[var(--msp-text)]' : 'cursor-not-allowed border-[var(--msp-border)] text-[var(--msp-text-faint)]'}`}
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
            className={`rounded-xl px-8 py-3 text-base font-bold text-[var(--msp-bg)] transition ${loading ? 'cursor-not-allowed bg-[var(--msp-panel)]' : 'cursor-pointer bg-[var(--msp-accent)]'}`}
          >
            {loading ? '🔄 Finding Best Options Setup...' : '🎯 Find Best Options Setup'}
          </button>

          {result && (
            <button
              onClick={() => handleScan()}
              disabled={loading}
              className="cursor-pointer rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-4 py-3 text-[0.85rem] text-[var(--msp-text-muted)]"
            >
              🔄 Refresh
            </button>
          )}
        </div>

        {/* Status Bar */}
        {lastUpdated && (
          <div className="mb-4 text-center text-[0.8rem] text-[var(--msp-text-muted)]">
            Last updated: {lastUpdated.toLocaleTimeString()}
            {isCached && <span className="ml-2 text-[var(--msp-warn)]">(cached)</span>}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-xl border border-[color:var(--msp-bear)] bg-[var(--msp-bear-tint)] p-4 text-center text-[var(--msp-bear)]">
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="grid gap-6">

            <div className="-mt-1 rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.7rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Decision Engine</span>
                <span className="text-[0.7rem] font-bold uppercase tracking-[0.05em] text-slate-500">Decision First • Evidence Second • Deep Analysis On Demand</span>
              </div>
            </div>

            <div className="rounded-[14px] border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[0.85rem]">
              <div className="grid gap-[0.65rem] md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
                <div className="rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.7rem]">
                  <div className="text-[0.64rem] font-extrabold uppercase text-slate-500">Decision Core</div>
                  <div className="mt-[0.2rem] text-[0.9rem] font-black text-slate-200">
                    {result.tradeSnapshot?.oneLine || `${thesisDirection.toUpperCase()} setup ${commandStatus === 'ACTIVE' ? 'ready for execution' : 'requires trigger confirmation'}`}
                  </div>
                  <div className="mt-[0.35rem] flex flex-wrap gap-[0.35rem]">
                    <span className="rounded-full border border-[var(--msp-border)] bg-slate-400/20 px-2 py-[2px] text-[0.68rem] font-bold text-slate-200">
                      Grade {result.tradeQuality}
                    </span>
                    <span className={`rounded-full border border-[var(--msp-border)] px-2 py-[2px] text-[0.68rem] font-extrabold ${commandStatus === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-500' : commandStatus === 'WAIT' ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'}`}>
                      {commandStatus}
                    </span>
                    <span className="rounded-full border border-[var(--msp-border)] bg-slate-400/20 px-2 py-[2px] text-[0.68rem] font-bold text-slate-300">
                      Trigger: {decisionTrigger}
                    </span>
                  </div>
                  <div className="mt-[0.35rem] text-[0.72rem] text-slate-400">
                    {(result.tradeSnapshot?.why || primaryWhyItems).slice(0, 2).join(' • ')}
                  </div>
                </div>

                <div className="rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.7rem]">
                  <div className="text-[0.64rem] font-extrabold uppercase text-slate-500">Risk + Execution</div>
                  <div className="mt-1 grid gap-1 text-[0.76rem]">
                    <div className="text-slate-200">Entry: {result.tradeLevels ? `${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}` : 'N/A'}</div>
                    <div className="text-red-300">Stop: {result.tradeLevels ? result.tradeLevels.stopLoss.toFixed(2) : 'N/A'}</div>
                    <div className="text-emerald-300">Targets: {result.tradeLevels ? `${result.tradeLevels.target1.price.toFixed(2)}${result.tradeLevels.target2 ? ` / ${result.tradeLevels.target2.price.toFixed(2)}` : ''}` : 'N/A'}</div>
                    <div className="text-slate-300">Expected Move: {result.expectedMove ? `${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A'}</div>
                    <div className="text-slate-400">Invalidation: {result.tradeSnapshot?.risk?.invalidationReason || 'Loss of setup structure'}</div>
                  </div>
                </div>

                <div className="rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.7rem]">
                  <div className="text-[0.64rem] font-extrabold uppercase text-slate-500">Options Snapshot</div>
                  <div className="mt-1 grid gap-1 text-[0.76rem]">
                    <div className="text-slate-200">P/C: {result.openInterestAnalysis ? result.openInterestAnalysis.pcRatio.toFixed(2) : 'N/A'}</div>
                    <div className="text-slate-200">IV Rank: {result.ivAnalysis ? `${result.ivAnalysis.ivRank.toFixed(0)}%` : 'N/A'}</div>
                    <div className="text-slate-200">Strategy: {(result.strategyRecommendation?.strategy || 'N/A').toUpperCase()}</div>
                    <div className="text-slate-300">Contract: {result.primaryStrike ? `${result.primaryStrike.strike}${result.primaryStrike.type === 'call' ? 'C' : 'P'}` : 'N/A'}</div>
                    <div className="text-slate-400">Theta: {result.primaryExpiration ? result.primaryExpiration.thetaRisk.toUpperCase() : 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="-mt-4 rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] p-[0.5rem_0.65rem] text-[0.74rem] text-slate-300">
              <span className="text-[0.64rem] font-extrabold uppercase text-slate-500">Trade Brief:</span>{' '}
              {result.tradeSnapshot?.oneLine || `${result.symbol} ${thesisDirection.toUpperCase()} setup with ${(result.compositeScore?.confidence ?? 0).toFixed(0)}% confidence — ${commandStatus}.`}
            </div>

            <div className={`-mt-[0.85rem] rounded-[10px] border px-[0.7rem] py-[0.55rem] ${tradeabilityToneClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem]">
                <span className="font-extrabold uppercase tracking-[0.05em]">Tradeability State</span>
                <span className="font-black">{tradeabilityState === 'EXECUTABLE' ? '🟢 EXECUTABLE' : tradeabilityState === 'CONDITIONAL' ? '🟡 CONDITIONAL' : '🔴 AVOID'}</span>
              </div>
            </div>

            {isGuidedMode && (
              <div className="-mt-[0.85rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-[0.7rem] py-[0.55rem]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[0.74rem]">
                  <span className="text-slate-300">Guided mode keeps Analyst sections collapsed for faster decision flow.</span>
                  <button
                    type="button"
                    onClick={() => setOperatorViewMode('advanced')}
                    className="rounded-full border border-[var(--msp-border-strong)] bg-[var(--msp-accent-glow)] px-3 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.05em] text-[var(--msp-accent)]"
                  >
                    Show Full Analysis
                  </button>
                </div>
              </div>
            )}

            <div className="-mt-[0.85rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] p-[0.58rem_0.72rem]">
              <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.04em] text-slate-400">Workflow Layers</div>
              <div className="mt-[0.35rem] grid gap-[0.25rem] text-[0.72rem] text-slate-300 md:grid-cols-2">
                <div><span className="font-extrabold text-slate-200">Layer 1 — Decision Panel:</span> score, bias, risk, trigger, tradeability</div>
                <div><span className="font-extrabold text-slate-200">Layer 2 — Evidence Stack:</span> confluence proof, contracts, greeks, validation</div>
                <div><span className="font-extrabold text-slate-200">Layer 3 — Analyst Mode (Advanced):</span> narrative + diagnostics, collapsed by default</div>
              </div>
            </div>

            <div className="-mt-[0.95rem] flex flex-wrap items-center gap-[0.45rem]">
              {([
                { key: 'evidence', label: '1) Evidence', count: `${result.confluenceStack} TF` },
                { key: 'contracts', label: '2) Contracts & Greeks', count: result.primaryStrike ? 'Ready' : 'N/A' },
                { key: 'narrative', label: '3) Analyst Narrative (Advanced)', count: `${(result.tradeSnapshot?.why || []).length || 0} notes` },
                { key: 'logs', label: '4) Execution Diagnostics (Advanced)', count: `${(result.disclaimerFlags?.length || 0) + (result.dataConfidenceCaps?.length || 0)}` },
              ] as const)
                .filter((section) => !isGuidedMode || (section.key !== 'narrative' && section.key !== 'logs'))
                .map((section) => (
                <button
                  key={section.key}
                  onClick={() => activateSection(section.key)}
                  className={`inline-flex cursor-pointer items-center gap-[0.35rem] rounded-full border border-[var(--msp-border)] px-[0.6rem] py-[0.3rem] text-[0.68rem] font-extrabold uppercase tracking-[0.04em] ${trapDoors[section.key] ? 'bg-[var(--msp-panel)] text-[var(--msp-text)]' : 'bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
                >
                  <span>{section.label}</span>
                  <span className="font-bold normal-case text-slate-500">({section.count})</span>
                </button>
              ))}
            </div>

            <div className="-mt-[0.65rem] grid gap-[0.45rem]">
              {([
                { key: 'evidence', title: '1) Evidence', subtitle: 'Confluence map, decision card, and setup proof stack' },
                { key: 'contracts', title: '2) Contracts & Greeks', subtitle: 'Strike, expiry, open interest, greeks, and risk setup' },
                { key: 'narrative', title: '3) Analyst Narrative (Advanced)', subtitle: 'Institutional brain summary and long-form interpretation' },
                { key: 'logs', title: '4) Execution Diagnostics (Advanced)', subtitle: 'Warnings, data quality, and execution diagnostic notes' },
              ] as const)
                .filter((door) => !isGuidedMode || (door.key !== 'narrative' && door.key !== 'logs'))
                .filter((door) => !trapDoors[door.key])
                .map((door) => (
                  <button
                    key={`collapsed-${door.key}`}
                    onClick={() => activateSection(door.key)}
                    className="grid w-full cursor-pointer gap-[0.18rem] rounded-[10px] border border-dashed border-[var(--msp-border)] bg-[var(--msp-panel)] p-[0.58rem_0.7rem] text-left"
                  >
                    <div className="text-[0.75rem] font-extrabold uppercase tracking-[0.04em] text-slate-200">
                      {door.title} • Collapsed
                    </div>
                    <div className="text-[0.72rem] text-slate-400">{door.subtitle}</div>
                    <div className="text-[0.68rem] font-bold text-slate-500">Click to expand</div>
                  </button>
                ))}
            </div>

            {trapDoors.evidence && (
              <div ref={(element) => { sectionAnchorsRef.current.evidence = element; }} className="-mt-[0.2rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-[0.7rem] py-[0.4rem] text-[0.72rem]">
                <span className="font-extrabold uppercase tracking-[0.04em] text-slate-300">Section 1 — Evidence</span>
                <span className="ml-2 text-slate-500">Confluence + structure + setup confirmation</span>
              </div>
            )}

            {trapDoors.evidence && focusMode && (
              <div className="grid gap-[0.45rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] p-[0.72rem_0.82rem] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                <div><div className="text-[0.64rem] font-bold uppercase text-slate-500">Direction</div><div className={`font-black ${thesisDirection === 'bullish' ? 'text-emerald-500' : thesisDirection === 'bearish' ? 'text-red-500' : 'text-amber-500'}`}>{thesisDirection.toUpperCase()}</div></div>
                <div><div className="text-[0.64rem] font-bold uppercase text-slate-500">Confidence</div><div className="font-black text-slate-200">{(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div></div>
                <div><div className="text-[0.64rem] font-bold uppercase text-slate-500">Entry</div><div className="font-extrabold text-[var(--msp-text)]">{result.tradeLevels ? `${result.tradeLevels.entryZone.low.toFixed(2)}-${result.tradeLevels.entryZone.high.toFixed(2)}` : 'N/A'}</div></div>
                <div><div className="text-[0.64rem] font-bold uppercase text-slate-500">Invalidation</div><div className="font-extrabold text-red-300">{result.tradeLevels ? result.tradeLevels.stopLoss.toFixed(2) : 'N/A'}</div></div>
                <div className="col-[1/-1]"><div className="text-[0.64rem] font-bold uppercase text-slate-500">Targets</div><div className="font-extrabold text-emerald-300">{result.tradeLevels ? `${result.tradeLevels.target1.price.toFixed(2)}${result.tradeLevels.target2 ? ` / ${result.tradeLevels.target2.price.toFixed(2)}` : ''}` : 'N/A'}</div></div>
              </div>
            )}

            {trapDoors.evidence && terminalDecisionCard && (
              <div className={`rounded-[14px] border border-[var(--msp-border-strong)] border-l-[3px] bg-[var(--msp-panel)] p-[0.95rem_1rem] shadow-[var(--msp-shadow)] ${adaptiveModeMeta.accentBorderClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-[0.6rem]">
                  <div className="text-[0.72rem] font-bold uppercase text-slate-400">AI Trade Command Card</div>
                  <div className="text-[0.86rem] font-extrabold text-slate-200">Conviction {terminalDecisionCard.conviction}%</div>
                </div>

                <div className="mt-[0.35rem] text-[0.74rem] text-slate-300">
                  <span className={`font-extrabold ${adaptiveModeMeta.accentTextClass}`}>TERMINAL MODE: {adaptiveModeMeta.label}</span>
                  <span className="text-slate-500"> • </span>
                  <span className="text-slate-400">{adaptiveModeMeta.reason}</span>
                </div>

                <div className="mt-[0.55rem] grid gap-[0.4rem] [grid-template-columns:repeat(auto-fit,minmax(175px,1fr))]">
                  <div className="rounded-lg bg-[var(--msp-panel-2)] p-2">
                    <div className="text-[0.64rem] font-bold uppercase text-slate-500">Direction</div>
                    <div className="text-[0.82rem] font-black text-slate-50">{terminalDecisionCard.direction}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--msp-panel-2)] p-2">
                    <div className="text-[0.64rem] font-bold uppercase text-slate-500">Best Setup</div>
                    <div className="text-[0.82rem] font-extrabold text-slate-50">{terminalDecisionCard.setup}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--msp-panel-2)] p-2">
                    <div className="text-[0.64rem] font-bold uppercase text-slate-500">Expected Move</div>
                    <div className="text-[0.82rem] font-extrabold text-slate-50">{terminalDecisionCard.expectedMove}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--msp-panel-2)] p-2">
                    <div className="text-[0.64rem] font-bold uppercase text-slate-500">Invalidation</div>
                    <div className="text-[0.82rem] font-extrabold text-red-300">{terminalDecisionCard.invalidation}</div>
                  </div>
                </div>

                <div className="mt-2 text-[0.78rem] text-slate-300">
                  <span className="font-bold text-emerald-200">Key Trigger:</span> {terminalDecisionCard.trigger}
                </div>

                {adaptiveTerminalMode === 'TRANSITION_MODE' && (
                  <div className="mt-2 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.45rem_0.55rem] text-[0.72rem] font-bold text-[var(--msp-muted)]">
                    SIGNAL TIMELINE: Flow shift → Momentum confirmation → Trigger validation
                  </div>
                )}
              </div>
            )}

            {trapDoors.evidence && (
            <div className={`grid items-stretch gap-[0.85rem] ${adaptiveModeMeta.layout.columnsClass}`}>
              <div className={`grid gap-[0.45rem] rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 ${adaptiveModeMeta.layout.signalOrderClass}`}>
                <div className="text-[0.7rem] font-bold uppercase text-slate-400">Signal Stack</div>
                {terminalSignalStack.map((item) => (
                  <div key={item.label} className="rounded-lg bg-black/20 p-[0.45rem_0.5rem]">
                    <div className="flex items-center justify-between gap-[0.4rem]">
                      <div className="text-[0.74rem] font-extrabold text-slate-200">
                        {item.label}
                        {copilotPresence?.watchSet.includes(item.label) && (
                          <span className="ml-1.5 text-[0.66rem] font-bold text-[var(--msp-accent)]">★ AI Watching</span>
                        )}
                      </div>
                      <div className="text-[0.74rem] font-extrabold text-[var(--msp-muted)]">{item.score}%</div>
                    </div>
                    <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-slate-500/25">
                      <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
                        <rect x="0" y="0" width={Math.max(0, Math.min(item.score, 100))} height="1" rx="0.5" ry="0.5" fill="var(--msp-accent)" />
                      </svg>
                    </div>
                    <div className="mt-[0.18rem] text-[0.68rem] text-slate-400">{item.state} • {item.summary}</div>
                  </div>
                ))}
              </div>

              <div className={`grid gap-[0.6rem] rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 ${adaptiveModeMeta.layout.marketOrderClass}`}>
                <div className="text-[0.7rem] font-bold uppercase text-slate-400">Market Surface</div>
                {confluenceRadar && (
                  <div className="flex items-center justify-center">
                    <svg width="190" height="190" viewBox={`0 0 ${confluenceRadar.size} ${confluenceRadar.size}`} role="img" aria-label="Confluence Radar Mini">
                      {confluenceRadar.ringPolygons.map((ring, idx) => (
                        <polygon key={`mini-ring-${idx}`} points={ring} fill="none" stroke="var(--msp-border)" strokeWidth={idx === confluenceRadar.ringPolygons.length - 1 ? 1.15 : 0.85} />
                      ))}
                      {confluenceRadar.axisLines.map((line, idx) => (
                        <line key={`mini-axis-${idx}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="var(--msp-text-faint)" strokeWidth={1} />
                      ))}
                      <polygon points={confluenceRadar.dataPolygon} fill="var(--msp-accent-glow)" stroke="var(--msp-accent)" strokeWidth={2} />
                    </svg>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-[0.35rem]">
                  <div className="rounded-lg bg-black/20 p-[0.45rem]">
                    <div className="text-[0.62rem] font-bold uppercase text-slate-500">Current Price</div>
                    <div className="text-[0.8rem] font-extrabold text-slate-50">${formatPrice(result.currentPrice)}</div>
                  </div>
                  <div className="rounded-lg bg-black/20 p-[0.45rem]">
                    <div className="text-[0.62rem] font-bold uppercase text-slate-500">Expected Move</div>
                    <div className={`font-extrabold ${adaptiveTerminalMode === 'HIGH_VOL_EVENT_MODE' ? 'text-[1rem] text-red-300' : 'text-[0.8rem] text-slate-50'}`}>
                      {result.expectedMove ? `±${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`grid gap-[0.45rem] rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 ${adaptiveModeMeta.layout.execOrderClass} ${adaptiveModeMeta.layout.execOpacityClass}`}>
                <div className="text-[0.7rem] font-bold uppercase text-slate-400">Execution Panel</div>
                <div className="rounded-lg bg-black/20 p-[0.45rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Entry Zone</div>
                  <div className="text-[0.8rem] font-extrabold text-slate-50">{result.tradeLevels ? `${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}` : 'Await setup'}</div>
                </div>
                <div className="rounded-lg bg-black/20 p-[0.45rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Stop / Invalidation</div>
                  <div className="text-[0.8rem] font-extrabold text-red-300">{result.tradeLevels ? result.tradeLevels.stopLoss.toFixed(2) : (result.tradeSnapshot?.risk?.invalidationReason || 'N/A')}</div>
                </div>
                <div className="rounded-lg bg-black/20 p-[0.45rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Target / R:R</div>
                  <div className="text-[0.8rem] font-extrabold text-emerald-200">{result.tradeLevels ? `${result.tradeLevels.target1.price.toFixed(2)} • ${result.tradeLevels.riskRewardRatio.toFixed(1)}:1` : 'Await trigger'}</div>
                </div>
                <div className="text-[0.7rem] text-slate-400">Permission: <span className={`font-extrabold ${tradePermission === 'ALLOWED' ? 'text-emerald-500' : tradePermission === 'BLOCKED' ? 'text-red-500' : 'text-amber-500'}`}>{tradePermission}</span></div>

                {copilotPresence && (
                  <div className="mt-1 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.45rem_0.5rem]">
                    <div className="text-[0.66rem] font-extrabold uppercase text-[var(--msp-accent)]">Co-Pilot Suggestion</div>
                    <div className="mt-[0.2rem] text-[0.74rem] font-bold text-slate-200">{copilotPresence.suggestion.action}</div>
                    <div className="mt-[0.15rem] text-[0.7rem] text-slate-400">{copilotPresence.suggestion.reason}</div>
                  </div>
                )}
              </div>
            </div>
            )}

            {trapDoors.evidence && copilotPresence && copilotPresence.notices.length > 0 && (
              <div className="grid gap-[0.42rem] rounded-xl border border-slate-400/25 bg-[var(--msp-panel)] p-[0.65rem_0.75rem]">
                <div className="text-[0.68rem] font-bold uppercase text-slate-400">Co-Pilot Notices</div>
                {copilotPresence.notices.map((notice, index) => (
                  <div key={`${notice.title}-${index}`} className={`rounded-lg border p-[0.4rem_0.48rem] ${notice.level === 'warn' ? 'border-red-500/25 bg-red-500/10' : notice.level === 'action' ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-slate-400/25 bg-slate-400/10'}`}>
                    <div className="text-[0.72rem] font-extrabold text-slate-200">
                      {notice.level === 'warn' ? '⚠️' : notice.level === 'action' ? '✅' : '⚡'} Co-Pilot Notice • {notice.title}
                    </div>
                    <div className="mt-[0.14rem] text-[0.7rem] text-slate-400">{notice.message}</div>
                  </div>
                ))}
              </div>
            )}

            {trapDoors.evidence && confluenceRadar && (
              <div className="rounded-[14px] border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[0.9rem_1rem]">
                <div className="flex flex-wrap items-center justify-between gap-[0.6rem]">
                  <div className="text-[0.72rem] font-bold uppercase text-slate-400">MSP Signature • Confluence Radar</div>
                  <div className="text-[0.9rem] font-black text-[var(--msp-accent)]">Composite {confluenceRadar.composite}%</div>
                </div>

                <div className="mt-[0.55rem] grid items-center gap-3 [grid-template-columns:minmax(220px,260px)_minmax(0,1fr)]">
                  <div className="flex justify-center">
                    <svg width={confluenceRadar.size} height={confluenceRadar.size} viewBox={`0 0 ${confluenceRadar.size} ${confluenceRadar.size}`} role="img" aria-label="Confluence Radar">
                      {confluenceRadar.ringPolygons.map((ring, idx) => (
                        <polygon
                          key={`ring-${idx}`}
                          points={ring}
                          fill="none"
                          stroke="var(--msp-border)"
                          strokeWidth={idx === confluenceRadar.ringPolygons.length - 1 ? 1.3 : 0.9}
                        />
                      ))}

                      {confluenceRadar.axisLines.map((line, idx) => (
                        <line
                          key={`axis-${idx}`}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke="var(--msp-text-faint)"
                          strokeWidth={1}
                        />
                      ))}

                      <polygon
                        points={confluenceRadar.dataPolygon}
                        fill="var(--msp-accent-glow)"
                        stroke="var(--msp-accent)"
                        strokeWidth={2}
                      />

                      {confluenceRadar.axisLabels.map((label) => (
                        <text
                          key={label.key}
                          x={label.x}
                          y={label.y}
                          fill="var(--msp-text-muted)"
                          fontSize="10"
                          fontWeight="700"
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {label.key}
                        </text>
                      ))}
                    </svg>
                  </div>

                  <div className="grid gap-[0.35rem] [grid-template-columns:repeat(auto-fit,minmax(145px,1fr))]">
                    {confluenceRadar.axes.map((axis) => (
                      <div key={axis.key} className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                        <div className="text-[0.64rem] font-bold uppercase text-slate-500">{axis.key}</div>
                        <div className="text-[0.8rem] font-extrabold text-slate-200">{axis.value}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {trapDoors.evidence && (
            <div className={`rounded-[14px] border border-[var(--msp-border-strong)] border-l-[3px] bg-[var(--msp-panel)] p-[0.8rem_0.95rem] shadow-[var(--msp-shadow)] ${modeAccentBorderClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-[0.6rem]">
                <div className="text-[0.72rem] font-bold uppercase text-slate-400">Institutional Lens State</div>
                <div className={`text-[0.92rem] font-black tracking-[0.4px] ${modeAccentClass}`}>{lensDisplayMode}</div>
              </div>
              <div className="mt-[0.4rem] text-[0.78rem] text-slate-300">
                {marketRegimeIntel?.regime === 'CHAOTIC_NEWS' && '🚫 NO TRADE ENVIRONMENT — chaotic/news-dominated phase detected. Preserve capital and wait for stability.'}
                {institutionalLensMode === 'OBSERVE' && marketRegimeIntel?.regime !== 'CHAOTIC_NEWS' && 'Market reading mode: structure, flow, and regime first. Execution intentionally de-emphasized.'}
                {institutionalLensMode === 'WATCH' && 'Setup identified but not permitted. Focus on pattern, confluence, and confirmation triggers.'}
                {institutionalLensMode === 'ARMED' && 'Institutional alignment confirmed. Execution panel prioritized; non-essential analysis collapsed.'}
                {institutionalLensMode === 'EXECUTE' && (hasActiveTradeForSymbol ? 'Live management mode active. Focus on risk, flow shifts, and exit discipline.' : 'Extreme confidence focus mode active. Only execution-critical data remains visible.')}
              </div>
              <div className="mt-2 grid gap-[0.35rem] [grid-template-columns:repeat(auto-fit,minmax(165px,1fr))]">
                <div className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                  <div className="text-[0.64rem] font-bold uppercase text-slate-500">MRI Regime</div>
                  <div className="text-[0.77rem] font-extrabold text-slate-200">{marketRegimeIntel?.regime || 'UNKNOWN'}</div>
                </div>
                <div className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                  <div className="text-[0.64rem] font-bold uppercase text-slate-500">MRI Confidence</div>
                  <div className="text-[0.77rem] font-extrabold text-slate-200">{marketRegimeIntel ? `${Math.round(marketRegimeIntel.confidence * 100)}%` : '—'}</div>
                </div>
                <div className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                  <div className="text-[0.64rem] font-bold uppercase text-slate-500">Adaptive Confidence</div>
                  <div className="text-[0.77rem] font-extrabold text-slate-200">{Math.round(adaptiveConfidenceScore)}% ({adaptiveConfidenceBand})</div>
                </div>
                <div className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                  <div className="text-[0.64rem] font-bold uppercase text-slate-500">Risk Modifier</div>
                  <div className="text-[0.77rem] font-extrabold text-slate-200">{marketRegimeIntel?.risk_modifier?.toFixed(2) ?? '—'}</div>
                </div>
              </div>
            </div>
            )}

            {trapDoors.evidence && result.institutionalIntent && (
              <div className="rounded-[14px] border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[0.85rem_0.95rem]">
                <div className="flex flex-wrap items-center justify-between gap-[0.6rem]">
                  <div className="text-[0.72rem] font-bold uppercase text-slate-400">Institutional Intent</div>
                  <div className={`text-[0.84rem] font-black tracking-[0.3px] ${result.institutionalIntent.primary_intent === 'UNKNOWN' ? 'text-red-300' : 'text-[var(--msp-accent)]'}`}>
                    {result.institutionalIntent.primary_intent}
                  </div>
                </div>

                {result.institutionalIntent.primary_intent === 'UNKNOWN' ? (
                  <div className="mt-2 text-[0.8rem] text-red-300">
                    🚫 {result.institutionalIntent.reason === 'DATA_INSUFFICIENT' ? 'Intent unavailable — DATA_INSUFFICIENT' : 'Intent unavailable'}
                  </div>
                ) : (
                  <>
                    <div className="mt-[0.45rem]">
                      <div className="mb-[0.2rem] flex justify-between text-[0.72rem] text-slate-400">
                        <span>Confidence</span>
                        <span>{Math.round(result.institutionalIntent.intent_confidence * 100)}%</span>
                      </div>
                      <div className="h-[6px] overflow-hidden rounded-full bg-slate-500/25">
                        <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
                          <rect
                            x="0"
                            y="0"
                            width={Math.max(0, Math.min(Math.round(result.institutionalIntent.intent_confidence * 100), 100))}
                            height="1"
                            rx="0.5"
                            ry="0.5"
                            fill="var(--msp-accent)"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="mt-[0.55rem] grid gap-[0.35rem] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
                      <div className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                        <div className="text-[0.64rem] font-bold uppercase text-slate-500">Expected Path</div>
                        <div className="text-[0.77rem] font-extrabold text-slate-200">
                          {result.institutionalIntent.expected_path === 'chop' ? '↔ CHOP' :
                           result.institutionalIntent.expected_path === 'mean-revert' ? '↩ MEAN REVERT' :
                           result.institutionalIntent.expected_path === 'expand' ? '↗ EXPAND' :
                           '🚀 EXPANSION CONTINUATION'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-black/20 p-[0.42rem_0.5rem]">
                        <div className="text-[0.64rem] font-bold uppercase text-slate-500">Permission Bias</div>
                        <div className={`text-[0.77rem] font-black ${result.institutionalIntent.permission_bias === 'LONG' ? 'text-emerald-500' : result.institutionalIntent.permission_bias === 'SHORT' ? 'text-red-500' : 'text-amber-500'}`}>
                          {result.institutionalIntent.permission_bias}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid gap-[0.2rem]">
                      {(result.institutionalIntent.notes || []).slice(0, 3).map((note, idx) => (
                        <div key={idx} className="text-[0.76rem] text-slate-300">• {note}</div>
                      ))}
                    </div>

                    <details className="mt-[0.45rem]">
                      <summary className="cursor-pointer text-[0.72rem] text-slate-400">Show intent probabilities</summary>
                      <div className="mt-[0.4rem] grid gap-[0.2rem]">
                        {(Object.entries(result.institutionalIntent.intent_probabilities) as Array<[InstitutionalIntentState, number]>)
                          .sort((a, b) => b[1] - a[1])
                          .map(([intent, probability]) => (
                            <div key={intent} className="flex justify-between text-[0.74rem] text-slate-300">
                              <span>{intent}</span>
                              <span>{(probability * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}

            {trapDoors.evidence && (institutionalLensMode === 'ARMED' || institutionalLensMode === 'EXECUTE') && (
              <div className={`grid gap-[0.9rem] rounded-[18px] border border-[var(--msp-border-strong)] border-l-[3px] bg-[var(--msp-panel)] p-[1rem_1.1rem] ${modeAccentBorderClass}`}>
                {institutionalLensMode === 'ARMED' ? (
                  <>
                    <div className="text-[0.95rem] font-black tracking-[0.35px] text-slate-200">████ EXECUTION CARD ████</div>
                    <div className="grid gap-[0.55rem] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Entry Zone</div>
                        <div className="text-[0.88rem] font-extrabold text-slate-200">{result.tradeLevels ? `${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}` : 'Await trigger'}</div>
                      </div>
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Invalidation</div>
                        <div className="text-[0.88rem] font-extrabold text-red-300">{result.tradeLevels ? `${result.tradeLevels.stopLoss.toFixed(2)}` : 'N/A'}</div>
                      </div>
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Targets</div>
                        <div className="text-[0.88rem] font-extrabold text-emerald-300">{result.tradeLevels ? `${result.tradeLevels.target1.price.toFixed(2)} / ${result.tradeLevels.target2?.price?.toFixed(2) || '—'}` : 'N/A'}</div>
                      </div>
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">R:R + Size</div>
                        <div className="text-[0.88rem] font-extrabold text-slate-200">{result.tradeLevels ? `${result.tradeLevels.riskRewardRatio.toFixed(1)}:1` : '—'} • {result.maxRiskPercent}%</div>
                      </div>
                    </div>
                    <div className="text-[0.8rem] text-slate-300">
                      <span className="font-bold text-emerald-200">Why this trade:</span> {(result.tradeSnapshot?.why || primaryWhyItems).slice(0, 2).join(' • ')}
                    </div>
                    <div className="text-[0.8rem] text-slate-300">
                      <span className="font-bold text-red-300">Risk summary:</span> {riskState} • {decisionTrigger}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[0.95rem] font-black tracking-[0.35px] text-slate-200">████ LIVE MANAGEMENT ████</div>
                    <div className="grid gap-[0.55rem] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Live PnL</div>
                        <div className="text-[0.88rem] font-extrabold text-slate-200">Track in Journal / Broker</div>
                      </div>
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Risk Exposure</div>
                        <div className="text-[0.88rem] font-extrabold text-red-300">{result.maxRiskPercent}% max risk • {riskState}</div>
                      </div>
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Flow Changes</div>
                        <div className="text-[0.88rem] font-extrabold text-slate-200">{institutionalFlowState}</div>
                      </div>
                      <div className="rounded-[10px] bg-black/20 p-[0.55rem_0.65rem]">
                        <div className="text-[0.66rem] font-bold uppercase text-slate-500">Exit Conditions</div>
                        <div className="text-[0.88rem] font-extrabold text-emerald-300">{result.tradeSnapshot?.risk?.invalidationReason || 'Stop/invalidation breached'}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {(
              <>

            {/* Institutional Header Layer (3-second trader test) */}
            <div className="rounded-2xl border border-[var(--msp-border-strong)] border-l-[3px] border-l-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[0.9rem_1rem] shadow-[var(--msp-shadow)]">
              <div className="mb-[0.6rem] text-[0.72rem] font-extrabold uppercase tracking-[0.45px] text-[var(--msp-muted)]">
                Institutional State
              </div>
              <div className="grid gap-[0.45rem] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.5rem_0.6rem]">
                  <div className="text-[0.66rem] font-bold uppercase text-slate-500">Flow State</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{institutionalFlowState}</div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.5rem_0.6rem]">
                  <div className="text-[0.66rem] font-bold uppercase text-slate-500">Market Regime</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{institutionalMarketRegime}</div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.5rem_0.6rem]">
                  <div className="text-[0.66rem] font-bold uppercase text-slate-500">Trade Permission</div>
                  <div className={`font-black ${tradePermission === 'ALLOWED' ? 'text-emerald-500' : tradePermission === 'BLOCKED' ? 'text-red-500' : 'text-amber-500'}`}>
                    {tradePermission}
                  </div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.5rem_0.6rem]">
                  <div className="text-[0.66rem] font-bold uppercase text-slate-500">Confidence</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div>
                </div>
              </div>
            </div>

            {/* Primary Intelligence Panel (Cognitive Anchor) */}
            <div className="grid min-h-[clamp(220px,32vh,380px)] gap-[0.8rem] rounded-[18px] border border-[var(--msp-border-strong)] border-l-[3px] border-l-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[1.1rem_1.2rem] shadow-[var(--msp-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[0.95rem] font-black tracking-[0.4px] text-slate-50">
                  ⭐ MSP AI SIGNAL
                </div>
                <div className="rounded-full border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-[2px] text-[0.72rem] font-bold text-[var(--msp-muted)]">
                  Powered by Nasdaq BX + FMV Options (LIVE)
                </div>
              </div>

              <div className="grid items-start gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                <div className="text-[0.83rem] leading-[1.5] text-slate-300">
                  <div><span className="font-bold uppercase text-slate-500">Market Mode:</span> <span className="font-extrabold text-slate-50">{marketStateLabel || 'Unknown'} {thesisDirection === 'bullish' ? '↑' : thesisDirection === 'bearish' ? '↓' : '→'}</span></div>
                  <div><span className="font-bold uppercase text-slate-500">Setup Type:</span> <span className="font-extrabold text-slate-50">{setupLabel || 'Awaiting Confirmation'}</span></div>
                </div>
                <div className={`min-w-[190px] justify-self-end rounded-[10px] p-[0.45rem_0.6rem] text-right ${commandStatusToneCardClass}`}>
                  <div className="text-[0.66rem] font-bold uppercase text-slate-500">Confidence Score</div>
                  <div className={`text-[1.15rem] font-black ${commandStatusClass}`}>{(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div>
                </div>
              </div>

              <div className="grid gap-[0.45rem] rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.72rem]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[0.72rem] font-extrabold uppercase text-[var(--msp-accent)]">
                    MSP AI Personality Match
                  </div>
                  {adaptiveMatch?.hasProfile && (
                    <div className={adaptiveMatch.noTradeBias ? 'font-extrabold text-red-500' : 'font-extrabold text-emerald-500'}>
                      {adaptiveMatch.noTradeBias ? 'NO-TRADE FILTER ACTIVE' : 'PROFILE ALIGNED'}
                    </div>
                  )}
                </div>

                <div className="grid items-center gap-[0.4rem] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                  <div>
                    <div className="text-[0.67rem] font-bold uppercase text-slate-400">Setup Fit Score</div>
                    <div className="text-[1.02rem] font-black text-slate-50">
                      {adaptiveMatch?.personalityMatch ?? 50}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.67rem] font-bold uppercase text-slate-400">Adaptive Confidence</div>
                    <div className={`text-[1.02rem] font-black ${(adaptiveMatch?.adaptiveScore ?? 50) >= 70 ? 'text-emerald-500' : (adaptiveMatch?.adaptiveScore ?? 50) >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {adaptiveMatch?.adaptiveScore ?? (result.compositeScore?.confidence ?? 50)}%
                    </div>
                  </div>
                  <div className="text-right text-[0.72rem] text-slate-400">
                    {adaptiveMatch?.hasProfile
                      ? `Profile from ${adaptiveMatch.sampleSize} closed trades (${adaptiveMatch.wins} wins)`
                      : (personalityLoaded ? 'Profile warming up from Journal data' : 'Loading Journal profile...')}
                  </div>
                </div>

                <div className="grid gap-1">
                  {(adaptiveMatch?.reasons || ['Build profile by logging and closing trades in Trade Journal']).map((reason, idx) => (
                    <div key={idx} className="text-[0.78rem] text-slate-200">✔ {reason}</div>
                  ))}
                </div>
              </div>

              {result.institutionalFilter && (
                <div className={`rounded-xl bg-slate-950/30 p-[0.65rem_0.72rem] ${result.institutionalFilter.noTrade ? 'border border-red-500/45' : 'border border-slate-400/35'}`}>
                  <div className="mb-[0.35rem] flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[0.72rem] font-extrabold uppercase text-[var(--msp-muted)]">
                      Institutional Filters
                    </div>
                    <div className={`text-[0.76rem] font-extrabold ${result.institutionalFilter.noTrade ? 'text-red-500' : 'text-emerald-500'}`}>
                      FINAL QUALITY: {result.institutionalFilter.finalGrade} ({Number(result.institutionalFilter.finalScore ?? 0).toFixed(0)})
                    </div>
                  </div>

                  <div className="grid gap-[0.2rem]">
                    {(result.institutionalFilter.filters || []).slice(0, 4).map((filter, idx) => (
                      <div key={idx} className="text-[0.74rem] text-slate-300">
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

              <div className="rounded-xl border border-slate-400/20 bg-black/20 p-3">
                <div className="mb-[0.45rem] text-[0.75rem] font-extrabold uppercase text-emerald-200">
                  Why This Exists
                </div>
                <div className="grid gap-[0.32rem]">
                  {primaryWhyItems.slice(0, 3).map((reason, idx) => (
                    <div key={idx} className="text-[0.8rem] text-slate-200">✔ {reason}</div>
                  ))}
                </div>
              </div>

              <div className="grid items-center gap-2 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                <div className="text-[0.8rem] text-slate-300">
                  <span className="font-bold uppercase text-slate-500">Risk State:</span>{' '}
                  <span className={`font-extrabold ${riskState === 'NORMAL' ? 'text-emerald-500' : riskState === 'ELEVATED' ? 'text-amber-500' : 'text-red-500'}`}>{riskState}</span>
                </div>
                <div className="text-right text-[0.8rem] text-slate-300">
                  <span className="font-bold uppercase text-slate-500">Primary Action:</span>{' '}
                  <span className="font-extrabold text-slate-50">{decisionTrigger.toUpperCase()}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem]">
                <div className="text-emerald-200">LIVE DATA STATUS: Nasdaq BX ✔ • FMV Options ✔</div>
                <div className="text-slate-400">
                  {liveLatencySeconds !== null ? `Latency: ${liveLatencySeconds.toFixed(1)}s` : 'Latency: n/a'}
                </div>
              </div>
            </div>

            {/* Decision Ladder - Institutional validation pipeline */}
            {institutionalLensMode === 'OBSERVE' && (
            <div className="rounded-[14px] border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[0.9rem_1rem]">
              <div className="mb-[0.8rem] flex flex-wrap items-center justify-between gap-3">
                <div className="text-[0.9rem] font-extrabold tracking-[0.4px] text-slate-200">
                  🪜 DECISION LADDER
                </div>
                <div className="flex items-center gap-2 text-[0.74rem]">
                  <span className="font-bold uppercase text-slate-400">Trade Pipeline:</span>
                  <span className="font-extrabold text-slate-200">{pipelineComplete} / {ladderSteps.length} Complete</span>
                  <span className="text-slate-500">•</span>
                  <span className={`uppercase font-extrabold ${pipelineStatus === 'READY' ? 'text-emerald-500' : pipelineStatus === 'WAITING' ? 'text-amber-500' : 'text-red-500'}`}>
                    {pipelineStatus}
                  </span>
                </div>
              </div>

              <div className="grid gap-2">
                {ladderSteps.map((step, index) => {
                  const visual = stateVisual(step.state);
                  return (
                    <div key={step.title} className="grid gap-[0.45rem]">
                      <div className={`flex items-center justify-between gap-2 rounded-[10px] p-[0.55rem_0.7rem] ${visual.containerClass}`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`text-[0.85rem] font-extrabold ${visual.textClass}`}>{visual.icon}</span>
                          <span className="text-[0.78rem] font-bold text-slate-200">{step.title}</span>
                        </div>
                        <span className={`text-[0.68rem] font-extrabold uppercase ${visual.textClass}`}>{visual.label}</span>
                      </div>
                      <div className="pl-[0.35rem] text-[0.74rem] text-slate-400">{step.detail}</div>
                      {index < ladderSteps.length - 1 && (
                        <div className="pl-[0.35rem] text-[0.74rem] text-slate-500">↓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* Trader Eye Path Layout (Z-Flow) */}
            {institutionalLensMode === 'OBSERVE' && (
            <div className="grid gap-[0.9rem] rounded-2xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[0.85rem] font-extrabold tracking-[0.4px] text-slate-200">
                  👁️ TRADER EYE PATH
                </div>
                <div className="text-[0.72rem] text-slate-500">Left → Center → Right → Down</div>
              </div>

              <div className="grid gap-[0.45rem] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                {heatSignalStrip.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-[0.45rem] rounded-lg border border-slate-400/25 bg-black/20 p-[0.42rem_0.5rem] text-[0.7rem]">
                    <span className="font-bold text-slate-400">{item.label}</span>
                    <span className="font-bold text-slate-200">{item.state} {item.value}</span>
                  </div>
                ))}
              </div>

              {/* Z-Flow 2x2: info-left/action-right */}
              <div className="grid gap-[0.7rem] [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                {/* Top Left: Bias / Regime / Trend */}
                <div className="rounded-[10px] border border-slate-400/25 bg-black/20 p-[0.65rem]">
                  <div className="mb-[0.45rem] text-[0.72rem] font-extrabold uppercase text-[var(--msp-muted)]">Top Left • Market Condition</div>
                  <div className="mb-[0.3rem] text-[1rem] font-black text-slate-50">
                    {result.symbol} — {thesisDirection.toUpperCase()} BIAS
                  </div>
                  <div className="text-[0.78rem] leading-[1.45] text-slate-300">
                    <div>Regime: {marketStateLabel || 'Unknown'}</div>
                    <div>Trend Alignment: {trendStrength}</div>
                    <div>Session: {result.entryTiming.marketSession || 'n/a'}</div>
                  </div>
                </div>

                {/* Top Right: Setup Status */}
                <div className="rounded-[10px] border border-slate-400/25 bg-black/20 p-[0.65rem]">
                  <div className="mb-[0.45rem] text-[0.72rem] font-extrabold uppercase text-amber-300">Top Right • Setup Status</div>
                  <div className={`mb-[0.4rem] rounded-[10px] p-[0.55rem_0.65rem] ${commandStatusToneCardClass}`}>
                    <div className={`text-[1rem] font-black ${commandStatusClass}`}>{commandStatus}</div>
                    <div className="text-[0.76rem] text-slate-300">Pipeline {pipelineComplete}/{ladderSteps.length} complete</div>
                  </div>
                  <div className="text-[0.76rem] text-slate-300">
                    Confidence {(result.compositeScore?.confidence ?? 0).toFixed(0)}% • Data {dataHealth}
                  </div>
                </div>

                {/* Bottom Left: Pattern + Confluence */}
                <div className="rounded-[10px] border border-slate-400/25 bg-black/20 p-[0.65rem]">
                  <div className="mb-[0.45rem] text-[0.72rem] font-extrabold uppercase text-emerald-200">Bottom Left • Pattern + Confluence</div>
                  <div className="text-[0.78rem] leading-[1.45] text-slate-200">
                    <div>Pattern: {hasConfirmedPattern && bestPattern ? bestPattern.name : 'No clean pattern'}</div>
                    <div>HTF: {result.confluenceStack >= 3 ? 'Aligned' : 'Mixed'}</div>
                    <div>Confluence: {(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div>
                    <div>Direction Score: {result.compositeScore?.directionScore?.toFixed(0) ?? '0'}</div>
                  </div>
                </div>

                {/* Bottom Right: Execution + Risk */}
                <div className="rounded-[10px] border border-slate-400/25 bg-black/20 p-[0.65rem]">
                  <div className="mb-[0.45rem] text-[0.72rem] font-extrabold uppercase text-violet-300">Bottom Right • Execution + Risk</div>
                  <div className="text-[0.77rem] leading-[1.45] text-slate-200">
                    <div>ENTRY: {result.tradeLevels ? `${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}` : 'WAIT'}</div>
                    <div>STOP: {result.tradeLevels ? result.tradeLevels.stopLoss.toFixed(2) : 'N/A'}</div>
                    <div>R:R: {result.tradeLevels ? `${result.tradeLevels.riskRewardRatio.toFixed(1)}:1` : 'N/A'}</div>
                    <div>Expected Move: {result.expectedMove ? `${result.expectedMove.selectedExpiryPercent.toFixed(1)}%` : 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Dominant Trader Decision Block */}
              <div className="rounded-xl border border-[var(--msp-border-strong)] border-l-[3px] border-l-[var(--msp-border)] bg-[var(--msp-panel-2)] p-[0.8rem_0.9rem] shadow-[var(--msp-shadow)]">
                <div className="mb-[0.3rem] text-[0.69rem] uppercase tracking-[0.45px] text-slate-400">
                  Trader Decision
                </div>
                <div className={`mb-[0.45rem] text-[1.05rem] font-black ${commandStatusClass}`}>
                  SETUP STATUS: {commandStatus}
                </div>

                <div className="mb-[0.35rem] text-[0.77rem] text-slate-300">
                  <span className="font-bold text-slate-50">Reason:</span>
                </div>
                <div className="mb-[0.55rem] grid gap-1">
                  {(decisionReasons.length ? decisionReasons : ['Momentum divergence', 'Liquidity below ideal threshold', 'Confluence below activation threshold']).map((reason, idx) => (
                    <div key={idx} className="text-[0.76rem] text-slate-300">• {reason}</div>
                  ))}
                </div>

                <div className="text-[0.77rem] text-slate-300">
                  <span className="font-bold text-slate-50">Next Trigger:</span> {decisionTrigger}
                </div>
                <div className="mt-[0.45rem] text-[0.72rem] text-[var(--msp-muted)]">
                  Powered by Nasdaq BX + FMV Options (LIVE)
                </div>
              </div>

              {/* Lower Why Panel */}
              <div className="rounded-[10px] border border-slate-400/25 bg-black/20 p-[0.65rem]">
                <div className="mb-[0.4rem] text-[0.72rem] font-extrabold uppercase text-violet-300">🧠 Why Panel</div>
                <div className="text-[0.76rem] leading-[1.5] text-slate-300">
                  {(result.tradeSnapshot?.why && result.tradeSnapshot.why.length > 0)
                    ? result.tradeSnapshot.why.slice(0, 4).join(' • ')
                    : `${result.unusualActivity?.hasUnusualActivity ? 'Unusual activity detected' : 'No unusual options flow'} • OI sentiment ${result.openInterestAnalysis?.sentiment || 'neutral'} • ${hasConfirmedPattern && bestPattern ? `Pattern ${bestPattern.name}` : 'Pattern not confirmed'} • ${result.aiMarketState?.thesis?.summary || 'Awaiting stronger thesis confirmation'}`}
                </div>
              </div>
            </div>
            )}
            
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* ⚠️ CRITICAL WARNINGS (Earnings, FOMC, Data Quality) */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {diagnosticsVisible && (
              <div ref={(element) => { sectionAnchorsRef.current.logs = element; }} className="-mt-[0.2rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-[0.7rem] py-[0.4rem] text-[0.72rem]">
                <span className="font-extrabold uppercase tracking-[0.04em] text-slate-300">Section 4 — Execution Diagnostics (Advanced)</span>
                <span className="ml-2 text-slate-500">Risk flags, data quality, confidence caps, execution notes</span>
              </div>
            )}

            {diagnosticsVisible && (result.disclaimerFlags && result.disclaimerFlags.length > 0) && (
              <div className="rounded-2xl border-2 border-red-500 bg-[var(--msp-bear-tint)] p-[1rem_1.25rem]">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[1.25rem]">🚨</span>
                  <span className="text-[0.9rem] font-bold uppercase tracking-[0.5px] text-red-500">
                    Critical Risk Events
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {result.disclaimerFlags.map((flag, idx) => (
                    <div key={idx} className="rounded-lg bg-black/20 px-3 py-2 text-[0.875rem] font-medium text-red-300">
                      {flag}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Data Quality & Execution Notes */}
            {diagnosticsVisible && ((result.executionNotes && result.executionNotes.length > 0) || 
              (result.dataConfidenceCaps && result.dataConfidenceCaps.length > 0)) && (
              <details className="rounded-xl border border-amber-500/40 bg-[var(--msp-warn-tint)] p-[0.875rem_1rem]">
                <summary className="flex cursor-pointer list-none items-center gap-2">
                  <span className="text-[1rem]">📋</span>
                  <span className="text-[0.8rem] font-bold uppercase text-amber-500">
                    System Diagnostics (Advanced)
                  </span>
                  {result.dataQuality && (
                    <span className={`ml-auto rounded-md px-2 py-[2px] text-[0.7rem] font-semibold ${result.dataQuality.freshness === 'REALTIME' ? 'bg-emerald-500/20 text-emerald-500' : result.dataQuality.freshness === 'DELAYED' ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'}`}>
                      {result.dataQuality.freshness} DATA
                    </span>
                  )}
                </summary>
                <div className="mt-[0.6rem] flex flex-wrap gap-2">
                  {result.dataConfidenceCaps?.map((cap, idx) => (
                    <span key={`cap-${idx}`} className="rounded-md bg-black/20 px-2 py-1 text-[0.75rem] text-amber-300">
                      ⚠️ {cap}
                    </span>
                  ))}
                  {result.executionNotes?.map((note, idx) => (
                    <span key={`note-${idx}`} className="rounded-md bg-black/15 px-2 py-1 text-[0.75rem] text-slate-400">
                      💡 {note}
                    </span>
                  ))}
                </div>
              </details>
            )}

            {/* 3-SECOND VIEW - Trade Snapshot */}
            <div className="rounded-2xl border border-[var(--msp-border-strong)] border-l-[3px] border-l-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[1rem_1.1rem] shadow-[var(--msp-shadow)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[0.95rem] font-extrabold tracking-[0.4px] text-slate-200">
                  🚨 TRADE SNAPSHOT (3-SECOND VIEW)
                </div>
                <div className={`text-[0.9rem] font-extrabold ${result.direction === 'bullish' ? 'text-emerald-500' : result.direction === 'bearish' ? 'text-red-500' : 'text-amber-500'}`}>
                  {result.symbol} — {result.tradeSnapshot?.verdict ? result.tradeSnapshot.verdict.replace('_', ' ') : (result.direction === 'bullish' ? 'BULLISH EDGE' : result.direction === 'bearish' ? 'BEARISH EDGE' : 'WAIT / NEUTRAL')} ({result.tradeSnapshot?.setupGrade || result.tradeQuality})
                </div>
              </div>

              {((result.tradeSnapshot?.timing?.catalyst && result.tradeSnapshot.timing.catalyst.length > 0) ||
                (result.candleCloseConfluence && result.candleCloseConfluence.bestEntryWindow.endMins > 0)) && (
                <div className="mb-3 rounded-[10px] border border-amber-400/35 bg-amber-400/10 p-[0.45rem_0.6rem] text-[0.85rem] font-bold text-amber-300">
                  🔥 {result.tradeSnapshot?.timing?.catalyst || (`TIME EDGE ACTIVE: ${result.candleCloseConfluence?.bestEntryWindow.startMins === 0 ? 'NOW' : `${result.candleCloseConfluence?.bestEntryWindow.startMins} min`} until TF compression release`)}
                </div>
              )}

              <div className="grid gap-[0.45rem]">
                {result.tradeSnapshot?.oneLine && (
                  <div className="text-[0.87rem] text-slate-200">
                    <span className="font-bold text-emerald-200">WHAT:</span>{' '}
                    {result.tradeSnapshot.oneLine}
                  </div>
                )}

                <div className="text-[0.87rem] text-slate-200">
                  <span className="font-bold text-[var(--msp-muted)]">WHY:</span>{' '}
                  {result.tradeSnapshot?.why?.length
                    ? result.tradeSnapshot.why.join(' • ')
                    : result.professionalTradeStack
                      ? `${result.professionalTradeStack.structureState.state} + ${result.professionalTradeStack.liquidityContext.state} + ${result.professionalTradeStack.timeEdge.state} + ${result.professionalTradeStack.optionsEdge.state}`
                      : `${result.signalStrength.toUpperCase()} signal with ${result.confluenceStack} TF confluence and ${result.openInterestAnalysis?.sentiment || 'neutral'} options sentiment`}
                </div>

                <div className="text-[0.87rem] text-slate-200">
                  <span className="font-bold text-red-300">RISK:</span>{' '}
                  {result.tradeSnapshot?.risk?.invalidationReason
                    ? result.tradeSnapshot.risk.invalidationReason
                    : result.tradeLevels
                    ? `Lose $${result.tradeLevels.stopLoss.toFixed(2)} → setup invalid`
                    : result.aiMarketState?.thesis?.invalidationLevel
                      ? `Lose $${result.aiMarketState.thesis.invalidationLevel.toFixed(2)} → setup invalid`
                      : 'Directional invalidation not clear yet — reduce size / wait'}
                </div>

                <div className="text-[0.87rem] text-slate-200">
                  <span className="font-bold text-emerald-300">ACTION:</span>{' '}
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

            {/* 📈 PATTERN FORMATION - moved before Decision Engine (WHY before ACT) */}
            {(() => {
              const biasAligned = !!bestPattern && (
                bestPattern.bias === 'neutral' ||
                bestPattern.bias === result.direction
              );

              return (
                <div className="rounded-2xl border border-[var(--msp-border-strong)] border-l-[3px] border-l-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-[0.85rem_1rem] shadow-[var(--msp-shadow)]">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[0.9rem] font-black tracking-[0.35px] text-slate-200">
                      🧩 PATTERN FORMATION
                    </div>
                    <span className={`rounded-full border px-[10px] py-[3px] text-[0.68rem] font-bold uppercase ${hasConfirmedPattern && bestPattern?.bias === 'bullish' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : hasConfirmedPattern && bestPattern?.bias === 'bearish' ? 'border-red-500/50 bg-red-500/20 text-red-300' : hasConfirmedPattern ? 'border-amber-500/50 bg-amber-500/20 text-amber-300' : 'border-amber-500/50 bg-amber-500/20 text-amber-300'}`}>
                      {hasConfirmedPattern ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>

                  <div className="grid gap-[0.45rem] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                    <div className="rounded-[10px] bg-black/20 p-[0.5rem_0.6rem]">
                      <div className="text-[0.66rem] font-bold uppercase text-slate-500">Pattern</div>
                        <div className={`text-[0.86rem] font-extrabold ${!bestPattern ? 'text-amber-500' : bestPattern.bias === 'bullish' ? 'text-emerald-500' : bestPattern.bias === 'bearish' ? 'text-red-500' : 'text-amber-500'}`}>{bestPattern?.name || 'No clear pattern yet'}</div>
                    </div>
                    <div className="rounded-[10px] bg-black/20 p-[0.5rem_0.6rem]">
                      <div className="text-[0.66rem] font-bold uppercase text-slate-500">Strength</div>
                      <div className="text-[0.86rem] font-extrabold text-slate-200">{bestPattern ? `${bestPattern.confidence.toFixed(0)}%` : '—'}</div>
                    </div>
                    <div className="rounded-[10px] bg-black/20 p-[0.5rem_0.6rem]">
                      <div className="text-[0.66rem] font-bold uppercase text-slate-500">Bias Align</div>
                        <div className={`text-[0.86rem] font-extrabold ${biasAligned ? 'text-emerald-500' : 'text-amber-500'}`}>{biasAligned ? 'YES' : 'MIXED'}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* 🎯 DECISION ENGINE - The ONE card that answers "Should I trade this?" */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <div className="rounded-[20px] border border-[var(--msp-border-strong)] border-l-[3px] border-l-[var(--msp-border-strong)] bg-[var(--msp-card)] p-[clamp(1rem,3vw,1.75rem)] shadow-[var(--msp-shadow)]">
              {/* Header Row */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-400/20 pb-4">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="rounded-[10px] bg-[var(--msp-accent)] px-4 py-[6px] text-[13px] font-bold tracking-[0.5px] text-white">
                    🎯 DECISION ENGINE
                  </span>
                  <span className="text-[14px] text-slate-500">
                    {symbol.toUpperCase()} • ${result.currentPrice.toFixed(2)}
                  </span>
                </div>
                
                {/* Entry Status Badge */}
                <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${result.entryTiming.urgency === 'immediate' || result.entryTiming.urgency === 'within_hour' ? 'border-emerald-500/50 bg-emerald-500/20' : result.entryTiming.urgency === 'wait' ? 'border-amber-500/50 bg-amber-500/20' : 'border-red-500/50 bg-red-500/20'}`}>
                  <span className="text-[0.9rem]">{urgencyEmoji(result.entryTiming.urgency)}</span>
                  <span className={`text-[13px] font-bold uppercase ${result.entryTiming.urgency === 'immediate' || result.entryTiming.urgency === 'within_hour' ? 'text-emerald-500' : result.entryTiming.urgency === 'wait' ? 'text-amber-500' : 'text-red-500'}`}>
                    {result.entryTiming.urgency === 'no_trade' ? 'NO TRADE' : result.entryTiming.urgency.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Compressed KPI Strip */}
              <div className="mb-[1.2rem] flex flex-wrap gap-2">
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.45rem_0.65rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Edge</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{probabilityResult?.winProbability ? `${probabilityResult.winProbability.toFixed(0)}%` : '—'}</div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.45rem_0.65rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Probability</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{(result.compositeScore?.confidence ?? 0).toFixed(0)}%</div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.45rem_0.65rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Risk</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{result.tradeLevels ? `1:${result.tradeLevels.riskRewardRatio.toFixed(1)}` : '—'}</div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.45rem_0.65rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Flow</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{result.openInterestAnalysis?.sentiment?.toUpperCase() || 'NEUTRAL'}</div>
                </div>
                <div className="rounded-[10px] border border-slate-400/25 bg-slate-900/45 p-[0.45rem_0.65rem]">
                  <div className="text-[0.62rem] font-bold uppercase text-slate-500">Strategy</div>
                  <div className="text-[0.85rem] font-extrabold text-slate-200">{(result.strategyRecommendation?.strategy || 'N/A').toUpperCase()}</div>
                </div>
              </div>

              {/* Conflicts Warning (if any) */}
              {(result.compositeScore?.conflicts?.length ?? 0) > 0 && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <div className="mb-2 flex items-center gap-2 font-bold text-red-500">
                    ⚠️ SIGNAL CONFLICTS DETECTED
                  </div>
                  <div className="text-[0.8rem] text-red-300">
                    {result.compositeScore?.conflicts?.map((conflict, i) => (
                      <div key={i} className="mb-1">• {conflict}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entry Window Info */}
              <div className="entry-timing-row rounded-xl bg-[var(--msp-panel-2)] p-4">
                <div>
                  <div className="mb-1 text-[0.75rem] font-semibold text-[var(--msp-muted)]">
                    ENTRY WINDOW
                  </div>
                  <div className="font-medium text-slate-200">
                    {result.entryTiming.idealEntryWindow}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[0.75rem] font-semibold text-[var(--msp-muted)]">
                    SESSION
                  </div>
                  <div className="font-medium text-slate-200">
                    {result.entryTiming.marketSession === 'regular' ? '🟢 Market Open' :
                     result.entryTiming.marketSession === 'premarket' ? '🌅 Pre-Market' :
                     result.entryTiming.marketSession === 'afterhours' ? '🌙 After Hours' :
                     '🔒 Closed'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[0.75rem] font-semibold text-[var(--msp-muted)]">
                    CONFLUENCE
                  </div>
                  <div className="font-medium text-slate-200">
                    {result.candleCloseConfluence 
                      ? `${result.candleCloseConfluence.confluenceRating.toUpperCase()} (${result.candleCloseConfluence.confluenceScore}%)`
                      : `${result.confluenceStack} TFs`}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[0.75rem] font-semibold text-[var(--msp-muted)]">
                    ALIGNMENT
                  </div>
                  <div className={`font-semibold ${result.compositeScore && result.compositeScore.confidence >= 70 ? 'text-emerald-500' : result.compositeScore && result.compositeScore.confidence >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>
                    {result.compositeScore ? `${result.compositeScore.confidence.toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>

              {/* Quality Reasons (collapsible summary) */}
              <details className="mt-4">
                <summary className="cursor-pointer py-2 text-[0.8rem] text-slate-500">
                  📋 Quality Factors ({result.qualityReasons.length})
                </summary>
                <div className="mt-2 pl-4 text-[0.75rem] text-slate-400">
                  {result.qualityReasons.map((r, i) => (
                    <div key={i} className="mb-1">• {r}</div>
                  ))}
                </div>
              </details>
            </div>

            {/* Pattern panel intentionally rendered above Decision Engine */}

            {/* PRO TRADER SECTION - Collapsible */}
            {narrativeVisible && (
              <div ref={(element) => { sectionAnchorsRef.current.narrative = element; }} className="-mt-[0.2rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-[0.7rem] py-[0.4rem] text-[0.72rem]">
                <span className="font-extrabold uppercase tracking-[0.04em] text-slate-300">Section 3 — Analyst Narrative (Advanced)</span>
                <span className="ml-2 text-slate-500">Institutional interpretation and strategy rationale</span>
              </div>
            )}

            {narrativeVisible && (
            <details className="mb-4 rounded-[16px] border border-[var(--msp-border-strong)] bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
              <summary className="mb-5 flex cursor-pointer list-none items-center gap-3 border-b border-violet-500/30 pb-3">
                <span className="text-[1.5rem]">🎯</span>
                <h2 className="m-0 flex-1 text-[1.25rem] text-slate-200">Institutional Brain Summary</h2>
                <span className="rounded-lg bg-violet-500/20 px-[10px] py-1 text-[0.75rem] text-[var(--msp-muted)]">
                  ▼ Show Details
                </span>
              </summary>

              <div className="mb-4 grid gap-[0.35rem] rounded-xl border border-slate-400/25 bg-slate-900/45 p-3">
                <div className="text-[0.66rem] font-bold uppercase text-slate-500">State</div>
                <div className={`text-[0.95rem] font-black ${commandStatusClass}`}>{commandStatus}</div>
                <div className="text-[0.78rem] text-slate-300">Institutional Flow: {institutionalFlowState}</div>
                <div className={`text-[0.78rem] font-extrabold ${tradePermission === 'ALLOWED' ? 'text-emerald-500' : tradePermission === 'BLOCKED' ? 'text-red-500' : 'text-amber-500'}`}>
                  Trade Permission: {tradePermission}
                </div>
              </div>

              {/* COMPOSITE SCORE & STRATEGY - TOP OF PRO SECTION */}
              {result.compositeScore && (
                <div className="mb-6">
                  {/* Strategy Recommendation Banner */}
                  {result.strategyRecommendation && (
                    <div className={`mb-4 rounded-2xl border border-[var(--msp-border-strong)] border-l-[3px] p-5 ${result.strategyRecommendation.strategyType === 'sell_premium' ? 'border-l-red-500/65 bg-red-500/20' : result.strategyRecommendation.strategyType === 'buy_premium' ? 'border-l-emerald-500/65 bg-emerald-500/20' : 'border-l-slate-500/65 bg-slate-400/20'}`}>
                      <div className="trade-levels-row">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-[1.25rem]">
                              {result.strategyRecommendation.strategyType === 'sell_premium' ? '💰' :
                               result.strategyRecommendation.strategyType === 'buy_premium' ? '📈' : '⚖️'}
                            </span>
                            <span className={`text-[1.4rem] font-bold ${result.strategyRecommendation.strategyType === 'sell_premium' ? 'text-red-400' : result.strategyRecommendation.strategyType === 'buy_premium' ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {result.strategyRecommendation.strategy}
                            </span>
                            <span className={`rounded-full px-2 py-[2px] text-[0.7rem] font-semibold ${result.strategyRecommendation.riskProfile === 'defined' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                              {result.strategyRecommendation.riskProfile === 'defined' ? '✓ Defined Risk' : '⚠️ Undefined Risk'}
                            </span>
                          </div>
                          <div className="mb-2 text-[0.85rem] text-slate-300">
                            {result.strategyRecommendation.reason}
                          </div>
                          {result.strategyRecommendation.strikes && (
                            <div className="text-[0.8rem] text-slate-400">
                              {result.strategyRecommendation.strikes.long && (
                                <span>Long: ${result.strategyRecommendation.strikes.long} </span>
                              )}
                              {result.strategyRecommendation.strikes.short && (
                                <span>Short: ${result.strategyRecommendation.strikes.short}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="mb-1 text-[0.75rem] text-slate-500">Risk / Reward</div>
                          <div className="text-[0.8rem] text-red-300">Max Risk: {result.strategyRecommendation.maxRisk}</div>
                          <div className="text-[0.8rem] text-emerald-300">Max Reward: {result.strategyRecommendation.maxReward}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Composite Score Card */}
                  <div className="mb-4 rounded-xl border border-violet-500/40 bg-slate-800/80 p-4">
                    <div className="flex-wrap-mobile mb-4 flex items-center justify-between gap-4">
                      <div>
                        <div className="mb-1 text-[0.85rem] text-slate-400">Composite Signal</div>
                        <div className={`text-[clamp(1.1rem,4vw,1.75rem)] font-bold ${result.compositeScore.finalDirection === 'bullish' ? 'text-emerald-500' : result.compositeScore.finalDirection === 'bearish' ? 'text-red-500' : 'text-amber-500'}`}>
                          {result.compositeScore.finalDirection.toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-wrap-mobile flex gap-4">
                        <div className="text-center">
                          <div className={`text-[clamp(1rem,3vw,1.5rem)] font-bold ${result.compositeScore.directionScore > 0 ? 'text-emerald-500' : result.compositeScore.directionScore < 0 ? 'text-red-500' : 'text-amber-500'}`}>
                            {result.compositeScore.directionScore > 0 ? '+' : ''}{result.compositeScore.directionScore.toFixed(0)}
                          </div>
                          <div className="text-[0.7rem] text-slate-500">Score</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-[clamp(1rem,3vw,1.5rem)] font-bold ${result.compositeScore.confidence >= 70 ? 'text-emerald-500' : result.compositeScore.confidence >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {result.compositeScore.confidence.toFixed(0)}%
                          </div>
                          <div className="text-[0.7rem] text-slate-500">Confidence</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[clamp(1rem,3vw,1.5rem)] font-bold text-violet-500">
                            {result.compositeScore.alignedCount}/{result.compositeScore.totalSignals}
                          </div>
                          <div className="text-[0.7rem] text-slate-500">Aligned</div>
                        </div>
                      </div>
                    </div>

                    {/* Signal Components - With weight % and proper color grading */}
                    <div className="mb-4">
                      <div className="mb-2 text-[0.8rem] text-slate-400">Signal Components (weighted):</div>
                      <div className="card-grid-mobile gap-2">
                        {result.compositeScore.components.map((comp, idx) => {
                          // Color based on strength, not just direction
                          const isStrong = Math.abs(comp.score) >= 50;
                          const isMedium = Math.abs(comp.score) >= 25;
                          const barClass = comp.direction === 'neutral'
                            ? 'text-slate-500 border-l-slate-500'
                            : isStrong
                              ? (comp.direction === 'bullish' ? 'text-emerald-500 border-l-emerald-500' : 'text-red-500 border-l-red-500')
                              : isMedium
                                ? (comp.direction === 'bullish' ? 'text-emerald-300 border-l-emerald-300' : 'text-red-300 border-l-red-300')
                                : 'text-slate-400 border-l-slate-400';
                          const cardToneClass = comp.direction === 'neutral'
                            ? 'bg-slate-500/15'
                            : isStrong
                              ? (comp.direction === 'bullish' ? 'bg-emerald-500/15' : 'bg-red-500/15')
                              : isMedium
                                ? (comp.direction === 'bullish' ? 'bg-emerald-500/10' : 'bg-red-500/10')
                                : 'bg-slate-500/10';
                          const barFillTextClass = comp.direction === 'neutral'
                            ? 'text-slate-400'
                            : isStrong
                              ? (comp.direction === 'bullish' ? 'text-emerald-500' : 'text-red-500')
                              : isMedium
                                ? (comp.direction === 'bullish' ? 'text-emerald-300' : 'text-red-300')
                                : 'text-slate-400';
                          const strengthOpacityClass = isStrong ? 'opacity-100' : isMedium ? 'opacity-[0.85]' : 'opacity-[0.65]';
                          
                          return (
                            <div key={idx} className={`rounded-lg border-l-[3px] p-[0.5rem_0.75rem] text-[0.75rem] ${cardToneClass} ${barClass} ${strengthOpacityClass}`}>
                              <div className="mb-1 flex items-center justify-between">
                                <span className="font-semibold text-slate-200">
                                  {comp.name}
                                  <span className="ml-1 text-[0.6rem] font-normal text-slate-500">({(comp.weight * 100).toFixed(0)}%)</span>
                                </span>
                                <span className={`font-bold ${barClass.includes('text-') ? barClass.split(' ')[0] : ''}`}>
                                  {comp.direction === 'neutral' ? '—' : comp.direction === 'bullish' ? '↑' : '↓'}
                                  {' '}{Math.abs(comp.score).toFixed(0)}
                                </span>
                              </div>
                              <div className="text-[0.65rem] text-slate-400">{comp.reason}</div>
                              <div className="mt-1 h-1 overflow-hidden rounded-[2px] bg-slate-500/30">
                                <svg viewBox="0 0 100 1" preserveAspectRatio="none" className={`h-full w-full ${barFillTextClass}`} aria-hidden="true">
                                  <rect x="0" y="0" width={Math.max(0, Math.min(Math.abs(comp.score), 100))} height="1" rx="0.5" ry="0.5" fill="currentColor" />
                                </svg>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conflicts Warning */}
                    {result.compositeScore.conflicts.length > 0 && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/15 p-3">
                        <div className="mb-2 text-[0.8rem] font-semibold text-red-300">
                          ⚠️ Signal Conflicts Detected
                        </div>
                        {result.compositeScore.conflicts.map((conflict, idx) => (
                          <div key={idx} className="mb-1 text-[0.75rem] text-rose-300">
                            {conflict}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="card-grid-mobile gap-4">
                
                {/* IV Analysis Card */}
                {result.ivAnalysis && (
                  <div className="rounded-xl border border-violet-500/30 bg-slate-800/80 p-4">
                    <h4 className="mb-3 mt-0 text-[0.9rem] text-violet-500">📊 IV Rank / Percentile</h4>
                    <div className="mb-3 flex flex-wrap gap-4">
                      <div className="text-center">
                        <div className={`text-[1.75rem] font-bold ${result.ivAnalysis.ivRank >= 70 ? 'text-red-500' : result.ivAnalysis.ivRank <= 30 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {result.ivAnalysis.ivRank}%
                        </div>
                        <div className="text-[0.7rem] text-slate-400">IV Rank</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[1.25rem] font-bold text-slate-300">
                          {(result.ivAnalysis.currentIV * 100).toFixed(0)}%
                        </div>
                        <div className="text-[0.7rem] text-slate-400">Current IV</div>
                      </div>
                    </div>
                    <div className={`rounded-lg p-2 text-[0.75rem] ${result.ivAnalysis.ivSignal === 'sell_premium' ? 'bg-red-500/20 text-red-300' : result.ivAnalysis.ivSignal === 'buy_premium' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {result.ivAnalysis.ivSignal === 'sell_premium' ? '💰 SELL Premium' :
                       result.ivAnalysis.ivSignal === 'buy_premium' ? '📈 BUY Premium' : '⚖️ Neutral'}
                      <div className="mt-1 text-[0.65rem] opacity-80">
                        {result.ivAnalysis.ivReason}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expected Move Card */}
                {result.expectedMove && (
                  <div className="rounded-xl border border-[var(--msp-border)] bg-slate-800/80 p-4">
                    <h4 className="mb-3 mt-0 text-[0.9rem] text-[var(--msp-muted)]">📏 Expected Move</h4>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.75rem] text-slate-400">Weekly (7 DTE):</span>
                        <span className="font-bold text-[var(--msp-muted)]">
                          ±${result.expectedMove.weekly.toFixed(2)} ({result.expectedMove.weeklyPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[0.75rem] text-slate-400">Monthly (30 DTE):</span>
                        <span className="font-bold text-blue-400">
                          ±${result.expectedMove.monthly.toFixed(2)} ({result.expectedMove.monthlyPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between rounded-md bg-[var(--msp-panel-2)] p-2">
                        <span className="text-[0.75rem] text-[var(--msp-muted)]">Selected Expiry:</span>
                        <span className="font-bold text-[var(--msp-muted)]">
                          ±${result.expectedMove.selectedExpiry.toFixed(2)} ({result.expectedMove.selectedExpiryPercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-[0.65rem] text-slate-500">
                      Based on 1 standard deviation (68% probability)
                    </div>
                  </div>
                )}

                {/* Unusual Activity Card */}
                {result.unusualActivity && (
                  <div className={`rounded-xl bg-slate-800/80 p-4 ${result.unusualActivity.alertLevel === 'high' ? 'border border-red-500/50' : result.unusualActivity.alertLevel === 'moderate' ? 'border border-amber-500/50' : 'border border-slate-500/30'}`}>
                    <h4 className="mb-3 mt-0 text-[0.9rem] text-amber-500">
                      🔥 Unusual Activity
                      {result.unusualActivity.alertLevel === 'high' && (
                        <span className="ml-2 rounded-full bg-red-500/30 px-2 py-[2px] text-[0.65rem] text-red-300">
                          HIGH ALERT
                        </span>
                      )}
                    </h4>
                    
                    {result.unusualActivity.hasUnusualActivity ? (
                      <>
                        <div className={`mb-2 text-[0.85rem] ${result.unusualActivity.smartMoneyDirection === 'bullish' ? 'text-emerald-500' : result.unusualActivity.smartMoneyDirection === 'bearish' ? 'text-red-500' : 'text-slate-400'}`}>
                          Smart Money: {result.unusualActivity.smartMoneyDirection.toUpperCase()}
                        </div>
                        <div className="max-h-[120px] overflow-y-auto">
                          {result.unusualActivity.unusualStrikes.slice(0, 3).map((strike, idx) => (
                            <div key={idx} className={`mb-2 rounded-md p-[0.4rem_0.6rem] text-[0.75rem] ${strike.type === 'call' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                              <div className={`font-bold ${strike.type === 'call' ? 'text-emerald-500' : 'text-red-500'}`}>
                                ${strike.strike} {strike.type.toUpperCase()} - {strike.volumeOIRatio.toFixed(1)}x Vol/OI
                              </div>
                              <div className="text-[0.65rem] text-slate-400">
                                {strike.volume.toLocaleString()} vol / {strike.openInterest.toLocaleString()} OI
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-[0.8rem] text-slate-500">
                        No unusual options activity detected
                      </div>
                    )}
                  </div>
                )}

                {/* Trade Levels Card */}
                {result.tradeLevels && (
                  <div className="col-span-1 rounded-xl border border-emerald-500/30 bg-slate-800/80 p-4">
                    <h4 className="mb-3 mt-0 text-[0.9rem] text-emerald-500">
                      📍 Entry/Exit Levels
                      <span className={`ml-2 rounded-full px-2 py-[2px] text-[0.65rem] ${result.tradeLevels.riskRewardRatio >= 1.5 ? 'bg-emerald-500/30 text-emerald-300' : result.tradeLevels.riskRewardRatio >= 1.0 ? 'bg-amber-500/30 text-amber-300' : result.tradeLevels.riskRewardRatio >= 0.75 ? 'bg-orange-400/30 text-orange-300' : 'bg-red-500/30 text-red-300'}`}>
                        {result.tradeLevels.riskRewardRatio.toFixed(1)}:1 R:R
                      </span>
                    </h4>
                    
                    <div className="flex flex-col gap-[0.4rem] text-[0.8rem]">
                      <div className="flex justify-between">
                        <span className="text-[var(--msp-muted)]">📥 Entry Zone:</span>
                        <span className="font-bold text-[var(--msp-text)]">
                          ${result.tradeLevels.entryZone.low.toFixed(2)} - ${result.tradeLevels.entryZone.high.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-500">🛑 Stop Loss:</span>
                        <span className="font-bold text-red-300">
                          ${result.tradeLevels.stopLoss.toFixed(2)} ({result.tradeLevels.stopLossPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-500">🎯 Target 1 (50%):</span>
                        <span className="font-bold text-emerald-300">
                          ${result.tradeLevels.target1.price.toFixed(2)}
                        </span>
                      </div>
                      {result.tradeLevels.target2 && (
                        <div className="flex justify-between">
                          <span className="text-emerald-500">🎯 Target 2 (30%):</span>
                          <span className="text-emerald-300">
                            ${result.tradeLevels.target2.price.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {result.tradeLevels.target3 && (
                        <div className="flex justify-between">
                          <span className="text-emerald-500">🎯 Target 3 (20%):</span>
                          <span className="text-emerald-300">
                            ${result.tradeLevels.target3.price.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-[0.65rem] leading-[1.4] text-slate-500">
                      {result.tradeLevels.reasoning}
                    </div>
                  </div>
                )}

              </div>
            </details>
            )}

            {/* Confluence Info - Collapsible */}
            {institutionalLensMode === 'OBSERVE' && (
            <details className="rounded-[16px] border border-[var(--msp-border)] bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
              <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 border-b border-[var(--msp-border)] pb-3 text-violet-400">
                <span className="text-violet-500">🔮</span>
                <span>Confluence Analysis</span>
                <span className="ml-auto text-[0.7rem] text-slate-500">
                  {result.confluenceStack} TFs closing together • click to expand
                </span>
              </summary>
              <div className="confluence-info-row">
                <div className={`rounded-xl p-4 text-center ${result.confluenceStack >= 4 ? 'border border-emerald-500/40 bg-emerald-500/20' : result.confluenceStack >= 2 ? 'border border-transparent bg-violet-500/20' : 'border border-transparent bg-slate-500/20'}`}>
                  <div className={`text-[2rem] font-bold ${result.confluenceStack >= 4 ? 'text-emerald-500' : result.confluenceStack >= 2 ? 'text-violet-500' : 'text-slate-500'}`}>
                    {result.confluenceStack}
                  </div>
                  <div className="text-[0.8rem] text-slate-400">
                    {result.confluenceStack >= 4 ? 'TFs Closing Together 🔥' : 
                     result.confluenceStack >= 2 ? 'TFs Aligned' : 
                     result.confluenceStack === 1 ? 'TF Active' : 'No Clustering'}
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="mb-2 text-[0.85rem] text-slate-400">
                    {result.confluenceStack >= 2 ? 'Clustered Timeframes:' : 'Active Timeframes:'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.decompressingTFs.length > 0 ? result.decompressingTFs.map(tf => (
                      <span key={tf} className="rounded-full bg-violet-500/30 px-3 py-1 text-[0.85rem] text-violet-200">
                        {tf}
                      </span>
                    )) : (
                      <span className="text-[0.85rem] text-slate-500">No TFs actively aligned</span>
                    )}
                  </div>
                </div>
              </div>
            </details>
            )}

            {/* 🕐 CANDLE CLOSE CONFLUENCE - When multiple TFs close together */}
            {institutionalLensMode === 'OBSERVE' && result.candleCloseConfluence && (
              <div className={`rounded-[16px] border bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft ${result.candleCloseConfluence.confluenceRating === 'extreme' ? 'border-red-500/50' : result.candleCloseConfluence.confluenceRating === 'high' ? 'border-amber-500/50' : 'border-[var(--msp-border)]'}`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <h3 className="m-0 mb-4 text-[0.98rem] font-extrabold tracking-[0.3px] text-amber-500">
                    🕐 Candle Close Confluence
                    {result.candleCloseConfluence.confluenceRating === 'extreme' && (
                      <span className="ml-2 rounded-full bg-red-500/30 px-[10px] py-[3px] text-[0.68rem] font-bold uppercase tracking-[0.3px] text-red-300">
                        🔥 EXTREME
                      </span>
                    )}
                    {result.candleCloseConfluence.confluenceRating === 'high' && (
                      <span className="ml-2 rounded-full bg-amber-500/30 px-[10px] py-[3px] text-[0.68rem] font-bold uppercase tracking-[0.3px] text-amber-300">
                        ⚡ HIGH
                      </span>
                    )}
                  </h3>
                  <div className={`text-[1.5rem] font-bold ${result.candleCloseConfluence.confluenceScore >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>
                    Score: {result.candleCloseConfluence.confluenceScore}%
                  </div>
                </div>

                <div className="card-grid-mobile">
                  {/* Closing Now */}
                  <div className={`rounded-xl border-l-[3px] bg-slate-800/60 p-4 ${result.candleCloseConfluence.closingNow.count >= 2 ? 'border-l-emerald-500' : 'border-l-slate-500'}`}>
                    <div className="mb-2 text-[0.8rem] text-slate-400">Closing NOW (within 5 mins)</div>
                    <div className={`text-[1.5rem] font-bold ${result.candleCloseConfluence.closingNow.count >= 2 ? 'text-emerald-500' : 'text-slate-200'}`}>
                      {result.candleCloseConfluence.closingNow.count} TFs
                    </div>
                    {result.candleCloseConfluence.closingNow.count > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {result.candleCloseConfluence.closingNow.timeframes.map(tf => (
                          <span key={tf} className="rounded-full bg-emerald-500/20 px-2 py-[2px] text-[0.7rem] text-emerald-300">{tf}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Closing Soon */}
                  <div className="rounded-xl border-l-[3px] border-l-[var(--msp-muted)] bg-slate-800/60 p-4">
                    <div className="mb-2 text-[0.8rem] text-slate-400">Closing Soon (1-4 hours)</div>
                    <div className="text-[1.5rem] font-bold text-[var(--msp-muted)]">
                      {result.candleCloseConfluence.closingSoon.count} TFs
                    </div>
                    <div className="mt-1 text-[0.75rem] text-[var(--msp-text)]">
                      Peak: {result.candleCloseConfluence.closingSoon.peakCount} TFs in {result.candleCloseConfluence.closingSoon.peakConfluenceIn}m
                    </div>
                  </div>

                  {/* Special Events */}
                  <div className={`rounded-xl border-l-[3px] bg-slate-800/60 p-4 ${
                    result.candleCloseConfluence.specialEvents.isYearEnd ? 'border-l-red-500' :
                    result.candleCloseConfluence.specialEvents.isQuarterEnd ? 'border-l-amber-500' :
                    result.candleCloseConfluence.specialEvents.isMonthEnd ? 'border-l-violet-500' :
                    'border-l-slate-500'
                  }`}>
                    <div className="mb-2 text-[0.8rem] text-slate-400">Special Events</div>
                    <div className="flex flex-col gap-1">
                      {result.candleCloseConfluence.specialEvents.isYearEnd && (
                        <span className="text-[0.8rem] font-semibold text-red-300">📅 YEAR END</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.isQuarterEnd && (
                        <span className="text-[0.8rem] font-semibold text-amber-300">📅 QUARTER END</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.isMonthEnd && (
                        <span className="text-[0.8rem] font-semibold text-violet-200">📅 Month End</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.isWeekEnd && (
                        <span className="text-[0.8rem] text-slate-300">📅 Week End (Friday)</span>
                      )}
                      {result.candleCloseConfluence.specialEvents.sessionClose !== 'none' && (
                        <span className="text-[0.8rem] text-[var(--msp-text)]">
                          🌍 {result.candleCloseConfluence.specialEvents.sessionClose.toUpperCase()} Session Close
                        </span>
                      )}
                      {!result.candleCloseConfluence.specialEvents.isYearEnd && 
                       !result.candleCloseConfluence.specialEvents.isQuarterEnd && 
                       !result.candleCloseConfluence.specialEvents.isMonthEnd && 
                       !result.candleCloseConfluence.specialEvents.isWeekEnd &&
                       result.candleCloseConfluence.specialEvents.sessionClose === 'none' && (
                        <span className="text-[0.8rem] text-slate-500">No special events</span>
                      )}
                    </div>
                  </div>

                  {/* Best Entry Window */}
                  <div className="rounded-xl border-l-[3px] border-l-emerald-500 bg-slate-800/60 p-4">
                    <div className="mb-2 text-[0.8rem] text-slate-400">Best Entry Window</div>
                    <div className="text-[1.1rem] font-bold text-emerald-500">
                      {result.candleCloseConfluence.bestEntryWindow.startMins === 0 ? 'NOW' : `In ${result.candleCloseConfluence.bestEntryWindow.startMins}m`}
                      {' → '}{result.candleCloseConfluence.bestEntryWindow.endMins}m
                    </div>
                    <div className="mt-1 text-[0.75rem] text-emerald-300">
                      {result.candleCloseConfluence.bestEntryWindow.reason}
                    </div>
                  </div>
                </div>

                {/* Closing Soon Timeline */}
                {result.candleCloseConfluence.closingSoon.timeframes.length > 0 && (
                  <div className="mt-4 border-t border-slate-500/30 pt-4">
                    <div className="mb-2 text-[0.8rem] text-slate-400">Upcoming Candle Closes:</div>
                    <div className="flex flex-wrap gap-2">
                      {result.candleCloseConfluence.closingSoon.timeframes.slice(0, 8).map((item, idx) => (
                        <div key={idx} className={`rounded-lg border px-[10px] py-1 text-[0.75rem] ${item.weight >= 10 ? 'border-red-500/30 bg-red-500/15' : item.weight >= 5 ? 'border-amber-500/30 bg-amber-500/15' : 'border-slate-500/30 bg-slate-500/15'}`}>
                          <span className={`font-semibold ${item.weight >= 10 ? 'text-red-300' : item.weight >= 5 ? 'text-amber-300' : 'text-slate-300'}`}>{item.tf}</span>
                          <span className="text-slate-400"> in {item.minsAway}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {trapDoors.contracts && (
              <div ref={(element) => { sectionAnchorsRef.current.contracts = element; }} className="-mt-[0.2rem] rounded-[10px] border border-[var(--msp-border)] bg-[var(--msp-panel)] px-[0.7rem] py-[0.4rem] text-[0.72rem]">
                <span className="font-extrabold uppercase tracking-[0.04em] text-slate-300">Section 2 — Contracts & Greeks</span>
                <span className="ml-2 text-slate-500">Strike + expiry + OI + greeks + risk management</span>
              </div>
            )}

            {/* Strike & Expiration Recommendations */}
            {trapDoors.contracts && result.direction !== 'neutral' && (
              <div className="card-grid-mobile">
                
                {/* Strike Recommendation */}
                <div className="rounded-[16px] border border-emerald-500/40 bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
                  <h3 className="mb-4 text-[0.98rem] font-extrabold tracking-[0.3px] text-emerald-500">🎯 Recommended Strike</h3>
                  
                  {result.primaryStrike ? (
                    <>
                      <div className={`mb-4 rounded-xl p-5 ${result.primaryStrike.type === 'call' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                        <div className="mb-3 flex items-center justify-between">
                          <span className={`text-[1.75rem] font-bold ${result.primaryStrike.type === 'call' ? 'text-emerald-500' : 'text-red-500'}`}>
                            ${result.primaryStrike.strike} {result.primaryStrike.type.toUpperCase()}
                          </span>
                          <span className={`rounded-md px-[10px] py-1 text-[0.75rem] font-bold ${result.primaryStrike.moneyness === 'ATM' ? 'bg-amber-500/30' : 'bg-slate-500/30'}`}>
                            {result.primaryStrike.moneyness}
                          </span>
                        </div>
                        
                        <div className="mb-3 text-[0.85rem] text-slate-400">
                          {result.primaryStrike.reason}
                        </div>
                        
                        <div className="grid-equal-2-col-responsive gap-3 text-[0.8rem]">
                          <div>
                            <span className="text-slate-500">Est. Delta:</span>
                            <span className="ml-1.5 font-bold text-slate-200">
                              {(result.primaryStrike.estimatedDelta * (result.primaryStrike.type === 'call' ? 1 : -1)).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Distance:</span>
                            <span className="ml-1.5 text-slate-200">
                              {result.primaryStrike.distanceFromPrice > 0 ? '+' : ''}{result.primaryStrike.distanceFromPrice.toFixed(2)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Target Level:</span>
                            <span className="ml-1.5 text-emerald-500">
                              ${formatPrice(result.primaryStrike.targetLevel)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Confidence:</span>
                            <span className="ml-1.5 text-slate-200">
                              {result.primaryStrike.confidenceScore.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {result.alternativeStrikes.length > 0 && (
                        <div>
                          <div className="mb-2 text-[0.8rem] text-slate-500">Alternative Strikes:</div>
                          {result.alternativeStrikes.map((s, i) => (
                            <div key={i} className="mb-2 rounded-lg bg-[var(--msp-panel-2)] p-3 text-[0.85rem]">
                              <span className={`font-bold ${s.type === 'call' ? 'text-emerald-500' : 'text-red-500'}`}>
                                ${s.strike} {s.type.toUpperCase()}
                              </span>
                              <span className="ml-2 text-slate-500">({s.moneyness})</span>
                              <div className="mt-1 text-[0.75rem] text-slate-400">{s.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      No clear strike recommendation - wait for directional signal
                    </div>
                  )}
                </div>

                {/* Expiration Recommendation */}
                <div className="rounded-[16px] border border-[var(--msp-border)] bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
                  <h3 className="mb-4 text-[0.98rem] font-extrabold tracking-[0.3px] text-[var(--msp-muted)]">📅 Recommended Expiration</h3>
                  
                  {result.primaryExpiration ? (
                    <>
                      <div className="mb-4 rounded-xl bg-[var(--msp-panel-2)] p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-[1.75rem] font-bold text-[var(--msp-muted)]">
                            {result.primaryExpiration.dte} DTE
                          </span>
                          <span className={`rounded-md px-[10px] py-1 text-[0.75rem] font-bold ${result.primaryExpiration.thetaRisk === 'low' ? 'bg-emerald-500/30 text-emerald-500' : result.primaryExpiration.thetaRisk === 'moderate' ? 'bg-amber-500/30 text-amber-500' : 'bg-red-500/30 text-red-500'}`}>
                            {result.primaryExpiration.thetaRisk.toUpperCase()} THETA
                          </span>
                        </div>
                        
                        <div className="mb-2 text-base text-slate-200">
                          📆 {result.primaryExpiration.expirationDate}
                        </div>
                        
                        <div className="mb-3 text-[0.85rem] text-slate-400">
                          {result.primaryExpiration.reason}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-[0.8rem]">
                          <div>
                            <span className="text-slate-500">Timeframe:</span>
                            <span className="ml-1.5 text-slate-200">
                              {result.primaryExpiration.timeframe}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Confidence:</span>
                            <span className="ml-1.5 text-slate-200">
                              {result.primaryExpiration.confidenceScore.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {result.alternativeExpirations.length > 0 && (
                        <div>
                          <div className="mb-2 text-[0.8rem] text-slate-500">Alternative Expirations:</div>
                          <div className="flex flex-wrap gap-2">
                            {result.alternativeExpirations.map((e, i) => (
                              <div key={i} className="rounded-lg bg-[var(--msp-panel-2)] px-4 py-2 text-[0.85rem]">
                                <span className="font-bold text-[var(--msp-muted)]">{e.dte} DTE</span>
                                <span className="ml-1.5 text-slate-500">({e.expirationDate})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      No expiration recommendation available
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Open Interest Analysis */}
            {trapDoors.contracts && (result.openInterestAnalysis ? (
              <div className="rounded-[16px] border border-[color:var(--msp-accent)] bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-[0.98rem] font-extrabold tracking-[0.3px] text-[var(--msp-accent)]">📈 Open Interest Analysis</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-500/20 px-[10px] py-[3px] text-[0.68rem] font-bold uppercase tracking-[0.3px] text-amber-500">
                      📅 EOD Data
                    </span>
                    <span className="rounded-full bg-[var(--msp-panel-2)] px-[10px] py-[3px] text-[0.68rem] font-bold uppercase tracking-[0.3px] text-[var(--msp-accent)]">
                      Expiry: {result.openInterestAnalysis.expirationDate}
                    </span>
                  </div>
                </div>
                
                <div className="card-grid-mobile mb-4">
                  {/* P/C Ratio */}
                  <div className="rounded-xl bg-[var(--msp-panel-2)] p-4 text-center">
                    <div className="mb-1 text-[0.8rem] text-slate-400">Put/Call Ratio</div>
                    <div className={`text-[1.75rem] font-bold ${result.openInterestAnalysis.pcRatio > 1 ? 'text-red-500' : result.openInterestAnalysis.pcRatio < 0.7 ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {result.openInterestAnalysis.pcRatio.toFixed(2)}
                    </div>
                    <div className="text-[0.75rem] text-slate-500">
                      {result.openInterestAnalysis.pcRatio > 1 ? 'Bearish bias' : result.openInterestAnalysis.pcRatio < 0.7 ? 'Bullish bias' : 'Neutral'}
                    </div>
                  </div>
                  
                  {/* Max Pain */}
                  {result.openInterestAnalysis.maxPainStrike && (
                    <div className="rounded-xl bg-amber-500/15 p-4 text-center">
                      <div className="mb-1 text-[0.8rem] text-slate-400">Max Pain Strike</div>
                      <div className="text-[1.75rem] font-bold text-amber-500">
                        ${result.openInterestAnalysis.maxPainStrike}
                      </div>
                      <div className="text-[0.75rem] text-slate-500">
                        {result.openInterestAnalysis.maxPainStrike > result.currentPrice ? 'Above price' : 'Below price'}
                      </div>
                    </div>
                  )}
                  
                  {/* O/I Sentiment */}
                  <div className={`rounded-xl p-4 text-center ${result.openInterestAnalysis.sentiment === 'bullish' ? 'bg-emerald-500/15' : result.openInterestAnalysis.sentiment === 'bearish' ? 'bg-red-500/15' : 'bg-slate-500/15'}`}>
                    <div className="mb-1 text-[0.8rem] text-slate-400">O/I Sentiment</div>
                    <div className={`text-[1.5rem] font-bold ${result.openInterestAnalysis.sentiment === 'bullish' ? 'text-emerald-500' : result.openInterestAnalysis.sentiment === 'bearish' ? 'text-red-500' : 'text-gray-500'}`}>
                      {result.openInterestAnalysis.sentiment === 'bullish' ? '🟢 BULLISH' : 
                       result.openInterestAnalysis.sentiment === 'bearish' ? '🔴 BEARISH' : '⚪ NEUTRAL'}
                    </div>
                    <div className="text-[0.75rem] text-slate-500">
                      {result.openInterestAnalysis.sentimentReason}
                    </div>
                  </div>
                </div>
                
                {/* O/I Volume Comparison */}
                <div className="grid-equal-2-col-responsive mb-4 gap-4">
                  <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                    <div className="text-[0.75rem] text-slate-500">Total Call O/I</div>
                    <div className="font-bold text-emerald-500">
                      {(result.openInterestAnalysis.totalCallOI / 1000).toFixed(1)}K
                    </div>
                  </div>
                  <div className="rounded-lg bg-red-500/10 p-3 text-center">
                    <div className="text-[0.75rem] text-slate-500">Total Put O/I</div>
                    <div className="font-bold text-red-500">
                      {(result.openInterestAnalysis.totalPutOI / 1000).toFixed(1)}K
                    </div>
                  </div>
                </div>
                
                {/* High O/I Strikes with Greeks - Open by default */}
                {result.openInterestAnalysis.highOIStrikes.length > 0 && (
                  <details open className="mt-2">
                    <summary className="flex cursor-pointer items-center gap-2 py-2 text-[0.85rem] text-violet-400">
                      📊 Strike Analysis with Greeks ({result.openInterestAnalysis.highOIStrikes.length} strikes)
                    </summary>
                    <div className="mt-3">
                      <div className="greeks-table-container">
                        <table className="greeks-table w-full border-collapse text-[0.8rem]">
                          <thead>
                            <tr className="border-b border-[var(--msp-border-strong)]">
                              <th className="p-2 text-left font-medium text-slate-400">Strike</th>
                              <th className="p-2 text-right font-medium text-slate-400">OI</th>
                              <th className="p-2 text-right font-medium text-slate-400">IV</th>
                              <th className="p-2 text-right font-medium text-emerald-500">Δ</th>
                              <th className="p-2 text-right font-medium text-violet-500">Γ</th>
                              <th className="p-2 text-right font-medium text-red-500">Θ</th>
                              <th className="p-2 text-right font-medium text-[var(--msp-muted)]">ν</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.openInterestAnalysis.highOIStrikes.slice(0, 6).map((s, i) => (
                              <tr key={i} className={`border-b border-[var(--msp-border)] ${i % 2 === 0 ? 'bg-black/10' : 'bg-transparent'}`}>
                                <td className="p-2">
                                  <span className={`mr-1 font-bold ${s.type === 'call' ? 'text-emerald-500' : 'text-red-500'}`}>
                                    ${s.strike}
                                  </span>
                                  <span className={`rounded px-1.5 py-[2px] text-[0.7rem] ${s.type === 'call' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                                    {s.type === 'call' ? 'C' : 'P'}
                                  </span>
                                </td>
                                <td className="p-2 text-right text-slate-300">
                                  {(s.openInterest / 1000).toFixed(1)}K
                                </td>
                                <td className="p-2 text-right text-slate-300">
                                  {s.iv ? `${(s.iv * 100).toFixed(0)}%` : '-'}
                                </td>
                                <td className="p-2 text-right text-emerald-500">
                                  {s.delta !== undefined ? s.delta.toFixed(2) : '-'}
                                </td>
                                <td className="p-2 text-right text-violet-500">
                                  {s.gamma !== undefined ? s.gamma.toFixed(3) : '-'}
                                </td>
                                <td className="p-2 text-right text-red-500">
                                  {s.theta !== undefined ? s.theta.toFixed(3) : '-'}
                                </td>
                                <td className="p-2 text-right text-[var(--msp-muted)]">
                                  {s.vega !== undefined ? s.vega.toFixed(3) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right text-[0.7rem] text-slate-500">
                        Δ Delta • Γ Gamma • Θ Theta • ν Vega
                      </div>
                    </div>
                  </details>
                )}
                
                {/* Alignment Check */}
                <div className={`mt-4 rounded-lg border p-3 text-[0.85rem] ${(result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') || (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish') ? 'border-emerald-500/30 bg-emerald-500/15' : result.openInterestAnalysis.sentiment === 'neutral' ? 'border-amber-500/30 bg-amber-500/15' : 'border-red-500/30 bg-red-500/15'}`}>
                  {(result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                   (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish') ? (
                    <span className="text-emerald-500">
                      ✅ O/I sentiment CONFIRMS confluence direction — higher confidence trade
                    </span>
                  ) : result.openInterestAnalysis.sentiment === 'neutral' ? (
                    <span className="text-amber-500">
                      ⚠️ O/I sentiment neutral — rely on confluence signals
                    </span>
                  ) : (
                    <span className="text-red-500">
                      ⚠️ O/I sentiment DIVERGES from confluence — proceed with caution
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* No Options Data Available - Show Placeholder */
              <div className="rounded-[16px] border border-[color:var(--msp-accent)] bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="m-0 text-[0.98rem] font-extrabold tracking-[0.3px] text-[var(--msp-accent)]">📈 Open Interest Analysis</h3>
                  <span className="rounded-full bg-amber-500/20 px-[10px] py-[3px] text-[0.68rem] font-bold uppercase tracking-[0.3px] text-amber-500">
                    ⚠️ Data Unavailable
                  </span>
                </div>
                
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
                  <div className="mb-3 text-[2rem]">�</div>
                  <div className="mb-2 text-[1.1rem] font-bold text-amber-500">
                    Options Data Loading Issue
                  </div>
                  <div className="text-[0.9rem] leading-[1.6] text-slate-400">
                    End-of-day options data is temporarily unavailable. This may be due to 
                    API rate limits, market hours, or the symbol not having options available.
                  </div>
                  <div className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-[0.85rem] text-emerald-500">
                    ✅ Strike & Expiration recommendations still work based on price action confluence!
                  </div>
                </div>
              </div>
            ))}

            {/* Greeks Advice - Collapsible (advanced) */}
            {trapDoors.contracts && (
            <details className="rounded-[16px] border border-amber-500/35 bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
              <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 border-b border-[var(--msp-border)] pb-3 font-semibold text-amber-500">
                📊 Greeks & Risk Advice
                <span className="ml-auto text-[0.72rem] font-normal text-slate-500">
                  ▼ Show advanced data
                </span>
              </summary>
              
              <div className="card-grid-mobile">
                <div>
                  <div className="mb-1 text-[0.8rem] text-slate-500">Target Delta</div>
                  <div className="font-bold text-slate-200">{result.greeksAdvice.deltaTarget}</div>
                </div>
                
                {result.greeksAdvice.thetaWarning && (
                  <div>
                    <div className="mb-1 text-[0.8rem] text-slate-500">Theta Warning</div>
                    <div className="text-[0.85rem] text-orange-500">{result.greeksAdvice.thetaWarning}</div>
                  </div>
                )}
                
                {result.greeksAdvice.gammaAdvice && (
                  <div>
                    <div className="mb-1 text-[0.8rem] text-slate-500">Gamma Advice</div>
                    <div className="text-[0.85rem] text-slate-200">{result.greeksAdvice.gammaAdvice}</div>
                  </div>
                )}
                
                <div className="col-span-full">
                  <div className="mb-1 text-[0.8rem] text-slate-500">Overall Strategy</div>
                  <div className="text-slate-200">{result.greeksAdvice.overallAdvice}</div>
                </div>
              </div>
            </details>
            )}

            {/* Risk Management - Collapsible (advanced) */}
            {trapDoors.contracts && (
            <details className="rounded-[16px] border border-red-500/35 bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
              <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 border-b border-[var(--msp-border)] pb-3 font-semibold text-red-500">
                ⚠️ Risk Management
                <span className="ml-auto text-[0.72rem] font-normal text-slate-500">
                  {result.maxRiskPercent}% max risk • ▼ Show details
                </span>
              </summary>
              
              <div className="card-grid-mobile">
                <div className="rounded-xl bg-red-500/10 p-4 text-center">
                  <div className="text-[1.5rem] font-bold text-red-500">
                    {result.maxRiskPercent}%
                  </div>
                  <div className="text-[0.8rem] text-slate-400">Max Position Risk</div>
                </div>
                
                <div className="flex-1">
                  <div className="mb-3">
                    <div className="mb-1 text-[0.8rem] text-slate-500">🛑 Stop Loss Strategy</div>
                    <div className="text-[0.85rem] text-slate-200">{result.stopLossStrategy}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-[0.8rem] text-slate-500">🎯 Profit Target Strategy</div>
                    <div className="text-[0.85rem] text-emerald-500">{result.profitTargetStrategy}</div>
                  </div>
                </div>
              </div>
            </details>
            )}

            {/* Summary Trade Setup */}
            {trapDoors.contracts && result.primaryStrike && result.primaryExpiration && (
              <div className="rounded-[16px] border border-emerald-500/50 bg-[var(--msp-card)] p-[1.15rem] shadow-msp-soft">
                <h3 className="mb-4 text-[0.98rem] font-extrabold tracking-[0.3px] text-emerald-500">📋 Trade Summary</h3>
                
                <div className="rounded-xl bg-black/30 p-5 font-mono text-base">
                  <div className="mb-2">
                    <span className="text-slate-500">Symbol:</span>
                    <span className="ml-2 font-bold text-slate-200">{result.symbol}</span>
                    <span className="ml-4 text-slate-500">@</span>
                    <span className="ml-2 text-[var(--msp-muted)]">${formatPrice(result.currentPrice)}</span>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-slate-500">Action:</span>
                    <span className={`ml-2 font-bold ${result.primaryStrike.type === 'call' ? 'text-emerald-500' : 'text-red-500'}`}>
                      BUY {result.primaryStrike.type.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-slate-500">Strike:</span>
                    <span className="ml-2 font-bold text-amber-500">${result.primaryStrike.strike}</span>
                    <span className="ml-2 text-slate-500">({result.primaryStrike.moneyness})</span>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-slate-500">Expiration:</span>
                    <span className="ml-2 font-bold text-[var(--msp-muted)]">{result.primaryExpiration.expirationDate}</span>
                    <span className="ml-2 text-slate-500">({result.primaryExpiration.dte} DTE)</span>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-slate-500">Quality:</span>
                    <span className={`ml-2 font-bold ${gradeClass(result.tradeQuality)}`}>
                      {gradeEmoji(result.tradeQuality)} {result.tradeQuality}
                    </span>
                    <span className="ml-2 text-slate-500">|</span>
                    <span className={`ml-2 ${urgencyClass(result.entryTiming.urgency)}`}>
                      {urgencyEmoji(result.entryTiming.urgency)} {result.entryTiming.urgency.toUpperCase()}
                    </span>
                  </div>
                    <div className="mb-2 font-bold text-[var(--msp-muted)]">Expiration Logic</div>
                  <div className="border-t border-white/10 pt-3">
                    <span className="text-[0.85rem] text-slate-400">
                    Target: ${formatPrice(result.primaryStrike.targetLevel)} (50% level) | 
                    Max Risk: {result.maxRiskPercent}% of portfolio
                    </span>
                  </div>
                </div>
              </div>
            )}

              </>
            )}

          </div>
        )}

        {/* Help Section */}
        {!result && !loading && (
          <div className="mt-8 rounded-2xl border border-[var(--msp-border)] bg-slate-800/40 p-8">
            <h3 className="mb-6 text-slate-200">How It Works</h3>
            
            <div className="card-grid-mobile gap-6">
              <div>
                <div className="mb-2 text-[1.5rem]">🔮</div>
                <div className="mb-2 font-bold text-violet-500">Time Confluence</div>
                <div className="text-[0.85rem] text-slate-400">
                  Scans multiple timeframes for decompression events - when candles are gravitating toward their 50% levels.
                </div>
              </div>
              
              <div>
                <div className="mb-2 text-[1.5rem]">🎯</div>
                <div className="mb-2 font-bold text-emerald-500">Strike Selection</div>
                <div className="text-[0.85rem] text-slate-400">
                  Recommends strikes based on 50% level clusters and target zones from decompressing timeframes.
                </div>
              </div>
              
              <div>
                <div className="mb-2 text-[1.5rem]">📅</div>
                <div className="mb-2 font-bold text-[var(--msp-muted)]">Expiration Logic</div>
                <div className="text-[0.85rem] text-slate-400">
                  Matches expiration to your trading timeframe - scalping gets 0-2 DTE, swing trading gets weekly/monthly options.
                </div>
              </div>
              
              <div>
                <div className="mb-2 text-[1.5rem]">📊</div>
                <div className="mb-2 font-bold text-amber-500">Greeks-Aware</div>
                <div className="text-[0.85rem] text-slate-400">
                  Provides delta targets, theta decay warnings, and gamma considerations based on your chosen timeframe.
                </div>
              </div>
            </div>
            
            <div className="mt-8 rounded-xl bg-amber-500/10 p-4 text-[0.85rem] text-amber-500">
              ⚠️ <strong>Risk Warning:</strong> Options trading involves significant risk. This tool provides confluence-based analysis, not financial advice. 
              Always manage position sizes and use stops. Paper trade first!
            </div>
          </div>
        )}

    </TerminalShell>
  );
}
