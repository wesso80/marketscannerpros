/**
 * Pure rules for labelling ai_signal_log outcomes (used by /api/cron/label-ai-outcomes).
 *
 * - Each horizon (4h, 24h) is measured on its own: the price is the first COMPLETED bar close at or after
 *   signal_at + horizon. Nothing is labelled before its horizon has passed.
 * - Only LONG / SHORT signals are labelled. Anything else (null, NEUTRAL, confluence grades such as VALID) has no
 *   direction to score, so it is skipped, never defaulted to LONG.
 * - No price, no label: a missing bar never falls back to another signal's price.
 */
import { nyWallTimeToUtcMs } from '@/lib/time/nyWallClock';
import { usSessionCloseMinutes } from '@/lib/time/usSession';

export type OutcomeHorizon = '4h' | '24h';
export type OutcomeLabel = 'correct' | 'wrong' | 'neutral';
export type SignalDirection = 'LONG' | 'SHORT';
export type OutcomeAssetClass = 'equity' | 'crypto';

const HOUR_MS = 60 * 60 * 1000;

export const OUTCOME_HORIZONS: readonly OutcomeHorizon[] = ['4h', '24h'];
export const HORIZON_MS: Record<OutcomeHorizon, number> = { '4h': 4 * HOUR_MS, '24h': 24 * HOUR_MS };
/** Move (in %) the price must make in the signal's direction to count as correct (or against it, wrong). */
export const OUTCOME_MOVE_THRESHOLD_PCT = 1;
/** Signals that still cannot be labelled after this long are given up on. */
export const MAX_LABEL_AGE_MS = 7 * 24 * HOUR_MS;

/** A bar reduced to what labelling needs: when it closed (epoch ms) and at what price. */
export interface PriceBar {
  closeTime: number;
  close: number;
}

export interface HorizonPrice {
  price: number;
  /** Close time of the bar the price came from. */
  at: number;
}

export function normalizeDirection(raw: unknown): SignalDirection | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return s === 'LONG' || s === 'SHORT' ? s : null;
}

export function normalizeAssetClass(raw: unknown): OutcomeAssetClass | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'crypto') return 'crypto';
  if (s === 'equity' || s === 'equities' || s === 'stock' || s === 'stocks' || s === 'etf') return 'equity';
  return null;
}

/** "BTC", "btc-usd", "BTCUSD", "BTC/USDT" → "BTC". */
export function normalizeCryptoSymbol(raw: string): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[-/]?(USDT|USD)$/, '') || String(raw ?? '').trim().toUpperCase();
}

export function horizonTargetMs(signalAtMs: number, horizon: OutcomeHorizon): number {
  return signalAtMs + HORIZON_MS[horizon];
}

export function horizonPassed(signalAtMs: number, horizon: OutcomeHorizon, nowMs: number): boolean {
  return Number.isFinite(signalAtMs) && horizonTargetMs(signalAtMs, horizon) <= nowMs;
}

/**
 * First completed bar close at or after `targetMs`. Bars that have not closed yet (closeTime > now) are ignored, so a
 * partial in-progress bar is never used. Returns null when the data does not reach the horizon yet.
 */
export function priceAtOrAfter(bars: readonly PriceBar[], targetMs: number, nowMs: number): HorizonPrice | null {
  let best: PriceBar | null = null;
  for (const b of bars) {
    if (!Number.isFinite(b.closeTime) || !(b.close > 0)) continue;
    if (b.closeTime < targetMs || b.closeTime > nowMs) continue;
    if (!best || b.closeTime < best.closeTime) best = b;
  }
  return best ? { price: best.close, at: best.closeTime } : null;
}

/** Percent move from entry to exit, rounded to 4 dp and clamped to the NUMERIC(10,4) column range. */
export function pctMove(entry: number, exit: number): number {
  const raw = ((exit - entry) / entry) * 100;
  const rounded = Math.round(raw * 10000) / 10000;
  return Math.max(-999999, Math.min(999999, rounded));
}

export function classifyOutcome(direction: SignalDirection, movePct: number, thresholdPct = OUTCOME_MOVE_THRESHOLD_PCT): OutcomeLabel {
  const signed = direction === 'LONG' ? movePct : -movePct;
  if (signed >= thresholdPct) return 'correct';
  if (signed <= -thresholdPct) return 'wrong';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Alpha Vantage payload → PriceBar[]
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function closeOf(row: Record<string, unknown>): number | null {
  return num(row['4. close']) ?? num(row['4a. close (USD)']) ?? num(row['4b. close (USD)']);
}

function metaTimeZone(json: Record<string, unknown>): string | null {
  const meta = json['Meta Data'] as Record<string, unknown> | undefined;
  if (!meta) return null;
  for (const [k, v] of Object.entries(meta)) {
    if (/time zone/i.test(k) && typeof v === 'string') return v;
  }
  return null;
}

/**
 * TIME_SERIES_INTRADAY / CRYPTO_INTRADAY → bars. AV stamps a bar with its START time, so closeTime = start + interval.
 * The zone comes from "Meta Data" (US/Eastern for equities, UTC for crypto); `fallbackZone` is used when absent.
 */
export function parseAvIntradayBars(json: unknown, intervalMinutes: number, fallbackZone: 'NY' | 'UTC'): PriceBar[] {
  if (!json || typeof json !== 'object') return [];
  const obj = json as Record<string, unknown>;
  const seriesKey = Object.keys(obj).find((k) => k.startsWith('Time Series'));
  const series = seriesKey ? (obj[seriesKey] as Record<string, Record<string, unknown>> | undefined) : undefined;
  if (!series || typeof series !== 'object') return [];
  const tz = metaTimeZone(obj);
  const utc = tz ? /^utc$/i.test(tz.trim()) : fallbackZone === 'UTC';
  const bars: PriceBar[] = [];
  for (const [stamp, row] of Object.entries(series)) {
    const close = closeOf(row ?? {});
    if (close === null || close <= 0) continue;
    const start = utc ? Date.parse(`${stamp.trim().replace(' ', 'T')}Z`) : nyWallTimeToUtcMs(stamp);
    if (start === null || !Number.isFinite(start)) continue;
    bars.push({ closeTime: start + intervalMinutes * 60_000, close });
  }
  return bars.sort((a, b) => a.closeTime - b.closeTime);
}

/** DIGITAL_CURRENCY_DAILY → bars. Crypto daily bars are UTC days, so a bar dated D closes at D+1 00:00 UTC. */
export function parseAvCryptoDailyBars(json: unknown): PriceBar[] {
  if (!json || typeof json !== 'object') return [];
  const obj = json as Record<string, unknown>;
  const seriesKey = Object.keys(obj).find((k) => k.startsWith('Time Series'));
  const series = seriesKey ? (obj[seriesKey] as Record<string, Record<string, unknown>> | undefined) : undefined;
  if (!series || typeof series !== 'object') return [];
  const bars: PriceBar[] = [];
  for (const [date, row] of Object.entries(series)) {
    const close = closeOf(row ?? {});
    const dayStart = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
    if (close === null || close <= 0 || !Number.isFinite(dayStart)) continue;
    bars.push({ closeTime: dayStart + 24 * HOUR_MS, close });
  }
  return bars.sort((a, b) => a.closeTime - b.closeTime);
}

/** US equity daily bars (date = NY session date) → bars closing at that session's close (16:00, or 13:00 early close). */
export function equityDailyToPriceBars(bars: readonly { date: string; close: number }[]): PriceBar[] {
  const out: PriceBar[] = [];
  for (const b of bars) {
    const ymd = String(b.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !(b.close > 0)) continue;
    const closeMin = usSessionCloseMinutes(ymd);
    const hh = String(Math.floor(closeMin / 60)).padStart(2, '0');
    const mm = String(closeMin % 60).padStart(2, '0');
    const closeTime = nyWallTimeToUtcMs(`${ymd} ${hh}:${mm}:00`);
    if (closeTime !== null) out.push({ closeTime, close: b.close });
  }
  return out.sort((a, b) => a.closeTime - b.closeTime);
}
