/**
 * Admin health routes report measured state only:
 *  - /api/admin/data-health: no queries to the nonexistent stripe_webhook_events / alert_dispatch_log tables;
 *    Discord from discord_bridge_channels; scanner from admin_scan_runs; crypto paused ≠ error.
 *  - /api/admin/system/health: websocket / cache / API are NOT MONITORED (never a made-up DISCONNECTED/OK).
 *  - /api/admin/scanner/live: crypto rows skipped because crypto is off are "paused", not scan errors.
 *  - "crypto off" is ADMIN_CRYPTO_ENABLED=false (lib/admin/adminCrypto), not the CoinGecko flag: with CoinGecko off
 *    crypto scans on Alpha Vantage and is reported like any other market.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  sql: [] as string[],
  scanRuns: [] as Record<string, unknown>[],
  discord: [] as Record<string, unknown>[],
  savedRows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/auth", () => ({ getSessionFromCookie: vi.fn(async () => null) }));
vi.mock("@/lib/db", () => ({
  q: vi.fn(async (sql: string) => {
    m.sql.push(sql);
    if (/FROM admin_scan_runs/.test(sql) && /DISTINCT ON/.test(sql)) return m.scanRuns;
    if (/FROM admin_scan_runs/.test(sql)) return [];
    if (/FROM discord_bridge_channels/.test(sql)) return m.discord;
    if (/FROM admin_research_alerts/.test(sql)) return [{ fired: 1, suppressed: 0, last: new Date().toISOString() }];
    if (/FROM user_subscriptions/.test(sql)) return [{ last: null }];
    return [{ "?column?": 1 }];
  }),
}));
vi.mock("@/lib/admin/scan-context", () => ({ buildAdminScanContext: vi.fn(async () => ({ risk: { source: "test" } })) }));
vi.mock("@/lib/admin/expectancy", () => ({ enrichHitsWithExpectancy: vi.fn(async (hits: unknown[]) => hits) }));
vi.mock("@/lib/admin/sharedScan", async (orig) => {
  const real = await orig<typeof import("@/lib/admin/sharedScan")>();
  return {
    ...real,
    readSavedScan: vi.fn(async (input: { market: string; timeframe?: string }) => ({
      available: true, market: input.market, timeframe: input.timeframe ?? "15m", packets: [], rows: m.savedRows,
      lastRun: null, running: null, newestScannedAt: null, oldestScannedAt: null, ageSec: null, ageLabel: "never", missingSymbols: [],
    })),
  };
});

import { GET as dataHealthGET } from "../../app/api/admin/data-health/route";
import { GET as systemHealthGET } from "../../app/api/admin/system/health/route";
import { GET as scannerLiveGET } from "../../app/api/admin/scanner/live/route";

const req = (url: string) => new NextRequest(new URL(url, "http://localhost"));

beforeEach(() => {
  m.sql = [];
  m.scanRuns = [];
  m.discord = [];
  m.savedRows = [];
  delete process.env.OPERATOR_CG_FETCH_ENABLED;
  delete process.env.ADMIN_CRYPTO_ENABLED;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("GET /api/admin/data-health", () => {
  it("never queries the nonexistent webhook tables and reads Discord from discord_bridge_channels", async () => {
    m.discord = [{ channel_key: "signals", label: null, enabled: true, configured: true, last_posted_at: new Date().toISOString(), post_count: 3, last_attempt_at: null, last_status_code: 204, last_skip_reason: null }];
    const res = await dataHealthGET(req("/api/admin/data-health"));
    const body = await res.json();
    const all = m.sql.join("\n");
    expect(all).not.toMatch(/stripe_webhook_events|alert_dispatch_log|operator_state/);
    expect(all).toMatch(/discord_bridge_channels/);
    expect(all).toMatch(/admin_scan_runs/);
    expect(all).not.toMatch(/webhook_url\s*,/); // URL itself is never selected, only whether it is set
    const byId = Object.fromEntries(body.webhooks.map((w: { id: string }) => [w.id, w]));
    expect(byId.discord.lastStatus).toBe("OK");
    expect(byId.stripe.lastStatus).toBe("NOT_MONITORED");
    expect(byId.alerts.lastStatus).toBe("OK");
    for (const w of body.webhooks) expect(w.lastStatus).not.toBe("STALE");
  });

  it("shows crypto as paused (not an error) when admin crypto is switched off, and keys as configuration-only", async () => {
    process.env.ADMIN_CRYPTO_ENABLED = "false";
    process.env.ALPHA_VANTAGE_API_KEY = "k";
    m.scanRuns = [{ market: "EQUITIES", timeframe: "15m", status: "completed", started_at: new Date(Date.now() - 120_000).toISOString(), finished_at: new Date(Date.now() - 60_000).toISOString(), symbols_scanned: 40, symbols_failed: 0 }];
    const body = await (await dataHealthGET(req("/api/admin/data-health"))).json();
    const crypto = body.scanner.markets.find((x: { market: string }) => x.market === "CRYPTO");
    expect(crypto.status).toBe("PAUSED");
    const scannerProvider = body.providers.find((p: { id: string }) => p.id === "scanner");
    expect(scannerProvider.status).toBe("OK");
    const av = body.providers.find((p: { id: string }) => p.id === "alpha-vantage");
    expect(av.status).toBe("CONFIGURED");
  });
});

describe("crypto with CoinGecko off but admin crypto on (default)", () => {
  it("data-health reports crypto from its runs, never PAUSED", async () => {
    const recent = { started_at: new Date(Date.now() - 120_000).toISOString(), finished_at: new Date(Date.now() - 60_000).toISOString() };
    m.scanRuns = [
      { market: "EQUITIES", timeframe: "15m", status: "completed", ...recent, symbols_scanned: 40, symbols_failed: 0 },
      { market: "CRYPTO", timeframe: "15m", status: "completed", ...recent, symbols_scanned: 60, symbols_failed: 1 },
    ];
    const body = await (await dataHealthGET(req("/api/admin/data-health"))).json();
    const crypto = body.scanner.markets.find((x: { market: string }) => x.market === "CRYPTO");
    expect(crypto.status).toBe("OK");
    expect(crypto.scanned).toBe(60);
  });

  it("system health counts crypto failures (crypto is not paused)", async () => {
    const recent = { started_at: new Date(Date.now() - 120_000).toISOString(), finished_at: new Date(Date.now() - 60_000).toISOString() };
    m.scanRuns = [{ market: "CRYPTO", timeframe: "15m", status: "completed", ...recent, symbols_scanned: 58, symbols_failed: 2 }];
    const body = await (await systemHealthGET(req("/api/admin/system/health"))).json();
    expect(body.scanner).not.toBe("PAUSED");
    expect(body.scannerDetail.markets.find((x: { market: string }) => x.market === "CRYPTO").status).toBe("OK");
    expect(body.errorsCount).toBe(2);
    expect(JSON.stringify(body)).not.toMatch(/OPERATOR_CG_FETCH_ENABLED/);
  });

  it("scanner/live: crypto feed is not PAUSED; a real crypto failure is an error; leftover skipped rows stay paused", async () => {
    m.savedRows = [
      { symbol: "BTC", status: "failed", error: "NO_BAR_DATA", ageSec: 60, hits: [] },
      { symbol: "ETH", status: "skipped", error: "Crypto market data paused (OPERATOR_CG_FETCH_ENABLED is off)", ageSec: null, hits: [] },
    ];
    const body = await (await scannerLiveGET(req("/api/admin/scanner/live?market=CRYPTO&timeframe=15m"))).json();
    expect(body.health.feed).not.toBe("PAUSED");
    expect(body.health.scanner).not.toBe("PAUSED");
    expect(body.meta.errors.map((e: { symbol: string }) => e.symbol)).toEqual(["BTC"]);
    expect(body.meta.paused).toEqual(["ETH"]);
  });
});

describe("GET /api/admin/system/health", () => {
  it("reports unmeasured parts as NOT MONITORED and the scanner from admin_scan_runs", async () => {
    const body = await (await systemHealthGET(req("/api/admin/system/health"))).json();
    expect(body.websocket).toBe("NOT MONITORED");
    expect(body.cache).toBe("NOT MONITORED");
    expect(body.api).toBe("NOT MONITORED");
    expect(body.scanner).toBe("NO RUNS");
    expect(body.feed).toBe("NO DATA");
    expect(body.dbConnected).toBe(true);
    expect(m.sql.join("\n")).not.toMatch(/operator_state/);
  });
});

describe("GET /api/admin/scanner/live", () => {
  it("defaults to EQUITIES when crypto is off (no market param)", async () => {
    const body = await (await scannerLiveGET(req("/api/admin/scanner/live?timeframe=15m"))).json();
    expect(body.meta.market).toBe("EQUITIES");
    expect(body.health.websocket).toBe("NOT MONITORED");
    expect(body.health.api).toBe("NOT MONITORED");
  });

  it("lists paused crypto rows separately instead of counting them as errors (admin crypto switched off)", async () => {
    process.env.ADMIN_CRYPTO_ENABLED = "false";
    m.savedRows = [
      { symbol: "BTC", status: "skipped", error: "Crypto market data paused (OPERATOR_CG_FETCH_ENABLED is off)", ageSec: null, hits: [] },
      { symbol: "ETH", status: "skipped", error: "Crypto market data paused (OPERATOR_CG_FETCH_ENABLED is off)", ageSec: null, hits: [] },
    ];
    const body = await (await scannerLiveGET(req("/api/admin/scanner/live?market=CRYPTO&timeframe=15m"))).json();
    expect(body.meta.errorsCount).toBe(0);
    expect(body.meta.pausedCount).toBe(2);
    expect(body.meta.paused).toEqual(["BTC", "ETH"]);
    expect(body.health.feed).toBe("PAUSED");
    expect(body.health.scanner).toBe("PAUSED");
  });

  it("still counts real equities failures as errors", async () => {
    m.savedRows = [{ symbol: "AAPL", status: "failed", error: "AV timeout", ageSec: 60, hits: [] }];
    const body = await (await scannerLiveGET(req("/api/admin/scanner/live?market=EQUITIES"))).json();
    expect(body.meta.errorsCount).toBe(1);
    expect(body.meta.pausedCount).toBe(0);
  });
});
