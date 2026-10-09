/**
 * Stage 1 — cheap whole-market screen.
 *   LISTING_STATUS (1 call)  → ~14k active US listings with Stock/ETF type
 *   REALTIME_BULK_QUOTES     → 100 symbols per call: close, volume, change %
 * Output: a liquidity/mover-filtered candidate list for Stage 2 (daily series).
 */
import { avTakeToken, avTryToken } from '../../avRateGovernor';
import { budget } from './budget';
import { parseCsvLine } from '../../csv';

/** Cold start waits through one full limiter minute before giving up on the first listings token. */
export const JARVIS_LISTINGS_TOKEN_WAIT_MS = 65_000;

export class StockListingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockListingsError';
  }
}

/** Stage 1 must not continue as a quiet core-only scan when the listings file never arrived. */
export function rethrowStockListingsFailure(error: unknown): void {
  if (error instanceof StockListingsError) throw error;
}

export interface Listing { symbol: string; name: string; exchange: string; type: 'Stock' | 'ETF' }
export interface BulkQuote { symbol: string; close: number; prevClose: number; changePct: number; volume: number; dollarVolume: number; tradingDay: string }

const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSE ARCA', 'AMEX', 'NYSE MKT', 'BATS']);
// Warrants, units, rights, preferreds, notes and test/odd tickers cannot be researched like common stock.
const EXCLUDE_NAME = /\b(warrant|warrants|units?|rights?|preferred|depositary|notes? due|debentures?|trust preferred|\d+(\.\d+)?%)\b/i;

/** CSV line splitter that respects double-quoted fields (company names contain commas) — shared RFC 4180 reader. */
function splitCsv(line: string): string[] {
  return parseCsvLine(line).map((f) => f.trim());
}

async function waitForFirstListingsToken(): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await avTryToken({ lane: 'backfill', feature: 'jarvis-listings' })) return;
    if (Date.now() - started >= JARVIS_LISTINGS_TOKEN_WAIT_MS) {
      throw new StockListingsError(`Stock listings download failed: no Alpha Vantage token for LISTING_STATUS after ${JARVIS_LISTINGS_TOKEN_WAIT_MS}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export async function loadListings(): Promise<{ listings: Listing[]; total: number; excluded: number }> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new StockListingsError('Stock listings download failed: ALPHA_VANTAGE_API_KEY is not set');
  try {
    await waitForFirstListingsToken();
  } catch (err) {
    budget.errors++;
    if (err instanceof StockListingsError) throw err;
    throw new StockListingsError(`Stock listings download failed: no Alpha Vantage token for LISTING_STATUS (${err instanceof Error ? err.message : String(err)})`);
  }
  budget.av++;
  let text = '';
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=LISTING_STATUS&apikey=${key}`, { signal: AbortSignal.timeout(30000) });
    text = await res.text();
    if (!res.ok) throw new StockListingsError(`Stock listings download failed: LISTING_STATUS returned HTTP ${res.status}`);
  } catch (err) {
    budget.errors++;
    if (err instanceof StockListingsError) throw err;
    throw new StockListingsError(`Stock listings download failed: LISTING_STATUS request failed (${err instanceof Error ? err.message : String(err)})`);
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines[0]?.startsWith('symbol')) {
    budget.errors++;
    throw new StockListingsError('Stock listings download failed: LISTING_STATUS did not return a stock listings file');
  }
  const listings: Listing[] = []; let excluded = 0;
  for (const line of lines.slice(1)) {
    const [symbol, name, exchange, type, , , status] = splitCsv(line);
    if (status !== 'Active' || !ALLOWED_EXCHANGES.has(exchange) || (type !== 'Stock' && type !== 'ETF')) { excluded++; continue; }
    if (!/^[A-Z]{1,5}$/.test(symbol) || EXCLUDE_NAME.test(name ?? '')) { excluded++; continue; }
    listings.push({ symbol, name: name ?? '', exchange, type: type as 'Stock' | 'ETF' });
  }
  if (listings.length === 0) {
    budget.errors++;
    throw new StockListingsError('Stock listings download failed: LISTING_STATUS returned no stocks');
  }
  return { listings, total: lines.length - 1, excluded };
}

export async function bulkQuotes(symbols: string[], concurrency = 6): Promise<Map<string, BulkQuote>> {
  const key = process.env.ALPHA_VANTAGE_API_KEY; const out = new Map<string, BulkQuote>();
  if (!key) return out;
  const chunks: string[][] = []; for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
    while (idx < chunks.length) {
      const chunk = chunks[idx++];
      try {
        await avTakeToken(); budget.av++;
        const res = await fetch(`https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${chunk.join(',')}&apikey=${key}`, { signal: AbortSignal.timeout(30000) });
        const json = await res.json();
        for (const r of json?.data ?? []) {
          const close = Number(r.close), prev = Number(r.previous_close), vol = Number(r.volume);
          if (!Number.isFinite(close) || close <= 0) continue;
          out.set(String(r.symbol).toUpperCase(), { symbol: String(r.symbol).toUpperCase(), close, prevClose: prev, changePct: Number(r.change_percent), volume: vol, dollarVolume: close * vol, tradingDay: String(r.timestamp ?? '').slice(0, 10) });
        }
      } catch { budget.errors++; }
    }
  }));
  return out;
}

export interface Stage1Result { listed: number; quoted: number; liquid: number; movers: number; selected: string[]; etfs: Set<string>; names: Map<string, string>; quotes: Map<string, BulkQuote>; tradingDay: string | null }

/**
 * Select Stage-2 symbols: core universe ∪ top-N by dollar volume ∪ notable movers, capped.
 * Liquidity floor applies to everything except the core list (which is scanned regardless, but flagged thin later).
 */
export async function runStage1(core: string[], opts: { maxEquities: number; maxEtfs?: number; minPrice: number; minDollarVol: number; moverPct: number; moverMinDollarVol: number; log: (m: string) => void }): Promise<Stage1Result> {
  const { listings, total } = await loadListings();
  const names = new Map(listings.map((l) => [l.symbol, l.name])), etfs = new Set(listings.filter((l) => l.type === 'ETF').map((l) => l.symbol));
  const universe = [...new Set([...listings.map((l) => l.symbol), ...core])];
  opts.log(`stage1: ${total} listings → ${listings.length} common stock/ETF on major exchanges; bulk-quoting ${universe.length} symbols (${Math.ceil(universe.length / 100)} calls)`);
  const quotes = await bulkQuotes(universe);
  const dayCounts = new Map<string, number>(); for (const qv of quotes.values()) dayCounts.set(qv.tradingDay, (dayCounts.get(qv.tradingDay) ?? 0) + 1);
  const tradingDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const coreSet = new Set(core);
  const liquid = [...quotes.values()].filter((qv) => qv.close >= opts.minPrice && qv.dollarVolume >= opts.minDollarVol && qv.tradingDay === tradingDay);
  const movers = [...quotes.values()].filter((qv) => Math.abs(qv.changePct) >= opts.moverPct && qv.dollarVolume >= opts.moverMinDollarVol && qv.close >= 1 && qv.tradingDay === tradingDay);
  const byDollar = [...liquid].sort((a, b) => b.dollarVolume - a.dollarVolume).map((x) => x.symbol);
  const maxEtfs = opts.maxEtfs ?? 40;
  const selected = new Set<string>(core);
  let etfCount = 0;
  const tryAdd = (s: string) => { if (selected.has(s) || selected.size >= opts.maxEquities) return; if (etfs.has(s)) { if (etfCount >= maxEtfs) return; etfCount++; } selected.add(s); };
  for (const s of movers.filter((m) => !etfs.has(m.symbol)).map((m) => m.symbol)) tryAdd(s);
  for (const s of byDollar) tryAdd(s);
  opts.log(`stage1: quoted ${quotes.size}; liquid (≥$${opts.minPrice}, ≥$${(opts.minDollarVol / 1e6).toFixed(0)}M/day) ${liquid.length}; movers ≥${opts.moverPct}% ${movers.length}; core ${coreSet.size} → stage2 ${selected.size} (cap ${opts.maxEquities}, ETFs from listing capped at ${maxEtfs})`);
  return { listed: listings.length, quoted: quotes.size, liquid: liquid.length, movers: movers.length, selected: [...selected], etfs, names, quotes, tradingDay };
}
