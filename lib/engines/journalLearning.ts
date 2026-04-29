/**
 * Phase 7 — Journal Learning Engine
 *
 * Pure pattern-detection over saved admin_research_cases. Given a list
 * of historical cases and a current research candidate, identifies
 * repeat patterns and produces a "journal DNA" summary the cockpit can
 * render. Also exposes a small boost computation used by the score
 * engine when a strong journal pattern match exists.
 *
 * BOUNDARY: this engine never speaks about trades. It speaks about
 * *research patterns* — repeated thesis fingerprints across past
 * research cases.
 */

export interface JournalCaseRow {
  id?: string | number;
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setupType: string;
  score: number;
  lifecycle: string;
  dataTrustScore: number;
  createdAt: string;
}

export interface JournalCurrent {
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setupType: string;
  score: number;
}

export interface JournalPatternGroup {
  /** Stable group key: setupType|market|bias. */
  key: string;
  setupType: string;
  market: string;
  bias: string;
  count: number;
  avgScore: number;
  /** Most recent createdAt in the group. */
  lastSeenAt: string | null;
  /** Sample symbols in the group (deduped, max 8). */
  sampleSymbols: string[];
}

export interface JournalPatternMatch {
  group: JournalPatternGroup;
  /** How well the current candidate fits the group (0..1). */
  fit: number;
  /** Whether the current candidate's score sits inside the group's score band. */
  inScoreBand: boolean;
}

export interface JournalDNASummary {
  totalCases: number;
  groups: JournalPatternGroup[];
  /** Groups whose key matches the current candidate (setup+market+bias). */
  matches: JournalPatternMatch[];
  /** True if the current candidate has a meaningful repeat pattern. */
  hasMeaningfulMatch: boolean;
}

export interface JournalPatternBoost {
  weight: number;
  reason: string;
}

/* ───────────── Tuning ───────────── */

const MIN_GROUP_FOR_BOOST = 3;          // need ≥3 cases to call it a pattern
const SCORE_BAND_TOLERANCE = 12;        // ± points around the group's avg score
const BOOST_WEIGHT_MIN = 2;
const BOOST_WEIGHT_MAX = 6;

/* ───────────── Helpers ───────────── */

function groupKey(setupType: string, market: string, bias: string): string {
  return `${setupType.toUpperCase()}|${market.toUpperCase()}|${bias.toUpperCase()}`;
}

/* ───────────── Public ───────────── */

export function buildPatternGroups(cases: JournalCaseRow[]): JournalPatternGroup[] {
  const buckets = new Map<string, JournalCaseRow[]>();
  for (const c of cases) {
    const k = groupKey(c.setupType, c.market, c.bias);
    const arr = buckets.get(k) ?? [];
    arr.push(c);
    buckets.set(k, arr);
  }

  const out: JournalPatternGroup[] = [];
  for (const [key, rows] of buckets.entries()) {
    const count = rows.length;
    const avgScore = rows.reduce((s, r) => s + (Number.isFinite(r.score) ? r.score : 0), 0) / Math.max(1, count);
    const lastSeenAt = rows
      .map((r) => r.createdAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;
    const symbols = Array.from(new Set(rows.map((r) => r.symbol.toUpperCase()))).slice(0, 8);
    out.push({
      key,
      setupType: rows[0].setupType,
      market: rows[0].market,
      bias: rows[0].bias,
      count,
      avgScore: Math.round(avgScore),
      lastSeenAt,
      sampleSymbols: symbols,
    });
  }
  // Sort by count desc, then avgScore desc.
  out.sort((a, b) => b.count - a.count || b.avgScore - a.avgScore);
  return out;
}

export function findJournalMatches(
  groups: JournalPatternGroup[],
  current: JournalCurrent,
): JournalPatternMatch[] {
  const targetKey = groupKey(current.setupType, current.market, current.bias);
  const out: JournalPatternMatch[] = [];
  for (const g of groups) {
    if (g.key !== targetKey) continue;
    const inBand = Math.abs(current.score - g.avgScore) <= SCORE_BAND_TOLERANCE;
    // Fit: scales with count and proximity to avg score (saturates at 10 cases).
    const countFit = Math.min(1, g.count / 10);
    const scoreFit = inBand ? 1 - Math.abs(current.score - g.avgScore) / SCORE_BAND_TOLERANCE : 0;
    const fit = Math.max(0, Math.min(1, 0.6 * countFit + 0.4 * scoreFit));
    out.push({ group: g, fit, inScoreBand: inBand });
  }
  return out;
}

export function buildJournalDNA(
  cases: JournalCaseRow[],
  current: JournalCurrent | null,
): JournalDNASummary {
  const groups = buildPatternGroups(cases);
  const matches = current ? findJournalMatches(groups, current) : [];
  const hasMeaningfulMatch = matches.some(
    (m) => m.group.count >= MIN_GROUP_FOR_BOOST && m.inScoreBand,
  );
  return {
    totalCases: cases.length,
    groups,
    matches,
    hasMeaningfulMatch,
  };
}

/**
 * Compute the JOURNAL_PATTERN_MATCH boost for the score engine. Returns
 * `null` if no qualifying pattern exists.
 */
export function computeJournalPatternBoost(
  matches: JournalPatternMatch[],
): JournalPatternBoost | null {
  if (!matches.length) return null;
  const qualifying = matches.filter((m) => m.group.count >= MIN_GROUP_FOR_BOOST && m.inScoreBand);
  if (!qualifying.length) return null;
  const best = qualifying.reduce((a, b) => (b.fit > a.fit ? b : a));
  const span = BOOST_WEIGHT_MAX - BOOST_WEIGHT_MIN;
  const weight = Math.round(BOOST_WEIGHT_MIN + best.fit * span);
  return {
    weight,
    reason: `${best.group.count} prior cases in ${best.group.setupType}/${best.group.market}/${best.group.bias} (avg ${best.group.avgScore})`,
  };
}
