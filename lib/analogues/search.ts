/**
 * lib/analogues/search.ts
 *
 * Analogue search over historical edge-ledger setups using pgvector
 * cosine similarity on the 32-dim feature embedding.
 *
 * Workflow:
 *   1. Caller builds a SetupFeatures object for the *current* candidate.
 *   2. We embed it via buildFeatureEmbedding.
 *   3. Query: nearest N rows from edge_ledger_setups joined with
 *      edge_ledger_outcomes to surface historical resolution.
 *
 * Graceful degradation: if pgvector / feature_embedding column is
 * missing, return { ok: false, reason: 'pgvector-unavailable' } —
 * never silently fall back to fake data.
 */

import { q } from '@/lib/db';
import { buildFeatureEmbedding, vectorLiteral, type SetupFeatures } from './featureEmbedding';

export interface Analogue {
  setupId: number;
  symbol: string;
  surfacedAt: string;
  playbook: string | null;
  setupType: string;
  direction: string;
  regime: string | null;
  opportunityScore: number | null;
  evidenceQuality: number | null;
  distance: number; // cosine distance, 0 = identical
  outcome: {
    classification: string | null;
    rMultiple: number | null;
    resolvedAt: string | null;
  } | null;
}

export interface AnalogueSearchResult {
  ok: boolean;
  reason?: string;
  analogues: Analogue[];
  summary: {
    count: number;
    avgRMultiple: number | null;
    winRate: number | null; // fraction with rMultiple > 0
    medianDistance: number | null;
  };
}

async function pgvectorAvailable(): Promise<boolean> {
  const rows = await q<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'edge_ledger_setups' AND column_name = 'feature_embedding'
     ) AS exists`,
  );
  return rows[0]?.exists === true;
}

export async function findAnalogues(opts: {
  workspaceId: string;
  features: SetupFeatures;
  k?: number;
  excludeSetupId?: number;
}): Promise<AnalogueSearchResult> {
  if (!(await pgvectorAvailable())) {
    return { ok: false, reason: 'pgvector-unavailable', analogues: [], summary: emptySummary() };
  }
  const k = Math.max(1, Math.min(50, opts.k ?? 10));
  const vec = vectorLiteral(buildFeatureEmbedding(opts.features));

  const rows = await q<{
    id: number; symbol: string; surfaced_at: Date;
    playbook: string | null; setup_type: string; direction: string;
    regime: string | null; opportunity_score: string | null; evidence_quality: string | null;
    distance: string;
    classification: string | null; r_multiple: string | null; resolved_at: Date | null;
  }>(
    `SELECT s.id, s.symbol, s.surfaced_at, s.playbook, s.setup_type, s.direction,
            s.regime, s.opportunity_score::text, s.evidence_quality::text,
            (s.feature_embedding <=> $2::vector)::text AS distance,
            o.classification, o.r_multiple::text, o.resolved_at
       FROM edge_ledger_setups s
       LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
      WHERE s.workspace_id = $1
        AND s.feature_embedding IS NOT NULL
        ${opts.excludeSetupId ? 'AND s.id <> $4' : ''}
      ORDER BY s.feature_embedding <=> $2::vector
      LIMIT $3`,
    opts.excludeSetupId
      ? [opts.workspaceId, vec, k, opts.excludeSetupId]
      : [opts.workspaceId, vec, k],
  );

  const analogues: Analogue[] = rows.map((r) => ({
    setupId: Number(r.id),
    symbol: r.symbol,
    surfacedAt: r.surfaced_at.toISOString(),
    playbook: r.playbook,
    setupType: r.setup_type,
    direction: r.direction,
    regime: r.regime,
    opportunityScore: r.opportunity_score === null ? null : Number(r.opportunity_score),
    evidenceQuality: r.evidence_quality === null ? null : Number(r.evidence_quality),
    distance: Number(r.distance),
    outcome: r.classification !== null || r.r_multiple !== null
      ? {
          classification: r.classification,
          rMultiple: r.r_multiple === null ? null : Number(r.r_multiple),
          resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
        }
      : null,
  }));

  const withR = analogues.filter((a) => a.outcome?.rMultiple !== null && a.outcome?.rMultiple !== undefined);
  const avgR = withR.length > 0
    ? withR.reduce((s, a) => s + (a.outcome!.rMultiple ?? 0), 0) / withR.length
    : null;
  const winRate = withR.length > 0
    ? withR.filter((a) => (a.outcome!.rMultiple ?? 0) > 0).length / withR.length
    : null;
  const distances = analogues.map((a) => a.distance).sort((x, y) => x - y);
  const medianDistance = distances.length > 0
    ? distances[Math.floor(distances.length / 2)]
    : null;

  return {
    ok: true,
    analogues,
    summary: {
      count: analogues.length,
      avgRMultiple: avgR,
      winRate,
      medianDistance,
    },
  };
}

function emptySummary() {
  return { count: 0, avgRMultiple: null, winRate: null, medianDistance: null };
}

/**
 * Backfill helper — re-embed all rows that don't have an embedding yet.
 * Safe to run repeatedly. Skips quietly if pgvector unavailable.
 */
export async function backfillEmbeddings(workspaceId: string, limit = 500): Promise<{
  ok: boolean; reason?: string; updated: number;
}> {
  if (!(await pgvectorAvailable())) {
    return { ok: false, reason: 'pgvector-unavailable', updated: 0 };
  }
  const rows = await q<{
    id: number; regime: string | null; setup_type: string; direction: string;
    market: string; playbook: string | null; sector: string | null;
    vix_level: string | null; iv_percentile: string | null;
    catalyst_proximity_days: number | null; evidence_quality: string | null;
    opportunity_score: string | null; confidence: string | null;
    reward_risk: string | null;
  }>(
    `SELECT id, regime, setup_type, direction, market, playbook, sector,
            vix_level::text, iv_percentile::text, catalyst_proximity_days,
            evidence_quality::text, opportunity_score::text, confidence,
            reward_risk::text
       FROM edge_ledger_setups
      WHERE workspace_id = $1
        AND feature_embedding IS NULL
      LIMIT $2`,
    [workspaceId, Math.max(1, Math.min(5000, limit))],
  );
  let updated = 0;
  for (const r of rows) {
    const vec = vectorLiteral(buildFeatureEmbedding({
      regime: r.regime,
      setupType: r.setup_type,
      direction: r.direction,
      market: r.market,
      playbook: r.playbook,
      sector: r.sector,
      vixLevel: r.vix_level === null ? null : Number(r.vix_level),
      ivPercentile: r.iv_percentile === null ? null : Number(r.iv_percentile),
      catalystProximityDays: r.catalyst_proximity_days,
      evidenceQuality: r.evidence_quality === null ? null : Number(r.evidence_quality),
      opportunityScore: r.opportunity_score === null ? null : Number(r.opportunity_score),
      confidence: r.confidence,
      rewardRisk: r.reward_risk === null ? null : Number(r.reward_risk),
    }));
    await q(
      `UPDATE edge_ledger_setups SET feature_embedding = $2::vector WHERE id = $1`,
      [r.id, vec],
    );
    updated += 1;
  }
  return { ok: true, updated };
}
