/**
 * OKX public derivatives data (no API key).
 *
 * Why OKX: production runs in a US region. Binance futures (fapi.binance.com)
 * answers US IPs with HTTP 451 and Bybit's API with HTTP 403, while OKX's public
 * market-data endpoints answer normally. OKX also reports each contract's funding
 * schedule (prevFundingTime / fundingTime / nextFundingTime), so the funding
 * interval is observed rather than assumed, and it publishes an exchange-reported
 * long/short ACCOUNT ratio (not a funding-rate proxy).
 *
 * Docs: https://www.okx.com/docs-v5/en/#public-data-rest-api-get-funding-rate
 *       https://www.okx.com/docs-v5/en/#trading-statistics-rest-api-get-contract-long-short-ratio
 */
import { getCoinGeckoFreshnessStatus, type CoinGeckoFreshnessStatus } from '@/lib/coingecko';

const OKX_BASE = 'https://www.okx.com';
const HOUR_MS = 3_600_000;

export interface OkxResponseMeta {
  provider: 'okx';
  sourceAttribution: 'OKX public API';
  endpointFamily: string;
  lastUpdated: string | null;
  freshnessStatus: CoinGeckoFreshnessStatus;
  stale: boolean;
  fallbackUsed: boolean;
  simulationUsed: false;
}

export function buildOkxResponseMeta(options: {
  endpointFamily: string;
  lastUpdated?: string | number | Date | null;
  maxAgeMs?: number;
  fallbackUsed?: boolean;
}): OkxResponseMeta {
  const raw = options.lastUpdated ?? null;
  const date = raw == null ? null : new Date(raw);
  const lastUpdated = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  const freshnessStatus = getCoinGeckoFreshnessStatus(lastUpdated, options.maxAgeMs);
  return {
    provider: 'okx',
    sourceAttribution: 'OKX public API',
    endpointFamily: options.endpointFamily,
    lastUpdated,
    freshnessStatus,
    stale: freshnessStatus === 'stale',
    fallbackUsed: Boolean(options.fallbackUsed),
    simulationUsed: false,
  };
}

export type FundingSentiment = 'Bullish' | 'Bearish' | 'Neutral';

export interface OkxFundingObservation {
  symbol: string;
  instId: string;
  /** Rate for the contract's own funding interval, in percent (0.01 = 0.01%). */
  rawRatePercent: number;
  /** Observed funding interval in hours (e.g. 8 or 4). */
  intervalHours: number;
  /** Rate normalised to an 8-hour interval, in percent, so venues/contracts compare. */
  ratePercent8h: number;
  /** Simple annualisation using the observed interval: raw × (24 / interval) × 365. */
  annualizedPercent: number;
  sentiment: FundingSentiment;
  /** When the current-period rate settles (OKX `fundingTime`), ms. */
  settlementTime: number;
  observedAt: number;
}

const finite = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Parse OKX /api/v5/public/funding-rate rows for USDT-margined perpetual swaps. */
export function parseOkxFundingRates(rows: unknown, symbols: string[]): OkxFundingObservation[] {
  if (!Array.isArray(rows)) return [];
  const wanted = new Map(symbols.map((s) => [`${s.toUpperCase()}-USDT-SWAP`, s.toUpperCase()]));
  const out: OkxFundingObservation[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const instId = typeof row?.instId === 'string' ? row.instId : '';
    const symbol = wanted.get(instId);
    if (!symbol) continue;
    const rate = finite(row.fundingRate);
    const fundingTime = finite(row.fundingTime);
    const prevFundingTime = finite(row.prevFundingTime);
    const nextFundingTime = finite(row.nextFundingTime);
    const observedAt = finite(row.ts);
    if (rate == null || fundingTime == null || observedAt == null) continue;
    // Interval comes from the venue's own schedule; never assume 8h.
    const intervalMs = prevFundingTime != null && fundingTime > prevFundingTime
      ? fundingTime - prevFundingTime
      : nextFundingTime != null && nextFundingTime > fundingTime ? nextFundingTime - fundingTime : null;
    if (intervalMs == null) continue;
    const intervalHours = intervalMs / HOUR_MS;
    if (!(intervalHours > 0 && intervalHours <= 24)) continue;
    const rawRatePercent = rate * 100;
    const ratePercent8h = rawRatePercent * (8 / intervalHours);
    const annualizedPercent = rawRatePercent * (24 / intervalHours) * 365;
    const sentiment: FundingSentiment = ratePercent8h > 0.03 ? 'Bullish' : ratePercent8h < -0.01 ? 'Bearish' : 'Neutral';
    out.push({ symbol, instId, rawRatePercent, intervalHours, ratePercent8h, annualizedPercent, sentiment, settlementTime: fundingTime, observedAt });
  }
  return out;
}

export interface OkxLongShortObservation {
  symbol: string;
  /** Long accounts ÷ short accounts across OKX contracts for this coin. */
  longShortRatio: number;
  longAccount: number;
  shortAccount: number;
  /** Start of the latest reported period (ms). */
  timestamp: number;
}

/** Parse the latest point of OKX /api/v5/rubik/stat/contracts/long-short-account-ratio. */
export function parseOkxLongShortRatio(symbol: string, rows: unknown): OkxLongShortObservation | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = (rows as unknown[][])
    .map((r) => (Array.isArray(r) ? { ts: finite(r[0]), ratio: finite(r[1]) } : { ts: null, ratio: null }))
    .filter((r): r is { ts: number; ratio: number } => r.ts != null && r.ratio != null && r.ratio > 0)
    .sort((a, b) => b.ts - a.ts)[0];
  if (!latest) return null;
  const longAccount = (latest.ratio / (1 + latest.ratio)) * 100;
  return {
    symbol: symbol.toUpperCase(),
    longShortRatio: latest.ratio,
    longAccount,
    shortAccount: 100 - longAccount,
    timestamp: latest.ts,
  };
}

async function okxGet(path: string, timeoutMs = 8_000): Promise<unknown[]> {
  const response = await fetch(`${OKX_BASE}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`[OKX] ${path} returned HTTP ${response.status}`);
  const body = await response.json() as { code?: string; msg?: string; data?: unknown };
  if (body?.code !== '0' || !Array.isArray(body.data)) {
    throw new Error(`[OKX] ${path} returned code ${body?.code ?? 'unknown'} ${body?.msg ?? ''}`.trim());
  }
  return body.data;
}

/** Current-period funding for the given coins' USDT perpetual swaps (one request). */
export async function getOkxFundingRates(symbols: string[]): Promise<OkxFundingObservation[]> {
  const rows = await okxGet('/api/v5/public/funding-rate?instId=ANY', 10_000);
  return parseOkxFundingRates(rows, symbols);
}

/**
 * Latest hourly long/short account ratio per coin. Requests run sequentially
 * because this endpoint allows 5 requests per 2 seconds per IP.
 */
export async function getOkxLongShortRatios(symbols: string[]): Promise<OkxLongShortObservation[]> {
  const out: OkxLongShortObservation[] = [];
  for (const symbol of symbols) {
    try {
      const rows = await okxGet(`/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${encodeURIComponent(symbol.toUpperCase())}&period=1H`);
      const parsed = parseOkxLongShortRatio(symbol, rows);
      if (parsed) out.push(parsed);
    } catch (error) {
      console.warn(`[OKX] long/short ratio unavailable for ${symbol}:`, error instanceof Error ? error.message : error);
    }
  }
  return out;
}
