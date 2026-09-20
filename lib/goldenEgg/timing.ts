/**
 * Time-confluence evidence policy for Golden Egg.
 *
 * The confluence agent's "direction" is the weighted pull of price toward multi-timeframe mid-50 levels. In a strong
 * trend every mid-50 sits behind price, so the raw read is "bearish" for every rising symbol and "bullish" for every
 * falling one. That is a mean-reversion pressure, not a timing verdict — so it may only gate a setup when the agent
 * itself reports a valid signal, the session is live for the asset, and the read is current.
 */
import type { TimeConfluenceData } from '@/lib/goldenEggFetchers';

export type TimingRelation = 'supportive' | 'conflict' | 'neutral' | 'unavailable';
export type SetupDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface TimingAssessment {
  /** True when the read is usable as directional evidence at all. */
  valid: boolean;
  /** True when the read is strong/current enough to downgrade an otherwise aligned setup. */
  eligibleForHardGate: boolean;
  /** Direction after validity rules (no_signal / closed session → neutral). */
  effectiveDirection: 'bullish' | 'bearish' | 'neutral';
  relation: TimingRelation;
  reasons: string[];
}

export const TIMING_HARD_GATE = {
  minConfidence: 55,
  minDirectionScore: 35,
  minActiveTFs: 3,
  maxAgeMs: 15 * 60_000,
  strengths: ['moderate', 'strong'] as const,
};

export interface TimingInput {
  tc: TimeConfluenceData | null | undefined;
  setupDirection: SetupDirection;
  assetClass: 'equity' | 'crypto' | 'forex';
  /** Equity regular session open right now (crypto callers pass true). */
  sessionOpen: boolean;
  /** When the scan was produced; undefined = unknown. */
  scanAgeMs?: number;
}

export function assessTimingEvidence(input: TimingInput): TimingAssessment {
  const { tc, setupDirection, assetClass, sessionOpen, scanAgeMs } = input;
  const reasons: string[] = [];
  if (!tc) return { valid: false, eligibleForHardGate: false, effectiveDirection: 'neutral', relation: 'unavailable', reasons: ['time confluence unavailable'] };

  let valid = true;
  if (assetClass === 'equity' && !sessionOpen) {
    valid = false;
    reasons.push('equity session closed — intraday timing inactive');
  }
  if (tc.signalStrength === 'no_signal') {
    valid = false;
    reasons.push('no timing signal (agent gates not met)');
  }
  if (scanAgeMs != null && scanAgeMs > TIMING_HARD_GATE.maxAgeMs) {
    reasons.push(`scan is ${Math.round(scanAgeMs / 60_000)}m old`);
  }

  const effectiveDirection: TimingAssessment['effectiveDirection'] = valid ? tc.direction : 'neutral';

  let relation: TimingRelation = 'neutral';
  if (valid && effectiveDirection !== 'neutral' && setupDirection !== 'NEUTRAL') {
    const supportive = (setupDirection === 'LONG' && effectiveDirection === 'bullish') || (setupDirection === 'SHORT' && effectiveDirection === 'bearish');
    relation = supportive ? 'supportive' : 'conflict';
  }

  const strong = (TIMING_HARD_GATE.strengths as readonly string[]).includes(tc.signalStrength);
  const current = scanAgeMs == null || scanAgeMs <= TIMING_HARD_GATE.maxAgeMs;
  const eligibleForHardGate =
    valid &&
    relation === 'conflict' &&
    strong &&
    current &&
    tc.confidence >= TIMING_HARD_GATE.minConfidence &&
    Math.abs(tc.scoreBreakdown.directionScore) >= TIMING_HARD_GATE.minDirectionScore &&
    tc.scoreBreakdown.activeTFs >= TIMING_HARD_GATE.minActiveTFs;

  if (relation === 'conflict' && !eligibleForHardGate) reasons.push('conflict noted but below hard-gate thresholds');
  if (valid && relation === 'neutral' && setupDirection === 'NEUTRAL') reasons.push('setup direction neutral — timing cannot agree or disagree');

  return { valid, eligibleForHardGate, effectiveDirection, relation, reasons };
}

/** Verdict vocabulary used by the Golden Egg evidence stack. */
export function timingVerdict(a: TimingAssessment): 'agree' | 'disagree' | 'neutral' | 'unknown' {
  if (a.relation === 'unavailable') return 'unknown';
  if (a.relation === 'supportive') return 'agree';
  if (a.relation === 'conflict') return 'disagree';
  return 'neutral';
}

/**
 * Normalise the agent output for display: strip conviction banners when there is no signal, neutralise direction
 * when the read is not valid, and drop intraday countdowns while an equity session is closed.
 */
export function sanitizeTimeConfluence(tc: TimeConfluenceData, opts: { assetClass: 'equity' | 'crypto' | 'forex'; sessionOpen: boolean }): TimeConfluenceData & { sessionState: 'open' | 'closed' | 'always_open'; displayNote?: string } {
  const noSignal = tc.signalStrength === 'no_signal';
  const equityClosed = opts.assetClass === 'equity' && !opts.sessionOpen;
  const sessionState: 'open' | 'closed' | 'always_open' = opts.assetClass === 'equity' ? (opts.sessionOpen ? 'open' : 'closed') : 'always_open';

  const weakOrNone = tc.signalStrength === 'no_signal' || tc.signalStrength === 'weak';
  // Conviction banners require a moderate/strong signal in a live session; a weak read cannot be "EXTREME".
  const banners = weakOrNone || equityClosed ? tc.banners.filter((b) => !/EXTREME|HIGH ALIGNMENT|MEGA/i.test(b)) : tc.banners;
  const closeSchedule = equityClosed ? tc.closeSchedule.filter((r) => r.category !== 'intraday') : tc.closeSchedule;
  const direction = noSignal || equityClosed ? 'neutral' : tc.direction;

  const displayNote = equityClosed
    ? 'US equity session closed — intraday close timing resumes at the next regular session; daily+ closes shown.'
    : noSignal
      ? 'No timing signal: the agent\'s gates (active TFs, cluster ratio, directional conviction) are not met. Direction score is shown for context only.'
      : undefined;

  return {
    ...tc,
    direction,
    banners,
    closeSchedule,
    candleCloseConfluence: equityClosed
      ? { ...tc.candleCloseConfluence, closingNowCount: 0, closingNowTFs: [], closingSoonCount: 0 }
      : tc.candleCloseConfluence,
    prediction: { ...tc.prediction, direction, expectedMoveTime: equityClosed ? 'Market closed' : tc.prediction.expectedMoveTime },
    sessionState,
    displayNote,
  };
}

/** Sign-consistent description of a level relative to price: "31.2% below price" / "4.4% above price". */
export function describeLevelRelation(price: number, level: number): { pct: number; side: 'above' | 'below' | 'at'; label: string } {
  if (!(price > 0) || !Number.isFinite(level)) return { pct: 0, side: 'at', label: 'n/a' };
  const pct = ((level - price) / price) * 100;
  if (Math.abs(pct) < 0.05) return { pct: 0, side: 'at', label: 'at price' };
  const side = pct > 0 ? 'above' : 'below';
  return { pct, side, label: `${Math.abs(pct).toFixed(2)}% ${side} price` };
}
