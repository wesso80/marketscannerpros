/**
 * Server-side ATR fetcher for the execution engine.
 *
 * - Equities/Forex/Commodities → Alpha Vantage ATR indicator (rate-governed + circuit-breaker)
 * - Crypto → CoinGecko OHLC → manual ATR(14) calculation (commercial plan)
 *
 * Cached in-memory for 5 minutes to avoid burning API quota.
 */
import { avTakeToken } from '@/lib/avRateGovernor';
import { avCircuit } from '@/lib/circuitBreaker';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';

const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// Simple in-memory cache: symbol → { atr, fetchedAt }
const atrCache = new Map<string, { atr: number; fetchedAt: number }>();
const ATR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Helpers ─────────────────────────────────────────────────────────

/** Strip -USD / -USDT suffix and normalise to uppercase */
function cleanCryptoSymbol(symbol: string): string {
  return symbol.replace(/[-_]?(USD|USDT)$/i, '').toUpperCase();
}

/** Compute ATR(period) from OHLC candles [ts, open, high, low, close] */
function computeATRFromOHLC(candles: number[][], period = 14): number | null {
  if (!candles || candles.length < period + 1) return null;

  // Sort ascending by timestamp
  const sorted = [...candles].sort((a, b) => a[0] - b[0]);

  // True Range series
  const trValues: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const high = sorted[i][2];
    const low = sorted[i][3];
    const prevClose = sorted[i - 1][4];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }

  if (trValues.length < period) return null;

  // Initial ATR = simple average of first `period` TR values
  let atr = trValues.slice(0, period).reduce((s, v) => s + v, 0) / period;

  // Wilder smoothing for subsequent values
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

// ── Crypto ATR via CoinGecko OHLC ───────────────────────────────────

async function fetchCryptoATR(symbol: string): Promise<number | null> {
  const clean = cleanCryptoSymbol(symbol);

  // Resolve to CoinGecko ID
  const coinId =
    COINGECKO_ID_MAP[clean] ||
    COINGECKO_ID_MAP[clean + 'USDT'] ||
    (await resolveSymbolToId(clean));

  if (!coinId) {
    console.warn(`[fetchATR/crypto] No CoinGecko mapping for ${clean}`);
    return null;
  }

  // Fetch 30 days of daily OHLC — gives us ~30 candles, enough for ATR(14)
  const ohlc = await getOHLC(coinId, 30, { timeoutMs: 12_000 });
  if (!ohlc || ohlc.length < 15) {
    console.warn(`[fetchATR/crypto] Insufficient OHLC candles for ${clean}: ${ohlc?.length ?? 0}`);
    return null;
  }

  const atr = computeATRFromOHLC(ohlc, 14);
  if (atr == null) {
    console.warn(`[fetchATR/crypto] ATR computation failed for ${clean}`);
    return null;
  }

  console.info(`[fetchATR/crypto] ${clean} (${coinId}) ATR(14) = ${atr.toFixed(4)}`);
  return atr;
}

// ── Equity/Forex ATR via Alpha Vantage ──────────────────────────────

async function fetchEquityATR(symbol: string): Promise<number | null> {
  if (!ALPHA_KEY) {
    console.warn('[fetchATR/equity] No ALPHA_VANTAGE_API_KEY set');
    return null;
  }

  const url =
    `https://www.alphavantage.co/query?function=ATR&symbol=${encodeURIComponent(symbol)}` +
    `&interval=daily&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`;

  await avTakeToken();
  const json = await avCircuit.call(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  });

  if (json?.Note || json?.Information || json?.['Error Message']) {
    console.warn('[fetchATR/equity] AV notice:', (json.Note || json.Information || json['Error Message']).substring(0, 120));
    return null;
  }

  const ta = json?.['Technical Analysis: ATR'] || {};
  const firstEntry = Object.values(ta)[0] as Record<string, string> | undefined;
  const atr = firstEntry ? Number(firstEntry.ATR) : NaN;

  if (!Number.isFinite(atr) || atr <= 0) {
    console.warn(`[fetchATR/equity] Invalid ATR for ${symbol}: ${atr}`);
    return null;
  }

  console.info(`[fetchATR/equity] ${symbol} ATR = ${atr.toFixed(4)}`);
  return atr;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Fetch the 14-period daily ATR for a symbol.
 *
 * - `crypto`  → CoinGecko OHLC → manual ATR(14)
 * - `equity` / `forex` / `commodity` → Alpha Vantage ATR indicator
 *
 * Results are cached for 5 minutes.
 */
export async function fetchATR(
  symbol: string,
  assetClass: 'crypto' | 'equity' | 'forex' | 'commodity' = 'equity',
): Promise<number | null> {
  const cacheKey = `${symbol.toUpperCase()}:${assetClass}`;
  const cached = atrCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ATR_CACHE_TTL_MS) {
    return cached.atr;
  }

  try {
    const atr = assetClass === 'crypto'
      ? await fetchCryptoATR(symbol)
      : await fetchEquityATR(symbol.replace(/[-](USD|USDT)$/i, ''));

    if (atr != null) {
      atrCache.set(cacheKey, { atr, fetchedAt: Date.now() });
    }
    return atr;
  } catch (err) {
    console.error(`[fetchATR] Failed for ${symbol} (${assetClass}):`, err instanceof Error ? err.message : err);
    return null;
  }
}
