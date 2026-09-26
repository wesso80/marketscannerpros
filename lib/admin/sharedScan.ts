/**
 * Shared saved admin scan.
 *
 * One job scans the admin universe (DEFAULT_WATCHLISTS union) and saves each symbol's result in
 * admin_scan_results (migrations/104_admin_shared_scan.sql). Priority Desk, Operator Terminal, Opportunity
 * Board, the operator radar and the edge-packet cron read those rows instead of re-running the operator
 * engine per page load / per workspace / per watchlist.
 *
 * Per run:
 *   1. take the (market, timeframe) run lock — a second concurrent run is refused, not queued;
 *   2. pick the "due" symbols (not checked within ADMIN_SCAN_MAX_AGE_MIN, default 25 min);
 *   3. equities: one REALTIME_BULK_QUOTES call per 100 due symbols (price + day change); crypto with CoinGecko on
 *      (OPERATOR_CG_FETCH_ENABLED): one /coins/markets call per 250 due symbols (price + 24h change); crypto with
 *      CoinGecko off: no quotes (Alpha Vantage has no bulk crypto quote), so every due symbol gets a full scan;
 *   4. shortlist from those prices (never scanned / failed, refresh floor, movers, radar names; capped);
 *   5. full scan of the shortlist only: 15m bars via avFetch (waits for an avRateGovernor token), daily bars
 *      from the lib/marketData cache, VIX once per run (memoised provider), bars reused for the packet;
 *   6. quote-only refresh for the rest (packet kept, age label shows its real age);
 *   7. save, record radar appear/drop events on the run row, alert on new radar names.
 * Crypto is never looked up through stock endpoints. Crypto runs on Alpha Vantage bars/levels whether or not
 * CoinGecko is on; only ADMIN_CRYPTO_ENABLED=false (lib/admin/adminCrypto) marks crypto rows skipped with no calls.
 */
import { randomUUID } from "crypto";
import type { CandidatePipeline } from "@/lib/operator/orchestrator";
import { avFetch } from "@/lib/avRateGovernor";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { buildAdminResearchScan, type AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";
import {
  createOperatorProvider,
  effectiveEquityEntitlement,
  entitlementParam,
  isEntitlementError,
  memoizeProvider,
  operatorCgFetchEnabled,
  rememberEntitlementRejected,
} from "@/lib/operator/market-data";
import { pipelineToScannerHit } from "@/lib/admin/serializer";
import { recordSignals } from "@/lib/admin/signal-recorder";
import { opsAlert } from "@/lib/opsAlerting";
import { COINGECKO_ID_MAP, getMarketData } from "@/lib/coingecko";
import * as store from "@/lib/admin/sharedScanStore";
import { ADMIN_CRYPTO_DISABLED_MESSAGE, isAdminCryptoEnabled } from "@/lib/admin/adminCrypto";
import { closedUsSession, isCurrentForClosedMarket } from "@/lib/admin/closedMarket";
import {
  chunk,
  diffRadar,
  formatScanAge,
  parseBulkQuotePayload,
  parseCgMarketsQuotes,
  selectDeepScanSymbols,
  selectDueSymbols,
  sharedScanConfig,
  sharedScanUniverse,
  type BulkQuote,
  type RadarChange,
  type SharedScanConfig,
  type SharedScanMarket,
} from "@/lib/admin/sharedScanLogic";
import type { RadarOpportunity } from "@/types/operator";

export type SharedScanTrigger = "cron" | "radar" | "edge" | "manual" | "page";

/** Saved on crypto rows skipped because admin crypto is switched off (ADMIN_CRYPTO_ENABLED=false). */
export const CRYPTO_PAUSED_MESSAGE = ADMIN_CRYPTO_DISABLED_MESSAGE;
export const MIGRATION_MISSING_MESSAGE = "Saved admin scan tables are missing — apply migrations/104_admin_shared_scan.sql.";

export interface SharedScanRequest {
  market: SharedScanMarket;
  timeframe?: string;
  trigger: SharedScanTrigger;
  /** Defaults to the full universe for the market. */
  symbols?: string[];
  /** Overrides for this run (e.g. manual rescan uses maxAgeMin 0). */
  config?: Partial<SharedScanConfig>;
  /**
   * Log pipelines to ai_signal_log for outcome labelling. Default: every run (cron, radar, edge, page, manual), tagged
   * with the trigger in decision_trace; pass false to opt out. It used to be manual rescans only, so the calls the
   * Terminal / Priority Desk / Opportunity Board show between rescans were never measured.
   */
  recordSignals?: boolean;
  /** Full-scan every due symbol (up to maxDeepScans) instead of shortlisting by quote (manual symbol rescans). */
  forceDeep?: boolean;
}

export interface SharedScanSummary {
  runId: string;
  market: SharedScanMarket;
  timeframe: string;
  trigger: SharedScanTrigger;
  status: "done" | "failed";
  symbolsRequested: number;
  symbolsDue: number;
  scanned: number;
  quoted: number;
  failed: number;
  skipped: number;
  deferred: number;
  avCalls: number;
  vixState: string | null;
  quotesAvailable: boolean;
  radarChanges: RadarChange[];
  durationMs: number;
  error?: string;
}

export type StartSharedScanResult =
  | { started: true; runId: string; symbolsRequested: number; done: Promise<SharedScanSummary> }
  | { started: false; reason: "already_running" | "table_missing" | "no_symbols" | "error"; message: string };

function normalizeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of symbols) {
    const s = String(raw || "").trim().toUpperCase();
    if (s && /^[A-Z0-9.\-]{1,15}$/.test(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Take the run lock and start the job. Resolves as soon as the lock decision is made; the scan itself runs
 * on (`done`), which never rejects. Callers that answer an HTTP request (cron curl, admin button) should not
 * await `done`; the web service is a long-lived Node process so the run completes after the response.
 */
export async function startSharedScan(req: SharedScanRequest): Promise<StartSharedScanResult> {
  const market = req.market;
  const timeframe = req.timeframe || "15m";
  const symbols = normalizeSymbols(req.symbols?.length ? req.symbols : sharedScanUniverse(market));
  if (symbols.length === 0) return { started: false, reason: "no_symbols", message: "No symbols to scan." };

  const runId = `scan_${market.toLowerCase()}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  try {
    const locked = await store.acquireRunLock({ runId, market, timeframe, trigger: req.trigger, symbolsRequested: symbols.length });
    if (!locked) {
      return { started: false, reason: "already_running", message: `A ${market} ${timeframe} scan is already running.` };
    }
  } catch (err) {
    if (store.isMissingTableError(err)) return { started: false, reason: "table_missing", message: MIGRATION_MISSING_MESSAGE };
    return { started: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }

  const done = executeRun({ runId, market, timeframe, symbols, req });
  return { started: true, runId, symbolsRequested: symbols.length, done };
}

/** Fire-and-forget helper for routes. */
export function detachRun(result: StartSharedScanResult): void {
  if (result.started) void result.done.catch(() => undefined);
}

/** REALTIME_BULK_QUOTES for up to 100 symbols per call, entitlement per OPERATOR_AV_ENTITLEMENT with fallback. */
export async function fetchBulkQuotes(symbols: string[], onAvCall: () => void): Promise<Map<string, BulkQuote> | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key || symbols.length === 0) return null;
  const out = new Map<string, BulkQuote>();
  let anyOk = false;
  for (const group of chunk(symbols, 100)) {
    const url = (ent: ReturnType<typeof effectiveEquityEntitlement>) =>
      `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(group.join(","))}${entitlementParam(ent)}&apikey=${key}`;
    const label = `ADMIN SCAN REALTIME_BULK_QUOTES x${group.length}`;
    const ent = effectiveEquityEntitlement();
    try {
      let json: unknown;
      try {
        onAvCall();
        json = await avFetch(url(ent), label);
      } catch (err) {
        if (ent === "none" || !isEntitlementError(err)) throw err;
        rememberEntitlementRejected();
        console.warn(`[sharedScan] AV key not entitled to entitlement=${ent} for bulk quotes; retrying without it`);
        onAvCall();
        json = await avFetch(url("none"), `${label} (no entitlement)`);
      }
      const parsed = parseBulkQuotePayload(json);
      if (parsed.size > 0) anyOk = true;
      for (const [sym, quote] of parsed) out.set(sym, quote);
    } catch (err) {
      console.warn(`[sharedScan] bulk quotes failed: ${(err instanceof Error ? err.message : String(err)).replace(/apikey=[^&\s]+/gi, "apikey=***")}`);
    }
  }
  return anyOk ? out : null;
}

/**
 * Crypto bulk quote: CoinGecko /coins/markets for every due symbol with a static CoinGecko id, 250 ids per call
 * (the admin universe is one call). Symbols without an id simply get no quote (they still get their
 * never-scanned / refresh-floor full scans). null when CoinGecko returned nothing, so the run falls back to
 * the no-quotes plan exactly as before.
 */
export async function fetchCryptoBulkQuotes(symbols: string[]): Promise<Map<string, BulkQuote> | null> {
  const idToSymbols = new Map<string, string[]>();
  for (const symbol of symbols) {
    const id = COINGECKO_ID_MAP[symbol.replace(/-?USD$/i, "").toUpperCase()];
    if (!id) continue;
    idToSymbols.set(id, [...(idToSymbols.get(id) ?? []), symbol]);
  }
  if (idToSymbols.size === 0) return null;
  const out = new Map<string, BulkQuote>();
  for (const ids of chunk([...idToSymbols.keys()], 250)) {
    try {
      const rows = await getMarketData({ ids, per_page: 250, page: 1 });
      for (const [sym, quote] of parseCgMarketsQuotes(rows, idToSymbols)) out.set(sym, quote);
    } catch (err) {
      console.warn(`[sharedScan] CoinGecko bulk quotes failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out.size > 0 ? out : null;
}

function barTimestampToIso(ts: string | undefined): string | null {
  if (!ts) return null;
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(ts) ? Date.parse(`${ts}T00:00:00Z`) : Date.parse(ts);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function executeRun(input: {
  runId: string;
  market: SharedScanMarket;
  timeframe: string;
  symbols: string[];
  req: SharedScanRequest;
}): Promise<SharedScanSummary> {
  const { runId, market, timeframe, symbols, req } = input;
  const started = Date.now();
  const cfg: SharedScanConfig = { ...sharedScanConfig(), ...(req.config ?? {}) };
  let avCalls = 0;
  const onAvCall = () => { avCalls += 1; };
  const summary: SharedScanSummary = {
    runId, market, timeframe, trigger: req.trigger, status: "done",
    symbolsRequested: symbols.length, symbolsDue: 0, scanned: 0, quoted: 0, failed: 0, skipped: 0, deferred: 0,
    avCalls: 0, vixState: null, quotesAvailable: false, radarChanges: [], durationMs: 0,
  };
  const notes: Record<string, unknown> = {};

  try {
    const prior = await store.loadPriorResults(market, timeframe, symbols);
    const due = selectDueSymbols(symbols, prior, started, cfg.maxAgeMin);
    summary.symbolsDue = due.length;

    if (market === "CRYPTO" && !isAdminCryptoEnabled()) {
      for (const symbol of due) {
        await store.markResultStatus({ market, timeframe, symbol, runId, status: "skipped", error: CRYPTO_PAUSED_MESSAGE });
      }
      summary.skipped = due.length;
      notes.crypto = "paused";
    } else if (due.length > 0) {
      // Crypto quotes need CoinGecko; with it off (quota protection) the run full-scans every due symbol on AV.
      const quotes = market === "EQUITIES"
        ? await fetchBulkQuotes(due, onAvCall)
        : operatorCgFetchEnabled() ? await fetchCryptoBulkQuotes(due) : null;
      if (market === "CRYPTO") notes.cryptoQuotes = quotes ? "coingecko" : operatorCgFetchEnabled() ? "coingecko_failed" : "off";
      summary.quotesAvailable = quotes != null;
      const plan = req.forceDeep
        ? { deep: due.slice(0, cfg.maxDeepScans), quoteOnly: [] as string[], deferred: due.slice(cfg.maxDeepScans), reasons: Object.fromEntries(due.map((s) => [s, "manual rescan"])) as Record<string, string> }
        : selectDeepScanSymbols({ due, prior, quotes, nowMs: started, cfg });
      summary.deferred = plan.deferred.length;
      notes.reasons = Object.fromEntries(plan.deep.map((s) => [s, plan.reasons[s]]));

      if (quotes && plan.quoteOnly.length > 0) {
        await store.saveQuotes(market, timeframe, runId, plan.quoteOnly.map((s) => quotes.get(s)!).filter(Boolean));
        summary.quoted = plan.quoteOnly.length;
      }

      if (plan.deep.length > 0) {
        const { context } = await buildAdminScanContext();
        const provider = memoizeProvider(createOperatorProvider({ waitForToken: true, onAvCall }));
        summary.vixState = (await provider.getCrossMarketState()).vixState;
        const radarInputs: Array<{ symbol: string; before: RadarOpportunity[] | null; after: RadarOpportunity[] }> = [];
        const toRecord: CandidatePipeline[] = [];

        for (const symbol of plan.deep) {
          const quote = quotes?.get(symbol) ?? null;
          const previous = prior.get(symbol);
          try {
            const scan = await buildAdminResearchScan({
              symbol, market, timeframe, scanContext: context, provider,
              quote: quote ? { changePercent: quote.changePercent } : null,
            });
            // Bars but no playbook detected and no error is a valid "no setup" result, saved as ok (it used to
            // be saved as a NO_PIPELINE failure: hidden from ranking, listed as data-degraded, re-queued first
            // every run so it crowded the refresh of everything else).
            const failedReason = scan.noBars
              ? "NO_BAR_DATA"
              : scan.result.pipelines.length === 0 && scan.result.errors.length > 0
                ? scan.result.errors.map((e) => e.error).join("; ")
                : null;

            if (failedReason && previous?.hasPacket) {
              // Keep the last good result (with its real age); record the failure.
              await store.markResultStatus({ market, timeframe, symbol, runId, status: "failed", error: failedReason });
              summary.failed += 1;
              continue;
            }

            const hits = scan.result.pipelines.map(pipelineToScannerHit).sort((a, b) => b.confidence - a.confidence);
            const radar = scan.result.radar.filter((r) => r.symbol.toUpperCase() === symbol);
            await store.saveScanResult({
              market, timeframe, symbol, runId,
              status: failedReason ? "failed" : "ok",
              dataAsOf: barTimestampToIso(scan.bars[scan.bars.length - 1]?.timestamp),
              price: quote?.price ?? (scan.packet.quote.price > 0 ? scan.packet.quote.price : null),
              // A "no setup" packet now carries a real price/change built from its bars.
              changePct: quote?.changePercent ?? (failedReason ? null : scan.packet.quote.changePercent),
              quoteAt: quote?.quoteAt ?? null,
              packet: scan.packet,
              hits,
              radar,
              error: failedReason,
            });
            if (failedReason) {
              summary.failed += 1;
            } else {
              summary.scanned += 1;
              radarInputs.push({ symbol, before: previous?.radar ?? null, after: radar });
              if (req.recordSignals !== false) toRecord.push(...scan.result.pipelines);
            }
          } catch (err) {
            summary.failed += 1;
            const msg = err instanceof Error ? err.message : String(err);
            await store.markResultStatus({ market, timeframe, symbol, runId, status: "failed", error: msg.slice(0, 300) }).catch(() => undefined);
          }
        }

        summary.radarChanges = diffRadar(radarInputs, new Date().toISOString());
        if (toRecord.length > 0) {
          await recordSignals(toRecord, market, timeframe, Date.now(), { trigger: req.trigger, runId })
            .catch((err) => console.error("[sharedScan] signal recording failed:", err));
        }
        const appeared = summary.radarChanges.filter((c) => c.action === "appeared");
        if (appeared.length > 0) {
          opsAlert({
            title: `Shared admin scan — ${appeared.length} new radar signal(s)`,
            message: appeared.map((a) => `${a.symbol} (${a.permission} @ ${(a.confidence * 100).toFixed(1)}%)`).join("\n"),
            severity: "info",
            source: "auto-scan",
            metadata: { market, timeframe, runId, scanned: summary.scanned, trigger: req.trigger },
          }).catch(() => undefined);
        }
      }
    }
  } catch (err) {
    summary.status = "failed";
    summary.error = err instanceof Error ? err.message : String(err);
    console.error(`[sharedScan] run ${runId} failed:`, summary.error);
  }

  summary.avCalls = avCalls;
  summary.durationMs = Date.now() - started;
  try {
    await store.finishRun({
      runId, status: summary.status, symbolsDue: summary.symbolsDue, symbolsScanned: summary.scanned,
      symbolsQuoted: summary.quoted, symbolsFailed: summary.failed, avCalls, vixState: summary.vixState,
      radarChanges: summary.radarChanges, error: summary.error ?? null,
      notes: { ...notes, skipped: summary.skipped, deferred: summary.deferred, quotesAvailable: summary.quotesAvailable, durationMs: summary.durationMs },
    });
    await store.pruneOldRuns();
  } catch (err) {
    console.error(`[sharedScan] could not finish run ${runId}:`, err instanceof Error ? err.message : err);
  }
  return summary;
}

/* ── Readers ─────────────────────────────────────────────── */

export interface SavedScanMeta {
  status: "ok" | "failed" | "skipped";
  scannedAt: string | null;
  ageSec: number | null;
  ageLabel: string;
  stale: boolean;
  checkedAt: string | null;
  dataAsOf: string | null;
  error: string | null;
  /** Newer bulk-quote price / day change (may be newer than the packet). */
  quote: { price: number | null; changePct: number | null; quoteAt: string | null };
  /** Scanned fine, but no playbook was detected (not a data failure; not ranked as a setup). */
  noSetup: boolean;
  /** US market closed and the scan ran after the last session's close: "as of Fri 25 Sep 2026 close". */
  asOfLabel: string | null;
}

export type SavedPacket = AdminResearchPacket & { savedScan: SavedScanMeta };

/** A saved packet older than this is labelled stale (refresh floor + 30 min). */
export function savedScanStaleAfterSec(cfg: SharedScanConfig = sharedScanConfig()): number {
  return (cfg.refreshFloorMin + 30) * 60;
}

/**
 * Attach the saved-scan age/status to a packet. A failed, skipped or stale row is re-labelled in dataTruth
 * (ERROR / STALE, trust 0 for failures) so every existing "data degraded" filter treats it as such and it is
 * never presented as fresh.
 */
export function toSavedPacket(row: store.SavedScanRow, staleAfterSec = savedScanStaleAfterSec(), nowMs: number = Date.now()): SavedPacket | null {
  if (!row.packet) return null;
  // While the US market is shut, an equity scan made after the last session's close is as current as data gets:
  // it keeps ranking (labelled "as of <session> close") instead of going stale 2.5 h after it ran.
  const closedCurrent = row.market === "EQUITIES" && isCurrentForClosedMarket(row.scannedAt, nowMs);
  const stale = !closedCurrent && (row.ageSec == null || row.ageSec > staleAfterSec);
  const packet = { ...row.packet } as SavedPacket;
  const ageLabel = formatScanAge(row.ageSec);
  packet.savedScan = {
    status: row.status,
    scannedAt: row.scannedAt,
    ageSec: row.ageSec,
    ageLabel,
    stale,
    checkedAt: row.checkedAt,
    dataAsOf: row.dataAsOf,
    error: row.error,
    quote: { price: row.price, changePct: row.changePct, quoteAt: row.quoteAt },
    noSetup: row.status === "ok" && row.hits.length === 0,
    asOfLabel: closedCurrent ? closedUsSession(nowMs)?.label ?? null : null,
  };
  const dt = packet.dataTruth;
  if (dt && row.status === "failed") {
    packet.dataTruth = { ...dt, status: "ERROR", trustScore: 0, notes: [...(dt.notes ?? []), `Last scan failed (${row.error ?? "unknown"}); showing the result from ${ageLabel}.`] };
  } else if (dt && (row.status === "skipped" || stale)) {
    const why = row.status === "skipped" ? row.error ?? "skipped" : `saved scan is ${ageLabel}`;
    packet.dataTruth = { ...dt, status: "STALE", notes: [...(dt.notes ?? []), `Stale: ${why}.`] };
  }
  return packet;
}

/**
 * Copy of a saved packet whose price fields use the newer bulk quote (quote-only refreshes happen between
 * full scans). Analysis fields are untouched; the packetId gets a quote suffix so snapshot dedupe stores it.
 */
export function withFreshQuote(p: SavedPacket): SavedPacket {
  const quote = p.savedScan.quote;
  const scannedMs = p.savedScan.scannedAt ? Date.parse(p.savedScan.scannedAt) : NaN;
  const quoteMs = quote.quoteAt ? Date.parse(quote.quoteAt) : NaN;
  if (!(quote.price != null && quote.price > 0) || !Number.isFinite(quoteMs) || !(quoteMs > scannedMs)) return p;
  const changePercent = quote.changePct ?? p.quote.changePercent;
  return {
    ...p,
    packetId: `${p.packetId}:q${quoteMs}`,
    quote: { ...p.quote, price: quote.price, changePercent },
    snapshot: { ...p.snapshot, price: quote.price, changePercent },
  };
}

/** True when a saved packet is current enough to rank in "best" lists and has a detected setup. */
export function isRankable(p: SavedPacket): boolean {
  return p.savedScan.status === "ok" && !p.savedScan.stale && !p.savedScan.noSetup;
}

const DEGRADED_TRUTH = ["STALE", "DEGRADED", "MISSING", "ERROR", "SIMULATED"];

/** Failed, skipped or stale saved result, or degraded data. A current "no setup" result is not degraded. */
export function isDataDegraded(p: SavedPacket): boolean {
  return p.savedScan.status !== "ok" || p.savedScan.stale || DEGRADED_TRUTH.includes(p.dataTruth.status);
}

export interface SavedScanView {
  available: boolean;
  message?: string;
  market: SharedScanMarket;
  timeframe: string;
  packets: SavedPacket[];
  rows: store.SavedScanRow[];
  lastRun: store.RunSummary | null;
  running: store.RunSummary | null;
  newestScannedAt: string | null;
  oldestScannedAt: string | null;
  /** Age of the newest saved packet, seconds. */
  ageSec: number | null;
  ageLabel: string;
  /** Requested symbols that have no saved result yet. */
  missingSymbols: string[];
}

export async function readSavedScan(input: { market: SharedScanMarket; timeframe?: string; symbols?: string[]; nowMs?: number }): Promise<SavedScanView> {
  const timeframe = input.timeframe || "15m";
  const base: SavedScanView = {
    available: false, market: input.market, timeframe, packets: [], rows: [], lastRun: null, running: null,
    newestScannedAt: null, oldestScannedAt: null, ageSec: null, ageLabel: "never", missingSymbols: [],
  };
  try {
    const symbols = input.symbols?.length ? normalizeSymbols(input.symbols) : undefined;
    const [rows, runs] = await Promise.all([
      store.loadSavedResults({ market: input.market, timeframe, symbols, nowMs: input.nowMs }),
      store.loadRunStatus(input.market, timeframe),
    ]);
    const packets = rows.map((r) => toSavedPacket(r, savedScanStaleAfterSec(), input.nowMs ?? Date.now())).filter((p): p is SavedPacket => p != null);
    const scanned = rows.map((r) => r.scannedAt).filter((s): s is string => !!s).sort();
    const ages = rows.map((r) => r.ageSec).filter((a): a is number => a != null);
    const newestAge = ages.length ? Math.min(...ages) : null;
    const have = new Set(rows.filter((r) => r.packet).map((r) => r.symbol));
    return {
      ...base,
      available: true,
      packets,
      rows,
      lastRun: runs.lastRun,
      running: runs.running,
      newestScannedAt: scanned[scanned.length - 1] ?? null,
      oldestScannedAt: scanned[0] ?? null,
      ageSec: newestAge,
      ageLabel: formatScanAge(newestAge),
      missingSymbols: (symbols ?? sharedScanUniverse(input.market)).filter((s) => !have.has(s)),
    };
  } catch (err) {
    return { ...base, message: store.isMissingTableError(err) ? MIGRATION_MISSING_MESSAGE : err instanceof Error ? err.message : String(err) };
  }
}

/** Compact scan status for API responses / UI age labels. */
export function scanStatusForResponse(view: SavedScanView) {
  return {
    available: view.available,
    message: view.message ?? null,
    market: view.market,
    timeframe: view.timeframe,
    newestScannedAt: view.newestScannedAt,
    oldestScannedAt: view.oldestScannedAt,
    ageSec: view.ageSec,
    ageLabel: view.ageLabel,
    savedSymbols: view.packets.length,
    missingSymbols: view.missingSymbols.length,
    lastRun: view.lastRun,
    running: view.running,
  };
}

/* ── Manual rescan (admin action) ────────────────────────── */

export function manualRescanMinIntervalSec(): number {
  const n = Number(process.env.ADMIN_RESCAN_MIN_INTERVAL_SEC);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

export const MANUAL_RESCAN_MAX_SYMBOLS = 25;

/** Manual rescans allowed per market in any rolling 24 hours (ADMIN_RESCAN_DAILY_CAP, default 48; 0 = none). */
export function manualRescanDailyCap(): number {
  const raw = process.env.ADMIN_RESCAN_DAILY_CAP;
  const n = raw == null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 48;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type ManualRescanResult =
  | { ok: true; runId: string; symbolsRequested: number }
  | { ok: false; status: 400 | 409 | 429 | 503 | 500; error: string; retryAfterSec?: number };

/**
 * Admin "Rescan now": rate-limited (one manual rescan per market per ADMIN_RESCAN_MIN_INTERVAL_SEC, default
 * 5 min, and at most ADMIN_RESCAN_DAILY_CAP per market in any 24 hours, default 48) and overlap-protected (refused while any scan for that market+timeframe is running). With symbols
 * (max 25) those are rescanned regardless of age; without, the universe is rescanned through the normal
 * shortlist with the freshness window disabled.
 */
export async function requestManualRescan(input: {
  market: SharedScanMarket;
  timeframe?: string;
  symbols?: string[];
  nowMs?: number;
}): Promise<ManualRescanResult> {
  const nowMs = input.nowMs ?? Date.now();
  const universe = new Set(sharedScanUniverse(input.market));
  let symbols: string[] | undefined;
  if (input.symbols?.length) {
    symbols = normalizeSymbols(input.symbols);
    if (symbols.length > MANUAL_RESCAN_MAX_SYMBOLS) {
      return { ok: false, status: 400, error: `At most ${MANUAL_RESCAN_MAX_SYMBOLS} symbols per manual rescan.` };
    }
    const foreign = symbols.filter((s) => !universe.has(s));
    if (foreign.length > 0) {
      return { ok: false, status: 400, error: `Not in the ${input.market} admin universe: ${foreign.join(", ")}` };
    }
  }
  try {
    const last = await store.lastManualRunAt(input.market);
    const minGap = manualRescanMinIntervalSec() * 1000;
    if (last != null && nowMs - last < minGap) {
      const retryAfterSec = Math.ceil((minGap - (nowMs - last)) / 1000);
      return { ok: false, status: 429, error: `Manual rescan is limited to one per ${Math.round(minGap / 60000)} min per market.`, retryAfterSec };
    }
    const cap = manualRescanDailyCap();
    const recent = await store.manualRunsSince(input.market, nowMs - DAY_MS);
    if (recent.count >= cap) {
      const retryAfterSec = recent.oldestMs != null ? Math.max(60, Math.ceil((recent.oldestMs + DAY_MS - nowMs) / 1000)) : 3600;
      const totalMin = Math.ceil(retryAfterSec / 60);
      const h = Math.floor(totalMin / 60);
      const min = totalMin % 60;
      return {
        ok: false,
        status: 429,
        error: `Daily manual rescan cap reached for ${input.market}: ${recent.count} of ${cap} in the last 24 hours `
          + `(ADMIN_RESCAN_DAILY_CAP). The next rescan is allowed in about ${h > 0 ? `${h} h ` : ""}${min} min; saved results stay readable meanwhile.`,
        retryAfterSec,
      };
    }
  } catch (err) {
    if (store.isMissingTableError(err)) return { ok: false, status: 503, error: MIGRATION_MISSING_MESSAGE };
    return { ok: false, status: 500, error: err instanceof Error ? err.message : String(err) };
  }
  const started = await startSharedScan({
    market: input.market,
    timeframe: input.timeframe,
    trigger: "manual",
    symbols,
    recordSignals: true,
    forceDeep: !!symbols,
    config: symbols ? { maxAgeMin: 0, maxDeepScans: MANUAL_RESCAN_MAX_SYMBOLS } : { maxAgeMin: 0 },
  });
  if (!started.started) {
    if (started.reason === "already_running") return { ok: false, status: 409, error: started.message };
    if (started.reason === "table_missing") return { ok: false, status: 503, error: started.message };
    return { ok: false, status: started.reason === "no_symbols" ? 400 : 500, error: started.message };
  }
  detachRun(started);
  return { ok: true, runId: started.runId, symbolsRequested: started.symbolsRequested };
}
