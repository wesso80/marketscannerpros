/**
 * Real health probes for the admin health pages (Data Health, System, Diagnostics).
 *
 * These replace statuses that used to be invented: a hard-coded "websocket DISCONNECTED" / "API LOW_LATENCY",
 * a scanner "RUNNING" whenever operator_state had ever been written (the shared scan no longer writes it),
 * webhook "STALE" counts from tables that do not exist (stripe_webhook_events, alert_dispatch_log) and a
 * Discord check against env vars the bridge does not use. Anything we do not actually measure is reported as
 * NOT_MONITORED instead of a made-up state.
 *
 * Read-only: SELECTs only, and a missing table reads as "no data" (never created from here).
 */
import { q } from "@/lib/db";
import { isCurrentForClosedMarket } from "@/lib/admin/closedMarket";
import { sharedScanConfig } from "@/lib/admin/sharedScanLogic";
import { operatorCgFetchEnabled } from "@/lib/operator/market-data";

export const NOT_MONITORED = "NOT MONITORED";

const toIso = (v: unknown): string | null => {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (err as { code?: string })?.code === "42P01" || /relation .* does not exist/i.test(msg);
}

/**
 * A saved-scan row skipped because crypto data is switched off on purpose (OPERATOR_CG_FETCH_ENABLED off).
 * It is "paused", never a scan error.
 */
export function isPausedRow(row: { status: string; error?: string | null }, market: string, cryptoEnabled: boolean): boolean {
  return market === "CRYPTO" && row.status === "skipped" && (!cryptoEnabled || /OPERATOR_CG_FETCH_ENABLED/.test(row.error ?? ""));
}

/* ── Scanner (shared saved scan → admin_scan_runs) ───────────────────── */

export type ScannerMarketStatus = "OK" | "STALE" | "FAILED" | "NO_RUNS" | "PAUSED";

export interface ScanRunRow {
  market: string;
  timeframe: string;
  status: string;
  started_at: unknown;
  finished_at: unknown;
  symbols_scanned: number | string | null;
  symbols_failed: number | string | null;
}

export interface ScannerMarketHealth {
  market: "EQUITIES" | "CRYPTO";
  status: ScannerMarketStatus;
  timeframe: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  ageSec: number | null;
  scanned: number;
  failed: number;
  running: boolean;
  note: string;
}

export interface ScannerHealth {
  source: "admin_scan_runs";
  /** Worst status among markets that are not paused; PAUSED only when every market is paused. */
  status: ScannerMarketStatus;
  lastRunAt: string | null;
  running: boolean;
  markets: ScannerMarketHealth[];
  note: string;
}

/** Saved results older than this are stale (same rule as the saved packets: refresh floor + 30 min). */
export function scannerStaleAfterSec(): number {
  return (sharedScanConfig().refreshFloorMin + 30) * 60;
}

const STATUS_RANK: Record<ScannerMarketStatus, number> = { OK: 0, PAUSED: 0, NO_RUNS: 1, STALE: 2, FAILED: 3 };

function ageText(sec: number | null): string {
  if (sec == null) return "never";
  if (sec < 90) return "just now";
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}

/**
 * Pure: per-market scanner health from the latest finished run per market (+ whether one is running now).
 * Crypto with OPERATOR_CG_FETCH_ENABLED off is PAUSED on purpose, never an error. An equities run made after
 * the last session's close stays OK while the US market is shut.
 */
export function summarizeScannerHealth(
  latest: ScanRunRow[],
  runningMarkets: string[],
  opts: { nowMs: number; cryptoEnabled: boolean; staleAfterSec: number },
): ScannerHealth {
  const markets: ScannerMarketHealth[] = (["EQUITIES", "CRYPTO"] as const).map((market) => {
    const row = latest.find((r) => String(r.market).toUpperCase() === market) ?? null;
    const running = runningMarkets.map((m) => m.toUpperCase()).includes(market);
    const lastRunAt = row ? toIso(row.finished_at) ?? toIso(row.started_at) : null;
    const ageSec = lastRunAt ? Math.max(0, Math.round((opts.nowMs - Date.parse(lastRunAt)) / 1000)) : null;
    const scanned = Number(row?.symbols_scanned ?? 0) || 0;
    const failed = Number(row?.symbols_failed ?? 0) || 0;
    const base = { market, timeframe: row?.timeframe ?? null, lastRunAt, lastRunStatus: row?.status ?? null, ageSec, scanned, failed, running };
    if (market === "CRYPTO" && !opts.cryptoEnabled) {
      return { ...base, status: "PAUSED" as const, note: "Crypto paused on purpose (OPERATOR_CG_FETCH_ENABLED is off)." };
    }
    if (!row) return { ...base, status: "NO_RUNS" as const, note: "No shared-scan run recorded." };
    const summary = `last run ${ageText(ageSec)} (${row.status}), ${scanned} scanned, ${failed} failed`;
    if (row.status === "failed" || row.status === "abandoned") return { ...base, status: "FAILED" as const, note: summary };
    const closedCurrent = market === "EQUITIES" && isCurrentForClosedMarket(lastRunAt, opts.nowMs);
    const fresh = ageSec != null && ageSec <= opts.staleAfterSec;
    if (fresh || closedCurrent) {
      return { ...base, status: "OK" as const, note: closedCurrent && !fresh ? `${summary}; US market closed, last session is current` : summary };
    }
    return { ...base, status: "STALE" as const, note: `${summary}; older than ${Math.round(opts.staleAfterSec / 60)} min` };
  });
  const active = markets.filter((m) => m.status !== "PAUSED");
  const status: ScannerMarketStatus = active.length === 0
    ? "PAUSED"
    : active.reduce<ScannerMarketStatus>((worst, m) => (STATUS_RANK[m.status] > STATUS_RANK[worst] ? m.status : worst), "OK");
  const lastRunAt = markets.map((m) => m.lastRunAt).filter((v): v is string => !!v).sort().at(-1) ?? null;
  return {
    source: "admin_scan_runs",
    status,
    lastRunAt,
    running: markets.some((m) => m.running),
    markets,
    note: markets.map((m) => `${m.market}: ${m.status === "PAUSED" ? "paused" : m.note}`).join(" · "),
  };
}

export async function loadScannerHealth(nowMs: number = Date.now()): Promise<ScannerHealth | null> {
  try {
    const [latest, running] = await Promise.all([
      q<ScanRunRow>(
        `SELECT DISTINCT ON (market) market, timeframe, status, started_at, finished_at, symbols_scanned, symbols_failed
           FROM admin_scan_runs
          WHERE status <> 'running'
          ORDER BY market, started_at DESC`,
      ),
      q<{ market: string }>(
        `SELECT DISTINCT market FROM admin_scan_runs WHERE status = 'running' AND started_at >= NOW() - INTERVAL '20 minutes'`,
      ),
    ]);
    return summarizeScannerHealth(latest, running.map((r) => r.market), {
      nowMs,
      cryptoEnabled: operatorCgFetchEnabled(),
      staleAfterSec: scannerStaleAfterSec(),
    });
  } catch (err) {
    if (isMissingTable(err)) return summarizeScannerHealth([], [], { nowMs, cryptoEnabled: operatorCgFetchEnabled(), staleAfterSec: scannerStaleAfterSec() });
    return null;
  }
}

/** Legacy SystemHealth-style scanner label (RUNNING while a run is in progress). */
export function scannerLabel(h: ScannerHealth | null): string {
  if (!h) return "UNKNOWN";
  if (h.running) return "RUNNING";
  return h.status === "NO_RUNS" ? "NO RUNS" : h.status;
}

/** Legacy "feed" label: the market-data feed as seen by the latest shared-scan runs. */
export function feedLabel(h: ScannerHealth | null): string {
  if (!h) return "UNKNOWN";
  switch (h.status) {
    case "OK": return "HEALTHY";
    case "PAUSED": return "PAUSED";
    case "NO_RUNS": return "NO DATA";
    case "FAILED": return "DEGRADED";
    default: return "STALE";
  }
}

/* ── Webhooks / outbound activity ─────────────────────────────────────── */

export type ActivityStatus = "OK" | "IDLE" | "FAILED" | "NOT_CONFIGURED" | "NO_DATA" | "NOT_MONITORED";

export interface ActivityRow {
  id: string;
  label: string;
  lastStatus: ActivityStatus;
  lastReceivedAt?: string | null;
  count24h?: number;
  failures24h?: number;
  note: string;
}

export interface DiscordChannelRow {
  channel_key: string;
  label: string | null;
  enabled: boolean;
  configured: boolean;
  last_posted_at: unknown;
  post_count: number | string | null;
  last_attempt_at: unknown;
  last_status_code: number | string | null;
  last_skip_reason: string | null;
}

/**
 * Pure: Discord bridge health from discord_bridge_channels (per-channel webhook URLs; the bridge does not use
 * DISCORD_WEBHOOK_URL). A cooldown skip is normal throttling, not a failure.
 */
export function summarizeDiscordChannels(rows: DiscordChannelRow[], nowMs: number): ActivityRow {
  const base = { id: "discord", label: "Discord Bridge" };
  const live = rows.filter((r) => r.enabled && r.configured);
  if (live.length === 0) {
    return { ...base, lastStatus: "NOT_CONFIGURED", note: rows.length ? "No enabled channel has a webhook URL." : "No bridge channels saved." };
  }
  const failing = live.filter((r) => r.last_skip_reason === "request_failed" || Number(r.last_status_code ?? 0) >= 400);
  const lastPost = live.map((r) => toIso(r.last_posted_at)).filter((v): v is string => !!v).sort().at(-1) ?? null;
  const posted24h = live.filter((r) => {
    const t = toIso(r.last_posted_at);
    return !!t && nowMs - Date.parse(t) <= 86_400_000;
  }).length;
  const attemptedUnconfigured = rows
    .filter((r) => r.last_skip_reason === "not_configured" && (!r.enabled || !r.configured))
    .map((r) => `#${r.channel_key}`);
  const parts = [
    `${live.length} channel(s) configured`,
    `${posted24h} posted in 24h`,
    failing.length ? `failing: ${failing.map((r) => `#${r.channel_key}`).join(", ")}` : null,
    attemptedUnconfigured.length ? `posts skipped, no webhook: ${attemptedUnconfigured.join(", ")}` : null,
  ].filter(Boolean);
  return {
    ...base,
    lastStatus: failing.length ? "FAILED" : posted24h > 0 ? "OK" : "IDLE",
    lastReceivedAt: lastPost,
    count24h: posted24h,
    failures24h: failing.length,
    note: parts.join(" · "),
  };
}

export async function loadDiscordBridgeHealth(nowMs: number = Date.now()): Promise<ActivityRow> {
  try {
    const rows = await q<DiscordChannelRow>(
      `SELECT channel_key, label, enabled,
              (webhook_url IS NOT NULL AND btrim(webhook_url) <> '') AS configured,
              last_posted_at, post_count, last_attempt_at, last_status_code, last_skip_reason
         FROM discord_bridge_channels`,
    );
    return summarizeDiscordChannels(rows, nowMs);
  } catch (err) {
    return { id: "discord", label: "Discord Bridge", lastStatus: "NO_DATA", note: isMissingTable(err) ? "discord_bridge_channels table not created yet." : "Could not read discord_bridge_channels." };
  }
}

/** Pure: research-alert activity from admin_research_alerts (FIRED / SUPPRESSED rows). */
export function summarizeResearchAlerts(row: { fired: number | string | null; suppressed: number | string | null; last: unknown } | null): ActivityRow {
  const fired = Number(row?.fired ?? 0) || 0;
  const suppressed = Number(row?.suppressed ?? 0) || 0;
  return {
    id: "alerts",
    label: "Research Alerts",
    lastStatus: fired + suppressed > 0 ? "OK" : "IDLE",
    lastReceivedAt: toIso(row?.last),
    count24h: fired + suppressed,
    note: `${fired} fired, ${suppressed} suppressed in 24h (admin_research_alerts). No alerts is not a failure.`,
  };
}

export async function loadResearchAlertHealth(): Promise<ActivityRow> {
  try {
    const rows = await q<{ fired: number; suppressed: number; last: unknown }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'FIRED')::int AS fired,
              COUNT(*) FILTER (WHERE status = 'SUPPRESSED')::int AS suppressed,
              (SELECT MAX(created_at) FROM admin_research_alerts) AS last
         FROM admin_research_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );
    return summarizeResearchAlerts(rows[0] ?? null);
  } catch (err) {
    return { id: "alerts", label: "Research Alerts", lastStatus: "NO_DATA", note: isMissingTable(err) ? "No research alert has ever been logged (table not created yet)." : "Could not read admin_research_alerts." };
  }
}

/**
 * Stripe webhooks: the receiver does not log events anywhere, so delivery is NOT MONITORED. As a real (weaker)
 * signal, report the latest update to a Stripe-linked subscription row (written by the webhook or a manual sync).
 */
export async function loadStripeWebhookHealth(hasWebhookSecret: boolean): Promise<ActivityRow> {
  let last: string | null = null;
  try {
    const rows = await q<{ last: unknown }>(
      `SELECT MAX(updated_at) AS last FROM user_subscriptions WHERE stripe_subscription_id IS NOT NULL`,
    );
    last = toIso(rows[0]?.last);
  } catch {
    last = null;
  }
  return {
    id: "stripe",
    label: "Stripe Webhooks",
    lastStatus: hasWebhookSecret ? "NOT_MONITORED" : "NOT_CONFIGURED",
    lastReceivedAt: last,
    note: `${hasWebhookSecret ? "Signing secret set; webhook events are not logged, so delivery is not monitored." : "STRIPE_WEBHOOK_SECRET missing."}${last ? " Last Stripe-linked subscription update (webhook or sync) shown." : ""}`,
  };
}
