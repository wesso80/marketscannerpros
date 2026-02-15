import { InstitutionalFlowState } from './institutional-flow-state-engine';
import { TradeArchetype } from './flow-trade-permission';

export type RiskMode = 'FULL_OFFENSE' | 'NORMAL' | 'DEFENSIVE' | 'LOCKDOWN';
export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
export type TradeDirection = 'long' | 'short';

export interface CorrelationPosition {
  symbol: string;
  direction: TradeDirection;
  cluster?: string;
}

export interface InstitutionalRiskGovernorInput {
  marketType: 'equity' | 'crypto';
  symbol: string;
  flowState: InstitutionalFlowState;
  preferredArchetype: TradeArchetype;
  conviction: number; // 0-100
  tps: number; // 0-100
  atrPercent: number;
  expansionProbability: number; // 0-100
  expansionAcceleration: 'rising' | 'falling' | 'flat';
  account: {
    openRiskPercent: number;
    proposedRiskPercent: number;
    dailyRiskPercent: number;
    dailyR: number;
  };
  exposure: {
    openPositions: CorrelationPosition[];
    proposedPosition?: CorrelationPosition;
  };
  behavior: {
    consecutiveLosses: number;
    lossesWindowMinutes: number;
    tradesThisSession: number;
    expectancyR: number;
    ruleViolations: number;
  };
  volatilityRegimeOverride?: VolatilityRegime;
}

export interface InstitutionalRiskGovernorOutput {
  executionAllowed: boolean;
  hardBlocked: boolean;
  hardBlockReasons: string[];
  irs: number;
  riskMode: RiskMode;
  capital: {
    usedPercent: number;
    openRiskPercent: number;
    proposedRiskPercent: number;
    dailyRiskPercent: number;
    maxRiskPerTrade: number;
    maxDailyRisk: number;
    maxOpenRisk: number;
    blocked: boolean;
    reason: string;
    score: number;
  };
  drawdown: {
    dailyR: number;
    sizeMultiplier: number;
    aPlusOnly: boolean;
    lockout: boolean;
    score: number;
    action: string;
  };
  correlation: {
    cluster: string;
    correlatedCount: number;
    maxCorrelated: number;
    blocked: boolean;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    score: number;
    reason: string;
  };
  volatility: {
    regime: VolatilityRegime;
    breakoutBlocked: boolean;
    sizeMultiplier: number;
    score: number;
  };
  behavior: {
    cooldownActive: boolean;
    cooldownMinutes: number;
    overtradingBlocked: boolean;
    score: number;
    reason: string;
  };
  sizing: {
    baseSize: number;
    flowStateMultiplier: number;
    riskGovernorMultiplier: number;
    personalPerformanceMultiplier: number;
    finalSize: number;
  };
  allowed: string[];
  blocked: string[];
}

const MAX_RISK_PER_TRADE = 1;
const MAX_DAILY_RISK = 3;
const MAX_OPEN_RISK = 4;
const MAX_CORRELATED_EXPOSURE = 2;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function inferCluster(marketType: 'equity' | 'crypto', symbol: string): string {
  const s = symbol.toUpperCase();

  if (marketType === 'crypto') {
    if (/^(BTC|ETH|SOL|AVAX|RNDR|FET|TAO|NEAR|APT|ARB|OP|SUI)$/.test(s)) return 'CRYPTO_BETA';
    if (/^(FET|RNDR|TAO|AGIX|OCEAN|GRT)$/.test(s)) return 'CRYPTO_AI_NARRATIVE';
    if (/^(ADA|DOT|ATOM|AVAX|SOL|NEAR)$/.test(s)) return 'CRYPTO_L1';
    return 'CRYPTO_CORE';
  }

  if (/^(NVDA|AAPL|AMD|MSFT|META|GOOGL|QQQ|SOXL|TSLA)$/.test(s)) return 'AI_TECH';
  if (/^(IWM|ARKK|SHOP|SNOW|NET|PLTR)$/.test(s)) return 'RISK_ON_GROWTH';
  if (/^(XOM|CVX|COP|XLE)$/.test(s)) return 'ENERGY';
  if (/^(JPM|BAC|GS|MS|XLF)$/.test(s)) return 'FINANCIALS';
  return 'GENERAL';
}

function classifyVolatilityRegime(
  atrPercent: number,
  expansionProbability: number,
  acceleration: 'rising' | 'falling' | 'flat'
): VolatilityRegime {
  if (atrPercent >= 3.5 || (expansionProbability >= 74 && acceleration === 'rising')) return 'EXTREME';
  if (atrPercent >= 2.2 || expansionProbability >= 62) return 'HIGH';
  if (atrPercent <= 0.9 && expansionProbability <= 40) return 'LOW';
  return 'NORMAL';
}

function riskModeFromIrs(irs: number): RiskMode {
  if (irs >= 0.85) return 'FULL_OFFENSE';
  if (irs >= 0.7) return 'NORMAL';
  if (irs >= 0.5) return 'DEFENSIVE';
  return 'LOCKDOWN';
}

function riskModeMultiplier(mode: RiskMode): number {
  switch (mode) {
    case 'FULL_OFFENSE':
      return 1;
    case 'NORMAL':
      return 0.85;
    case 'DEFENSIVE':
      return 0.6;
    default:
      return 0;
  }
}

function drawdownProfile(dailyR: number, conviction: number, tps: number): {
  score: number;
  sizeMultiplier: number;
  aPlusOnly: boolean;
  lockout: boolean;
  action: string;
} {
  if (dailyR <= -5) {
    return {
      score: 0.05,
      sizeMultiplier: 0,
      aPlusOnly: false,
      lockout: true,
      action: 'AUTO LOCKOUT: daily drawdown <= -5R',
    };
  }

  if (dailyR <= -4) {
    const isAPlus = conviction >= 82 && tps >= 78;
    return {
      score: isAPlus ? 0.35 : 0.2,
      sizeMultiplier: isAPlus ? 0.35 : 0,
      aPlusOnly: true,
      lockout: !isAPlus,
      action: isAPlus ? 'ONLY A+ setups' : 'A+ ONLY mode active; setup not qualified',
    };
  }

  if (dailyR <= -3) {
    return {
      score: 0.48,
      sizeMultiplier: 0.5,
      aPlusOnly: false,
      lockout: false,
      action: 'Size reduced to 50% (drawdown <= -3R)',
    };
  }

  if (dailyR <= -2) {
    return {
      score: 0.7,
      sizeMultiplier: 0.75,
      aPlusOnly: false,
      lockout: false,
      action: 'Size reduced to 75% (drawdown <= -2R)',
    };
  }

  return {
    score: 0.95,
    sizeMultiplier: 1,
    aPlusOnly: false,
    lockout: false,
    action: 'Normal drawdown profile',
  };
}

export function computeInstitutionalRiskGovernor(input: InstitutionalRiskGovernorInput): InstitutionalRiskGovernorOutput {
  const hardBlockReasons: string[] = [];

  const openRisk = Math.max(0, input.account.openRiskPercent);
  const dailyRisk = Math.max(0, input.account.dailyRiskPercent);
  const proposedRisk = Math.max(0, input.account.proposedRiskPercent);
  const totalOpenIfAccepted = openRisk + proposedRisk;
  const totalDailyIfAccepted = dailyRisk + proposedRisk;

  let capitalReason = 'Within allocation';
  let capitalBlocked = false;

  if (proposedRisk > MAX_RISK_PER_TRADE) {
    capitalBlocked = true;
    capitalReason = 'Per-trade risk exceeds 1%';
  } else if (totalDailyIfAccepted > MAX_DAILY_RISK) {
    capitalBlocked = true;
    capitalReason = 'Daily risk limit exceeded';
  } else if (totalOpenIfAccepted > MAX_OPEN_RISK) {
    capitalBlocked = true;
    capitalReason = 'Open risk exceeds allocation';
  }

  if (capitalBlocked) {
    hardBlockReasons.push(`CAPITAL: ${capitalReason}`);
  }

  const capitalUtilization = Math.max(
    totalOpenIfAccepted / MAX_OPEN_RISK,
    totalDailyIfAccepted / MAX_DAILY_RISK,
    proposedRisk / MAX_RISK_PER_TRADE
  );
  const capitalScore = clamp01(1 - (capitalUtilization * 0.9));

  const drawdown = drawdownProfile(input.account.dailyR, input.conviction, input.tps);
  if (drawdown.lockout) {
    hardBlockReasons.push(`DRAWDOWN: ${drawdown.action}`);
  }

  const proposedCluster = input.exposure.proposedPosition?.cluster
    ?? inferCluster(input.marketType, input.symbol);
  const proposedDirection = input.exposure.proposedPosition?.direction ?? 'long';

  const correlatedCount = input.exposure.openPositions.filter((position) => {
    const cluster = position.cluster ?? inferCluster(input.marketType, position.symbol);
    return cluster === proposedCluster && position.direction === proposedDirection;
  }).length;

  const correlationBlocked = correlatedCount >= MAX_CORRELATED_EXPOSURE;
  const correlationSeverity: 'LOW' | 'MEDIUM' | 'HIGH' = correlatedCount >= 2 ? 'HIGH' : correlatedCount === 1 ? 'MEDIUM' : 'LOW';
  const correlationScore = clamp01(1 - (correlatedCount / (MAX_CORRELATED_EXPOSURE + 1)));
  const correlationReason = correlationBlocked
    ? `Max correlated exposure reached in ${proposedCluster}`
    : `Correlated exposure ${correlatedCount}/${MAX_CORRELATED_EXPOSURE} in ${proposedCluster}`;

  if (correlationBlocked) {
    hardBlockReasons.push(`CORRELATION: ${correlationReason}`);
  }

  const volatilityRegime = input.volatilityRegimeOverride
    ?? classifyVolatilityRegime(input.atrPercent, input.expansionProbability, input.expansionAcceleration);

  const breakoutArchetype = input.preferredArchetype === 'breakout_early' || input.preferredArchetype === 'breakout_late';
  const volatilityBreakoutBlock = volatilityRegime === 'EXTREME' && breakoutArchetype;

  const volatilitySizeMultiplier = volatilityRegime === 'EXTREME'
    ? 0.5
    : volatilityRegime === 'HIGH'
      ? 0.8
      : volatilityRegime === 'LOW'
        ? 0.85
        : 1;

  const volatilityScore = volatilityRegime === 'NORMAL'
    ? 0.95
    : volatilityRegime === 'HIGH'
      ? 0.72
      : volatilityRegime === 'LOW'
        ? 0.66
        : 0.4;

  if (volatilityBreakoutBlock) {
    hardBlockReasons.push('VOLATILITY: EXTREME regime blocks breakout entries');
  }

  const cooldownActive = input.behavior.consecutiveLosses >= 3 && input.behavior.lossesWindowMinutes <= 20;
  const overtradingBlocked = input.behavior.tradesThisSession > 6 && input.behavior.expectancyR < 0;
  const ruleViolationBlock = input.behavior.ruleViolations >= 2;

  const behavioralReason = cooldownActive
    ? 'COOLDOWN MODE: 30 minutes after rapid loss cluster'
    : overtradingBlocked
      ? 'Overtrading detected with negative expectancy'
      : ruleViolationBlock
        ? 'Repeated rule violations detected'
        : 'Behavior stable';

  const behaviorScore = clamp01(
    1 - (
      (cooldownActive ? 0.55 : 0) +
      (overtradingBlocked ? 0.35 : 0) +
      Math.min(0.25, input.behavior.ruleViolations * 0.08)
    )
  );

  if (cooldownActive || overtradingBlocked || ruleViolationBlock) {
    hardBlockReasons.push(`BEHAVIOR: ${behavioralReason}`);
  }

  const irs = clamp01(
    (capitalScore * 0.30) +
    (drawdown.score * 0.25) +
    (correlationScore * 0.20) +
    (volatilityScore * 0.15) +
    (behaviorScore * 0.10)
  );

  const mode = riskModeFromIrs(irs);
  if (mode === 'LOCKDOWN') {
    hardBlockReasons.push('IRS: Lockdown mode (< 0.50)');
  }

  const personalPerformanceMultiplier = input.behavior.expectancyR < 0
    ? clamp01(0.85 + (input.behavior.expectancyR * 0.2))
    : 1;

  const sizing = {
    baseSize: 1,
    flowStateMultiplier: 1,
    riskGovernorMultiplier: riskModeMultiplier(mode),
    personalPerformanceMultiplier: Number(personalPerformanceMultiplier.toFixed(2)),
    finalSize: 0,
  };

  const hardBlocked = hardBlockReasons.length > 0;
  const executionAllowed = !hardBlocked;

  sizing.finalSize = Number((
    sizing.baseSize *
    sizing.flowStateMultiplier *
    (executionAllowed ? sizing.riskGovernorMultiplier : 0) *
    drawdown.sizeMultiplier *
    volatilitySizeMultiplier *
    sizing.personalPerformanceMultiplier
  ).toFixed(2));

  const allowed: string[] = [];
  const blocked: string[] = [];

  if (!drawdown.aPlusOnly) allowed.push('Standard setups allowed within flow permissions');
  else allowed.push('A+ setups only while drawdown control active');

  if (mode === 'DEFENSIVE') allowed.push('Defensive sizing enforced');
  if (mode === 'FULL_OFFENSE') allowed.push('Full offense available under strong IRS');

  if (correlationBlocked) blocked.push(`New ${proposedCluster} ${proposedDirection} positions`);
  if (volatilityBreakoutBlock) blocked.push('Breakout entries in EXTREME volatility');
  if (cooldownActive) blocked.push('All new trades during 30-minute cooldown');
  if (overtradingBlocked) blocked.push('New trades: overtrading + negative expectancy');
  if (ruleViolationBlock) blocked.push('New trades after repeated rule violations');
  if (drawdown.lockout) blocked.push('All trading lockout (drawdown governor)');
  if (capitalBlocked) blocked.push('New risk allocation (capital limits exceeded)');
  if (mode === 'LOCKDOWN') blocked.push('All new trades (IRS lockdown mode)');

  return {
    executionAllowed,
    hardBlocked,
    hardBlockReasons,
    irs: Number(irs.toFixed(2)),
    riskMode: mode,
    capital: {
      usedPercent: Number(clamp01(totalOpenIfAccepted / MAX_OPEN_RISK).toFixed(2)),
      openRiskPercent: Number(openRisk.toFixed(2)),
      proposedRiskPercent: Number(proposedRisk.toFixed(2)),
      dailyRiskPercent: Number(dailyRisk.toFixed(2)),
      maxRiskPerTrade: MAX_RISK_PER_TRADE,
      maxDailyRisk: MAX_DAILY_RISK,
      maxOpenRisk: MAX_OPEN_RISK,
      blocked: capitalBlocked,
      reason: capitalReason,
      score: Number(capitalScore.toFixed(2)),
    },
    drawdown: {
      dailyR: Number(input.account.dailyR.toFixed(2)),
      sizeMultiplier: Number(drawdown.sizeMultiplier.toFixed(2)),
      aPlusOnly: drawdown.aPlusOnly,
      lockout: drawdown.lockout,
      score: Number(drawdown.score.toFixed(2)),
      action: drawdown.action,
    },
    correlation: {
      cluster: proposedCluster,
      correlatedCount,
      maxCorrelated: MAX_CORRELATED_EXPOSURE,
      blocked: correlationBlocked,
      severity: correlationSeverity,
      score: Number(correlationScore.toFixed(2)),
      reason: correlationReason,
    },
    volatility: {
      regime: volatilityRegime,
      breakoutBlocked: volatilityBreakoutBlock,
      sizeMultiplier: Number(volatilitySizeMultiplier.toFixed(2)),
      score: Number(volatilityScore.toFixed(2)),
    },
    behavior: {
      cooldownActive,
      cooldownMinutes: cooldownActive ? 30 : 0,
      overtradingBlocked,
      score: Number(behaviorScore.toFixed(2)),
      reason: behavioralReason,
    },
    sizing,
    allowed,
    blocked,
  };
}
