/**
 * Which price a daily-pick row's `price` is. Pure.
 *
 * The scan writers store different things in `daily_picks.price`: equity and forex rows store the close of the latest
 * daily bar, while scan-daily's crypto rows store a CURRENCY_EXCHANGE_RATE spot quote taken at scan time. The canonical
 * verdict and its levels always use the completed daily bar (stored as `canonical.raw.close`), so for crypto the row
 * price and the close the levels were built from can differ (e.g. SOL 121.10 spot vs 117.01 completed-bar close).
 * This labels the row from the stored numbers rather than guessing from the asset class.
 */

export type DailyPickPriceBasis = 'daily_bar_close' | 'spot_quote_at_scan' | 'scan_price';

export interface DailyPickPriceInfo {
  priceBasis: DailyPickPriceBasis;
  /** Short label for the UI ("Daily close 2026-09-24", "Spot quote at scan time"). */
  priceBasisLabel: string;
  /** Close of the completed daily bar the canonical verdict used, when stored. */
  canonicalClose: number | null;
  /** That bar's date (YYYY-MM-DD), when stored. */
  canonicalBarDate: string | null;
}

/** Prices within this relative distance count as the same number (stored values are rounded differently). */
const SAME_PRICE_REL = 1e-6;

export function dailyPickPriceBasis(
  price: unknown,
  canonical: { raw?: Record<string, unknown> | null; barDate?: unknown } | null | undefined,
  assetClass: string | null | undefined,
): DailyPickPriceInfo {
  const p = Number(price);
  const close = Number(canonical?.raw?.close);
  const hasClose = Number.isFinite(close) && close > 0;
  const barDate = typeof canonical?.barDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(canonical.barDate)
    ? canonical.barDate.slice(0, 10) : null;
  const canonicalClose = hasClose ? close : null;
  if (hasClose && Number.isFinite(p) && p > 0 && Math.abs(p - close) / close <= SAME_PRICE_REL) {
    return { priceBasis: 'daily_bar_close', priceBasisLabel: barDate ? `Daily close ${barDate}` : 'Daily close', canonicalClose, canonicalBarDate: barDate };
  }
  if (assetClass === 'crypto') {
    return { priceBasis: 'spot_quote_at_scan', priceBasisLabel: 'Spot quote at scan time', canonicalClose, canonicalBarDate: barDate };
  }
  return { priceBasis: 'scan_price', priceBasisLabel: 'Price at scan', canonicalClose, canonicalBarDate: barDate };
}
