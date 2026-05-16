/**
 * lib/calibration/calibration.ts — Confidence calibration report.
 *
 * For each confidence bucket the system has used (high/medium/low and
 * opportunity_score buckets), what was the actual realised win rate
 * and avg R? A well-calibrated system has monotonically improving
 * outcomes as confidence rises.
 *
 * Read-only aggregation over edge_ledger_setups + edge_ledger_outcomes.
 */

import { q } from '@/lib/db';

export interface CalibrationBucket {
  bucket: string;
  setups: number;
  withOutcome: number;
  winRate: number | null;
  avgR5d: number | null;
  avgR20d: number | null;
}

export interface CalibrationReport {
  workspaceId: string;
  byConfidence: CalibrationBucket[];
  byOppScore: CalibrationBucket[];
  byEvidenceQuality: CalibrationBucket[];
  generatedAt: string;
}

async function bucketBy(
  workspaceId: string,
  bucketExpr: string,
  orderExpr: string,
): Promise<CalibrationBucket[]> {
  const rows = await q<{
    bucket: string; setups: string; with_outcome: string;
    win_rate: string | null; avg_r_5d: string | null; avg_r_20d: string | null;
    order_val: string | null;
  }>(
    `SELECT ${bucketExpr} AS bucket,
            COUNT(*)::text AS setups,
            COUNT(*) FILTER (WHERE o.realised_r_5d IS NOT NULL)::text AS with_outcome,
            AVG(CASE WHEN o.realised_r_5d IS NOT NULL THEN (CASE WHEN o.realised_r_5d > 0 THEN 1.0 ELSE 0.0 END) END)::text AS win_rate,
            AVG(o.realised_r_5d)::text AS avg_r_5d,
            AVG(o.realised_r_20d)::text AS avg_r_20d,
            ${orderExpr} AS order_val
       FROM edge_ledger_setups s
       LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
      WHERE s.workspace_id = $1 AND s.status = 'taken'
      GROUP BY bucket, order_val
      ORDER BY order_val NULLS LAST`,
    [workspaceId],
  );
  const num = (v: string | null) => v === null ? null : Number(v);
  return rows.map((r) => ({
    bucket: r.bucket,
    setups: Number(r.setups),
    withOutcome: Number(r.with_outcome),
    winRate: num(r.win_rate),
    avgR5d: num(r.avg_r_5d),
    avgR20d: num(r.avg_r_20d),
  }));
}

export async function buildCalibrationReport(workspaceId: string): Promise<CalibrationReport> {
  const [byConfidence, byOppScore, byEvidence] = await Promise.all([
    bucketBy(
      workspaceId,
      `COALESCE(s.confidence, 'unknown')`,
      `CASE COALESCE(s.confidence, 'unknown')
         WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END::text`,
    ),
    bucketBy(
      workspaceId,
      `CASE
         WHEN s.opportunity_score IS NULL THEN 'unknown'
         WHEN s.opportunity_score >= 80 THEN '80–100'
         WHEN s.opportunity_score >= 60 THEN '60–79'
         WHEN s.opportunity_score >= 40 THEN '40–59'
         ELSE '<40' END`,
      `CASE
         WHEN s.opportunity_score IS NULL THEN 5
         WHEN s.opportunity_score >= 80 THEN 1
         WHEN s.opportunity_score >= 60 THEN 2
         WHEN s.opportunity_score >= 40 THEN 3
         ELSE 4 END::text`,
    ),
    bucketBy(
      workspaceId,
      `CASE
         WHEN s.evidence_quality IS NULL THEN 'unknown'
         WHEN s.evidence_quality >= 80 THEN '80–100'
         WHEN s.evidence_quality >= 60 THEN '60–79'
         WHEN s.evidence_quality >= 40 THEN '40–59'
         ELSE '<40' END`,
      `CASE
         WHEN s.evidence_quality IS NULL THEN 5
         WHEN s.evidence_quality >= 80 THEN 1
         WHEN s.evidence_quality >= 60 THEN 2
         WHEN s.evidence_quality >= 40 THEN 3
         ELSE 4 END::text`,
    ),
  ]);
  return {
    workspaceId,
    byConfidence,
    byOppScore,
    byEvidenceQuality: byEvidence,
    generatedAt: new Date().toISOString(),
  };
}
