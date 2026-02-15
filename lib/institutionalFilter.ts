import { TraderRiskDNA } from '@/lib/adaptiveTrader';

export type InstitutionalRegime = 'trending' | 'ranging' | 'high_volatility_chaos' | 'low_liquidity' | 'news_shock' | 'unknown';
export type InstitutionalStrategy = 'breakout' | 'mean_reversion' | 'momentum' | 'options_flow' | 'macro_swing' | 'unknown';
export type VolatilityState = 'compressed' | 'normal' | 'expanded' | 'extreme';
export type FilterStatus = 'pass' | 'warn' | 'block';

export interface InstitutionalFilterInput {
  baseScore: number;
  strategy: InstitutionalStrategy;
  regime: InstitutionalRegime;
  liquidity?: {
    session?: 'premarket' | 'regular' | 'afterhours' | 'closed' | 'unknown';
    volumeRatio?: number;
    spreadBps?: number;
    optionsLiquidityScore?: number;
  };
  volatility?: {
    atrPercent?: number;
    state?: VolatilityState;
  };
  dataHealth?: {
    freshness?: 'REALTIME' | 'LIVE' | 'DELAYED' | 'CACHED' | 'EOD' | 'STALE' | 'NONE';
    fallbackActive?: boolean;
    sources?: string[];
  };
  riskEnvironment?: {
    stressLevel?: 'low' | 'medium' | 'high';
    vix?: number;
    traderRiskDNA?: TraderRiskDNA;
  };
  newsEventSoon?: boolean;
}

export interface InstitutionalFilterCheck {
  key: 'regime' | 'liquidity' | 'volatility' | 'data_reliability' | 'risk_environment';
  label: string;
  status: FilterStatus;
  weight: number;
  reason: string;
}

export interface InstitutionalFilterResult {
  baseScore: number;
  finalScore: number;
  finalGrade: 'A+' | 'A' | 'A-' | 'B' | 'C' | 'D' | 'F';
  recommendation: 'TRADE_READY' | 'CAUTION' | 'NO_TRADE';
  noTrade: boolean;
  filters: InstitutionalFilterCheck[];
  weights: {
    regimeWeight: number;
    liquidityWeight: number;
    volatilityWeight: number;
    dataHealthWeight: number;
    riskEnvironmentWeight: number;
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function gradeFromScore(score: number): InstitutionalFilterResult['finalGrade'] {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'A-';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function inferStrategyFromText(input: string): InstitutionalStrategy {
  const text = input.toLowerCase();
  if (/breakout|break/.test(text)) return 'breakout';
  if (/mean|reversion|pullback|fade/.test(text)) return 'mean_reversion';
  if (/momentum|trend|continuation/.test(text)) return 'momentum';
  if (/options|flow|gamma|delta|oi/.test(text)) return 'options_flow';
  if (/macro|swing|monthly|weekly|leaps|position/.test(text)) return 'macro_swing';
  return 'unknown';
}

function regimeFilter(input: InstitutionalFilterInput): InstitutionalFilterCheck {
  const strategy = input.strategy;
  const regime = input.regime;

  if ((regime === 'ranging' || regime === 'low_liquidity') && strategy === 'breakout') {
    return { key: 'regime', label: 'Market Regime', status: 'block', weight: 0.68, reason: 'Range/low-liquidity regime conflicts with breakout strategy' };
  }
  if (regime === 'news_shock' || regime === 'high_volatility_chaos') {
    return { key: 'regime', label: 'Market Regime', status: 'block', weight: 0.62, reason: 'Shock/chaos regime active — institutional desks reduce risk' };
  }
  if (regime === 'trending' && (strategy === 'breakout' || strategy === 'momentum' || strategy === 'options_flow')) {
    return { key: 'regime', label: 'Market Regime', status: 'pass', weight: 1.05, reason: 'Regime aligned with strategy profile' };
  }
  if (regime === 'unknown') {
    return { key: 'regime', label: 'Market Regime', status: 'warn', weight: 0.92, reason: 'Regime uncertain — reduce size until structure confirms' };
  }
  return { key: 'regime', label: 'Market Regime', status: 'pass', weight: 1.0, reason: 'Regime acceptable for this setup' };
}

function liquidityFilter(input: InstitutionalFilterInput): InstitutionalFilterCheck {
  const session = input.liquidity?.session || 'unknown';
  const volumeRatio = input.liquidity?.volumeRatio;
  const spreadBps = input.liquidity?.spreadBps;
  const optionsLiquidityScore = input.liquidity?.optionsLiquidityScore;

  if (session === 'closed') {
    return { key: 'liquidity', label: 'Liquidity & Timing', status: 'block', weight: 0.55, reason: 'Market session closed — execution quality unreliable' };
  }
  if (typeof spreadBps === 'number' && spreadBps > 30) {
    return { key: 'liquidity', label: 'Liquidity & Timing', status: 'block', weight: 0.7, reason: `Spread too wide (${spreadBps.toFixed(1)} bps)` };
  }
  if (typeof volumeRatio === 'number' && volumeRatio < 0.6) {
    return { key: 'liquidity', label: 'Liquidity & Timing', status: 'warn', weight: 0.76, reason: 'Volume below baseline — higher slippage risk' };
  }
  if (typeof optionsLiquidityScore === 'number' && optionsLiquidityScore < 40) {
    return { key: 'liquidity', label: 'Liquidity & Timing', status: 'warn', weight: 0.82, reason: 'Options chain liquidity thin for institutional entry' };
  }
  if (session === 'premarket' || session === 'afterhours') {
    return { key: 'liquidity', label: 'Liquidity & Timing', status: 'warn', weight: 0.82, reason: 'Off-session liquidity — expect wider spreads / fake moves' };
  }
  return { key: 'liquidity', label: 'Liquidity & Timing', status: 'pass', weight: 1.0, reason: 'Liquidity conditions supportive' };
}

function volatilityFilter(input: InstitutionalFilterInput): InstitutionalFilterCheck {
  const strategy = input.strategy;
  const state = input.volatility?.state || 'normal';
  const atrPercent = input.volatility?.atrPercent;

  if (strategy === 'breakout' && state === 'compressed') {
    return { key: 'volatility', label: 'Volatility Alignment', status: 'pass', weight: 1.06, reason: 'Compression supports cleaner breakout expansion' };
  }
  if (strategy === 'breakout' && (state === 'expanded' || state === 'extreme')) {
    return { key: 'volatility', label: 'Volatility Alignment', status: 'block', weight: 0.72, reason: 'Breakout appears late — expansion likely already spent' };
  }
  if (typeof atrPercent === 'number' && atrPercent > 6) {
    return { key: 'volatility', label: 'Volatility Alignment', status: 'warn', weight: 0.82, reason: `ATR elevated (${atrPercent.toFixed(2)}%) — noise risk higher` };
  }
  if (typeof atrPercent === 'number' && atrPercent < 0.35 && strategy === 'momentum') {
    return { key: 'volatility', label: 'Volatility Alignment', status: 'warn', weight: 0.9, reason: 'ATR too compressed for momentum follow-through' };
  }
  return { key: 'volatility', label: 'Volatility Alignment', status: 'pass', weight: 1.0, reason: 'Volatility profile acceptable for setup' };
}

function dataReliabilityFilter(input: InstitutionalFilterInput): InstitutionalFilterCheck {
  const freshness = input.dataHealth?.freshness || 'NONE';
  const fallback = !!input.dataHealth?.fallbackActive;

  if (freshness === 'STALE' || freshness === 'NONE') {
    return { key: 'data_reliability', label: 'Data Reliability', status: 'block', weight: 0.64, reason: 'Data stale/fallback only — confidence severely reduced' };
  }

  if (freshness === 'REALTIME' || freshness === 'LIVE') {
    return {
      key: 'data_reliability',
      label: 'Data Reliability',
      status: fallback ? 'warn' : 'pass',
      weight: fallback ? 0.92 : 1.0,
      reason: fallback ? 'Realtime source with fallback engaged' : 'Realtime institutional data sources active',
    };
  }

  if (freshness === 'DELAYED' || freshness === 'CACHED') {
    return { key: 'data_reliability', label: 'Data Reliability', status: 'warn', weight: 0.9, reason: 'Delayed/cached data active — confidence adjusted' };
  }

  return { key: 'data_reliability', label: 'Data Reliability', status: 'warn', weight: 0.82, reason: 'EOD-grade data only — intraday confidence reduced' };
}

function riskEnvironmentFilter(input: InstitutionalFilterInput): InstitutionalFilterCheck {
  const stress = input.riskEnvironment?.stressLevel || (input.newsEventSoon ? 'high' : 'medium');
  const dna = input.riskEnvironment?.traderRiskDNA || 'balanced';

  if (stress === 'high' && dna === 'aggressive') {
    return { key: 'risk_environment', label: 'Risk Environment', status: 'warn', weight: 0.78, reason: 'High stress + aggressive profile — reduce size / tighten risk' };
  }
  if (stress === 'high' && dna === 'balanced') {
    return { key: 'risk_environment', label: 'Risk Environment', status: 'warn', weight: 0.88, reason: 'Elevated stress regime — tighten execution thresholds' };
  }
  if (stress === 'high') {
    return { key: 'risk_environment', label: 'Risk Environment', status: 'warn', weight: 0.94, reason: 'Stress elevated but profile remains defensive' };
  }
  if (stress === 'medium') {
    return { key: 'risk_environment', label: 'Risk Environment', status: 'pass', weight: 0.97, reason: 'Risk environment neutral' };
  }
  return { key: 'risk_environment', label: 'Risk Environment', status: 'pass', weight: 1.0, reason: 'Risk environment supportive' };
}

export function computeInstitutionalFilter(input: InstitutionalFilterInput): InstitutionalFilterResult {
  const baseScore = clamp(input.baseScore, 0, 100);

  const checks: InstitutionalFilterCheck[] = [
    regimeFilter(input),
    liquidityFilter(input),
    volatilityFilter(input),
    dataReliabilityFilter(input),
    riskEnvironmentFilter(input),
  ];

  const [regime, liquidity, volatility, data, risk] = checks;

  const finalScore = clamp(
    baseScore *
      regime.weight *
      liquidity.weight *
      volatility.weight *
      data.weight *
      risk.weight,
    0,
    100
  );

  const hardBlock = checks.some((check) =>
    check.status === 'block' && (check.key === 'regime' || check.key === 'liquidity' || check.key === 'data_reliability')
  );
  const noTrade = hardBlock || finalScore < 55;

  const recommendation: InstitutionalFilterResult['recommendation'] = noTrade
    ? 'NO_TRADE'
    : finalScore >= 70
      ? 'TRADE_READY'
      : 'CAUTION';

  return {
    baseScore,
    finalScore: Number(finalScore.toFixed(1)),
    finalGrade: gradeFromScore(finalScore),
    recommendation,
    noTrade,
    filters: checks,
    weights: {
      regimeWeight: regime.weight,
      liquidityWeight: liquidity.weight,
      volatilityWeight: volatility.weight,
      dataHealthWeight: data.weight,
      riskEnvironmentWeight: risk.weight,
    },
  };
}
