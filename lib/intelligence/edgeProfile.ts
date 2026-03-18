/**
 * Edge Profile Stats Engine — v3.1 Adaptive Intelligence Foundation
 *
 * Aggregates trade_outcomes by configurable dimensions to reveal a trader's
 * statistically significant edges and blind spots.
 *
 * Design principles:
 *  1. Minimum sample thresholds to avoid overfitting on noise
 *  2. Single-dimension slices first (asset, side, strategy, regime, etc.)
 *  3. Cross-dimension combos only when both dimensions meet threshold
 *  4. Confidence score based on sample size relative to threshold
 *  5. Soft personalization — insights surfaced as hints, not hard overrides
 */

import { q } from '@/lib/db';

/* ── Configuration ─────────────────────────────────────────────────────── */

/** Minimum trades before we consider a dimension statistically meaningful. */
export const MIN_SAMPLE_SIZE = 10;

/** Minimum trades for a cross-dimension combo (higher bar than single). */
export const MIN_COMBO_SIZE = 15;

/** How many recent trades to include. Null = all time. */
export const DEFAULT_LOOKBACK_DAYS: number | null = null;

/* ── Types ──────────────────────────────────────────────────────────────── */

export type EdgeDimension =
  | 'overall'
  | 'asset_class'
  | 'side'
  | 'strategy'
  | 'setup'
  | 'regime'
  | 'volatility_regime'
  | 'day_of_week'
  | 'hour_of_day'
  | 'outcome_label'
  | 'exit_reason'
  | 'trade_type';

export interface EdgeSlice {
  dimension: EdgeDimension;
  value: string;
  sampleSize: number;
  meetsThreshold: boolean;

  winRate: number;          // 0-1
  avgR: number;             // average R-multiple
  profitFactor: number;     // gross wins / gross losses (Infinity if no losses)
  expectancy: number;       // avgWin * winRate - avgLoss * lossRate (per trade)
  avgHoldMinutes: number | null;

  // Distribution
  bigWins: number;
  smallWins: number;
  breakevens: number;
  smallLosses: number;
  bigLosses: number;

  // Advanced
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  bestR: number;
  worstR: number;
  avgPlPercent: number;

  /** 0-1 confidence in the stat (ramps from 0 at threshold/2 to 1 at 3×threshold). */
  confidence: number;
}

export interface EdgeProfile {
  workspaceId: string;
  totalOutcomes: number;
  computedAt: string;
  slices: EdgeSlice[];
  topEdges: EdgeSlice[];    // Best 5 edges by expectancy (meets threshold only)
  weakSpots: EdgeSlice[];   // Worst 5 edges by expectancy (meets threshold only)
  insights: EdgeInsight[];  // Human-readable insight cards
  edgeSummary: EdgeSummary | null;       // AI-ready summary (v3.2)
  strongestEdges: EdgeEntry[];           // Qualified strength entries (v3.2)
  weakestEdges: EdgeEntry[];             // Qualified weakness entries (v3.2)
  softEdgeHints: SoftEdgeHints;          // Scanner-ready hints (v3.2)
}

export interface EdgeInsight {
  id: string;
  type: 'strength' | 'weakness' | 'pattern' | 'caution';
  title: string;
  body: string;
  dimension: EdgeDimension;
  value: string;
  confidence: number;
  sampleSize: number;
}

/* ── v3.2 Structured output types ──────────────────────────────────────── */

/** AI-ready summary for prompt injection. */
export interface EdgeSummary {
  strongestAssetClass: string | null;
  strongestStrategy: string | null;
  strongestRegime: string | null;
  preferredSide: string | null;
  overallWinRate: number;
  avgR: number;
  expectancy: number;
  profitFactor: number;
  confidence: number;
}

/** Structured edge entry for strongest/weakest arrays. */
export interface EdgeEntry {
  dimension: EdgeDimension;
  value: string;
  sampleSize: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  confidence: number;
  insightType: 'strength' | 'weakness';
}

/** Scanner-ready soft personalization hints. */
export interface SoftEdgeHints {
  preferredAssets: string[];
  preferredSides: string[];      // Normalized: 'long' | 'short'
  preferredStrategies: string[];
  preferredRegimes: string[];
  hasEnoughData: boolean;
}

/**
 * Normalize directional vocabulary to a common internal form.
 * DB stores: LONG / SHORT
 * Scanner uses: bullish / bearish / neutral
 * Internal canonical: long / short / neutral
 */
export function normalizeSide(value: string): 'long' | 'short' | 'neutral' {
  const v = value.toLowerCase().trim();
  if (v === 'long' || v === 'bullish' || v === 'bull') return 'long';
  if (v === 'short' || v === 'bearish' || v === 'bear') return 'short';
  return 'neutral';
}

/* ── Dimension validation (prevents SQL injection) ─────────────────────── */

const VALID_DIMENSION_COLUMNS: Record<EdgeDimension, string> = {
  overall: "'overall'",
  asset_class: 'asset_class',
  side: 'side',
  strategy: 'LOWER(TRIM(strategy))',
  setup: 'LOWER(TRIM(setup))',
  regime: 'regime',
  volatility_regime: 'volatility_regime',
  day_of_week: 'day_of_week',
  hour_of_day: 'hour_of_day',
  outcome_label: 'outcome_label',
  exit_reason: 'exit_reason',
  trade_type: 'trade_type',
};

export function isValidDimension(d: string): d is EdgeDimension {
  return d in VALID_DIMENSION_COLUMNS;
}

/* ── Core SQL aggregation ──────────────────────────────────────────────── */

interface AggRow {
  dim_value: string;
  sample_size: number;
  wins: number;
  losses: number;
  breakevens: number;
  big_wins: number;
  small_wins: number;
  small_losses: number;
  big_losses: number;
  avg_r: number;
  avg_pl_pct: number;
  gross_win_r: number;
  gross_loss_r: number;
  best_r: number;
  worst_r: number;
  avg_hold_m: number | null;
  outcomes_list: string;  // comma-separated outcomes for streak calculation
}

async function queryDimension(
  workspaceId: string,
  dimension: EdgeDimension,
  lookbackDays: number | null
): Promise<AggRow[]> {
  // Validate dimension against allowlist (prevents SQL injection)
  const dimCol = VALID_DIMENSION_COLUMNS[dimension];
  if (!dimCol) throw new Error(`Invalid dimension: ${dimension}`);

  const params: (string | number)[] = [workspaceId];
  let lookbackClause = '';
  if (lookbackDays != null && Number.isFinite(lookbackDays) && lookbackDays > 0) {
    params.push(lookbackDays);
    lookbackClause = `AND exit_ts >= NOW() - make_interval(days => $${params.length})`;
  }

  const sql = `
    SELECT
      ${dimCol}::TEXT                                       AS dim_value,
      COUNT(*)::INT                                         AS sample_size,
      COUNT(*) FILTER (WHERE outcome = 'win')::INT          AS wins,
      COUNT(*) FILTER (WHERE outcome = 'loss')::INT         AS losses,
      COUNT(*) FILTER (WHERE outcome = 'breakeven')::INT    AS breakevens,
      COUNT(*) FILTER (WHERE outcome_label = 'big_win')::INT    AS big_wins,
      COUNT(*) FILTER (WHERE outcome_label = 'small_win')::INT  AS small_wins,
      COUNT(*) FILTER (WHERE outcome_label = 'small_loss')::INT AS small_losses,
      COUNT(*) FILTER (WHERE outcome_label = 'big_loss')::INT   AS big_losses,
      COALESCE(AVG(r_multiple), 0)::FLOAT                   AS avg_r,
      COALESCE(AVG(pl_percent), 0)::FLOAT                   AS avg_pl_pct,
      COALESCE(SUM(r_multiple) FILTER (WHERE r_multiple > 0), 0)::FLOAT  AS gross_win_r,
      COALESCE(ABS(SUM(r_multiple) FILTER (WHERE r_multiple < 0)), 0)::FLOAT AS gross_loss_r,
      COALESCE(MAX(r_multiple), 0)::FLOAT                   AS best_r,
      COALESCE(MIN(r_multiple), 0)::FLOAT                   AS worst_r,
      AVG(hold_duration_m)::FLOAT                           AS avg_hold_m,
      STRING_AGG(outcome, ',' ORDER BY exit_ts, journal_entry_id) AS outcomes_list
    FROM trade_outcomes
    WHERE workspace_id = $1
      AND outcome IN ('win','loss','breakeven')
      ${lookbackClause}
    ${dimension === 'overall' ? '' : `GROUP BY ${dimCol}`}
    ${dimension !== 'overall' ? `HAVING COUNT(*) >= 1` : ''}
    ORDER BY sample_size DESC
  `;

  return q<AggRow>(sql, params);
}

/* ── Streak calculator ──────────────────────────────────────────────────── */

function maxStreak(outcomes: string, target: string): number {
  if (!outcomes) return 0;
  let current = 0;
  let max = 0;
  for (const o of outcomes.split(',')) {
    if (o === target) {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

/* ── Stat confidence (ramps from 0 → 1 as sample grows) ────────────────── */

function statConfidence(sampleSize: number, minThreshold: number): number {
  if (sampleSize < minThreshold * 0.5) return 0;
  if (sampleSize >= minThreshold * 3) return 1;
  return Math.min(1, (sampleSize - minThreshold * 0.5) / (minThreshold * 2.5));
}

/* ── Build a single slice from an agg row ──────────────────────────────── */

function buildSlice(
  dimension: EdgeDimension,
  row: AggRow,
  minSample: number
): EdgeSlice {
  const winRate = row.sample_size > 0 ? row.wins / row.sample_size : 0;
  const lossRate = row.sample_size > 0 ? row.losses / row.sample_size : 0;

  const avgWinR = row.wins > 0 ? row.gross_win_r / row.wins : 0;
  const avgLossR = row.losses > 0 ? row.gross_loss_r / row.losses : 0;

  return {
    dimension,
    value: row.dim_value ?? 'unknown',
    sampleSize: row.sample_size,
    meetsThreshold: row.sample_size >= minSample,
    winRate,
    avgR: row.avg_r,
    profitFactor: row.gross_loss_r > 0 ? row.gross_win_r / row.gross_loss_r : (row.gross_win_r > 0 ? Infinity : 0),
    expectancy: avgWinR * winRate - avgLossR * lossRate,
    avgHoldMinutes: row.avg_hold_m,
    bigWins: row.big_wins,
    smallWins: row.small_wins,
    breakevens: row.breakevens,
    smallLosses: row.small_losses,
    bigLosses: row.big_losses,
    maxConsecutiveWins: maxStreak(row.outcomes_list, 'win'),
    maxConsecutiveLosses: maxStreak(row.outcomes_list, 'loss'),
    bestR: row.best_r,
    worstR: row.worst_r,
    avgPlPercent: row.avg_pl_pct,
    confidence: statConfidence(row.sample_size, minSample),
  };
}

/* ── Insight generator ──────────────────────────────────────────────────── */

function generateInsights(slices: EdgeSlice[]): EdgeInsight[] {
  const insights: EdgeInsight[] = [];
  const qualified = slices.filter(s =>
    s.meetsThreshold &&
    s.dimension !== 'overall' &&
    s.value !== '(null)' && s.value !== 'null' && s.value !== 'unknown'
  );

  // Best edge
  const byExpectancy = [...qualified].sort((a, b) => b.expectancy - a.expectancy);
  if (byExpectancy[0] && byExpectancy[0].expectancy > 0) {
    const s = byExpectancy[0];
    insights.push({
      id: `strength_${s.dimension}_${s.value}`,
      type: 'strength',
      title: `Historical pattern: ${formatDimLabel(s.dimension)} = ${s.value}`,
      body: `${(s.winRate * 100).toFixed(0)}% win rate with ${s.avgR.toFixed(2)}R avg across ${s.sampleSize} trades.` +
        (s.profitFactor !== Infinity ? ` Profit factor ${s.profitFactor.toFixed(2)}.` : ''),
      dimension: s.dimension,
      value: s.value,
      confidence: s.confidence,
      sampleSize: s.sampleSize,
    });
  }

  // Worst weakness
  const worst = byExpectancy[byExpectancy.length - 1];
  if (worst && worst.expectancy < 0) {
    insights.push({
      id: `weakness_${worst.dimension}_${worst.value}`,
      type: 'weakness',
      title: `Weak spot: ${formatDimLabel(worst.dimension)} = ${worst.value}`,
      body: `${(worst.winRate * 100).toFixed(0)}% win rate with ${worst.avgR.toFixed(2)}R avg across ${worst.sampleSize} trades. Historical performance below average in this category.`,
      dimension: worst.dimension,
      value: worst.value,
      confidence: worst.confidence,
      sampleSize: worst.sampleSize,
    });
  }

  // Time patterns
  const daySlices = qualified.filter(s => s.dimension === 'day_of_week').sort((a, b) => b.expectancy - a.expectancy);
  if (daySlices.length >= 2) {
    const best = daySlices[0];
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    insights.push({
      id: `pattern_best_day`,
      type: 'pattern',
      title: `Best trading day: ${names[Number(best.value)] ?? best.value}`,
      body: `${(best.winRate * 100).toFixed(0)}% win rate, ${best.avgR.toFixed(2)}R avg on ${names[Number(best.value)] ?? best.value}s (${best.sampleSize} trades).`,
      dimension: 'day_of_week',
      value: best.value,
      confidence: best.confidence,
      sampleSize: best.sampleSize,
    });
  }

  // Regime edge
  const regimeSlices = qualified.filter(s => s.dimension === 'regime').sort((a, b) => b.expectancy - a.expectancy);
  if (regimeSlices.length >= 1 && regimeSlices[0].expectancy > 0) {
    const s = regimeSlices[0];
    insights.push({
      id: `pattern_best_regime`,
      type: 'pattern',
      title: `Best in ${s.value.replace(/_/g, ' ')} regime`,
      body: `${(s.winRate * 100).toFixed(0)}% win rate, ${s.avgR.toFixed(2)}R avg when ${s.value.replace(/_/g, ' ')} (${s.sampleSize} trades).`,
      dimension: 'regime',
      value: s.value,
      confidence: s.confidence,
      sampleSize: s.sampleSize,
    });
  }

  // Caution: high loss rate somewhere
  const highLoss = qualified.find(s => s.winRate < 0.35 && s.sampleSize >= MIN_SAMPLE_SIZE);
  if (highLoss) {
    insights.push({
      id: `caution_${highLoss.dimension}_${highLoss.value}`,
      type: 'caution',
      title: `Low win rate: ${formatDimLabel(highLoss.dimension)} = ${highLoss.value}`,
      body: `Only ${(highLoss.winRate * 100).toFixed(0)}% wins with ${highLoss.avgR.toFixed(2)}R avg. Historical win rate is below 35% in this category.`,
      dimension: highLoss.dimension,
      value: highLoss.value,
      confidence: highLoss.confidence,
      sampleSize: highLoss.sampleSize,
    });
  }

  // Strategy comparison
  const stratSlices = qualified.filter(s => s.dimension === 'strategy').sort((a, b) => b.expectancy - a.expectancy);
  if (stratSlices.length >= 2) {
    const top = stratSlices[0];
    const bottom = stratSlices[stratSlices.length - 1];
    if (top.expectancy > 0 && bottom.expectancy < top.expectancy * 0.5) {
      insights.push({
        id: `pattern_strategy_gap`,
        type: 'pattern',
        title: `"${top.value}" outperforms "${bottom.value}"`,
        body: `${top.value}: ${top.avgR.toFixed(2)}R avg (${top.sampleSize} trades) vs ${bottom.value}: ${bottom.avgR.toFixed(2)}R avg (${bottom.sampleSize} trades).`,
        dimension: 'strategy',
        value: top.value,
        confidence: Math.min(top.confidence, bottom.confidence),
        sampleSize: top.sampleSize + bottom.sampleSize,
      });
    }
  }

  return insights;
}

function formatDimLabel(dim: EdgeDimension): string {
  const labels: Record<EdgeDimension, string> = {
    overall: 'Overall',
    asset_class: 'Asset class',
    side: 'Direction',
    strategy: 'Strategy',
    setup: 'Setup',
    regime: 'Market regime',
    volatility_regime: 'Volatility regime',
    day_of_week: 'Day',
    hour_of_day: 'Hour',
    outcome_label: 'Outcome type',
    exit_reason: 'Exit reason',
    trade_type: 'Trade type',
  };
  return labels[dim] || dim;
}

/* ── Main: compute full edge profile ───────────────────────────────────── */

const DIMENSIONS: EdgeDimension[] = [
  'overall',
  'asset_class',
  'side',
  'strategy',
  'setup',
  'regime',
  'volatility_regime',
  'day_of_week',
  // 'hour_of_day' excluded — trade_date is DATE so hour is always 0
  // 'exit_reason' excluded — tautological (tp always wins, sl always loses)
  'trade_type',
];

export async function computeEdgeProfile(
  workspaceId: string,
  options?: { lookbackDays?: number | null; dimensions?: EdgeDimension[] }
): Promise<EdgeProfile> {
  const lookback = options?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const dims = options?.dimensions ?? DIMENSIONS;

  const allSlices: EdgeSlice[] = [];

  for (const dim of dims) {
    const rows = await queryDimension(workspaceId, dim, lookback);
    for (const row of rows) {
      allSlices.push(buildSlice(dim, row, MIN_SAMPLE_SIZE));
    }
  }

  const overall = allSlices.find(s => s.dimension === 'overall');
  const qualified = allSlices.filter(s => s.meetsThreshold && s.dimension !== 'overall');

  const topEdges = [...qualified]
    .sort((a, b) => b.expectancy - a.expectancy)
    .slice(0, 5);

  const weakSpots = [...qualified]
    .filter(s => s.expectancy < 0)
    .sort((a, b) => a.expectancy - b.expectancy)
    .slice(0, 5);

  return {
    workspaceId,
    totalOutcomes: overall?.sampleSize ?? 0,
    computedAt: new Date().toISOString(),
    slices: allSlices,
    topEdges,
    weakSpots,
    insights: generateInsights(allSlices),
    edgeSummary: buildEdgeSummary(allSlices, overall),
    strongestEdges: buildEdgeEntries(topEdges, 'strength'),
    weakestEdges: buildEdgeEntries(weakSpots, 'weakness'),
    softEdgeHints: buildSoftEdgeHints(allSlices, overall),
  };
}

/* ── v3.2 Structured builders ──────────────────────────────────────────── */

/** Dimensions allowed for personalization (statistically meaningful only). */
const PERSONALIZATION_DIMS: EdgeDimension[] = ['asset_class', 'side', 'strategy', 'regime'];

/** Minimum confidence for soft personalization hints. */
const HINT_MIN_CONFIDENCE = 0.3;

function bestByDim(slices: EdgeSlice[], dim: EdgeDimension): EdgeSlice | null {
  return slices
    .filter(s =>
      s.dimension === dim &&
      s.meetsThreshold &&
      s.expectancy > 0 &&
      s.confidence >= 0.5 &&
      s.value !== '(null)' && s.value !== 'null' && s.value !== 'unknown'
    )
    .sort((a, b) => b.expectancy - a.expectancy)[0] ?? null;
}

function buildEdgeSummary(slices: EdgeSlice[], overall: EdgeSlice | undefined): EdgeSummary | null {
  if (!overall || overall.sampleSize < MIN_SAMPLE_SIZE) return null;

  const bestAsset = bestByDim(slices, 'asset_class');
  const bestStrategy = bestByDim(slices, 'strategy');
  const bestRegime = bestByDim(slices, 'regime');
  const bestSide = bestByDim(slices, 'side');

  return {
    strongestAssetClass: bestAsset?.value ?? null,
    strongestStrategy: bestStrategy?.value ?? null,
    strongestRegime: bestRegime?.value ?? null,
    preferredSide: bestSide?.value ?? null,
    overallWinRate: overall.winRate,
    avgR: overall.avgR,
    expectancy: overall.expectancy,
    profitFactor: overall.profitFactor === Infinity ? 999 : overall.profitFactor,
    confidence: overall.confidence,
  };
}

function buildEdgeEntries(slices: EdgeSlice[], type: 'strength' | 'weakness'): EdgeEntry[] {
  return slices
    .filter(s => s.value !== '(null)' && s.value !== 'null' && s.value !== 'unknown')
    .map(s => ({
      dimension: s.dimension,
      value: s.value,
      sampleSize: s.sampleSize,
      winRate: s.winRate,
      avgR: s.avgR,
      expectancy: s.expectancy,
      confidence: s.confidence,
      insightType: type,
    }));
}

function buildSoftEdgeHints(slices: EdgeSlice[], overall: EdgeSlice | undefined): SoftEdgeHints {
  const hasEnoughData = (overall?.sampleSize ?? 0) >= MIN_SAMPLE_SIZE;
  if (!hasEnoughData) {
    return { preferredAssets: [], preferredSides: [], preferredStrategies: [], preferredRegimes: [], hasEnoughData: false };
  }

  const positiveValues = (dim: EdgeDimension) =>
    slices
      .filter(s =>
        s.dimension === dim &&
        s.meetsThreshold &&
        s.expectancy > 0 &&
        s.confidence >= HINT_MIN_CONFIDENCE &&
        s.value !== '(null)' && s.value !== 'null' && s.value !== 'unknown'
      )
      .sort((a, b) => b.expectancy - a.expectancy)
      .map(s => s.value);

  return {
    preferredAssets: positiveValues('asset_class'),
    preferredSides: positiveValues('side').map(normalizeSide).filter(s => s !== 'neutral'),
    preferredStrategies: positiveValues('strategy'),
    preferredRegimes: positiveValues('regime'),
    hasEnoughData: true,
  };
}
