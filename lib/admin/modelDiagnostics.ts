/**
 * Pure calibration maths for /api/admin/model-diagnostics (kept out of the route so it can be unit-tested).
 */

export interface CalibrationBucket {
  band: string;
  min: number;
  max: number;
  /** All signals in the band, including pending / unlabelled ones. Not the hit-rate denominator. */
  cases: number;
  /** Hit-rate denominator: correct + wrong verdicts from the fixed labeller. */
  labelled: number;
  wins: number;
  losses: number;
  /** Moved less than the threshold either way; left out of the hit rate. */
  neutral: number;
  pending: number;
  expired: number;
  /** Includes verdicts removed by the old-method filter and unrecognised/missing labels. */
  excludedOrUnknown: number;
  hitRate: number | null;
  avgScore: number | null;
  /** Signals with a measured 24h move (correct, wrong or neutral; |move| <= 100%). */
  measured: number;
  /** Mean 24h move in the call's direction, %, before costs. */
  avgSignedMove: number | null;
  /** avgSignedMove minus ASSUMED_ROUND_TRIP_COST_PCT. */
  avgSignedMoveAfterCost: number | null;
  /** Fewer than MIN_LABELLED_FOR_COMPARISON labelled verdicts: too few to compare bands. */
  smallSample: boolean;
}

export interface OutcomeRow {
  score?: number | string | null;
  outcome?: string | null;
  /** 24h move signed to the call's direction, %, or null when not measured by the fixed labeller. */
  signedMove?: number | string | null;
}

/** Bands with fewer labelled verdicts than this are flagged and never used for drift warnings. */
export const MIN_LABELLED_FOR_COMPARISON = 20;
/** Assumed round-trip trading cost (fees + slippage), %, deducted for the after-cost average. An assumption, not measured. */
export const ASSUMED_ROUND_TRIP_COST_PCT = 0.2;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "0–24", min: 0, max: 24 },
  { label: "25–44", min: 25, max: 44 },
  { label: "45–59", min: 45, max: 59 },
  { label: "60–74", min: 60, max: 74 },
  { label: "75–100", min: 75, max: 100 },
];

function bucketFor(score: number) {
  return BANDS.findIndex((b) => score >= b.min && score <= b.max);
}

/**
 * true = win, false = loss, null = not a verdict (pending / neutral / expired / unknown).
 * ai_signal_log uses correct / wrong; older free-text labels use win / hit / target / loss / stop.
 */
export function isWinningOutcome(outcome: string | null | undefined): boolean | null {
  if (!outcome) return null;
  const u = outcome.toUpperCase();
  if (u === "CORRECT") return true;
  if (u === "WRONG") return false;
  if (u === "NEUTRAL" || u === "EXPIRED" || u === "PENDING") return null;
  if (u.includes("WIN") || u.includes("HIT") || u.includes("TARGET") || u.includes("TP")) return true;
  if (u.includes("LOSS") || u.includes("STOP") || u.includes("MISS") || u.includes("SL")) return false;
  return null;
}

export function computeCalibration(rows: OutcomeRow[]) {
  const buckets: CalibrationBucket[] = BANDS.map((b) => ({
    band: b.label, min: b.min, max: b.max, cases: 0, labelled: 0, wins: 0, losses: 0, neutral: 0,
    pending: 0, expired: 0, excludedOrUnknown: 0,
    hitRate: null, avgScore: null, measured: 0, avgSignedMove: null, avgSignedMoveAfterCost: null, smallSample: true,
  }));
  const sumScore = new Array(BANDS.length).fill(0);
  const sumMove = new Array(BANDS.length).fill(0);

  for (const row of rows) {
    if (row.score === null || row.score === undefined || row.score === "") continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const idx = bucketFor(score);
    if (idx < 0) continue;
    const b = buckets[idx];
    b.cases += 1;
    sumScore[idx] += score;
    const win = isWinningOutcome(row.outcome ?? null);
    if (win === true) { b.labelled += 1; b.wins += 1; }
    else if (win === false) { b.labelled += 1; b.losses += 1; }
    else if (String(row.outcome ?? "").toLowerCase() === "neutral") b.neutral += 1;
    else if (String(row.outcome ?? "").toLowerCase() === "pending") b.pending += 1;
    else if (String(row.outcome ?? "").toLowerCase() === "expired") b.expired += 1;
    else b.excludedOrUnknown += 1;
    const move = row.signedMove === null || row.signedMove === undefined || row.signedMove === "" ? NaN : Number(row.signedMove);
    if (Number.isFinite(move) && Math.abs(move) <= 100) { b.measured += 1; sumMove[idx] += move; }
  }

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.cases > 0) b.avgScore = round1(sumScore[i] / b.cases);
    if (b.labelled > 0) b.hitRate = round1((b.wins / b.labelled) * 100);
    if (b.measured > 0) {
      b.avgSignedMove = round2(sumMove[i] / b.measured);
      b.avgSignedMoveAfterCost = round2(sumMove[i] / b.measured - ASSUMED_ROUND_TRIP_COST_PCT);
    }
    b.smallSample = b.labelled < MIN_LABELLED_FOR_COMPARISON;
  }

  const totalLabelled = buckets.reduce((a, b) => a + b.labelled, 0);
  const totalWins = buckets.reduce((a, b) => a + b.wins, 0);
  const overallHitRate = totalLabelled > 0 ? round1((totalWins / totalLabelled) * 100) : null;

  // Monotonicity check: a higher band materially worse (>= 5pp) than the band below, only when BOTH bands have
  // enough labelled verdicts to compare (signal counts include pending rows and are not a denominator).
  const drift: Array<{ from: string; to: string; delta: number; fromLabelled: number; toLabelled: number }> = [];
  for (let i = 1; i < buckets.length; i++) {
    const lo = buckets[i - 1];
    const hi = buckets[i];
    if (lo.hitRate !== null && hi.hitRate !== null && !lo.smallSample && !hi.smallSample) {
      const delta = round1(hi.hitRate - lo.hitRate);
      if (delta <= -5) drift.push({ from: lo.band, to: hi.band, delta, fromLabelled: lo.labelled, toLabelled: hi.labelled });
    }
  }
  return { buckets, totalLabelled, overallHitRate, drift };
}
