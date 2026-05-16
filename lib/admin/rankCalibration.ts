/**
 * Rank-score calibration (Tier 1 #3, read-only).
 *
 * Joins persisted admin_edge_packets (axis snapshots at decision time)
 * with edge_ledger_setups + edge_ledger_outcomes (realised forward
 * returns) and computes the Spearman correlation between each axis
 * score and the realised 5-day R-multiple.
 *
 * Output is read-only diagnostic — the live computeRankScore() in
 * lib/admin/edgePacket.ts is NOT mutated by this module. Operators
 * can compare current weights vs calibrated weights and decide
 * whether to apply a new weighting in a future release.
 *
 * Per data-integrity rule: when the sample is too small, we return
 * status="insufficient" rather than emit unreliable weights.
 */

import { q } from "@/lib/db";

const MIN_SAMPLE_SIZE = 25;

const AXES = [
  "asymmetryScore",
  "timingScore",
  "volatilityScore",
  "liquidityScore",
  "optionsScore",
  "structureScore",
  "invalidationClarityScore",
] as const;

const TRAP_AXIS = "trapRiskScore" as const;

// Current weights from computeRankScore() in lib/admin/edgePacket.ts.
// Kept in sync manually — referenced by the calibration report so
// operators can diff "current" vs "calibrated" side-by-side.
export const CURRENT_WEIGHTS: Record<string, number> = {
  asymmetryScore: 0.22,
  timingScore: 0.18,
  volatilityScore: 0.15,
  structureScore: 0.12,
  liquidityScore: 0.12,
  optionsScore: 0.11,
  invalidationClarityScore: 0.10,
  trapRiskScore: -0.20,
};

export type CalibrationStatus = "ok" | "insufficient" | "error";

export interface AxisCalibration {
  axis: string;
  /** Spearman correlation with realised_r_5d. Negative is expected for trapRiskScore. */
  correlation: number;
  /** Normalised recommended weight (sum of absolute values = 1.0). */
  recommendedWeight: number;
  currentWeight: number;
  delta: number;
  sampleSize: number;
}

export interface CalibrationReport {
  status: CalibrationStatus;
  workspaceId: string;
  sampleSize: number;
  minRequired: number;
  computedAt: string;
  windowDays: number;
  axes: AxisCalibration[];
  notes: string[];
}

interface JoinedRow {
  axes: Partial<Record<typeof AXES[number] | typeof TRAP_AXIS, number>>;
  realisedR5d: number;
}

/**
 * Compute calibrated axis weights for a workspace.
 * @param workspaceId tenant scope
 * @param windowDays look-back window in days (default 90)
 */
export async function computeRankCalibration(
  workspaceId: string,
  windowDays = 90,
): Promise<CalibrationReport> {
  const computedAt = new Date().toISOString();
  const notes: string[] = [];

  let rows: JoinedRow[] = [];
  try {
    rows = await loadJoinedRows(workspaceId, windowDays);
  } catch (err) {
    return {
      status: "error",
      workspaceId,
      sampleSize: 0,
      minRequired: MIN_SAMPLE_SIZE,
      computedAt,
      windowDays,
      axes: [],
      notes: [
        `Calibration query failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  if (rows.length < MIN_SAMPLE_SIZE) {
    notes.push(
      `Insufficient sample (${rows.length} < ${MIN_SAMPLE_SIZE}). Calibration is gathering data; current weights remain authoritative.`,
    );
    return {
      status: "insufficient",
      workspaceId,
      sampleSize: rows.length,
      minRequired: MIN_SAMPLE_SIZE,
      computedAt,
      windowDays,
      axes: [],
      notes,
    };
  }

  // Compute Spearman correlation per axis.
  const correlations: Array<{ axis: string; correlation: number; n: number }> = [];
  for (const axis of [...AXES, TRAP_AXIS] as readonly string[]) {
    const pairs: Array<[number, number]> = [];
    for (const r of rows) {
      const v = (r.axes as Record<string, number | undefined>)[axis];
      if (typeof v === "number" && Number.isFinite(v)) {
        pairs.push([v, r.realisedR5d]);
      }
    }
    if (pairs.length < MIN_SAMPLE_SIZE) {
      correlations.push({ axis, correlation: 0, n: pairs.length });
      notes.push(`Axis ${axis}: insufficient non-null samples (${pairs.length}), correlation pinned to 0.`);
      continue;
    }
    correlations.push({
      axis,
      correlation: spearman(pairs),
      n: pairs.length,
    });
  }

  // Normalise: positive axes get a share of 1.0 proportional to |correlation|.
  // Trap axis preserves its inverted sign by convention.
  const positive = correlations.filter((c) => c.axis !== TRAP_AXIS);
  const trap = correlations.find((c) => c.axis === TRAP_AXIS);
  const totalAbs = positive.reduce((acc, c) => acc + Math.max(0, c.correlation), 0);
  const trapAbs = trap ? Math.abs(trap.correlation) : 0;
  // Reserve a portion equal to current trap weight magnitude (0.20) for the trap axis.
  const positiveBudget = 1 - Math.min(0.3, trapAbs > 0 ? 0.2 : 0);

  const axesCalibration: AxisCalibration[] = correlations.map((c) => {
    const isTrap = c.axis === TRAP_AXIS;
    let recommendedWeight: number;
    if (isTrap) {
      recommendedWeight = -Math.min(0.3, trapAbs > 0 ? Math.max(0.1, trapAbs * 0.3) : 0.2);
    } else if (totalAbs <= 0) {
      recommendedWeight = CURRENT_WEIGHTS[c.axis] ?? 0;
    } else {
      const pos = Math.max(0, c.correlation);
      recommendedWeight = Math.round(((pos / totalAbs) * positiveBudget) * 1000) / 1000;
    }
    const current = CURRENT_WEIGHTS[c.axis] ?? 0;
    return {
      axis: c.axis,
      correlation: Math.round(c.correlation * 1000) / 1000,
      recommendedWeight,
      currentWeight: current,
      delta: Math.round((recommendedWeight - current) * 1000) / 1000,
      sampleSize: c.n,
    };
  });

  return {
    status: "ok",
    workspaceId,
    sampleSize: rows.length,
    minRequired: MIN_SAMPLE_SIZE,
    computedAt,
    windowDays,
    axes: axesCalibration,
    notes,
  };
}

async function loadJoinedRows(workspaceId: string, windowDays: number): Promise<JoinedRow[]> {
  // Join edge_ledger_outcomes -> edge_ledger_setups (for packet_id) ->
  // admin_edge_packets (for axes JSON). Filter by workspace and window.
  // Only `outcome_status='complete'` rows are considered (5d window must
  // be fully closed for realised_r_5d to be honest).
  const rows = await q<{ packet_json: unknown; realised_r_5d: string | number }>(
    `SELECT aep.packet_json AS packet_json, elo.realised_r_5d AS realised_r_5d
       FROM edge_ledger_outcomes elo
       JOIN edge_ledger_setups   els ON els.id = elo.setup_id
       JOIN admin_edge_packets   aep ON aep.packet_id = els.packet_id
                                    AND aep.workspace_id = elo.workspace_id
      WHERE elo.workspace_id = $1
        AND elo.outcome_status = 'complete'
        AND elo.realised_r_5d IS NOT NULL
        AND elo.labelled_at >= NOW() - ($2 || ' days')::interval
      LIMIT 1000`,
    [workspaceId, String(windowDays)],
  );

  const out: JoinedRow[] = [];
  for (const row of rows) {
    const r5 = Number(row.realised_r_5d);
    if (!Number.isFinite(r5)) continue;
    const pkt = row.packet_json as Record<string, unknown> | null;
    if (!pkt || typeof pkt !== "object") continue;
    const axes: JoinedRow["axes"] = {};
    for (const axis of [...AXES, TRAP_AXIS] as readonly string[]) {
      const v = pkt[axis];
      if (typeof v === "number" && Number.isFinite(v)) {
        (axes as Record<string, number>)[axis] = v;
      }
    }
    out.push({ axes, realisedR5d: r5 });
  }
  return out;
}

/**
 * Spearman rank correlation. Returns a value in [-1, 1].
 * Used here in preference to Pearson because axis scores are bounded
 * 0..100 and outcomes are heavy-tailed; rank correlation is more
 * robust to outliers without requiring outlier winsorisation.
 */
function spearman(pairs: Array<[number, number]>): number {
  const n = pairs.length;
  if (n < 2) return 0;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const rx = rank(xs);
  const ry = rank(ys);
  let sumDsq = 0;
  for (let i = 0; i < n; i += 1) {
    const d = rx[i] - ry[i];
    sumDsq += d * d;
  }
  return 1 - (6 * sumDsq) / (n * (n * n - 1));
}

function rank(values: number[]): number[] {
  const sorted = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j += 1;
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) out[sorted[k].i] = avg;
    i = j + 1;
  }
  return out;
}
