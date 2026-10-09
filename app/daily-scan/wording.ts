/**
 * Daily Picks reader copy. Presentation only — never pass these labels back to scoring, ranking, or storage.
 * Engine codes, letter grades, and setup categories stay in `foldedEngineDetail`.
 */
import { canonicalLabel } from '@/lib/scoring/canonical/dailyPick';
import { SETUP_LABEL } from '@/lib/scoring/canonical/scannerAdapter';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

export type DailyPickVerdict = (Pick<CanonicalResult, 'permission' | 'grade' | 'setupType'> & Partial<Pick<CanonicalResult, 'scoreBasis' | 'direction' | 'watchReasons'>>) | null | undefined;

const READER_VERDICT: Record<string, string> = {
  PASS: 'Checks passed',
  WATCH: 'Checks still open',
  BLOCK: 'Checks did not pass',
};

/** Plain label for the closed card. Setup-less rows say so without the engine grade. */
export function readerVerdict(verdict: DailyPickVerdict): string {
  if (!verdict) return 'Reading not available right now';
  if (verdict.setupType === 'NONE') return 'No qualifying setup';
  return READER_VERDICT[verdict.permission] ?? 'Reading not available right now';
}

/** The stored engine line (permission, grade, setup category, and any caution tags). Null when no verdict was stored. */
export function engineRecord(verdict: DailyPickVerdict): string | null {
  return canonicalLabel(verdict);
}

/** Fold copy: the same stored record, with the code, grade, and setup category named. */
export function foldedEngineDetail(verdict: DailyPickVerdict): string | null {
  const record = engineRecord(verdict);
  if (!verdict || !record) return null;
  const setup = SETUP_LABEL[verdict.setupType] ?? verdict.setupType;
  const prefix = `${verdict.permission} · ${verdict.grade} · ${setup}`;
  const extra = record.startsWith(prefix) ? record.slice(prefix.length) : '';
  return `Engine code ${verdict.permission} · grade ${verdict.grade} · setup category ${setup}${extra}`;
}

export function evidenceLabel(direction: string | null | undefined): string {
  if (direction === 'bullish') return 'Up-side evidence';
  if (direction === 'bearish') return 'Down-side evidence';
  return 'Mixed evidence';
}

/** One decimal when the stored score needs it; whole numbers stay whole. */
export function readableScore(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** The stored figure, without ranking or rounding it. Grouping is left off so the digits stay comparable. */
export function storedScoreText(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 8, useGrouping: false });
}

export function readablePrice(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${Number(value.toPrecision(4))}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Session dates inside an existing price label, without changing the label's meaning. */
export function readablePriceLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year: string, month: string, day: string) => {
    const name = MONTHS[Number(month) - 1];
    return name ? `${Number(day)} ${name} ${year}` : _match;
  });
}

export function readableObservedAt(value: string | null | undefined): string {
  if (!value) return 'not recorded';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'not recorded';
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23',
  }).format(date);
  return `${formatted} UTC`;
}
