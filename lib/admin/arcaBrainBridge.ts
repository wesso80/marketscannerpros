/**
 * Phase 7 — Brain Layer → ARCA Evidence Bridge
 *
 * The single, audited path through which Brain Layer features/outcomes/edge
 * scores are presented to ARCA (the Admin Research Copilot Agent).
 *
 * ARCA receives ONLY the fields enumerated in `ArcaBrainEvidence` below.
 * No raw DB rows, no future outcome labels, no cross-workspace data, no
 * stale data presented as live, no personal portfolio constraints unless
 * the operator is in 'portfolio' or 'risk' mode.
 *
 * Pairs with:
 *   - lib/brain/visibility.ts            (admin/public separation)
 *   - lib/brain/memoryRules.ts           (eligible memory pool)
 *   - lib/brain/finalEdgeScore.ts        (final tier + confidence)
 *   - lib/admin/arcaTypes.ts             (ARCA context contract)
 *   - lib/admin/arcaPrompt.ts            (prompt language rules)
 */

import { q } from "@/lib/db";
import {
  loadEligibleMemoryPool,
  type MemoryDimension,
  type MemoryPoolRow,
} from "@/lib/brain/memoryRules";
import {
  assertPortfolioContextAllowed,
  type AdminMode,
} from "@/lib/brain/visibility";
import type {
  EdgeTier,
  ConfidenceLabel,
  OutcomeHorizon,
  DataFreshness,
} from "@/lib/brain/types";

// ─── Whitelisted evidence shape ARCA may receive ─────────────────────────────

/**
 * The COMPLETE list of Brain-derived fields ARCA is permitted to read.
 * Anything not in this shape must NOT reach the prompt.
 */
export interface ArcaBrainEvidence {
  /** Symbol the evidence is bound to. */
  symbol: string;
  /** Workspace this evidence is scoped to. ARCA must verify this matches the operator. */
  workspaceId: string;
  /** As-of timestamp for the current setup features. */
  asOfTs: string;
  /** Horizon the historical edge summary applies to. */
  horizon: OutcomeHorizon;

  // ── Current setup features (from brain_features, abridged) ─────────────────
  currentFeatures: {
    /** Engine names that contributed (no payload). */
    contributors: string[];
    /** Free-form natural-language summary built server-side from features. */
    summary: string;
  };

  // ── Freshness metadata (from brain_events.data_freshness) ──────────────────
  freshness: {
    label: DataFreshness;          // 'real-time' | 'delayed' | 'stale' | 'simulated' | 'unknown'
    isLive: boolean;               // false unless label === 'real-time'
    cachedAtMs: number | null;     // when source was sampled (epoch ms)
    note: string;                  // operator-readable explanation
  };

  // ── Historical edge summary (from brain_edge_scores latest row) ────────────
  historicalEdge: {
    sampleSize: number;
    wins: number;
    losses: number;
    winRate: number | null;        // raw — paired with wilsonLower so prompt can reframe
    wilsonLower95: number | null;  // sample-size-aware floor
    edgeTier: EdgeTier;            // includes 'insufficient_sample'
    confidenceLabel: ConfidenceLabel;
    /** ISO timestamps bounding the sample window. */
    windowStart: string;
    windowEnd: string;
  } | null;

  // ── Sample size headline (always present even when no edge row exists) ─────
  sampleSize: {
    n: number;
    classification: 'none' | 'insufficient' | 'thin' | 'developing' | 'meaningful';
  };

  // ── Regime fit ─────────────────────────────────────────────────────────────
  regimeFit: {
    currentRegime: string | null;
    workedInRegime: number | null;       // 0..1 historical hit rate within this regime
    failedInRegime: number | null;       // 0..1 fail rate within this regime
    sampleInRegime: number;
  };

  // ── Missing data list (from brain_features.missing/stale/simulated counts) ─
  missingData: {
    missingCount: number;
    staleCount: number;
    simulatedCount: number;
    /** Which feature buckets had gaps (e.g. 'options', 'derivatives'). */
    missingBuckets: string[];
  };

  // ── Confidence downgrade reasons (deterministic, not model-generated) ──────
  downgradeReasons: string[];

  // ── Similar past setup outcomes (sanitised, capped) ────────────────────────
  similarPastOutcomes: Array<{
    asOfTs: string;
    horizon: OutcomeHorizon;
    outcomeClass: MemoryPoolRow['outcomeClass'];
    mfePct: number | null;
    maePct: number | null;
  }>;

  // ── Edge decay warnings ────────────────────────────────────────────────────
  edgeDecay: {
    detected: boolean;
    reason: string | null;
    /** Recent-half win rate / older-half win rate, when computable. */
    recentVsBaselineRatio: number | null;
  };

  // ── Trap / false-positive history ─────────────────────────────────────────
  trapHistory: {
    falsePositiveRate: number | null;     // failed_before_confirmation / sample
    trapRate: number | null;              // confirmed_then_failed / sample
    confirmationFailureRate: number | null;
  };

  // ── Optional portfolio context — ONLY populated in portfolio/risk modes ───
  portfolioContext?: {
    mode: 'portfolio' | 'risk';
    summary: string;                      // server-side summary, no raw positions
  };
}

// ─── Parameters ──────────────────────────────────────────────────────────────

export interface BuildArcaBrainEvidenceParams {
  workspaceId: string;
  symbol: string;
  setupKey: string;
  /** Horizon to summarise edge over. */
  horizon: OutcomeHorizon;
  /** Current regime tag, if known. Used for regime fit lookup. */
  currentRegime?: string | null;
  /** Operator mode — controls whether portfolio context is included. */
  adminMode: AdminMode;
  /** Optional: pass in a pre-loaded portfolio summary builder. */
  loadPortfolioSummary?: () => Promise<string>;
  /** Cap on similar-past-outcome rows surfaced to ARCA (default 8). */
  maxSimilar?: number;
}

// ─── Sample-size classification ──────────────────────────────────────────────

function classifySample(n: number): ArcaBrainEvidence['sampleSize']['classification'] {
  if (n <= 0) return 'none';
  if (n < 10) return 'insufficient';
  if (n < 30) return 'thin';
  if (n < 100) return 'developing';
  return 'meaningful';
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build the ARCA evidence packet for a symbol/setup pair, sourcing strictly
 * from Brain Layer tables and applying the Phase 7 guardrails.
 *
 * Hard contracts enforced here (defence in depth — DB also enforces):
 *   - workspaceId is required and used in EVERY query (no cross-workspace).
 *   - Only outcomes resolved BEFORE NOW are queried (`as_of_ts < NOW()`),
 *     and the loader view requires `data_through_ts > as_of_ts` upstream.
 *   - Stale/simulated freshness is surfaced explicitly via `freshness.note`,
 *     never relabelled as live.
 *   - Portfolio context is only attached when adminMode ∈ {portfolio, risk}.
 *   - Result shape is the closed `ArcaBrainEvidence` interface — extra fields
 *     in source rows are ignored.
 */
export async function buildArcaBrainEvidence(
  params: BuildArcaBrainEvidenceParams,
): Promise<ArcaBrainEvidence> {
  const {
    workspaceId,
    symbol,
    setupKey,
    horizon,
    currentRegime = null,
    adminMode,
    loadPortfolioSummary,
    maxSimilar = 8,
  } = params;

  if (!workspaceId) throw new Error('buildArcaBrainEvidence: workspaceId required');
  if (!symbol) throw new Error('buildArcaBrainEvidence: symbol required');
  const NOW = new Date();

  // 1. Latest event + features for this (workspace, symbol) — current setup snapshot.
  const eventRow = await q<{
    event_id: string;
    as_of_ts: string;
    data_freshness: DataFreshness;
    ts: string;
    source: string;
    event_type: string;
  }>(
    `SELECT e.event_id, COALESCE(f.as_of_ts, e.ts) AS as_of_ts, e.data_freshness,
            e.ts, e.source, e.event_type
       FROM brain_events e
  LEFT JOIN brain_features f ON f.event_id = e.event_id
      WHERE e.workspace_id = $1
        AND UPPER(e.symbol) = UPPER($2)
        AND e.ts < $3
      ORDER BY e.ts DESC
      LIMIT 1`,
    [workspaceId, symbol, NOW],
  );

  const latestEvent = eventRow[0] ?? null;

  const featureRow = latestEvent
    ? await q<{
        market_structure: Record<string, unknown>;
        volatility: Record<string, unknown>;
        volume_liquidity: Record<string, unknown>;
        options: Record<string, unknown>;
        derivatives: Record<string, unknown>;
        time_context: Record<string, unknown>;
        macro_context: Record<string, unknown>;
        ai_evidence: Record<string, unknown>;
        missing_data_count: number;
        stale_data_count: number;
        simulated_field_count: number;
      }>(
        `SELECT market_structure, volatility, volume_liquidity, options, derivatives,
                time_context, macro_context, ai_evidence,
                missing_data_count, stale_data_count, simulated_field_count
           FROM brain_features
          WHERE event_id = $1
          LIMIT 1`,
        [latestEvent.event_id],
      )
    : [];
  const features = featureRow[0] ?? null;

  // 2. Latest edge score for this setup_key.
  const edgeRow = await q<{
    sample_size: number;
    wins: number;
    losses: number;
    win_rate: string | number | null;
    wilson_lower_95: string | number | null;
    edge_tier: EdgeTier;
    confidence_label: ConfidenceLabel;
    window_start: string;
    window_end: string;
    false_positive_rate: string | number | null;
    trap_rate: string | number | null;
    confirmation_failure_rate: string | number | null;
  }>(
    `SELECT sample_size, wins, losses, win_rate, wilson_lower_95,
            edge_tier, confidence_label, window_start, window_end,
            false_positive_rate, trap_rate, confirmation_failure_rate
       FROM brain_edge_scores
      WHERE workspace_id = $1
        AND setup_key = $2
        AND horizon = $3
      ORDER BY computed_at DESC
      LIMIT 1`,
    [workspaceId, setupKey, horizon],
  );
  const edge = edgeRow[0] ?? null;

  // 3. Similar past outcomes — eligible only, capped, oldest→newest order trimmed.
  const memoryDimension: MemoryDimension = 'setup_by_regime';
  const similar = await loadEligibleMemoryPool({
    workspaceId,
    dimension: memoryDimension,
    horizon,
    symbol,
    limit: maxSimilar,
    windowEnd: NOW,
  });

  // 4. Regime-fit — restrict the pool to the current regime if known.
  let regimeFit: ArcaBrainEvidence['regimeFit'] = {
    currentRegime,
    workedInRegime: null,
    failedInRegime: null,
    sampleInRegime: 0,
  };
  if (currentRegime) {
    const regimeRow = await q<{
      sample_in_regime: string;
      worked: string;
      failed: string;
    }>(
      `SELECT
         COUNT(*)::text AS sample_in_regime,
         COUNT(*) FILTER (WHERE outcome_class = 'confirmed_followed_through')::text AS worked,
         COUNT(*) FILTER (WHERE outcome_class IN ('failed_before_confirmation','confirmed_then_failed'))::text AS failed
       FROM brain_edge_memory_pool
      WHERE workspace_id = $1
        AND UPPER(symbol) = UPPER($2)
        AND horizon = $3
        AND (event_meta->>'regime') = $4
        AND as_of_ts < $5`,
      [workspaceId, symbol, horizon, currentRegime, NOW],
    );
    const r = regimeRow[0];
    if (r) {
      const sample = Number(r.sample_in_regime) || 0;
      const worked = Number(r.worked) || 0;
      const failed = Number(r.failed) || 0;
      regimeFit = {
        currentRegime,
        workedInRegime: sample > 0 ? worked / sample : null,
        failedInRegime: sample > 0 ? failed / sample : null,
        sampleInRegime: sample,
      };
    }
  }

  // 5. Edge-decay heuristic: split similar pool in half by time, compare hit-rate.
  const decay = computeEdgeDecay(similar);

  // 6. Freshness label/note.
  const freshness = buildFreshnessSummary(latestEvent?.data_freshness ?? 'unknown', latestEvent?.ts ?? null);

  // 7. Missing-data summary.
  const missingBuckets: string[] = [];
  if (features) {
    if (Object.keys(features.options ?? {}).length === 0) missingBuckets.push('options');
    if (Object.keys(features.derivatives ?? {}).length === 0) missingBuckets.push('derivatives');
    if (Object.keys(features.macro_context ?? {}).length === 0) missingBuckets.push('macro_context');
  }

  // 8. Build deterministic downgrade-reason list (the prompt MUST surface these).
  const downgradeReasons: string[] = [];
  const sampleN = edge?.sample_size ?? 0;
  if (sampleN < 10) downgradeReasons.push('Sample size < 10 — historical edge cannot be relied upon.');
  else if (sampleN < 30) downgradeReasons.push(`Sample size ${sampleN} — edge is provisional.`);
  if (edge && edge.edge_tier === 'insufficient_sample') downgradeReasons.push('Edge tier is insufficient_sample.');
  if (freshness.label === 'stale') downgradeReasons.push('Source data is STALE; not currently live.');
  if (freshness.label === 'simulated') downgradeReasons.push('Source data is SIMULATED; not real market data.');
  if (freshness.label === 'unknown') downgradeReasons.push('Source data freshness is UNKNOWN.');
  if ((features?.simulated_field_count ?? 0) > 0) downgradeReasons.push('Feature snapshot contains simulated fields.');
  if ((features?.missing_data_count ?? 0) > 0) downgradeReasons.push(`Feature snapshot has ${features?.missing_data_count} missing fields.`);
  if (missingBuckets.length > 0) downgradeReasons.push(`Missing feature buckets: ${missingBuckets.join(', ')}.`);
  if (decay.detected) downgradeReasons.push(`Edge decay detected: ${decay.reason ?? 'recent half underperforms baseline.'}`);
  if (regimeFit.currentRegime && regimeFit.sampleInRegime < 10) {
    downgradeReasons.push(`Only ${regimeFit.sampleInRegime} prior outcomes in regime "${regimeFit.currentRegime}" — regime fit unproven.`);
  }
  if (regimeFit.failedInRegime !== null && regimeFit.failedInRegime > 0.6) {
    downgradeReasons.push(`Setup historically fails in regime "${regimeFit.currentRegime}" (${Math.round(regimeFit.failedInRegime * 100)}% fail rate).`);
  }

  // 9. Optional portfolio context — gated by adminMode.
  let portfolioContext: ArcaBrainEvidence['portfolioContext'] | undefined;
  if (loadPortfolioSummary) {
    try {
      assertPortfolioContextAllowed(adminMode);
      const summary = await loadPortfolioSummary();
      if (summary && (adminMode === 'portfolio' || adminMode === 'risk')) {
        portfolioContext = { mode: adminMode, summary };
      }
    } catch {
      // Mode not allowed — silently omit portfolio context. ARCA will not see it.
    }
  }

  // 10. Build current-features summary (no raw payload — abridged).
  const contributors: string[] = [];
  if (features) {
    if (Object.keys(features.market_structure ?? {}).length) contributors.push('market_structure');
    if (Object.keys(features.volatility ?? {}).length)        contributors.push('volatility');
    if (Object.keys(features.volume_liquidity ?? {}).length)  contributors.push('volume_liquidity');
    if (Object.keys(features.options ?? {}).length)           contributors.push('options');
    if (Object.keys(features.derivatives ?? {}).length)       contributors.push('derivatives');
    if (Object.keys(features.time_context ?? {}).length)      contributors.push('time_context');
    if (Object.keys(features.macro_context ?? {}).length)     contributors.push('macro_context');
    if (Object.keys(features.ai_evidence ?? {}).length)       contributors.push('ai_evidence');
  }
  const currentFeatures = {
    contributors,
    summary: contributors.length
      ? `Snapshot contains: ${contributors.join(', ')}.`
      : 'No frozen feature snapshot available — current setup features are missing.',
  };

  return {
    symbol,
    workspaceId,
    asOfTs: latestEvent?.as_of_ts ?? NOW.toISOString(),
    horizon,
    currentFeatures,
    freshness,
    historicalEdge: edge
      ? {
          sampleSize: edge.sample_size,
          wins: edge.wins,
          losses: edge.losses,
          winRate: edge.win_rate == null ? null : Number(edge.win_rate),
          wilsonLower95: edge.wilson_lower_95 == null ? null : Number(edge.wilson_lower_95),
          edgeTier: edge.edge_tier,
          confidenceLabel: edge.confidence_label,
          windowStart: edge.window_start,
          windowEnd: edge.window_end,
        }
      : null,
    sampleSize: { n: sampleN, classification: classifySample(sampleN) },
    regimeFit,
    missingData: {
      missingCount: features?.missing_data_count ?? 0,
      staleCount: features?.stale_data_count ?? 0,
      simulatedCount: features?.simulated_field_count ?? 0,
      missingBuckets,
    },
    downgradeReasons,
    similarPastOutcomes: similar.map((r) => ({
      asOfTs: r.asOfTs.toISOString(),
      horizon: r.horizon,
      outcomeClass: r.outcomeClass,
      mfePct: r.mfePct,
      maePct: r.maePct,
    })),
    edgeDecay: decay,
    trapHistory: {
      falsePositiveRate: edge?.false_positive_rate == null ? null : Number(edge.false_positive_rate),
      trapRate: edge?.trap_rate == null ? null : Number(edge.trap_rate),
      confirmationFailureRate:
        edge?.confirmation_failure_rate == null ? null : Number(edge.confirmation_failure_rate),
    },
    portfolioContext,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFreshnessSummary(
  label: DataFreshness,
  observedAt: string | null,
): ArcaBrainEvidence['freshness'] {
  const cachedAtMs = observedAt ? new Date(observedAt).getTime() : null;
  const isLive = label === 'real-time';
  let note: string;
  switch (label) {
    case 'real-time':
      note = 'Live data feed.'; break;
    case 'delayed':
      note = 'Delayed feed — not real-time.'; break;
    case 'stale':
      note = 'STALE data — must NOT be presented as live.'; break;
    case 'simulated':
      note = 'SIMULATED data — not real market activity.'; break;
    case 'unknown':
    default:
      note = 'Freshness UNKNOWN — treat as not live.'; break;
  }
  return { label, isLive, cachedAtMs, note };
}

function computeEdgeDecay(rows: MemoryPoolRow[]): ArcaBrainEvidence['edgeDecay'] {
  if (rows.length < 20) {
    return { detected: false, reason: null, recentVsBaselineRatio: null };
  }
  // rows are DESC by as_of_ts from loadEligibleMemoryPool; split into recent/older halves.
  const half = Math.floor(rows.length / 2);
  const recent = rows.slice(0, half);
  const older = rows.slice(half);
  const hit = (xs: MemoryPoolRow[]) =>
    xs.filter((r) => r.outcomeClass === 'confirmed_followed_through').length / xs.length;
  const recentRate = hit(recent);
  const olderRate = hit(older);
  if (olderRate <= 0) return { detected: false, reason: null, recentVsBaselineRatio: null };
  const ratio = recentRate / olderRate;
  if (ratio < 0.6) {
    return {
      detected: true,
      reason: `Recent ${Math.round(recentRate * 100)}% vs baseline ${Math.round(olderRate * 100)}% — ratio ${ratio.toFixed(2)}.`,
      recentVsBaselineRatio: ratio,
    };
  }
  return { detected: false, reason: null, recentVsBaselineRatio: ratio };
}
