import { q } from "@/lib/db";

export type TraderStyleBias = 'momentum' | 'mean_reversion' | 'breakout' | 'options_flow' | 'macro_swing';
export type TraderRiskDNA = 'aggressive' | 'balanced' | 'defensive';
export type TraderTiming = 'early' | 'confirmation' | 'late_momentum';
export type TraderEnvironment = 'trend' | 'range' | 'reversal' | 'unknown';

export interface AdaptiveProfile {
  sampleSize: number;
  wins: number;
  styleBias: TraderStyleBias;
  riskDNA: TraderRiskDNA;
  decisionTiming: TraderTiming;
  environmentRates: Record<TraderEnvironment, number>;
}

export interface AdaptiveContext {
  skill?: string;
  setupText?: string;
  direction?: 'bullish' | 'bearish' | 'neutral';
  regime?: TraderEnvironment;
  urgency?: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
  riskPercent?: number;
  hasOptionsFlow?: boolean;
  timeframe?: string;
}

export interface AdaptiveMatch {
  hasProfile: boolean;
  personalityMatch: number;
  adaptiveScore: number;
  reasons: string[];
  noTradeBias: boolean;
  sampleSize?: number;
  wins?: number;
}

interface JournalEntryRow {
  strategy?: string | null;
  setup?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  outcome?: string | null;
  is_open?: boolean | null;
  pl?: number | string | null;
  pl_percent?: number | string | null;
  r_multiple?: number | string | null;
}

const STYLE_LABEL: Record<TraderStyleBias, string> = {
  momentum: 'momentum continuation',
  mean_reversion: 'pullback / mean reversion',
  breakout: 'breakout expansion',
  options_flow: 'options flow-following',
  macro_swing: 'macro swing',
};

function parseNum(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickTop<T extends string>(map: Record<T, number>, fallback: T): T {
  const entries = Object.entries(map) as Array<[T, number]>;
  const best = entries.sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : fallback;
}

function textOf(row: JournalEntryRow): string {
  return `${row.strategy || ''} ${row.setup || ''} ${row.notes || ''} ${(row.tags || []).join(' ')}`.toLowerCase();
}

function inferEnvironmentFromText(input: string): TraderEnvironment {
  if (/trend|momentum|continuation|breakout/.test(input)) return 'trend';
  if (/range|chop|mean|reversion|pullback/.test(input)) return 'range';
  if (/reversal|fade|exhaust/.test(input)) return 'reversal';
  return 'unknown';
}

function inferStyleFromContext(context: AdaptiveContext): TraderStyleBias {
  const txt = `${context.setupText || ''} ${context.skill || ''}`.toLowerCase();
  if (/breakout|break/.test(txt)) return 'breakout';
  if (/pullback|mean|reversion|fade|bounce/.test(txt)) return 'mean_reversion';
  if (context.hasOptionsFlow || /options|flow|gamma|delta|oi/.test(txt)) return 'options_flow';
  if ((context.timeframe || '').startsWith('macro_') || /macro|swing|position|weekly|monthly|leaps/.test(txt)) return 'macro_swing';
  return 'momentum';
}

function inferRiskFromContext(context: AdaptiveContext): TraderRiskDNA {
  const risk = parseNum(context.riskPercent, 2);
  if (risk > 4) return 'aggressive';
  if (risk > 2) return 'balanced';
  return 'defensive';
}

function inferTimingFromContext(context: AdaptiveContext): TraderTiming {
  if (context.urgency === 'immediate') return 'early';
  if (context.urgency === 'within_hour') return 'confirmation';
  return 'late_momentum';
}

function inferEnvironmentFromContext(context: AdaptiveContext): TraderEnvironment {
  if (context.regime) return context.regime;
  return inferEnvironmentFromText(`${context.setupText || ''} ${context.skill || ''}`.toLowerCase());
}

export async function loadAdaptiveJournalEntries(workspaceId: string, limit = 150): Promise<JournalEntryRow[]> {
  return q<JournalEntryRow>(
    `SELECT strategy, setup, notes, tags, outcome, is_open, pl, pl_percent, r_multiple
     FROM journal_entries
     WHERE workspace_id = $1
     ORDER BY COALESCE(exit_date, trade_date) DESC, created_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );
}

export function deriveAdaptiveProfile(entries: JournalEntryRow[]): AdaptiveProfile | null {
  const closed = entries.filter((trade) => !trade.is_open && trade.outcome !== 'open');
  if (closed.length < 6) return null;

  const isWin = (trade: JournalEntryRow) => trade.outcome === 'win' || parseNum(trade.pl) > 0;
  const wins = closed.filter(isWin);
  const safeWins = wins.length ? wins : closed;

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
    const env = inferEnvironmentFromText(textOf(trade));
    envTotal[env] += 1;
    if (isWin(trade)) envWins[env] += 1;
  });

  const styleBias = pickTop(styleCounts, 'momentum');
  const decisionTiming = pickTop(timingCounts, 'confirmation');

  const absR = closed
    .map((trade) => Math.abs(parseNum(trade.r_multiple)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgAbsR = absR.length ? absR.reduce((a, b) => a + b, 0) / absR.length : 0;

  const absPct = closed
    .map((trade) => Math.abs(parseNum(trade.pl_percent)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgAbsPct = absPct.length ? absPct.reduce((a, b) => a + b, 0) / absPct.length : 0;

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
}

export function computeAdaptiveMatch(profile: AdaptiveProfile | null, context: AdaptiveContext, baseSignalScore = 50): AdaptiveMatch {
  if (!profile) {
    return {
      hasProfile: false,
      personalityMatch: 50,
      adaptiveScore: baseSignalScore,
      reasons: ['Build profile: close at least 6 journal trades for adaptive matching'],
      noTradeBias: false,
    };
  }

  const currentStyle = inferStyleFromContext(context);
  const currentRisk = inferRiskFromContext(context);
  const currentTiming = inferTimingFromContext(context);
  const currentEnvironment = inferEnvironmentFromContext(context);

  const styleScore = profile.styleBias === currentStyle
    ? 95
    : ((profile.styleBias === 'momentum' && currentStyle === 'breakout') || (profile.styleBias === 'breakout' && currentStyle === 'momentum'))
      ? 78
      : 45;

  const riskDistance = Math.abs(
    (profile.riskDNA === 'defensive' ? 0 : profile.riskDNA === 'balanced' ? 1 : 2) -
    (currentRisk === 'defensive' ? 0 : currentRisk === 'balanced' ? 1 : 2)
  );
  const riskScore = riskDistance === 0 ? 92 : riskDistance === 1 ? 68 : 42;

  const timingScore = profile.decisionTiming === currentTiming ? 90 : 55;
  const envWinRate = profile.environmentRates[currentEnvironment] ?? 50;
  const environmentScore = Math.max(30, Math.min(95, envWinRate));

  const personalityMatch = Math.round(
    (styleScore * 0.35) +
    (riskScore * 0.2) +
    (timingScore * 0.2) +
    (environmentScore * 0.25)
  );

  const adaptiveScore = Math.round((baseSignalScore * 0.6) + (personalityMatch * 0.4));

  const reasons: string[] = [];
  if (styleScore >= 70) reasons.push(`Matches your ${STYLE_LABEL[profile.styleBias]} win profile`);
  if (riskScore >= 70) reasons.push(`Risk profile aligns with your ${profile.riskDNA} execution DNA`);
  if (timingScore >= 70) reasons.push(`Entry timing fits your ${profile.decisionTiming.replace('_', ' ')} profile`);
  reasons.push(`Similar ${currentEnvironment} conditions: ${envWinRate.toFixed(0)}% historical win rate`);

  const noTradeBias = profile.sampleSize >= 8 && environmentScore < 40;

  return {
    hasProfile: true,
    personalityMatch,
    adaptiveScore,
    reasons: reasons.slice(0, 3),
    noTradeBias,
    sampleSize: profile.sampleSize,
    wins: profile.wins,
  };
}

export async function getAdaptiveLayer(workspaceId: string, context: AdaptiveContext, baseSignalScore = 50) {
  const entries = await loadAdaptiveJournalEntries(workspaceId);
  const profile = deriveAdaptiveProfile(entries);
  const match = computeAdaptiveMatch(profile, context, baseSignalScore);
  return { profile, match };
}
