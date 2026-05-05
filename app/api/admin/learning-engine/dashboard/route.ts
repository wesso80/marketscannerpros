/**
 * Phase 9 — Learning Engine admin dashboard data API.
 *
 * Admin-only. Returns the seven monitor sections:
 *   1. edgeHealth
 *   2. setupPerformance
 *   3. regimeMatrix
 *   4. symbolReliability
 *   5. dataQuality
 *   6. arcaAccuracy
 *   7. edgeDecay
 *
 * Sources: brain_events, brain_features, brain_outcomes, brain_edge_scores,
 * brain_edge_memory_pool view, brain_model_versions.
 *
 * Hard rules enforced:
 *   - Admin auth required (requireAdmin).
 *   - Stale/simulated rows are EXCLUDED from edge counts and surfaced as a
 *     separate "excluded" tally (data integrity rule).
 *   - All numeric claims carry a sample size; the UI labels small samples
 *     explicitly (no overstated confidence).
 *   - Source + timestamp surfaced on every section.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface EdgeHealth {
  totalSetupsTracked: number;
  cleanLabelledOutcomes: number;
  unresolvedOutcomes: number;
  excludedStaleSimulated: number;
  averageEdgeDecayRatio: number | null;
  setupsWithDecay: number;
  strongestRegimes: Array<{ regime: string; sampleSize: number; followThroughRate: number }>;
  weakestRegimes: Array<{ regime: string; sampleSize: number; followThroughRate: number }>;
}

interface SetupPerformanceRow {
  setupKey: string;
  regime: string | null;
  horizon: string;
  sampleSize: number;
  followThroughRate: number | null;
  avgMfePct: number | null;
  avgMaePct: number | null;
  falsePositiveRate: number | null;
  trapRate: number | null;
  expectancyProxy: number | null;
  wilsonLower95: number | null;
  wilsonUpper95: number | null;
  edgeTier: string;
  confidenceLabel: string;
  computedAt: string;
}

interface RegimeMatrixCell {
  setupKey: string;
  regime: string;
  edgeScore: number;
  edgeTier: string;
  sampleSize: number;
  confidenceLabel: string;
}

interface SymbolReliabilityRow {
  symbol: string;
  sampleSize: number;
  cleanFollowThroughRate: number | null;
  falsePositiveRate: number | null;
  trapRate: number | null;
  classification: 'reliable' | 'noisy' | 'inconclusive' | 'unproven';
}

interface DataQualityMonitor {
  providerStatus: Array<{ source: string; events: number; staleCount: number; simulatedCount: number; lastSeen: string | null }>;
  staleEvents: number;
  simulatedEvents: number;
  missingFeatureBuckets: { options: number; derivatives: number; macro: number };
  cachedVsLiveRatio: { live: number; delayed: number; stale: number; simulated: number; unknown: number };
  providerFailures24h: Array<{ source: string; ts: string; reason: string }>;
}

interface ArcaAccuracyMonitor {
  verdictsIssued: number;
  verdictsDowngraded: number;
  overconfidenceCaught: number;
  missingSectionWarnings: number;
  sampleSizeWarnings: number;
  followThroughAfterVerdict: { sample: number; followedThrough: number | null };
}

interface EdgeDecayRow {
  setupKey: string;
  regime: string | null;
  horizon: string;
  edgeDecayScore: number | null;
  recentVsBaselineRatio: number | null;
  reason: string | null;
  sampleSize: number;
  computedAt: string;
}

interface DashboardResponse {
  generatedAt: string;
  windowDays: number;
  edgeHealth: EdgeHealth;
  setupPerformance: SetupPerformanceRow[];
  regimeMatrix: { setupKeys: string[]; regimes: string[]; cells: RegimeMatrixCell[] };
  symbolReliability: {
    bestFollowThrough: SymbolReliabilityRow[];
    worstFalsePositive: SymbolReliabilityRow[];
    noisyOrInconclusive: SymbolReliabilityRow[];
  };
  dataQuality: DataQualityMonitor;
  arcaAccuracy: ArcaAccuracyMonitor;
  edgeDecay: EdgeDecayRow[];
}

// ────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const windowDays = Math.min(365, Math.max(1, Number(url.searchParams.get('windowDays')) || 90));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  try {
    const [
      edgeHealth,
      setupPerformance,
      regimeMatrix,
      symbolReliability,
      dataQuality,
      arcaAccuracy,
      edgeDecay,
    ] = await Promise.all([
      buildEdgeHealth(since),
      buildSetupPerformance(since),
      buildRegimeMatrix(),
      buildSymbolReliability(since),
      buildDataQuality(since),
      buildArcaAccuracy(since),
      buildEdgeDecay(),
    ]);

    const payload: DashboardResponse = {
      generatedAt: new Date().toISOString(),
      windowDays,
      edgeHealth,
      setupPerformance,
      regimeMatrix,
      symbolReliability,
      dataQuality,
      arcaAccuracy,
      edgeDecay,
    };
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'dashboard_failed', message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Edge Health
// ────────────────────────────────────────────────────────────────────────────
async function buildEdgeHealth(since: Date): Promise<EdgeHealth> {
  const totals = await q<{
    total_setups: string;
    clean_outcomes: string;
    unresolved: string;
    excluded: string;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT setup_key)::text FROM brain_edge_scores) AS total_setups,
       (SELECT COUNT(*)::text FROM brain_outcomes
          WHERE learning_eligible = TRUE AND as_of_ts >= $1) AS clean_outcomes,
       (SELECT COUNT(*)::text FROM brain_outcomes
          WHERE outcome_class IN ('no_resolution','insufficient_data') AND as_of_ts >= $1) AS unresolved,
       (SELECT COUNT(*)::text FROM brain_outcomes o
          JOIN brain_events e ON e.event_id = o.event_id
         WHERE (e.data_freshness IN ('stale','simulated','unknown') OR o.learning_eligible = FALSE)
           AND o.as_of_ts >= $1) AS excluded`,
    [since],
  );
  const t = totals[0] ?? { total_setups: '0', clean_outcomes: '0', unresolved: '0', excluded: '0' };

  const decay = await q<{ avg_ratio: string | null; with_decay: string }>(
    `SELECT AVG(edge_decay_score)::text AS avg_ratio,
            COUNT(*) FILTER (WHERE edge_decay_score IS NOT NULL AND edge_decay_score < 0.6)::text AS with_decay
       FROM brain_edge_scores
      WHERE computed_at >= $1`,
    [since],
  );
  const d = decay[0] ?? { avg_ratio: null, with_decay: '0' };

  const regimeStats = await q<{ regime: string; sample: string; follow: string }>(
    `SELECT
       COALESCE(NULLIF(event_meta->>'regime',''), 'unknown') AS regime,
       COUNT(*)::text AS sample,
       (COUNT(*) FILTER (WHERE outcome_class = 'confirmed_followed_through'))::text AS follow
       FROM brain_edge_memory_pool
      WHERE as_of_ts >= $1
      GROUP BY 1
     HAVING COUNT(*) >= 10
      ORDER BY COUNT(*) DESC`,
    [since],
  );

  const regimes = regimeStats
    .map((r) => {
      const sample = Number(r.sample) || 0;
      const follow = Number(r.follow) || 0;
      return { regime: r.regime, sampleSize: sample, followThroughRate: sample > 0 ? follow / sample : 0 };
    })
    .filter((r) => r.sampleSize >= 10);

  const sortedByFt = [...regimes].sort((a, b) => b.followThroughRate - a.followThroughRate);

  return {
    totalSetupsTracked: Number(t.total_setups) || 0,
    cleanLabelledOutcomes: Number(t.clean_outcomes) || 0,
    unresolvedOutcomes: Number(t.unresolved) || 0,
    excludedStaleSimulated: Number(t.excluded) || 0,
    averageEdgeDecayRatio: d.avg_ratio == null ? null : Number(d.avg_ratio),
    setupsWithDecay: Number(d.with_decay) || 0,
    strongestRegimes: sortedByFt.slice(0, 5),
    weakestRegimes: sortedByFt.slice(-5).reverse(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Setup Performance
// ────────────────────────────────────────────────────────────────────────────
async function buildSetupPerformance(since: Date): Promise<SetupPerformanceRow[]> {
  // Latest edge_score per (setup_key, regime, horizon).
  const rows = await q<any>(
    `WITH ranked AS (
       SELECT
         setup_key, regime, horizon, sample_size, win_rate,
         avg_mfe_pct, avg_mae_pct, false_positive_rate, trap_rate,
         expectancy_proxy, wilson_lower_95, wilson_upper_95,
         edge_tier, confidence_label, computed_at,
         ROW_NUMBER() OVER (PARTITION BY setup_key, regime, horizon ORDER BY computed_at DESC) AS rn
       FROM brain_edge_scores
       WHERE computed_at >= $1
     )
     SELECT * FROM ranked WHERE rn = 1
     ORDER BY sample_size DESC, computed_at DESC
     LIMIT 200`,
    [since],
  );

  return rows.map((r) => ({
    setupKey: r.setup_key,
    regime: r.regime ?? null,
    horizon: r.horizon,
    sampleSize: Number(r.sample_size) || 0,
    followThroughRate: r.win_rate == null ? null : Number(r.win_rate),
    avgMfePct: r.avg_mfe_pct == null ? null : Number(r.avg_mfe_pct),
    avgMaePct: r.avg_mae_pct == null ? null : Number(r.avg_mae_pct),
    falsePositiveRate: r.false_positive_rate == null ? null : Number(r.false_positive_rate),
    trapRate: r.trap_rate == null ? null : Number(r.trap_rate),
    expectancyProxy: r.expectancy_proxy == null ? null : Number(r.expectancy_proxy),
    wilsonLower95: r.wilson_lower_95 == null ? null : Number(r.wilson_lower_95),
    wilsonUpper95: r.wilson_upper_95 == null ? null : Number(r.wilson_upper_95),
    edgeTier: r.edge_tier,
    confidenceLabel: r.confidence_label,
    computedAt: r.computed_at,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Regime Matrix
// ────────────────────────────────────────────────────────────────────────────
async function buildRegimeMatrix(): Promise<DashboardResponse['regimeMatrix']> {
  const rows = await q<any>(
    `WITH ranked AS (
       SELECT setup_key, regime, edge_score, edge_tier, sample_size, confidence_label,
              ROW_NUMBER() OVER (PARTITION BY setup_key, regime ORDER BY computed_at DESC) AS rn
       FROM brain_edge_scores
       WHERE regime IS NOT NULL
     )
     SELECT setup_key, regime, edge_score, edge_tier, sample_size, confidence_label
       FROM ranked WHERE rn = 1
      ORDER BY setup_key, regime`,
  );

  const setupKeys = Array.from(new Set(rows.map((r) => r.setup_key as string))).sort();
  const regimes = Array.from(new Set(rows.map((r) => r.regime as string))).sort();
  const cells: RegimeMatrixCell[] = rows.map((r) => ({
    setupKey: r.setup_key,
    regime: r.regime,
    edgeScore: Number(r.edge_score) || 0,
    edgeTier: r.edge_tier,
    sampleSize: Number(r.sample_size) || 0,
    confidenceLabel: r.confidence_label,
  }));

  return { setupKeys, regimes, cells };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Symbol Reliability
// ────────────────────────────────────────────────────────────────────────────
async function buildSymbolReliability(since: Date): Promise<DashboardResponse['symbolReliability']> {
  const rows = await q<any>(
    `SELECT
       UPPER(symbol) AS symbol,
       COUNT(*)::int AS sample,
       (COUNT(*) FILTER (WHERE outcome_class = 'confirmed_followed_through'))::int AS followed,
       (COUNT(*) FILTER (WHERE outcome_class = 'failed_before_confirmation'))::int AS failed_before,
       (COUNT(*) FILTER (WHERE outcome_class = 'confirmed_then_failed'))::int AS trapped
     FROM brain_edge_memory_pool
     WHERE as_of_ts >= $1
     GROUP BY UPPER(symbol)
     HAVING COUNT(*) >= 10`,
    [since],
  );

  const enriched: SymbolReliabilityRow[] = rows.map((r) => {
    const sample = Number(r.sample) || 0;
    const followed = Number(r.followed) || 0;
    const failedBefore = Number(r.failed_before) || 0;
    const trapped = Number(r.trapped) || 0;
    const ft = sample > 0 ? followed / sample : null;
    const fp = sample > 0 ? failedBefore / sample : null;
    const trap = sample > 0 ? trapped / sample : null;
    let classification: SymbolReliabilityRow['classification'];
    if (sample < 30) classification = 'unproven';
    else if (ft != null && ft > 0.55 && (fp ?? 0) < 0.25) classification = 'reliable';
    else if ((fp ?? 0) > 0.4 || (trap ?? 0) > 0.3) classification = 'noisy';
    else classification = 'inconclusive';
    return {
      symbol: r.symbol,
      sampleSize: sample,
      cleanFollowThroughRate: ft,
      falsePositiveRate: fp,
      trapRate: trap,
      classification,
    };
  });

  const bestFollowThrough = [...enriched]
    .filter((r) => r.classification === 'reliable')
    .sort((a, b) => (b.cleanFollowThroughRate ?? 0) - (a.cleanFollowThroughRate ?? 0))
    .slice(0, 15);
  const worstFalsePositive = [...enriched]
    .filter((r) => r.falsePositiveRate != null)
    .sort((a, b) => (b.falsePositiveRate ?? 0) - (a.falsePositiveRate ?? 0))
    .slice(0, 15);
  const noisyOrInconclusive = enriched
    .filter((r) => r.classification === 'noisy' || r.classification === 'inconclusive')
    .sort((a, b) => b.sampleSize - a.sampleSize)
    .slice(0, 15);

  return { bestFollowThrough, worstFalsePositive, noisyOrInconclusive };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Data Quality Monitor
// ────────────────────────────────────────────────────────────────────────────
async function buildDataQuality(since: Date): Promise<DataQualityMonitor> {
  const providerRows = await q<any>(
    `SELECT
       source,
       COUNT(*)::int AS events,
       (COUNT(*) FILTER (WHERE data_freshness = 'stale'))::int AS stale,
       (COUNT(*) FILTER (WHERE data_freshness = 'simulated'))::int AS simulated,
       MAX(ts) AS last_seen
     FROM brain_events
     WHERE ts >= $1
     GROUP BY source
     ORDER BY COUNT(*) DESC`,
    [since],
  );

  const freshnessRows = await q<{ data_freshness: string; n: string }>(
    `SELECT data_freshness, COUNT(*)::text AS n
       FROM brain_events
      WHERE ts >= $1
      GROUP BY data_freshness`,
    [since],
  );
  const freshness = { live: 0, delayed: 0, stale: 0, simulated: 0, unknown: 0 };
  for (const r of freshnessRows) {
    const n = Number(r.n) || 0;
    if (r.data_freshness === 'real-time') freshness.live = n;
    else if (r.data_freshness === 'delayed') freshness.delayed = n;
    else if (r.data_freshness === 'stale') freshness.stale = n;
    else if (r.data_freshness === 'simulated') freshness.simulated = n;
    else freshness.unknown = n;
  }

  const buckets = await q<{ options_missing: string; derivatives_missing: string; macro_missing: string }>(
    `SELECT
       (COUNT(*) FILTER (WHERE options = '{}'::jsonb))::text AS options_missing,
       (COUNT(*) FILTER (WHERE derivatives = '{}'::jsonb))::text AS derivatives_missing,
       (COUNT(*) FILTER (WHERE macro_context = '{}'::jsonb))::text AS macro_missing
     FROM brain_features
     WHERE ingested_at >= $1`,
    [since],
  );
  const b = buckets[0] ?? { options_missing: '0', derivatives_missing: '0', macro_missing: '0' };

  const failures = await q<any>(
    `SELECT source, ts, COALESCE(meta->>'failure_reason', meta->>'error', 'provider_failure') AS reason
       FROM brain_events
      WHERE event_type = 'provider_failure'
        AND ts >= NOW() - INTERVAL '24 hours'
      ORDER BY ts DESC
      LIMIT 50`,
  );

  return {
    providerStatus: providerRows.map((r) => ({
      source: r.source,
      events: Number(r.events) || 0,
      staleCount: Number(r.stale) || 0,
      simulatedCount: Number(r.simulated) || 0,
      lastSeen: r.last_seen ?? null,
    })),
    staleEvents: freshness.stale,
    simulatedEvents: freshness.simulated,
    missingFeatureBuckets: {
      options: Number(b.options_missing) || 0,
      derivatives: Number(b.derivatives_missing) || 0,
      macro: Number(b.macro_missing) || 0,
    },
    cachedVsLiveRatio: freshness,
    providerFailures24h: failures.map((f) => ({ source: f.source, ts: f.ts, reason: f.reason })),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 6. ARCA Accuracy Monitor
// ────────────────────────────────────────────────────────────────────────────
async function buildArcaAccuracy(since: Date): Promise<ArcaAccuracyMonitor> {
  // ARCA verdicts are recorded as brain_events with event_type = 'arca_verdict'.
  // Downgrades / overconfidence catches / sample warnings live in meta.
  const counts = await q<any>(
    `SELECT
       (COUNT(*) FILTER (WHERE event_type = 'arca_verdict'))::int AS issued,
       (COUNT(*) FILTER (WHERE event_type = 'arca_verdict' AND (meta->>'downgraded')::boolean = TRUE))::int AS downgraded,
       (COUNT(*) FILTER (WHERE event_type = 'arca_verdict' AND (meta->>'overconfidence_caught')::boolean = TRUE))::int AS overconf,
       (COUNT(*) FILTER (WHERE event_type = 'arca_verdict' AND (meta->>'missing_section_warning')::boolean = TRUE))::int AS missing_section,
       (COUNT(*) FILTER (WHERE event_type = 'arca_verdict' AND (meta->>'sample_size_warning')::boolean = TRUE))::int AS sample_warn
     FROM brain_events
     WHERE ts >= $1`,
    [since],
  );
  const c = counts[0] ?? {};

  const followRows = await q<any>(
    `SELECT
       COUNT(*)::int AS sample,
       (COUNT(*) FILTER (WHERE o.outcome_class = 'confirmed_followed_through'))::int AS followed
     FROM brain_events e
     JOIN brain_outcomes o ON o.event_id = e.event_id
     WHERE e.event_type = 'arca_verdict' AND e.ts >= $1`,
    [since],
  );
  const f = followRows[0] ?? { sample: 0, followed: 0 };
  const sample = Number(f.sample) || 0;
  const followed = Number(f.followed) || 0;

  return {
    verdictsIssued: Number(c.issued) || 0,
    verdictsDowngraded: Number(c.downgraded) || 0,
    overconfidenceCaught: Number(c.overconf) || 0,
    missingSectionWarnings: Number(c.missing_section) || 0,
    sampleSizeWarnings: Number(c.sample_warn) || 0,
    followThroughAfterVerdict: {
      sample,
      followedThrough: sample > 0 ? followed / sample : null,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Edge Decay Monitor
// ────────────────────────────────────────────────────────────────────────────
async function buildEdgeDecay(): Promise<EdgeDecayRow[]> {
  const rows = await q<any>(
    `WITH ranked AS (
       SELECT setup_key, regime, horizon, edge_decay_score, edge_decay_reason,
              sample_size, computed_at,
              ROW_NUMBER() OVER (PARTITION BY setup_key, regime, horizon ORDER BY computed_at DESC) AS rn
         FROM brain_edge_scores
        WHERE edge_decay_score IS NOT NULL
     )
     SELECT * FROM ranked
      WHERE rn = 1 AND edge_decay_score < 0.8
      ORDER BY edge_decay_score ASC, sample_size DESC
      LIMIT 100`,
  );

  return rows.map((r) => ({
    setupKey: r.setup_key,
    regime: r.regime ?? null,
    horizon: r.horizon,
    edgeDecayScore: r.edge_decay_score == null ? null : Number(r.edge_decay_score),
    recentVsBaselineRatio: r.edge_decay_score == null ? null : Number(r.edge_decay_score),
    reason: r.edge_decay_reason ?? null,
    sampleSize: Number(r.sample_size) || 0,
    computedAt: r.computed_at,
  }));
}
