/**
 * Which market an alert's symbol belongs to, and how the price checker prices it (TR-18).
 *
 * Before this, a basic alert with no asset type was silently stored as crypto, and every
 * non-crypto alert was priced as a US stock (Alpha Vantage GLOBAL_QUOTE), so forex and
 * commodity alerts were checked against the wrong feed or never priced at all.
 */
import { parseAvExchangeRate, splitFxPair } from '@/lib/watchlist/quotes';
import type { AlertQuote } from '@/lib/alerts/priceConditions';

/** Markets a basic price / % change alert can be created for. */
export const BASIC_ALERT_ASSET_TYPES = ['crypto', 'equity', 'forex'] as const;
export type BasicAlertAssetType = (typeof BASIC_ALERT_ASSET_TYPES)[number];

export type QuoteSource = 'crypto' | 'stock' | 'forex' | 'unsupported';

/** How the price checker should price an alert of this asset type. */
export function quoteSourceFor(assetType: string | null | undefined): QuoteSource {
  switch (String(assetType ?? '').toLowerCase()) {
    case 'crypto':
      return 'crypto';
    case 'forex':
    case 'fx':
      return 'forex';
    case 'commodity':
    case 'commodities':
      // No live commodity feed the checker can use yet (most AV commodity series are daily/monthly).
      return 'unsupported';
    default:
      // 'equity' / 'stock' and anything else keep the existing behaviour: priced as a US stock.
      return 'stock';
  }
}

export type AssetTypeCheck =
  | { ok: true; assetType: BasicAlertAssetType }
  | { ok: false; error: string; message: string };

/**
 * Validate the market chosen for a basic (non-smart) price or % change alert.
 * The market must be given explicitly; there is no silent crypto default.
 */
export function validateBasicAlertAssetType(
  assetType: unknown,
  conditionType: unknown,
  symbol?: unknown,
): AssetTypeCheck {
  const raw = typeof assetType === 'string' ? assetType.trim().toLowerCase() : '';
  if (!raw) {
    return {
      ok: false,
      error: 'Missing required field: assetType',
      message: 'Choose the market for this alert (crypto, stock or forex) so it is priced from the right feed.',
    };
  }
  if (raw === 'commodity') {
    return {
      ok: false,
      error: 'Commodity alerts are not available yet',
      message: 'Commodity price alerts are not checked yet, so they would never fire. Choose crypto, stock or forex.',
    };
  }
  if (!(BASIC_ALERT_ASSET_TYPES as readonly string[]).includes(raw)) {
    return {
      ok: false,
      error: `Invalid assetType: ${String(assetType)}`,
      message: 'The market must be crypto, stock (equity) or forex.',
    };
  }
  const type = raw as BasicAlertAssetType;
  if (type === 'forex') {
    if (typeof conditionType === 'string' && conditionType.startsWith('percent_change_')) {
      return {
        ok: false,
        error: '% change alerts are not available for forex',
        message: 'The forex feed reports only the current rate, not a daily % change. Use a price above/below alert instead.',
      };
    }
    if (typeof symbol === 'string' && !splitFxPair(symbol)) {
      return {
        ok: false,
        error: `Invalid forex pair: ${symbol}`,
        message: 'Enter a forex pair such as EURUSD or EUR/USD.',
      };
    }
  }
  return { ok: true, assetType: type };
}

/** Alpha Vantage CURRENCY_EXCHANGE_RATE URL for a forex alert symbol, or null if it is not a pair. */
export function fxQuoteUrl(symbol: string, apiKey: string): string | null {
  const pair = splitFxPair(symbol);
  if (!pair) return null;
  return `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${pair.from}&to_currency=${pair.to}&apikey=${encodeURIComponent(apiKey)}`;
}

/** Parse a CURRENCY_EXCHANGE_RATE response into an alert quote (rate only; no % change). */
export function parseFxAlertQuote(data: unknown): AlertQuote | null {
  const parsed = parseAvExchangeRate(data);
  if (!parsed) return null;
  return { price: parsed.price, changePercent: null };
}
