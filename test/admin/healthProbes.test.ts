/**
 * Admin health probes (lib/admin/healthProbes.ts): real statuses instead of invented ones.
 * Scanner status comes from the shared scan's run log (admin_scan_runs); crypto switched off on purpose is
 * PAUSED, not an error; Discord health comes from discord_bridge_channels (cooldown is not a failure).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ q: vi.fn(async () => []) }));

import {
  feedLabel,
  isPausedRow,
  scannerLabel,
  summarizeDiscordChannels,
  summarizeResearchAlerts,
  summarizeScannerHealth,
  type DiscordChannelRow,
  type ScanRunRow,
} from "@/lib/admin/healthProbes";

// Wednesday 2026-09-23 15:00 UTC = 11:00 ET, US market open.
const OPEN_NOW = Date.parse("2026-09-23T15:00:00Z");
const run = (market: string, minutesAgo: number, status = "completed", failed = 0, now = OPEN_NOW): ScanRunRow => ({
  market,
  timeframe: "15m",
  status,
  started_at: new Date(now - (minutesAgo + 2) * 60_000).toISOString(),
  finished_at: new Date(now - minutesAgo * 60_000).toISOString(),
  symbols_scanned: 40,
  symbols_failed: failed,
});
const opts = (over: Partial<{ nowMs: number; cryptoEnabled: boolean; staleAfterSec: number }> = {}) => ({
  nowMs: OPEN_NOW, cryptoEnabled: false, staleAfterSec: 150 * 60, ...over,
});

describe("summarizeScannerHealth", () => {
  it("marks crypto PAUSED (not an error) when the crypto flag is off, and overall status ignores it", () => {
    const h = summarizeScannerHealth([run("EQUITIES", 10)], [], opts());
    const crypto = h.markets.find((m) => m.market === "CRYPTO")!;
    expect(crypto.status).toBe("PAUSED");
    expect(crypto.note).toMatch(/paused on purpose/i);
    expect(h.status).toBe("OK");
    expect(feedLabel(h)).toBe("HEALTHY");
  });

  it("is PAUSED overall only when every market is paused", () => {
    const h = summarizeScannerHealth([], [], opts());
    expect(h.markets.find((m) => m.market === "EQUITIES")!.status).toBe("NO_RUNS");
    expect(h.status).toBe("NO_RUNS");
    expect(feedLabel(h)).toBe("NO DATA");
    expect(scannerLabel(h)).toBe("NO RUNS");
  });

  it("flags an old equities run as STALE while the market is open", () => {
    const h = summarizeScannerHealth([run("EQUITIES", 400)], [], opts());
    expect(h.status).toBe("STALE");
    expect(feedLabel(h)).toBe("STALE");
  });

  it("keeps a post-close equities run OK over the weekend", () => {
    // Saturday 2026-09-26 16:00 UTC; last run Friday 21:00 UTC (after the 20:00 UTC close).
    const sat = Date.parse("2026-09-26T16:00:00Z");
    const friRun: ScanRunRow = { ...run("EQUITIES", 0, "completed", 0, sat), started_at: "2026-09-25T20:55:00Z", finished_at: "2026-09-25T21:00:00Z" };
    const h = summarizeScannerHealth([friRun], [], opts({ nowMs: sat }));
    expect(h.markets.find((m) => m.market === "EQUITIES")!.status).toBe("OK");
  });

  it("reports a failed run as FAILED and a running run as RUNNING", () => {
    const failed = summarizeScannerHealth([run("EQUITIES", 5, "failed", 40)], [], opts());
    expect(failed.status).toBe("FAILED");
    expect(feedLabel(failed)).toBe("DEGRADED");
    const running = summarizeScannerHealth([run("EQUITIES", 5)], ["EQUITIES"], opts());
    expect(scannerLabel(running)).toBe("RUNNING");
  });

  it("checks crypto normally when the flag is on", () => {
    const h = summarizeScannerHealth([run("EQUITIES", 5), run("CRYPTO", 600)], [], opts({ cryptoEnabled: true }));
    expect(h.markets.find((m) => m.market === "CRYPTO")!.status).toBe("STALE");
    expect(h.status).toBe("STALE");
  });

  it("returns UNKNOWN labels when the probe failed", () => {
    expect(scannerLabel(null)).toBe("UNKNOWN");
    expect(feedLabel(null)).toBe("UNKNOWN");
  });
});

describe("isPausedRow", () => {
  it("treats skipped crypto rows as paused while the flag is off", () => {
    expect(isPausedRow({ status: "skipped", error: "anything" }, "CRYPTO", false)).toBe(true);
    expect(isPausedRow({ status: "skipped", error: "Crypto market data paused (OPERATOR_CG_FETCH_ENABLED is off)" }, "CRYPTO", true)).toBe(true);
    expect(isPausedRow({ status: "failed", error: "boom" }, "CRYPTO", false)).toBe(false);
    expect(isPausedRow({ status: "skipped", error: "x" }, "EQUITIES", false)).toBe(false);
  });
});

const ch = (over: Partial<DiscordChannelRow>): DiscordChannelRow => ({
  channel_key: "signals", label: null, enabled: true, configured: true, last_posted_at: null, post_count: 0,
  last_attempt_at: null, last_status_code: null, last_skip_reason: null, ...over,
});

describe("summarizeDiscordChannels", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  it("is NOT_CONFIGURED with no enabled channel that has a webhook", () => {
    expect(summarizeDiscordChannels([], now).lastStatus).toBe("NOT_CONFIGURED");
    expect(summarizeDiscordChannels([ch({ configured: false })], now).lastStatus).toBe("NOT_CONFIGURED");
  });
  it("treats a cooldown skip as normal", () => {
    const r = summarizeDiscordChannels([ch({ last_posted_at: "2026-09-26T11:00:00Z", last_skip_reason: "cooldown", last_status_code: 204 })], now);
    expect(r.lastStatus).toBe("OK");
    expect(r.failures24h).toBe(0);
  });
  it("flags request failures and HTTP errors", () => {
    const r = summarizeDiscordChannels([
      ch({ channel_key: "a", last_posted_at: "2026-09-26T11:00:00Z" }),
      ch({ channel_key: "b", last_skip_reason: "request_failed" }),
      ch({ channel_key: "c", last_status_code: 404 }),
    ], now);
    expect(r.lastStatus).toBe("FAILED");
    expect(r.failures24h).toBe(2);
    expect(r.note).toContain("#b");
    expect(r.note).toContain("#c");
  });
  it("is IDLE when configured but nothing posted in 24h, and lists skipped unconfigured channels", () => {
    const r = summarizeDiscordChannels([
      ch({ last_posted_at: "2026-09-20T11:00:00Z" }),
      ch({ channel_key: "news", configured: false, last_skip_reason: "not_configured" }),
    ], now);
    expect(r.lastStatus).toBe("IDLE");
    expect(r.note).toContain("#news");
  });
});

describe("summarizeResearchAlerts", () => {
  it("counts fired + suppressed and treats zero as IDLE, not a failure", () => {
    expect(summarizeResearchAlerts({ fired: 2, suppressed: "3", last: "2026-09-26T10:00:00Z" })).toMatchObject({ lastStatus: "OK", count24h: 5 });
    expect(summarizeResearchAlerts(null)).toMatchObject({ lastStatus: "IDLE", count24h: 0 });
  });
});
