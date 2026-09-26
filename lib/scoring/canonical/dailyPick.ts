/**
 * Canonical verdict for the daily-pick writers (scan-daily, scan-universe) and readers (daily-picks, top-cached).
 * Pure (client-safe). The verdict is stored inside the existing `daily_picks.indicators` JSONB as
 * `indicators.canonical` (no schema change).
 *
 * Phase 3: the `score` / `direction` COLUMNS now carry the canonical values (score = canonical display score, 0 when
 * BLOCK; direction = canonical side as bullish/bearish/neutral) whenever a verdict exists, marked by
 * `indicators.scoreColumn = 'canonical'`, and the legacy signal-count values move to `indicators.legacy`. Every reader
 * that orders or labels by those columns (share card, RSS, morning brief, candidates, opportunity scan, daily-pick
 * page) therefore ranks on the canonical engine without a schema change. Selection is symmetric: top = best canonical
 * long setups, bottom = best canonical short setups (see selectDailyPicks).
 */
import { evaluateCanonicalFromBars } from './engine';
import { evaluateRegimeOverlay, overlayForDirection, type RegimeOverlayInputs } from './regimeOverlay';
import { compareCanonicalRows, SETUP_LABEL } from './scannerAdapter';
import { cautionTags, scoreLabel } from './display';
import type { CanonicalAssetClass, CanonicalBar, CanonicalReason, CanonicalResult } from './types';

/** A completed daily bar older than this (calendar days) is treated as stale (covers weekends + a holiday). */
export const DAILY_PICK_STALE_DAYS = 5;

export interface DailyPickCanonicalOptions {
  symbol: string;
  assetClass: CanonicalAssetClass;
  overlay?: RegimeOverlayInputs | null;
  nowMs?: number;
  /** Extra hard blocks from the caller. */
  hardBlocks?: CanonicalReason[];
}

/** Most daily bars the canonical engine reads for a daily pick (EMA200 convergence). */
export const DAILY_PICK_MAX_BARS = 1000;

/** Evaluate the canonical engine on daily bars (oldest first). Returns null when there are too few usable bars. */
export function canonicalForDailyPick(bars: CanonicalBar[], opts: DailyPickCanonicalOptions): CanonicalResult | null {
  const clean = (bars ?? [])
    .filter((b) => b && [b.open, b.high, b.low, b.close].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0))
    .map((b) => ({ t: b.t, open: b.open, high: b.high, low: b.low, close: b.close, volume: typeof b.volume === 'number' && Number.isFinite(b.volume) && b.volume > 0 ? b.volume : null }));
  if (clean.length < 30) return null;
  const last = clean[clean.length - 1];
  const hardBlocks: CanonicalReason[] = [...(opts.hardBlocks ?? [])];
  const lastMs = Date.parse(last.t);
  const nowMs = opts.nowMs ?? Date.now();
  if (Number.isFinite(lastMs) && nowMs - lastMs > DAILY_PICK_STALE_DAYS * 86_400_000) {
    hardBlocks.push({ code: 'STALE_DATA', message: `Last daily bar ${last.t.slice(0, 10)} is older than ${DAILY_PICK_STALE_DAYS} days` });
  }
  const regimeOverlay = opts.overlay ? overlayForDirection(evaluateRegimeOverlay(opts.overlay, opts.assetClass)) : undefined;
  // Up to 1,000 bars so EMA200 converges (500 bars left ~5% of the SMA seed; RS-4).
  return evaluateCanonicalFromBars(clean.slice(-DAILY_PICK_MAX_BARS), {
    symbol: opts.symbol, assetClass: opts.assetClass, timeframe: 'daily',
    hardBlocks, dataTimestamp: last.t, regimeOverlay,
  });
}

/** JSONB-friendly copy: keeps only the top 4 candidates (the rest is diagnostic detail). */
export function compactCanonical(c: CanonicalResult): CanonicalResult {
  return { ...c, candidates: c.candidates.slice(0, 4) };
}

/** Read a stored canonical verdict back from a daily_picks.indicators blob (null when absent or malformed). */
export function readStoredCanonical(indicators: unknown): CanonicalResult | null {
  let ind: any = indicators;
  if (typeof ind === 'string') { try { ind = JSON.parse(ind); } catch { return null; } }
  const c = ind?.canonical;
  if (!c || typeof c !== 'object') return null;
  if (!['PASS', 'WATCH', 'BLOCK'].includes(c.permission) || typeof c.score !== 'number') return null;
  return c as CanonicalResult;
}

/** Primary label fields for API rows (canonical first; the legacy score stays on the row as-is). */
export function canonicalPickFields(c: CanonicalResult | null) {
  return {
    canonical: c,
    permission: c?.permission ?? null,
    grade: c?.grade ?? null,
    setupType: c?.setupType ?? null,
    canonicalDirection: c?.direction ?? null,
    canonicalScore: c?.score ?? null,
  };
}

/** Order daily picks canonical-first (permission → grade → canonical score); rows without a stored verdict (older
 *  scans) fall back to the legacy score, after every canonical row. */
export function rankDailyPicks<T extends { symbol: string; score?: number | null; canonical?: CanonicalResult | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareCanonicalRows(a, b) || (Number(b.score ?? 0) - Number(a.score ?? 0)) || a.symbol.localeCompare(b.symbol));
}

/** Short display label, e.g. "PASS · A · Pullback", "WATCH · C · Squeeze · factors only · at resistance". */
export function canonicalLabel(c: (Pick<CanonicalResult, 'permission' | 'grade' | 'setupType'> & Partial<Pick<CanonicalResult, 'scoreBasis' | 'direction' | 'watchReasons'>>) | null | undefined): string | null {
  if (!c) return null;
  const tag = c.scoreBasis === 'factor_alignment_uncalibrated' ? ' · uncalibrated' : c.scoreBasis && c.permission === 'WATCH' ? ' · factors only' : '';
  const cautions = c.permission === 'BLOCK' ? [] : cautionTags(c);
  return `${c.permission} · ${c.grade} · ${SETUP_LABEL[c.setupType] ?? c.setupType}${tag}${cautions.map((t) => ` · ${t}`).join('')}`;
}

export type LegacyDirection = 'bullish' | 'bearish' | 'neutral';

export interface DailyPickColumns {
  score: number;
  direction: LegacyDirection;
  /** Values for indicators.scoreColumn / indicators.legacy. */
  scoreColumn: 'canonical' | 'legacy';
  legacy: { score: number; direction: string };
}

/** Score/direction column values for a daily_picks row: canonical when a verdict exists, legacy otherwise. */
export function dailyPickColumns(c: CanonicalResult | null | undefined, legacy: { score: number; direction: string }): DailyPickColumns {
  if (!c) return { score: legacy.score, direction: (legacy.direction as LegacyDirection), scoreColumn: 'legacy', legacy };
  const direction: LegacyDirection = c.permission === 'BLOCK' || c.direction === 'neutral' ? 'neutral' : c.direction === 'long' ? 'bullish' : 'bearish';
  return { score: c.permission === 'BLOCK' ? 0 : Math.max(0, Math.min(100, Math.round(c.score))), direction, scoreColumn: 'canonical', legacy };
}

/**
 * Symmetric daily-pick selection. With canonical verdicts: top = non-BLOCK canonical LONG setups ranked by
 * permission → grade → calibrated score → factor score; bottom = the same for canonical SHORT setups. Rows without a
 * verdict are used only when no row has one (legacy fallback: highest / lowest legacy score).
 */
export function selectDailyPicks<T extends { symbol: string; score: number; canonical?: CanonicalResult | null }>(rows: T[], n: number): { top: T[]; bottom: T[]; basis: 'canonical' | 'legacy' } {
  const withC = rows.filter((r) => r.canonical);
  if (!withC.length) {
    const top = [...rows].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol)).slice(0, n);
    const topSet = new Set(top.map((r) => r.symbol));
    const bottom = [...rows].sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol)).filter((r) => !topSet.has(r.symbol)).slice(0, n);
    return { top, bottom, basis: 'legacy' };
  }
  const side = (d: 'long' | 'short') => rankDailyPicks(withC.filter((r) => r.canonical!.permission !== 'BLOCK' && r.canonical!.direction === d)).slice(0, n);
  return { top: side('long'), bottom: side('short'), basis: 'canonical' };
}

/** Legacy score stored with a row (indicators.legacy when the columns hold canonical values). */
export function storedLegacyScore(indicators: unknown, columnScore: number): number {
  let ind: any = indicators;
  if (typeof ind === 'string') { try { ind = JSON.parse(ind); } catch { return columnScore; } }
  return ind?.scoreColumn === 'canonical' && typeof ind?.legacy?.score === 'number' ? ind.legacy.score : columnScore;
}

/** Return a copy of a daily-pick writer row with canonical score/direction columns and legacy values in indicators. */
export function withCanonicalColumns<T extends { score: number; direction: string; indicators: Record<string, any> }>(row: T): T {
  const c = readStoredCanonical(row.indicators);
  const cols = dailyPickColumns(c, { score: row.score, direction: row.direction });
  return { ...row, score: cols.score, direction: cols.direction, indicators: { ...row.indicators, scoreColumn: cols.scoreColumn, legacy: cols.legacy } };
}

export interface PickView {
  side: 'LONG' | 'SHORT' | 'WATCH';
  score: number | null;
  /** e.g. "WATCH · B · Pullback · factors only"; null without a canonical verdict. */
  label: string | null;
  /** Honest one-liner about what the score means. */
  basisNote: string;
  /** The score as the share cards print it ("95th pct", "74/100 factors (uncalibrated)", "No qualifying setup");
   *  null without a canonical verdict. */
  scoreText: string | null;
}

/** Public-facing view of a stored daily pick (share card, RSS): canonical first, legacy fallback. */
export function pickView(row: { score: number | null; direction: string | null; canonical?: unknown }): PickView {
  const c = readStoredCanonical({ canonical: row.canonical });
  if (!c) {
    const side = row.direction === 'bullish' ? 'LONG' : row.direction === 'bearish' ? 'SHORT' : 'WATCH';
    return { side, score: row.score, label: null, basisNote: 'Legacy signal-count score (not a probability).', scoreText: null };
  }
  const side = c.permission === 'BLOCK' || c.direction === 'neutral' ? 'WATCH' : c.direction === 'long' ? 'LONG' : 'SHORT';
  const basisNote = c.scoreBasis === 'calibrated_expectancy_percentile'
    ? 'Score = percentile of calibrated expected R among same-side setups. Factors only — no validated edge.'
    : c.scoreBasis === 'factor_alignment_uncalibrated'
      ? 'Score = factor alignment (uncalibrated, not a probability).'
      : 'Canonical setup score (not a probability).';
  return { side, score: c.permission === 'BLOCK' ? 0 : c.score, label: canonicalLabel(c), basisNote, scoreText: scoreLabel(c) };
}
