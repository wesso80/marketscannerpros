/**
 * Guards for Alpha Vantage options-chain payloads.
 *
 * When an API key is not entitled to an options endpoint, Alpha Vantage does not always return an
 * error. REALTIME_OPTIONS (and potentially REALTIME_OPTIONS_FMV) answers HTTP 200 with
 *   { message: "This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL...***",
 *     data: [ { contractID: "XXYYZZ999999C00020000", symbol: "XXYYZZ", expiration: "2099-99-99", ... } ] }
 * That fake chain must never be shown to a trader, and the caller must fall through to the next
 * provider (HISTORICAL_OPTIONS is included in every premium plan).
 */

const SAMPLE_SYMBOL = 'XXYYZZ';

function isSampleMessage(text: unknown): boolean {
  return typeof text === 'string' && /artificial|sample data schema/i.test(text);
}

/**
 * Returns the chain rows only if they are real contracts for `symbol`; otherwise null
 * (empty, Alpha Vantage's artificial premium sample, or contracts for a different symbol).
 */
export function usableOptionRows<T extends object>(
  payload: { data?: T[]; message?: unknown; Information?: unknown } | null | undefined,
  symbol: string,
): T[] | null {
  if (!payload) return null;
  const rows: T[] = Array.isArray(payload.data) ? payload.data : [];
  if (!rows.length) return null;
  if (isSampleMessage(payload.message) || isSampleMessage(payload.Information)) return null;
  const want = symbol.trim().toUpperCase();
  let sawSymbol = false;
  let matched = false;
  for (const row of rows) {
    const r = (row ?? {}) as { symbol?: unknown; contractID?: unknown };
    const rowSymbol = String(r.symbol ?? '').trim().toUpperCase();
    const contractId = String(r.contractID ?? '').trim().toUpperCase();
    if (rowSymbol === SAMPLE_SYMBOL || contractId.startsWith(SAMPLE_SYMBOL)) return null;
    if (rowSymbol) {
      sawSymbol = true;
      if (rowSymbol === want) matched = true;
    }
  }
  if (sawSymbol && !matched) return null;
  return rows;
}

/** True when the payload is Alpha Vantage's "premium endpoint" artificial sample (not entitled). */
export function isAlphaVantageSampleChain(payload: { data?: unknown; message?: unknown } | null | undefined): boolean {
  if (!payload) return false;
  if (isSampleMessage(payload.message)) return true;
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.some((row: any) => String(row?.symbol ?? '').toUpperCase() === SAMPLE_SYMBOL
    || String(row?.contractID ?? '').toUpperCase().startsWith(SAMPLE_SYMBOL));
}
