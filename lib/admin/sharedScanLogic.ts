/**
 * Shared saved admin scan — pure decision logic (no I/O). See lib/admin/sharedScan.ts.
 */
import type { RadarOpportunity } from "@/types/operator";
import { parseEquityQuote } from "@/lib/scanner/equityScanInputs";
import { nyWallTimeToUtcMs } from "@/lib/time/nyWallClock";
import { unionWatchlistSymbols } from "@/lib/operator/watchlists";

export type SharedScanMarket = "EQUITIES" | "CRYPTO";

/** Pinned anchors first, then the deduped DEFAULT_WATCHLISTS union (same universe every admin surface used). */
export const EQUITY_ANCHORS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"];
export const CRYPTO_ANCHORS = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"];

export function sharedScanUniverse(market: SharedScanMarket): string[] {
  return market === "CRYPTO"
    ? unionWatchlistSymbols("CRYPTO", CRYPTO_ANCHORS)
    : unionWatchlistSymbols("EQUITIES", EQUITY_ANCHORS);
}

export interface SharedScanConfig {
  /** A symbol checked (quote or scan) within this many minutes is not looked at again. */
  maxAgeMin: number;
  /** Every symbol gets a full 15m-bar scan at least this often, moving or not. */
  refreshFloorMin: number;
  /** Cap on full scans (15m bars + packet) per run. */
  maxDeepScans: number;
  /** Price move since the last full scan that earns a re-scan. */
  movePct: number;
  /** Absolute day change that earns a re-scan. */
  dayMovePct: number;
}

function envNum(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function sharedScanConfig(): SharedScanConfig {
  return {
    maxAgeMin: envNum("ADMIN_SCAN_MAX_AGE_MIN", 25, 0, 24 * 60),
    refreshFloorMin: envNum("ADMIN_SCAN_REFRESH_FLOOR_MIN", 120, 5, 7 * 24 * 60),
    maxDeepScans: envNum("ADMIN_SCAN_MAX_DEEP", 60, 1, 400),
    movePct: envNum("ADMIN_SCAN_MOVE_PCT", 0.75, 0, 100),
    dayMovePct: envNum("ADMIN_SCAN_DAY_MOVE_PCT", 2, 0, 100),
  };
}

/** What the job knows about a symbol from its saved row. */
export interface PriorResult {
  symbol: string;
  status: "ok" | "failed" | "skipped";
  scannedAtMs: number | null;
  checkedAtMs: number | null;
  /** Price the saved packet was built at. */
  scanPrice: number | null;
  radarCount: number;
  /** false when the row has no saved packet (a quote-only refresh cannot create one). */
  hasPacket?: boolean;
}

export interface BulkQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  /** Day change vs previous close, percent. */
  changePercent: number | null;
  quoteAt: string | null;
}

/**
 * REALTIME_BULK_QUOTES payload → quotes by symbol. Accepts both the documented lower-case rows
 * (`symbol`, `close`, `previous_close`, `change_percent`, `timestamp`) and GLOBAL_QUOTE-style keys.
 * Rows without a positive price are dropped. `timestamp` is New York wall-clock time.
 */
export function parseBulkQuotePayload(payload: unknown): Map<string, BulkQuote> {
  const out = new Map<string, BulkQuote>();
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return out;
  for (const row of rows as Array<Record<string, unknown>>) {
    const symbol = String(row?.symbol ?? row?.["01. symbol"] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const q = parseEquityQuote(row);
    if (!Number.isFinite(q.price) || q.price <= 0) continue;
    const tsText = String(row?.timestamp ?? "").replace(/\.\d+$/, "").trim();
    const tsMs = tsText ? nyWallTimeToUtcMs(tsText) : null;
    out.set(symbol, {
      symbol,
      price: q.price,
      previousClose: Number.isFinite(q.prevClose) && q.prevClose > 0 ? q.prevClose : null,
      changePercent: Number.isFinite(q.changePct) ? q.changePct : null,
      quoteAt: tsMs != null ? new Date(tsMs).toISOString() : null,
    });
  }
  return out;
}

/**
 * CoinGecko /coins/markets rows → quotes by admin symbol (crypto bulk quote: every id in one call).
 * idToSymbols maps a CoinGecko id back to the universe symbol(s) that use it. The 24h change stands in for
 * the equity "day change" (crypto has no session close).
 */
export function parseCgMarketsQuotes(rows: unknown, idToSymbols: Map<string, string[]>): Map<string, BulkQuote> {
  const out = new Map<string, BulkQuote>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows as Array<Record<string, unknown>>) {
    const symbols = idToSymbols.get(String(row?.id ?? ""));
    if (!symbols?.length) continue;
    const price = Number(row?.current_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const pct = row?.price_change_percentage_24h;
    const change = row?.price_change_24h;
    const changePercent = pct != null && Number.isFinite(Number(pct)) ? Number(pct) : null;
    const prev = change != null && Number.isFinite(Number(change)) ? price - Number(change) : NaN;
    const tsMs = typeof row?.last_updated === "string" ? Date.parse(row.last_updated) : NaN;
    for (const symbol of symbols) {
      out.set(symbol, {
        symbol,
        price,
        previousClose: Number.isFinite(prev) && prev > 0 ? prev : null,
        changePercent,
        quoteAt: Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null,
      });
    }
  }
  return out;
}

/** Symbols the run should look at: never checked, or last checked longer ago than maxAgeMin. Universe order kept. */
export function selectDueSymbols(
  symbols: string[],
  prior: Map<string, PriorResult>,
  nowMs: number,
  maxAgeMin: number,
): string[] {
  const cutoff = nowMs - maxAgeMin * 60_000;
  return symbols.filter((s) => {
    const p = prior.get(s);
    return !p || p.checkedAtMs == null || p.checkedAtMs <= cutoff;
  });
}

export interface DeepScanPlan {
  /** Full scan: fetch 15m bars and rebuild the packet. */
  deep: string[];
  /** Bulk quote refreshed only; saved packet kept (its age label shows how old it is). */
  quoteOnly: string[];
  /** Nothing new this run (no quote and over the cap); still due next run. */
  deferred: string[];
  reasons: Record<string, string>;
}

/**
 * Shortlist which due symbols get a full scan, using the bulk-quote prices. Priority:
 *   3 never scanned OK / last scan failed
 *   2 last full scan older than refreshFloorMin, or no quotes available at all
 *   1 moved >= movePct since the last scan, |day change| >= dayMovePct, or was on the radar
 * Ties: bigger move first, then universe order. At most maxDeepScans; the rest are quote-only when a quote exists.
 */
export function selectDeepScanSymbols(input: {
  due: string[];
  prior: Map<string, PriorResult>;
  quotes: Map<string, BulkQuote> | null;
  nowMs: number;
  cfg: SharedScanConfig;
}): DeepScanPlan {
  const { due, prior, quotes, nowMs, cfg } = input;
  const floorCutoff = nowMs - cfg.refreshFloorMin * 60_000;
  const ranked: Array<{ symbol: string; priority: number; magnitude: number; index: number }> = [];
  const reasons: Record<string, string> = {};

  due.forEach((symbol, index) => {
    const p = prior.get(symbol);
    const quote = quotes?.get(symbol) ?? null;
    let priority = 0;
    let magnitude = 0;
    if (!p || p.scannedAtMs == null || p.status !== "ok") {
      priority = 3;
      reasons[symbol] = !p || p.scannedAtMs == null ? "never scanned" : `last scan ${p.status}`;
    } else if (p.scannedAtMs <= floorCutoff) {
      priority = 2;
      reasons[symbol] = `refresh floor (${cfg.refreshFloorMin}m)`;
    } else if (!quotes) {
      priority = 2;
      reasons[symbol] = "no bulk quotes this run";
    } else {
      const move = quote && p.scanPrice && p.scanPrice > 0 ? Math.abs(quote.price / p.scanPrice - 1) * 100 : 0;
      const day = quote?.changePercent != null ? Math.abs(quote.changePercent) : 0;
      if (move >= cfg.movePct) {
        priority = 1;
        magnitude = move;
        reasons[symbol] = `moved ${move.toFixed(2)}% since last scan`;
      } else if (day >= cfg.dayMovePct) {
        priority = 1;
        magnitude = day;
        reasons[symbol] = `day change ${day.toFixed(2)}%`;
      } else if (p.radarCount > 0) {
        priority = 1;
        reasons[symbol] = "on radar";
      }
    }
    if (priority > 0) ranked.push({ symbol, priority, magnitude, index });
  });

  ranked.sort((a, b) => b.priority - a.priority || b.magnitude - a.magnitude || a.index - b.index);
  const deepSet = new Set(ranked.slice(0, cfg.maxDeepScans).map((r) => r.symbol));
  const deep = due.filter((s) => deepSet.has(s));
  const rankedSet = new Set(ranked.map((r) => r.symbol));
  const quoteOnly: string[] = [];
  const deferred: string[] = [];
  for (const s of due) {
    if (deepSet.has(s)) continue;
    // A quote-only refresh only updates an existing saved packet; a symbol without one waits for a full scan.
    const p = prior.get(s);
    if (quotes?.has(s) && p && p.hasPacket !== false) quoteOnly.push(s);
    else deferred.push(s);
    reasons[s] = rankedSet.has(s) ? `${reasons[s]} (over cap)` : "quiet";
  }
  return { deep, quoteOnly, deferred, reasons };
}

export interface RadarChange {
  timestamp: string;
  symbol: string;
  action: "appeared" | "dropped";
  permission: string;
  confidence: number;
}

/** Radar appear/drop events for the symbols that were re-scanned this run. */
export function diffRadar(
  scanned: Array<{ symbol: string; before: RadarOpportunity[] | null; after: RadarOpportunity[] }>,
  nowIso: string,
): RadarChange[] {
  const out: RadarChange[] = [];
  for (const s of scanned) {
    const had = (s.before?.length ?? 0) > 0;
    const has = s.after.length > 0;
    if (!had && has) {
      out.push({ timestamp: nowIso, symbol: s.symbol, action: "appeared", permission: s.after[0].permission, confidence: s.after[0].confidenceScore });
    } else if (had && !has) {
      const prev = s.before![0];
      out.push({ timestamp: nowIso, symbol: s.symbol, action: "dropped", permission: prev.permission, confidence: prev.confidenceScore });
    }
  }
  return out;
}

/** Chunks for REALTIME_BULK_QUOTES (max 100 symbols per call). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Human age label, e.g. "just now", "12 min ago", "3 h ago". */
export function formatScanAge(ageSec: number | null | undefined): string {
  if (ageSec == null || !Number.isFinite(ageSec)) return "never";
  if (ageSec < 60) return "just now";
  if (ageSec < 3600) return `${Math.round(ageSec / 60)} min ago`;
  if (ageSec < 48 * 3600) return `${Math.round(ageSec / 3600)} h ago`;
  return `${Math.round(ageSec / 86400)} d ago`;
}
