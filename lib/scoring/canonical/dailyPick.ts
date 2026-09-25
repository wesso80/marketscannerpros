/**
 * Canonical verdict for the daily-pick writers (scan-daily, scan-universe) and readers (daily-picks, top-cached).
 * Pure (client-safe). The verdict is stored inside the existing `daily_picks.indicators` JSONB as
 * `indicators.canonical` (no schema change). The legacy signal-count `score`/`direction` columns are kept as-is
 * (secondary); readers surface the canonical permission/grade/setup as the primary label.
 */
import { evaluateCanonicalFromBars } from './engine';
import { evaluateRegimeOverlay, overlayForDirection, type RegimeOverlayInputs } from './regimeOverlay';
import { compareCanonicalRows, SETUP_LABEL } from './scannerAdapter';
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
  return evaluateCanonicalFromBars(clean.slice(-500), {
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

/** Short display label, e.g. "PASS · A · Pullback". */
export function canonicalLabel(c: Pick<CanonicalResult, 'permission' | 'grade' | 'setupType'> | null | undefined): string | null {
  if (!c) return null;
  return `${c.permission} · ${c.grade} · ${SETUP_LABEL[c.setupType] ?? c.setupType}`;
}
