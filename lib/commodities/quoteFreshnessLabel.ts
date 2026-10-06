import { isMonthlyObservationCurrent } from '@/lib/commodityFreshness';
import { FRESHNESS_RULES } from '@/lib/marketData/freshness';

/**
 * Visible freshness for a commodity row, from that quote's own timestamp.
 * Daily fund closes and date-only session stamps are never called Live.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A session date older than a week is shown as stale. Display only. */
const STALE_AFTER_DAYS = 7;

export type CommodityQuoteStamp = {
  date?: string | null;
  cadence?: 'live' | 'daily' | 'monthly' | null;
  source?: string | null;
  freshnessStatus?: string | null;
};

function sessionParts(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function sessionYmd(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match && sessionParts(match[1]) ? match[1] : null;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/** Calendar days from the session date to the UTC day of `nowMs`. */
export function sessionLagDays(date: string, nowMs: number): number | null {
  const ymd = sessionYmd(date);
  const parts = ymd ? sessionParts(ymd) : null;
  if (!parts) return null;
  const session = Date.UTC(parts.y, parts.m - 1, parts.d);
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - session) / 86_400_000);
}

function closeLabel(ymd: string): string {
  const parts = sessionParts(ymd);
  return parts ? `Close ${parts.d} ${MONTHS[parts.m - 1]}` : 'Delayed';
}

function dailyFund(input: CommodityQuoteStamp, dateOnly: boolean): boolean {
  if (input.cadence === 'daily' || input.cadence === 'monthly') return true;
  if (input.source === 'ETF_PROXY' || input.source === 'LEGACY_DAILY' || input.source === 'LEGACY_MONTHLY') return true;
  return dateOnly;
}

export function commodityFreshnessLabel(input: CommodityQuoteStamp, nowMs = Date.now()): string {
  // Futures quotes are delayed. A UTC date-only session stamp must not be labelled as that session's close.
  if (input.source === 'YAHOO_FUTURES') {
    return input.freshnessStatus === 'STALE' ? 'Stale' : 'Delayed';
  }

  const raw = (input.date ?? '').trim();
  const monthly = input.cadence === 'monthly' || input.source === 'LEGACY_MONTHLY';
  if (monthly) {
    return raw && isMonthlyObservationCurrent(raw, nowMs) ? 'Monthly' : 'Stale';
  }

  const dateOnly = raw ? isDateOnly(raw) : false;
  const ymd = raw ? sessionYmd(raw) : null;
  const lag = ymd ? sessionLagDays(ymd, nowMs) : null;

  if (!dailyFund(input, dateOnly) && raw && !dateOnly) {
    const observed = Date.parse(raw);
    if (Number.isFinite(observed)) {
      const ageSec = Math.max(0, (nowMs - observed) / 1000);
      if (ageSec <= FRESHNESS_RULES.quote.realTime) return 'Live';
    }
  }

  if (lag == null) return input.freshnessStatus === 'STALE' ? 'Stale' : 'Delayed';
  if (lag <= 0) return closeLabel(ymd!);
  if (lag === 1) return 'Delayed · 1d';
  if (lag > STALE_AFTER_DAYS) return `Stale · ${lag}d`;
  return `Delayed · ${lag}d`;
}
