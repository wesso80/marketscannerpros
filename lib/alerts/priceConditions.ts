/**
 * Pure helpers for the basic price alert checker (app/api/alerts/check).
 *
 * % change alerts ("SPY 2% drop", "SPY rally day") compare the day's move with the
 * alert's threshold. Alerts store no reference price, so the move is measured the
 * same way the quote source reports it:
 *   - stocks (Alpha Vantage GLOBAL_QUOTE): current price vs the previous close
 *   - crypto (CoinGecko): the rolling 24h change (crypto has no daily close)
 * Up and down are mirror images: up fires at change >= +threshold, down at
 * change <= -threshold. A missing change never fires.
 */

export interface AlertQuote {
  price: number;
  /** Percent move (e.g. -2.4 for a 2.4% drop). null when the source did not provide one. */
  changePercent: number | null;
}

function finite(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Parse an Alpha Vantage GLOBAL_QUOTE response (realtime or delayed key) into a price and % change vs previous close. */
export function parseGlobalQuote(data: unknown): AlertQuote | null {
  const d = (data ?? {}) as Record<string, any>;
  const gq = d['Global Quote'] || d['Global Quote - DATA DELAYED BY 15 MINUTES'];
  const price = finite(gq?.['05. price']);
  if (price == null || price <= 0) return null;
  const prevClose = finite(gq?.['08. previous close']);
  let changePercent: number | null = null;
  if (prevClose != null && prevClose > 0) {
    changePercent = ((price - prevClose) / prevClose) * 100;
  } else {
    changePercent = finite(gq?.['10. change percent']);
  }
  return { price, changePercent };
}

/** Whether a basic alert's condition is met. Price alerts keep their existing >= / <= test. */
export function checkPriceAlertCondition(conditionType: string, conditionValue: unknown, quote: AlertQuote): boolean {
  const value = finite(conditionValue);
  if (value == null) return false;
  switch (conditionType) {
    case 'price_above':
      return quote.price >= value;
    case 'price_below':
      return quote.price <= value;
    case 'percent_change_up':
    case 'percent_change_down': {
      const threshold = Math.abs(value);
      if (threshold === 0 || quote.changePercent == null || !Number.isFinite(quote.changePercent)) return false;
      return conditionType === 'percent_change_up'
        ? quote.changePercent >= threshold
        : quote.changePercent <= -threshold;
    }
    default:
      return false;
  }
}

function fmtPrice(price: number): string {
  return price >= 1 ? price.toFixed(2) : price.toFixed(6);
}

/** Human-readable description of what fired (used in history, email, push). */
export function describeConditionMet(symbol: string, conditionType: string, conditionValue: unknown, quote: AlertQuote, assetType?: string): string {
  const price = fmtPrice(quote.price);
  const threshold = Math.abs(finite(conditionValue) ?? 0);
  const basis = assetType === 'crypto' ? 'in 24h' : 'vs previous close';
  const change = quote.changePercent == null ? '' : `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`;
  switch (conditionType) {
    case 'price_above':
      return `${symbol} crossed above $${conditionValue} (now $${price})`;
    case 'price_below':
      return `${symbol} dropped below $${conditionValue} (now $${price})`;
    case 'percent_change_up':
      return `${symbol} ${change} ${basis} (alert: +${threshold}%, now $${price})`;
    case 'percent_change_down':
      return `${symbol} ${change} ${basis} (alert: -${threshold}%, now $${price})`;
    default:
      return `${symbol} alert triggered at $${price}`;
  }
}
