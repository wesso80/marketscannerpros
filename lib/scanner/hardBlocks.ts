/**
 * Scanner HARD BLOCKS and warning flags. Pure; every rule is independent of the row's own score.
 *
 * Blocks (permission → BLOCK, machine-readable code):
 *   STALE_DATA          last completed bar is behind the market (session-aware, judged from the bar timestamp)
 *   PRICE_SANITY        live price and the last completed bar close disagree by more than max(15%, 6 × ATR%)
 *   EARNINGS_IN_WINDOW  an earnings report falls inside the holding window for the timeframe
 *   LIQUIDITY_MIN       average daily dollar volume (equity) / 24h USD volume (crypto) below the minimum
 *
 * Flags (informational; never change permission):
 *   MACRO_EVENT, EARNINGS_UNKNOWN, LIQUIDITY_UNKNOWN, PRICE_CHECK_UNAVAILABLE, PRICE_CHECK_SAME_PROVIDER
 *
 * Unknown inputs are flagged, never blocked (missing data = neutral + flag).
 */
import type { ScoreReason } from './scoreContract';
import { CURATED_EVENTS } from '@/lib/macro/calendar/curated';
import { getIndicator } from '@/lib/macro/calendar/indicators';
import { ET_ZONE, zonedDateKey } from '@/lib/macro/calendar/time';

/** Documented policy constants. Heuristic starting points; Phase 2 calibrates them against outcomes. */
export const HARD_BLOCK_POLICY = {
  /** Equity: 20-bar average daily dollar volume below this is untradeable for the scanner's purposes. */
  minDollarVolumeEquity: 5_000_000,
  /** Crypto: 24h USD volume (or daily-average estimate) below this. */
  minVolume24hCrypto: 10_000_000,
  /** Price sanity: block when |price / reference − 1| exceeds max(minPct, atrMultiple × ATR%). Sized to catch data
   *  errors (unadjusted splits, wrong symbol mapping, unit errors) without blocking ordinary big-move days. */
  priceSanityMinPct: 15,
  priceSanityAtrMultiple: 6,
  /** Holding window (calendar days) per timeframe: an earnings date within [0, window] blocks.
   *  daily = 9: Phase 3 validation (Sep 2026) — canonical daily setups resolve (target or invalidation) in a median of
   *  3 trading days, 75th pct 6 (≈ 9 calendar days), 90th pct 11; 12% reach the 20-bar time stop. 9 covers ¾ of trades.
   *  Intraday and weekly windows are unvalidated defaults (no calibration data for those timeframes). */
  holdingWindowDays: { '5m': 1, '15m': 1, '30m': 1, '1h': 2, '4h': 3, daily: 9, '1d': 9, weekly: 28, '1w': 28 } as Record<string, number>,
  /** Macro flag: US high-importance events on the evaluation date or the next calendar day (ET). */
  macroLookaheadDays: 1,
} as const;

export type EarningsStatus = 'IN_WINDOW' | 'SCHEDULED' | 'NONE_IN_HORIZON' | 'UNKNOWN' | 'NOT_APPLICABLE';

export interface HardBlockInput {
  asset: 'equity' | 'crypto' | 'forex';
  timeframe: string;
  /** Data-trust freshness judged from the last completed bar time. */
  freshness?: 'fresh' | 'delayed' | 'stale' | 'unknown';
  lastBarAt?: string | null;
  /** Price used for the row (live quote when present). */
  price?: number | null;
  /** Reference price from a second feed (e.g. last completed bar close) and where it came from. */
  referencePrice?: number | null;
  referenceSource?: string | null;
  /** True only when the reference comes from an independent provider. */
  referenceIndependent?: boolean;
  atrPct?: number | null;
  /** Earnings: next report date (YYYY-MM-DD) and whether the calendar was actually loaded. */
  earningsDate?: string | null;
  earningsCalendarLoaded?: boolean;
  /** Average daily dollar volume (equity) or 24h USD volume (crypto). */
  dollarVolumeDaily?: number | null;
  nowMs?: number;
}

export interface HardBlockResult {
  blocks: ScoreReason[];
  flags: ScoreReason[];
  earnings: { status: EarningsStatus; date: string | null; daysUntil: number | null; holdingWindowDays: number | null };
  priceCheck: { status: 'OK' | 'FAILED' | 'UNAVAILABLE'; deviationPct: number | null; thresholdPct: number | null; referenceSource: string | null; independent: boolean };
  liquidity: { status: 'OK' | 'BELOW_MIN' | 'UNKNOWN' | 'NOT_APPLICABLE'; value: number | null; minimum: number | null };
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Bars per trading day, to turn a per-bar average volume into a daily figure. */
export function barsPerDay(timeframe: string | null | undefined, asset: 'equity' | 'crypto' | 'forex'): number {
  const k = String(timeframe ?? 'daily').toLowerCase();
  const crypto = asset === 'crypto';
  if (k === '1h' || k === '60m' || k === '60min') return crypto ? 24 : 6.5;
  if (k === '30m' || k === '30min') return crypto ? 48 : 13;
  if (k === '15m' || k === '15min') return crypto ? 96 : 26;
  if (k === '4h') return crypto ? 6 : 2;
  if (k === 'weekly' || k === '1w') return crypto ? 1 / 7 : 1 / 5;
  return 1;
}

export function holdingWindowDays(timeframe: string): number {
  const k = String(timeframe).toLowerCase();
  return HARD_BLOCK_POLICY.holdingWindowDays[k] ?? HARD_BLOCK_POLICY.holdingWindowDays.daily;
}

function daysBetween(dateStr: string, nowMs: number): number | null {
  const target = Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  const d = new Date(nowMs);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((target - base) / 86_400_000);
}

/** US high-importance macro events today/tomorrow (ET) from the curated calendar. Warning only. */
export function macroEventFlags(nowMs: number = Date.now()): ScoreReason[] {
  const days = new Set<string>();
  for (let i = 0; i <= HARD_BLOCK_POLICY.macroLookaheadDays; i++) days.add(zonedDateKey(nowMs + i * 86_400_000, ET_ZONE));
  const names = new Set<string>();
  for (const e of CURATED_EVENTS) {
    if (e.countryCode !== 'US' || !days.has(e.localDate)) continue;
    const def = getIndicator(e.canonicalIndicatorId);
    if (def?.importance !== 'high') continue;
    names.add(`${def.name} ${e.localDate}${e.timingStatus && e.timingStatus !== 'CONFIRMED' ? ` (${e.timingStatus.toLowerCase()})` : ''}`);
  }
  return names.size ? [{ code: 'MACRO_EVENT', message: `High-impact US macro event(s): ${[...names].join(', ')}.` }] : [];
}

export function evaluateHardBlocks(input: HardBlockInput, macroFlags: ScoreReason[] = []): HardBlockResult {
  const nowMs = input.nowMs ?? Date.now();
  const blocks: ScoreReason[] = [];
  const flags: ScoreReason[] = [...macroFlags];

  // 1. Stale data, from the bar timestamp (not request time).
  if (input.freshness === 'stale') {
    blocks.push({ code: 'STALE_DATA', message: `Last completed bar ${input.lastBarAt ? input.lastBarAt.slice(0, 16) : '(unknown time)'} is behind the market.` });
  }

  // 2. Price sanity vs a second feed.
  let priceCheck: HardBlockResult['priceCheck'] = { status: 'UNAVAILABLE', deviationPct: null, thresholdPct: null, referenceSource: input.referenceSource ?? null, independent: Boolean(input.referenceIndependent) };
  if (fin(input.price) && input.price > 0 && fin(input.referencePrice) && input.referencePrice > 0) {
    const deviationPct = Math.abs(input.price / input.referencePrice - 1) * 100;
    const thresholdPct = Math.max(HARD_BLOCK_POLICY.priceSanityMinPct, fin(input.atrPct) ? HARD_BLOCK_POLICY.priceSanityAtrMultiple * input.atrPct : 0);
    const failed = deviationPct > thresholdPct;
    priceCheck = { ...priceCheck, status: failed ? 'FAILED' : 'OK', deviationPct: Math.round(deviationPct * 100) / 100, thresholdPct: Math.round(thresholdPct * 100) / 100 };
    if (failed) blocks.push({ code: 'PRICE_SANITY', message: `Price ${input.price} is ${deviationPct.toFixed(1)}% from ${input.referenceSource ?? 'the reference price'} ${input.referencePrice} (limit ${thresholdPct.toFixed(1)}%).` });
    if (!input.referenceIndependent) flags.push({ code: 'PRICE_CHECK_SAME_PROVIDER', message: `Price checked against ${input.referenceSource ?? 'a second feed'} from the same provider; no independent second provider is wired.` });
  } else {
    flags.push({ code: 'PRICE_CHECK_UNAVAILABLE', message: 'No second price available to sanity-check this row.' });
  }

  // 3. Earnings inside the holding window (equities only). Unknown ≠ "not scheduled".
  let earnings: HardBlockResult['earnings'] = { status: 'NOT_APPLICABLE', date: null, daysUntil: null, holdingWindowDays: null };
  if (input.asset === 'equity') {
    const window = holdingWindowDays(input.timeframe);
    if (input.earningsDate) {
      const daysUntil = daysBetween(input.earningsDate, nowMs);
      const inWindow = daysUntil != null && daysUntil >= 0 && daysUntil <= window;
      earnings = { status: inWindow ? 'IN_WINDOW' : daysUntil != null && daysUntil >= 0 ? 'SCHEDULED' : 'UNKNOWN', date: input.earningsDate.slice(0, 10), daysUntil, holdingWindowDays: window };
      if (inWindow) blocks.push({ code: 'EARNINGS_IN_WINDOW', message: `Earnings ${input.earningsDate.slice(0, 10)} (in ${daysUntil}d) fall inside the ${window}-day holding window.` });
    } else if (input.earningsCalendarLoaded) {
      earnings = { status: 'NONE_IN_HORIZON', date: null, daysUntil: null, holdingWindowDays: window };
    } else {
      earnings = { status: 'UNKNOWN', date: null, daysUntil: null, holdingWindowDays: window };
      flags.push({ code: 'EARNINGS_UNKNOWN', message: 'Earnings date UNKNOWN (calendar unavailable); not verified clear of the holding window.' });
    }
  }

  // 4. Liquidity minimum.
  let liquidity: HardBlockResult['liquidity'] = { status: 'NOT_APPLICABLE', value: null, minimum: null };
  if (input.asset !== 'forex') {
    const minimum = input.asset === 'crypto' ? HARD_BLOCK_POLICY.minVolume24hCrypto : HARD_BLOCK_POLICY.minDollarVolumeEquity;
    if (fin(input.dollarVolumeDaily) && input.dollarVolumeDaily > 0) {
      const below = input.dollarVolumeDaily < minimum;
      liquidity = { status: below ? 'BELOW_MIN' : 'OK', value: Math.round(input.dollarVolumeDaily), minimum };
      if (below) blocks.push({ code: 'LIQUIDITY_MIN', message: `${input.asset === 'crypto' ? '24h volume' : 'Average daily dollar volume'} $${Math.round(input.dollarVolumeDaily).toLocaleString('en-US')} is below the $${minimum.toLocaleString('en-US')} minimum.` });
    } else {
      liquidity = { status: 'UNKNOWN', value: null, minimum };
      flags.push({ code: 'LIQUIDITY_UNKNOWN', message: 'Dollar volume unavailable; liquidity minimum not verified.' });
    }
  }

  return { blocks, flags, earnings, priceCheck, liquidity };
}
