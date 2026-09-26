/**
 * Shared saved admin scan — persistence (migrations/104_admin_shared_scan.sql).
 */
import { q } from "@/lib/db";
import type { RadarOpportunity } from "@/types/operator";
import type { AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";
import type { ScannerHit } from "@/lib/admin/types";
import { normalizeHitConfidence } from "@/lib/admin/hitIntegrity";
import type { BulkQuote, PriorResult, RadarChange, SharedScanMarket } from "@/lib/admin/sharedScanLogic";

/** A running row older than this is treated as a crashed run and no longer blocks new runs. */
export const RUN_STALE_MIN = 20;

export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .*admin_scan_(runs|results).* does not exist/i.test(msg) || (err as { code?: string })?.code === "42P01";
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505" || /duplicate key|uq_admin_scan_runs_running/i.test(String((err as Error)?.message ?? ""));
}

const toMs = (v: unknown): number | null => {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
};
const toIso = (v: unknown): string | null => {
  const ms = toMs(v);
  return ms == null ? null : new Date(ms).toISOString();
};
const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ── Runs (overlap lock + rate limit) ─────────────────────── */

/**
 * Take the per (market, timeframe) run lock by inserting a 'running' row. The partial unique index makes a
 * concurrent second insert fail, so only one run proceeds. Returns false when another run holds the lock.
 */
export async function acquireRunLock(input: {
  runId: string;
  market: SharedScanMarket;
  timeframe: string;
  trigger: string;
  symbolsRequested: number;
}): Promise<boolean> {
  await q(
    `UPDATE admin_scan_runs
        SET status = 'abandoned', finished_at = NOW(), error = COALESCE(error, 'run exceeded ${RUN_STALE_MIN} minutes')
      WHERE market = $1 AND timeframe = $2 AND status = 'running'
        AND started_at < NOW() - INTERVAL '${RUN_STALE_MIN} minutes'`,
    [input.market, input.timeframe],
  );
  try {
    await q(
      `INSERT INTO admin_scan_runs (run_id, market, timeframe, trigger, status, symbols_requested)
       VALUES ($1, $2, $3, $4, 'running', $5)`,
      [input.runId, input.market, input.timeframe, input.trigger, input.symbolsRequested],
    );
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export async function finishRun(input: {
  runId: string;
  status: "done" | "failed";
  symbolsDue: number;
  symbolsScanned: number;
  symbolsQuoted: number;
  symbolsFailed: number;
  avCalls: number;
  vixState: string | null;
  radarChanges: RadarChange[];
  error?: string | null;
  notes?: Record<string, unknown>;
}): Promise<void> {
  await q(
    `UPDATE admin_scan_runs
        SET status = $2, finished_at = NOW(), symbols_due = $3, symbols_scanned = $4, symbols_quoted = $5,
            symbols_failed = $6, av_calls = $7, vix_state = $8, radar_changes = $9::jsonb, error = $10, notes = $11::jsonb
      WHERE run_id = $1`,
    [
      input.runId, input.status, input.symbolsDue, input.symbolsScanned, input.symbolsQuoted, input.symbolsFailed,
      input.avCalls, input.vixState, JSON.stringify(input.radarChanges), input.error ?? null, JSON.stringify(input.notes ?? {}),
    ],
  );
}

export async function pruneOldRuns(retentionDays = 30): Promise<void> {
  await q(`DELETE FROM admin_scan_runs WHERE started_at < NOW() - ($1::int * INTERVAL '1 day')`, [retentionDays]);
}

/** Start time of the latest manual rescan for a market (rate limit), or null. */
export async function lastManualRunAt(market: SharedScanMarket): Promise<number | null> {
  const rows = await q<{ started_at: string }>(
    `SELECT started_at FROM admin_scan_runs WHERE market = $1 AND trigger = 'manual' ORDER BY started_at DESC LIMIT 1`,
    [market],
  );
  return toMs(rows[0]?.started_at);
}

/** Manual runs for a market started after sinceMs: count and the oldest start (for the daily-cap retry time). */
export async function manualRunsSince(market: SharedScanMarket, sinceMs: number): Promise<{ count: number; oldestMs: number | null }> {
  const rows = await q<{ n: number | string; oldest: string | null }>(
    `SELECT COUNT(*)::int AS n, MIN(started_at) AS oldest
       FROM admin_scan_runs
      WHERE market = $1 AND trigger = 'manual' AND started_at > $2`,
    [market, new Date(sinceMs).toISOString()],
  );
  return { count: Number(rows[0]?.n ?? 0) || 0, oldestMs: toMs(rows[0]?.oldest) };
}

export interface RunSummary {
  runId: string;
  market: string;
  timeframe: string;
  trigger: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  symbolsDue: number;
  symbolsScanned: number;
  symbolsQuoted: number;
  symbolsFailed: number;
  avCalls: number;
  vixState: string | null;
  error: string | null;
}

function toRunSummary(r: Record<string, unknown>): RunSummary {
  return {
    runId: String(r.run_id),
    market: String(r.market),
    timeframe: String(r.timeframe),
    trigger: String(r.trigger),
    status: String(r.status),
    startedAt: toIso(r.started_at),
    finishedAt: toIso(r.finished_at),
    symbolsDue: Number(r.symbols_due ?? 0),
    symbolsScanned: Number(r.symbols_scanned ?? 0),
    symbolsQuoted: Number(r.symbols_quoted ?? 0),
    symbolsFailed: Number(r.symbols_failed ?? 0),
    avCalls: Number(r.av_calls ?? 0),
    vixState: r.vix_state == null ? null : String(r.vix_state),
    error: r.error == null ? null : String(r.error),
  };
}

/** Latest finished run and the currently running one (if any) for a market + timeframe. */
export async function loadRunStatus(market: SharedScanMarket, timeframe: string): Promise<{ lastRun: RunSummary | null; running: RunSummary | null }> {
  const rows = await q<Record<string, unknown>>(
    `(SELECT * FROM admin_scan_runs WHERE market = $1 AND timeframe = $2 AND status <> 'running' ORDER BY started_at DESC LIMIT 1)
     UNION ALL
     (SELECT * FROM admin_scan_runs WHERE market = $1 AND timeframe = $2 AND status = 'running'
        AND started_at >= NOW() - INTERVAL '${RUN_STALE_MIN} minutes' ORDER BY started_at DESC LIMIT 1)`,
    [market, timeframe],
  );
  const runs = rows.map(toRunSummary);
  return { lastRun: runs.find((r) => r.status !== "running") ?? null, running: runs.find((r) => r.status === "running") ?? null };
}

/** Radar appear/drop events from recent runs, oldest first (max `limit`). */
export async function loadRecentRadarChanges(timeframe: string, limit = 200): Promise<RadarChange[]> {
  const rows = await q<{ radar_changes: RadarChange[] | null }>(
    `SELECT radar_changes FROM admin_scan_runs
      WHERE timeframe = $1 AND jsonb_array_length(radar_changes) > 0
      ORDER BY started_at DESC LIMIT 50`,
    [timeframe],
  );
  const all = rows.flatMap((r) => (Array.isArray(r.radar_changes) ? r.radar_changes : []));
  all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return all.slice(-limit);
}

/* ── Results ──────────────────────────────────────────────── */

export async function loadPriorResults(market: SharedScanMarket, timeframe: string, symbols: string[]): Promise<Map<string, PriorResult & { radar: RadarOpportunity[] | null; hasPacket: boolean }>> {
  const rows = symbols.length
    ? await q<Record<string, unknown>>(
        `SELECT symbol, status, scanned_at, checked_at, (packet->'quote'->>'price') AS scan_price, radar, (packet IS NOT NULL) AS has_packet
           FROM admin_scan_results
          WHERE market = $1 AND timeframe = $2 AND symbol = ANY($3)`,
        [market, timeframe, symbols],
      )
    : [];
  const out = new Map<string, PriorResult & { radar: RadarOpportunity[] | null; hasPacket: boolean }>();
  for (const r of rows) {
    const radar = Array.isArray(r.radar) ? (r.radar as RadarOpportunity[]) : null;
    out.set(String(r.symbol), {
      symbol: String(r.symbol),
      status: (r.status as PriorResult["status"]) ?? "failed",
      scannedAtMs: toMs(r.scanned_at),
      checkedAtMs: toMs(r.checked_at),
      scanPrice: toNum(r.scan_price),
      radarCount: radar?.length ?? 0,
      radar,
      hasPacket: r.has_packet === true,
    });
  }
  return out;
}

/** Save a completed scan for one symbol (packet, hits and radar replaced). */
export async function saveScanResult(input: {
  market: SharedScanMarket;
  timeframe: string;
  symbol: string;
  runId: string;
  status: "ok" | "failed";
  dataAsOf: string | null;
  price: number | null;
  changePct: number | null;
  quoteAt: string | null;
  packet: AdminResearchPacket;
  hits: ScannerHit[];
  radar: RadarOpportunity[];
  error: string | null;
}): Promise<void> {
  await q(
    `INSERT INTO admin_scan_results
       (market, timeframe, symbol, run_id, status, scanned_at, checked_at, data_as_of, price, change_pct, quote_at, packet, hit, radar, error)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13)
     ON CONFLICT (market, timeframe, symbol) DO UPDATE SET
       run_id = EXCLUDED.run_id, status = EXCLUDED.status, scanned_at = EXCLUDED.scanned_at, checked_at = EXCLUDED.checked_at,
       data_as_of = EXCLUDED.data_as_of, price = EXCLUDED.price, change_pct = EXCLUDED.change_pct, quote_at = EXCLUDED.quote_at,
       packet = EXCLUDED.packet, hit = EXCLUDED.hit, radar = EXCLUDED.radar, error = EXCLUDED.error`,
    [
      input.market, input.timeframe, input.symbol, input.runId, input.status, input.dataAsOf, input.price, input.changePct,
      input.quoteAt, JSON.stringify(input.packet), JSON.stringify(input.hits), JSON.stringify(input.radar), input.error,
    ],
  );
}

/**
 * Mark a symbol failed/skipped without touching its last good packet, hits, radar or scanned_at — the pages keep
 * showing that older result with its real age and the failure status, never a fresh-looking empty one.
 */
export async function markResultStatus(input: {
  market: SharedScanMarket;
  timeframe: string;
  symbol: string;
  runId: string;
  status: "failed" | "skipped";
  error: string;
}): Promise<void> {
  await q(
    `INSERT INTO admin_scan_results (market, timeframe, symbol, run_id, status, checked_at, error)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (market, timeframe, symbol) DO UPDATE SET
       run_id = EXCLUDED.run_id, status = EXCLUDED.status, checked_at = EXCLUDED.checked_at, error = EXCLUDED.error`,
    [input.market, input.timeframe, input.symbol, input.runId, input.status, input.error],
  );
}

/** Quote-only refresh: newer price / day change, packet kept. Only touches rows that already exist. */
export async function saveQuotes(market: SharedScanMarket, timeframe: string, runId: string, quotes: BulkQuote[]): Promise<void> {
  if (quotes.length === 0) return;
  await q(
    `UPDATE admin_scan_results AS r
        SET run_id = $3, checked_at = NOW(), price = x.price, change_pct = x.change_pct, quote_at = x.quote_at
       FROM jsonb_to_recordset($4::jsonb) AS x(symbol text, price numeric, change_pct numeric, quote_at timestamptz)
      WHERE r.market = $1 AND r.timeframe = $2 AND r.symbol = x.symbol`,
    [
      market, timeframe, runId,
      JSON.stringify(quotes.map((qt) => ({ symbol: qt.symbol, price: qt.price, change_pct: qt.changePercent, quote_at: qt.quoteAt ?? new Date().toISOString() }))),
    ],
  );
}

export interface SavedScanRow {
  symbol: string;
  market: SharedScanMarket;
  timeframe: string;
  status: "ok" | "failed" | "skipped";
  scannedAt: string | null;
  checkedAt: string | null;
  dataAsOf: string | null;
  /** Seconds since the packet was built (null = never scanned). */
  ageSec: number | null;
  price: number | null;
  changePct: number | null;
  quoteAt: string | null;
  packet: AdminResearchPacket | null;
  hits: ScannerHit[];
  radar: RadarOpportunity[];
  error: string | null;
}

export async function loadSavedResults(input: {
  market: SharedScanMarket;
  timeframe: string;
  symbols?: string[];
  nowMs?: number;
}): Promise<SavedScanRow[]> {
  const nowMs = input.nowMs ?? Date.now();
  const params: unknown[] = [input.market, input.timeframe];
  let filter = "";
  if (input.symbols?.length) {
    params.push(input.symbols.map((s) => s.toUpperCase()));
    filter = " AND symbol = ANY($3)";
  }
  const rows = await q<Record<string, unknown>>(
    `SELECT symbol, market, timeframe, status, scanned_at, checked_at, data_as_of, price, change_pct, quote_at, packet, hit, radar, error
       FROM admin_scan_results
      WHERE market = $1 AND timeframe = $2${filter}`,
    params,
  );
  return rows.map((r) => {
    const scannedMs = toMs(r.scanned_at);
    return {
      symbol: String(r.symbol),
      market: String(r.market) as SharedScanMarket,
      timeframe: String(r.timeframe),
      status: (r.status as SavedScanRow["status"]) ?? "failed",
      scannedAt: toIso(r.scanned_at),
      checkedAt: toIso(r.checked_at),
      dataAsOf: toIso(r.data_as_of),
      ageSec: scannedMs == null ? null : Math.max(0, Math.round((nowMs - scannedMs) / 1000)),
      price: toNum(r.price),
      changePct: toNum(r.change_pct),
      quoteAt: toIso(r.quote_at),
      packet: (r.packet as AdminResearchPacket | null) ?? null,
      // Legacy rows stored confidence as a 0..1 fraction; rescale on read (hitIntegrity.ts).
      hits: Array.isArray(r.hit) ? (r.hit as ScannerHit[]).map(normalizeHitConfidence) : [],
      radar: Array.isArray(r.radar) ? (r.radar as RadarOpportunity[]) : [],
      error: r.error == null ? null : String(r.error),
    };
  });
}
