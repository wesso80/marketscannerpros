/**
 * When a basic alert may fire (TR-17). Pure; used by app/api/alerts/check.
 *
 * Before: price alerts fired whenever price was already beyond the level (so an
 * alert set on the "wrong" side fired on the next run), recurring alerts ignored
 * any cooldown and re-sent every 5-minute cron run, and stock quotes were never
 * checked for age.
 *
 * Rules now:
 *  - Price alerts fire on a cross: the previous checked price (alerts.last_price)
 *    must be on the other side of the level. With no previous price yet (the
 *    first check after the alert is created) the check only records the price.
 *  - A cooldown set on the alert (cooldown_minutes) is respected.
 *  - Recurring % change alerts fire at most once per move period: once per
 *    trading day for stocks (the % is vs the previous close), once per 24 hours
 *    for crypto (the % is a rolling 24h change).
 *  - Stock quotes whose latest trading day is older than the most recent session
 *    that has opened are stale and don't fire anything.
 */
import { createMarketClock } from '../time-confluence';
import { checkPriceAlertCondition, type AlertQuote } from './priceConditions';

export interface AlertTimingInput {
  condition_type: string;
  condition_value: unknown;
  asset_type: string;
  is_recurring: boolean;
  /** Price seen at the previous check (or trigger); null before the first check. */
  last_price?: number | string | null;
  triggered_at?: string | Date | null;
  cooldown_minutes?: number | null;
}

export type AlertDecision =
  | { fire: true }
  | { fire: false; reason: 'not_met' | 'arming' | 'no_cross' | 'cooldown' | 'already_fired_this_period' };

const DAY_MS = 24 * 60 * 60 * 1000;

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** YYYY-MM-DD in New York for an instant. */
export function etDateKey(ms: number): string {
  return createMarketClock(new Date(ms)).et.dateStr;
}

export function decideAlert(alert: AlertTimingInput, quote: AlertQuote, nowMs = Date.now()): AlertDecision {
  if (!checkPriceAlertCondition(alert.condition_type, alert.condition_value, quote)) return { fire: false, reason: 'not_met' };

  const triggeredMs = toMs(alert.triggered_at);
  const cooldown = num(alert.cooldown_minutes);
  if (triggeredMs != null && cooldown != null && cooldown > 0 && nowMs - triggeredMs < cooldown * 60_000) {
    return { fire: false, reason: 'cooldown' };
  }

  if (alert.condition_type === 'price_above' || alert.condition_type === 'price_below') {
    const level = num(alert.condition_value)!;
    const last = num(alert.last_price);
    if (last == null) return { fire: false, reason: 'arming' };
    const crossed = alert.condition_type === 'price_above' ? last < level : last > level;
    return crossed ? { fire: true } : { fire: false, reason: 'no_cross' };
  }

  // % change alerts: one trigger per move period for recurring alerts.
  if (alert.is_recurring && triggeredMs != null) {
    if (alert.asset_type === 'crypto') {
      if (nowMs - triggeredMs < DAY_MS) return { fire: false, reason: 'already_fired_this_period' };
    } else {
      const quoteDay = quote.asOfDate ?? etDateKey(nowMs);
      if (etDateKey(triggeredMs) >= quoteDay) return { fire: false, reason: 'already_fired_this_period' };
    }
  }
  return { fire: true };
}

/** Most recent NYSE trading day whose regular session has opened, as YYYY-MM-DD (ET). */
export function latestOpenedTradingDay(nowMs = Date.now()): string {
  const clock = createMarketClock(new Date(nowMs));
  const openedToday = clock.dayInfo.isTradingDay && clock.et.hour * 60 + clock.et.minute >= 9 * 60 + 30;
  if (openedToday) return clock.et.dateStr;
  for (let back = 1; back <= 10; back++) {
    const probe = createMarketClock(new Date(nowMs - back * DAY_MS));
    if (probe.dayInfo.isTradingDay) return probe.et.dateStr;
  }
  return clock.et.dateStr;
}

/** A stock quote is stale when its latest trading day is before the latest session that has opened. */
export function isStaleStockQuote(quote: AlertQuote, nowMs = Date.now()): boolean {
  if (!quote.asOfDate) return false; // no date reported: can't judge; leave to the provider
  return quote.asOfDate < latestOpenedTradingDay(nowMs);
}
