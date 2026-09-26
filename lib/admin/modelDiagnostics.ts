/**
 * Pure calibration maths for /api/admin/model-diagnostics (kept out of the route so it can be unit-tested).
 */

export interface CalibrationBucket {
  band: string;
  min: number;
  max: number;
  cases: number;
  hitRate: number | null;
  avgScore: number | null;
}

export interface OutcomeRow {
  score?: number | string | null;
  outcome?: string | null;
}

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
    band: b.label, min: b.min, max: b.max, cases: 0, hitRate: null, avgScore: null,
  }));
  const sumByBucket = new Array(BANDS.length).fill(0);
  const winsByBucket = new Array(BANDS.length).fill(0);
  const labelledByBucket = new Array(BANDS.length).fill(0);

  for (const row of rows) {
    if (row.score === null || row.score === undefined || row.score === "") continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const idx = bucketFor(score);
    if (idx < 0) continue;
    buckets[idx].cases += 1;
    sumByBucket[idx] += score;
    const win = isWinningOutcome(row.outcome ?? null);
    if (win !== null) {
      labelledByBucket[idx] += 1;
      if (win) winsByBucket[idx] += 1;
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].cases > 0) buckets[i].avgScore = Math.round((sumByBucket[i] / buckets[i].cases) * 10) / 10;
    if (labelledByBucket[i] > 0) buckets[i].hitRate = Math.round((winsByBucket[i] / labelledByBucket[i]) * 1000) / 10;
  }

  const totalLabelled = labelledByBucket.reduce((a, b) => a + b, 0);
  const totalWins = winsByBucket.reduce((a, b) => a + b, 0);
  const overallHitRate = totalLabelled > 0 ? Math.round((totalWins / totalLabelled) * 1000) / 10 : null;

  // Simple monotonicity check: hit rates should not collapse as score increases. Surface a warning when a
  // higher band is materially worse than a lower one (>= 5pp drop with both bands populated).
  const drift: Array<{ from: string; to: string; delta: number }> = [];
  for (let i = 1; i < buckets.length; i++) {
    const lo = buckets[i - 1];
    const hi = buckets[i];
    if (lo.hitRate !== null && hi.hitRate !== null && hi.cases >= 5 && lo.cases >= 5) {
      const delta = Math.round((hi.hitRate - lo.hitRate) * 10) / 10;
      if (delta <= -5) drift.push({ from: lo.band, to: hi.band, delta });
    }
  }
  return { buckets, totalLabelled, overallHitRate, drift };
}
