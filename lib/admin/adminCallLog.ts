/**
 * Admin call log: every tradeable call an admin page shows is written into ai_signal_log so the existing outcome
 * labeller (/api/cron/label-ai-outcomes, 4h + 24h, fixed since 23:52 AEST Sat 26 Sep 2026) measures it.
 *
 * Each page logs under its own workspace id, `admin-call:<source>`, so:
 *   - the operator-terminal rows (shared-scan pipelines), the Signal Outcomes headline figures and the expectancy
 *     boost are untouched (they filter workspace_id = 'operator-terminal');
 *   - per-page hit rates are one GROUP BY workspace_id away (Signal Outcomes "by source", run-first.sql Q2).
 *
 * Column mapping (the same columns the shared-scan recorder fills):
 *   confluence_score = the page's headline score, 0–100 (callers with a 0–1 score pass scoreScale "0-1")
 *   confidence       = a secondary score, 0–100 (defaults to the headline score)
 *   verdict          = the page's state for the call (GO, FIRED, PLANNED, rank …), ≤ 30 chars
 *   regime           = regime when the page has one, else 'UNKNOWN'
 *   trade_bias       = LONG / SHORT. Anything else is not logged: the labeller cannot grade it.
 *   price_at_signal  = the snapshot price the page was showing (saved-scan quote, packet price, Jarvis close)
 *   signal_at        = when the call was made
 *   decision_trace   = { source, adminCall: true, priceAt, priceSource, priceAgeMin, session, ...page fields }
 *
 * A stale snapshot price would credit the call with the move before it was made, so a price older than
 * MAX_PRICE_AGE_MIN (3 h) is not logged. US equities while the market is shut may use the last close (up to 4 days,
 * i.e. over a weekend); those rows carry session 'closed' so they can be split out.
 *
 * Deduped per workspace + symbol + direction + NY day: a page re-showing the same call is one call.
 * Best-effort: never throws, so logging can never break a page, route or cron.
 *
 * Imports are relative (not "@/") because the Jarvis overnight script loads this through tsx.
 */
import { q } from "../db";
import { isUsRegularSessionOpen, nyDateTime } from "../time/usSession";

export const ADMIN_CALL_SOURCES = ["priority-desk", "morning-brief", "research-alert", "jarvis", "edge-packet", "arca"] as const;
export type AdminCallSource = (typeof ADMIN_CALL_SOURCES)[number];
export const ADMIN_CALL_WORKSPACE_PREFIX = "admin-call:";

export function adminCallWorkspace(source: AdminCallSource): string {
  return `${ADMIN_CALL_WORKSPACE_PREFIX}${source}`;
}

/** Max age of the snapshot price relative to the call (crypto, and US equities during the regular session). */
export const MAX_PRICE_AGE_MIN = 180;
/** US equities while the market is shut: the last close is the right price, up to a long weekend old. */
export const MAX_CLOSED_EQUITY_PRICE_AGE_MIN = 4 * 24 * 60;

export interface AdminCallInput {
  source: AdminCallSource;
  symbol: string;
  /** EQUITIES / CRYPTO, or an asset class (equity, stock, etf, crypto). */
  market: string;
  direction: string | null | undefined;
  score: number | null | undefined;
  secondaryScore?: number | null;
  /** Scale of score / secondaryScore. Default "0-100"; ScannerHit.confidence is "0-1". */
  scoreScale?: "0-1" | "0-100";
  /** Snapshot price shown with the call. */
  price: number | null | undefined;
  /** When that price was observed (quote / bar time). Defaults to the call time. */
  priceAt?: string | null;
  /** Where the price came from, e.g. "saved-scan-quote", "edge-packet", "jarvis-snapshot". */
  priceSource: string;
  timeframe?: string | null;
  entry?: number | null;
  stop?: number | null;
  target1?: number | null;
  target2?: number | null;
  regime?: string | null;
  verdict?: string | null;
  trace?: Record<string, unknown>;
  /** When the call was made (ms). Defaults to now. */
  calledAtMs?: number;
}

export type AdminCallSkipReason = "no_direction" | "no_price" | "stale_price" | "unsupported_asset" | "bad_symbol";

export interface AdminCallRow {
  workspaceId: string;
  symbol: string;
  assetType: "equities" | "crypto";
  timeframe: string | null;
  signalAt: string;
  nyDay: string;
  regime: string;
  confluenceScore: number;
  confidence: number;
  verdict: string;
  tradeBias: "LONG" | "SHORT";
  price: number;
  entry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  trace: Record<string, unknown>;
}

const LONG_WORDS = new Set(["LONG", "BUY", "BULLISH", "BULL", "UP", "CONSTRUCTIVE"]);
const SHORT_WORDS = new Set(["SHORT", "SELL", "BEARISH", "BEAR", "DOWN", "DETERIORATING"]);

export function normalizeCallDirection(raw: unknown): "LONG" | "SHORT" | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (LONG_WORDS.has(s)) return "LONG";
  if (SHORT_WORDS.has(s)) return "SHORT";
  return null;
}

/** ai_signal_log.asset_type values the labeller understands ('equities' matches the shared-scan recorder). */
export function normalizeCallAsset(market: unknown): "equities" | "crypto" | null {
  const s = String(market ?? "").trim().toLowerCase();
  if (s === "crypto") return "crypto";
  if (["equities", "equity", "stock", "stocks", "etf"].includes(s)) return "equities";
  return null;
}

/** 0–100 integer (clamped); "0-1" scores are scaled up; missing / non-finite scores become 0 (NOT NULL column). */
export function normalizeCallScore(score: unknown, scale: "0-1" | "0-100" = "0-100"): number {
  const n = Number(score);
  if (score === null || score === undefined || score === "" || !Number.isFinite(n)) return 0;
  const scaled = scale === "0-1" ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function positive(n: unknown): number | null {
  const v = Number(n);
  return n !== null && n !== undefined && Number.isFinite(v) && v > 0 ? v : null;
}

const SYMBOL_RE = /^[A-Z0-9.\-/]{1,30}$/;

/** Pure: the ai_signal_log row for a call, or why it is not logged. */
export function buildAdminCallRow(input: AdminCallInput, nowMs: number = Date.now()): { row: AdminCallRow } | { skip: AdminCallSkipReason } {
  const symbol = String(input.symbol ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return { skip: "bad_symbol" };
  const assetType = normalizeCallAsset(input.market);
  if (!assetType) return { skip: "unsupported_asset" };
  const tradeBias = normalizeCallDirection(input.direction);
  if (!tradeBias) return { skip: "no_direction" };
  const price = positive(input.price);
  if (price === null) return { skip: "no_price" };

  const calledAtMs = Number.isFinite(input.calledAtMs) ? Number(input.calledAtMs) : nowMs;
  const priceAtMs = input.priceAt ? Date.parse(input.priceAt) : NaN;
  const session = assetType === "crypto" ? "24x7" : isUsRegularSessionOpen(calledAtMs) ? "rth" : "closed";
  const priceAgeMin = Number.isFinite(priceAtMs) ? Math.max(0, Math.round((calledAtMs - priceAtMs) / 60_000)) : null;
  const maxAge = session === "closed" ? MAX_CLOSED_EQUITY_PRICE_AGE_MIN : MAX_PRICE_AGE_MIN;
  if (priceAgeMin !== null && priceAgeMin > maxAge) return { skip: "stale_price" };

  const scale = input.scoreScale ?? "0-100";
  const confluenceScore = normalizeCallScore(input.score, scale);
  const secondary = input.secondaryScore === null || input.secondaryScore === undefined ? confluenceScore : normalizeCallScore(input.secondaryScore, scale);

  return {
    row: {
      workspaceId: adminCallWorkspace(input.source),
      symbol,
      assetType,
      timeframe: input.timeframe ? String(input.timeframe).slice(0, 10) : null,
      signalAt: new Date(calledAtMs).toISOString(),
      nyDay: nyDateTime(calledAtMs).ymd,
      regime: String(input.regime || "UNKNOWN").slice(0, 40),
      confluenceScore,
      confidence: secondary,
      verdict: String(input.verdict || "CALL").slice(0, 30),
      tradeBias,
      price,
      entry: positive(input.entry),
      stop: positive(input.stop),
      target1: positive(input.target1),
      target2: positive(input.target2),
      trace: {
        ...(input.trace ?? {}),
        source: input.source,
        adminCall: true,
        priceSource: input.priceSource,
        priceAt: Number.isFinite(priceAtMs) ? new Date(priceAtMs).toISOString() : null,
        priceAgeMin,
        session,
        scoreRaw: input.score ?? null,
      },
    },
  };
}

export interface AdminCallResult {
  recorded: number;
  duplicates: number;
  skipped: Partial<Record<AdminCallSkipReason, number>>;
  error: string | null;
}

const dedupeKey = (r: Pick<AdminCallRow, "workspaceId" | "symbol" | "tradeBias" | "nyDay">) =>
  `${r.workspaceId}|${r.symbol}|${r.tradeBias}|${r.nyDay}`;

/**
 * Write calls to ai_signal_log (best-effort; never throws). One lookup finds today's already-logged calls for the
 * batch, then only new calls are inserted.
 */
export async function recordAdminCalls(inputs: AdminCallInput[], nowMs: number = Date.now()): Promise<AdminCallResult> {
  const result: AdminCallResult = { recorded: 0, duplicates: 0, skipped: {}, error: null };
  if (!inputs.length) return result;

  const rows: AdminCallRow[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const built = buildAdminCallRow(input, nowMs);
    if ("skip" in built) {
      result.skipped[built.skip] = (result.skipped[built.skip] ?? 0) + 1;
      continue;
    }
    const key = dedupeKey(built.row);
    if (seen.has(key)) {
      result.duplicates += 1;
      continue;
    }
    seen.add(key);
    rows.push(built.row);
  }
  if (!rows.length) return result;

  try {
    const existing = await q<{ workspace_id: string; symbol: string; trade_bias: string; ny_day: string }>(
      `SELECT workspace_id, symbol, trade_bias, ((signal_at AT TIME ZONE 'America/New_York')::date)::text AS ny_day
         FROM ai_signal_log
        WHERE workspace_id = ANY($1::text[])
          AND symbol = ANY($2::text[])
          AND (signal_at AT TIME ZONE 'America/New_York')::date = ANY($3::date[])`,
      [
        [...new Set(rows.map((r) => r.workspaceId))],
        [...new Set(rows.map((r) => r.symbol))],
        [...new Set(rows.map((r) => r.nyDay))],
      ],
    );
    const logged = new Set(existing.map((e) => `${e.workspace_id}|${e.symbol}|${String(e.trade_bias).toUpperCase()}|${e.ny_day}`));

    for (const r of rows) {
      if (logged.has(dedupeKey(r))) {
        result.duplicates += 1;
        continue;
      }
      await q(
        `INSERT INTO ai_signal_log (
           workspace_id, symbol, asset_type, timeframe, signal_at,
           regime, confluence_score, confidence, verdict, trade_bias,
           price_at_signal, entry_price, stop_loss, target_1, target_2,
           decision_trace, outcome
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,'pending')`,
        [
          r.workspaceId, r.symbol, r.assetType, r.timeframe, r.signalAt,
          r.regime, r.confluenceScore, r.confidence, r.verdict, r.tradeBias,
          r.price, r.entry, r.stop, r.target1, r.target2,
          JSON.stringify(r.trace),
        ],
      );
      result.recorded += 1;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.warn(`[admin-call-log] ${rows[0]?.workspaceId ?? "admin-call"}: ${result.error}`);
  }
  return result;
}

export interface SavedScanPrice {
  price: number;
  at: string | null;
}

/**
 * Latest saved-scan price per symbol (admin_scan_results: bulk quote, else packet price) and when it was observed.
 * Any timeframe; the newest observation wins. Empty map on any error.
 */
export async function loadSavedScanPrices(market: string, symbols: string[]): Promise<Map<string, SavedScanPrice>> {
  const out = new Map<string, SavedScanPrice>();
  const m = String(market ?? "").toUpperCase() === "CRYPTO" || normalizeCallAsset(market) === "crypto" ? "CRYPTO" : "EQUITIES";
  const syms = [...new Set(symbols.map((s) => String(s ?? "").trim().toUpperCase()).filter(Boolean))];
  if (!syms.length) return out;
  try {
    const rows = await q<{ symbol: string; price: string | number | null; at: string | Date | null }>(
      `SELECT DISTINCT ON (symbol) symbol, price, COALESCE(quote_at, data_as_of, scanned_at) AS at
         FROM admin_scan_results
        WHERE market = $1 AND symbol = ANY($2::text[]) AND price > 0
        ORDER BY symbol, COALESCE(quote_at, data_as_of, scanned_at) DESC NULLS LAST`,
      [m, syms],
    );
    for (const r of rows) {
      const price = positive(r.price);
      if (price === null) continue;
      out.set(String(r.symbol).toUpperCase(), { price, at: r.at ? new Date(r.at).toISOString() : null });
    }
  } catch (err) {
    console.warn(`[admin-call-log] saved-scan price lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}

/** The fields of a saved shared-scan packet (SavedPacket) a page call needs. Structural, so tests stay light. */
export interface SavedPacketLike {
  symbol: string;
  market: string;
  timeframe?: string;
  bias?: string;
  trustAdjustedScore?: number;
  rawResearchScore?: number;
  lifecycle?: string;
  packetId?: string;
  quote?: { price?: number | null; lastScanAt?: string | null } | null;
  snapshot?: {
    bias?: string;
    regime?: string;
    targets?: { entry?: number; invalidation?: number; target1?: number; target2?: number } | null;
  } | null;
  setup?: { type?: string } | null;
  savedScan?: {
    scannedAt?: string | null;
    dataAsOf?: string | null;
    quote?: { price?: number | null; quoteAt?: string | null } | null;
  } | null;
}

/**
 * A saved shared-scan packet shown by a page (Priority Desk list, ARCA top candidate) as an admin call. Price = the
 * saved bulk quote when there is one (observed at quoteAt), else the packet's own scan price (observed at the scan).
 */
export function savedPacketCall(p: SavedPacketLike, source: AdminCallSource, extra: { verdict?: string; trace?: Record<string, unknown>; calledAtMs?: number } = {}): AdminCallInput {
  const savedQuote = p.savedScan?.quote;
  const useSaved = positive(savedQuote?.price) !== null;
  const t = p.snapshot?.targets ?? null;
  return {
    source,
    symbol: p.symbol,
    market: p.market,
    direction: p.bias ?? p.snapshot?.bias ?? null,
    score: p.trustAdjustedScore ?? null,
    secondaryScore: p.rawResearchScore ?? null,
    price: useSaved ? savedQuote?.price : p.quote?.price ?? null,
    priceAt: useSaved
      ? savedQuote?.quoteAt ?? p.savedScan?.scannedAt ?? null
      : p.savedScan?.scannedAt ?? p.quote?.lastScanAt ?? null,
    priceSource: useSaved ? "saved-scan-quote" : "saved-scan-packet",
    timeframe: p.timeframe ?? null,
    entry: t?.entry ?? null,
    stop: t?.invalidation ?? null,
    target1: t?.target1 ?? null,
    target2: t?.target2 ?? null,
    regime: p.snapshot?.regime ?? null,
    verdict: extra.verdict ?? p.lifecycle ?? null,
    trace: {
      packetId: p.packetId ?? null,
      setupType: p.setup?.type ?? null,
      trustAdjustedScore: p.trustAdjustedScore ?? null,
      rawResearchScore: p.rawResearchScore ?? null,
      dataAsOf: p.savedScan?.dataAsOf ?? null,
      ...(extra.trace ?? {}),
    },
    calledAtMs: extra.calledAtMs,
  };
}
