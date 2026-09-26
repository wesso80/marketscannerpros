/**
 * Admin call logging (fix/admin-call-logging): the calls admin pages show are written to ai_signal_log under
 * workspace 'admin-call:<source>' with the snapshot price, deduped per NY day, so the labeller can grade them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  q: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
}));
vi.mock("@/lib/db", () => ({ q: m.q }));
vi.mock("../../lib/db", () => ({ q: m.q }));

import {
  adminCallWorkspace,
  buildAdminCallRow,
  loadSavedScanPrices,
  normalizeCallAsset,
  normalizeCallDirection,
  normalizeCallScore,
  recordAdminCalls,
  savedPacketCall,
  MAX_PRICE_AGE_MIN,
  type AdminCallInput,
} from "@/lib/admin/adminCallLog";

// Fri 25 Sep 2026 10:00 ET (regular session) and Sat 26 Sep 2026 12:00 ET (closed).
const RTH = Date.parse("2026-09-25T14:00:00Z");
const SAT = Date.parse("2026-09-26T16:00:00Z");
const MIN = 60_000;

const call = (over: Partial<AdminCallInput> = {}): AdminCallInput => ({
  source: "priority-desk",
  symbol: "aapl",
  market: "EQUITIES",
  direction: "bullish",
  score: 72.4,
  price: 190.5,
  priceAt: new Date(RTH - 5 * MIN).toISOString(),
  priceSource: "saved-scan-quote",
  calledAtMs: RTH,
  ...over,
});

beforeEach(() => {
  m.q.mockReset();
  m.q.mockImplementation(async () => []);
});

describe("normalisers", () => {
  it("maps direction words to LONG / SHORT and rejects neutral", () => {
    for (const w of ["LONG", "buy", "Bullish", "bull", "up", "constructive"]) expect(normalizeCallDirection(w)).toBe("LONG");
    for (const w of ["short", "SELL", "bearish", "bear", "down", "deteriorating"]) expect(normalizeCallDirection(w)).toBe("SHORT");
    for (const w of ["NEUTRAL", "flat", "", null, undefined, "watch"]) expect(normalizeCallDirection(w)).toBeNull();
  });

  it("maps markets / asset classes to the labeller's asset types", () => {
    expect(normalizeCallAsset("EQUITIES")).toBe("equities");
    expect(normalizeCallAsset("equity")).toBe("equities");
    expect(normalizeCallAsset("etf")).toBe("equities");
    expect(normalizeCallAsset("CRYPTO")).toBe("crypto");
    expect(normalizeCallAsset("forex")).toBeNull();
    expect(normalizeCallAsset(undefined)).toBeNull();
  });

  it("scales and clamps scores to a 0–100 integer", () => {
    expect(normalizeCallScore(72.6)).toBe(73);
    expect(normalizeCallScore(0.815, "0-1")).toBe(82);
    expect(normalizeCallScore(140)).toBe(100);
    expect(normalizeCallScore(-3)).toBe(0);
    expect(normalizeCallScore(null)).toBe(0);
    expect(normalizeCallScore("abc")).toBe(0);
  });

  it("workspace id is admin-call:<source>", () => {
    expect(adminCallWorkspace("morning-brief")).toBe("admin-call:morning-brief");
  });
});

describe("buildAdminCallRow", () => {
  it("builds a pending-ready row with the snapshot price and a trace", () => {
    const r = buildAdminCallRow(call({ secondaryScore: 55, entry: 190, stop: 185, target1: 200, target2: -1, regime: "TREND_UP" }), RTH);
    expect("row" in r).toBe(true);
    if (!("row" in r)) return;
    expect(r.row).toMatchObject({
      workspaceId: "admin-call:priority-desk", symbol: "AAPL", assetType: "equities", tradeBias: "LONG",
      price: 190.5, confluenceScore: 72, confidence: 55, entry: 190, stop: 185, target1: 200, target2: null,
      regime: "TREND_UP", verdict: "CALL", nyDay: "2026-09-25", signalAt: new Date(RTH).toISOString(),
    });
    expect(r.row.trace).toMatchObject({ source: "priority-desk", adminCall: true, priceSource: "saved-scan-quote", priceAgeMin: 5, session: "rth", scoreRaw: 72.4 });
    // no lifecycle_state: the signal-lifecycle job ignores these rows
    expect(r.row.trace).not.toHaveProperty("lifecycle_state");
  });

  it("secondary score defaults to the main score", () => {
    const r = buildAdminCallRow(call({ score: 0.64, scoreScale: "0-1" }), RTH);
    expect("row" in r && r.row.confluenceScore).toBe(64);
    expect("row" in r && r.row.confidence).toBe(64);
  });

  it("skips calls it can't grade", () => {
    expect(buildAdminCallRow(call({ symbol: "bad symbol!" }), RTH)).toEqual({ skip: "bad_symbol" });
    expect(buildAdminCallRow(call({ market: "FOREX" }), RTH)).toEqual({ skip: "unsupported_asset" });
    expect(buildAdminCallRow(call({ direction: "NEUTRAL" }), RTH)).toEqual({ skip: "no_direction" });
    expect(buildAdminCallRow(call({ price: 0 }), RTH)).toEqual({ skip: "no_price" });
    expect(buildAdminCallRow(call({ price: null }), RTH)).toEqual({ skip: "no_price" });
  });

  it("stale prices: 3 h limit in the session and for crypto, last close OK while equities are shut", () => {
    const old = new Date(RTH - (MAX_PRICE_AGE_MIN + 1) * MIN).toISOString();
    expect(buildAdminCallRow(call({ priceAt: old }), RTH)).toEqual({ skip: "stale_price" });
    expect(buildAdminCallRow(call({ market: "CRYPTO", symbol: "BTC", priceAt: new Date(SAT - 200 * MIN).toISOString(), calledAtMs: SAT }), SAT)).toEqual({ skip: "stale_price" });
    // Saturday call priced at Friday's close (~20 h old): fine, tagged session 'closed'
    const sat = buildAdminCallRow(call({ priceAt: "2026-09-25T20:00:00Z", calledAtMs: SAT }), SAT);
    expect("row" in sat && sat.row.trace.session).toBe("closed");
    // older than a long weekend: stale even while closed
    expect(buildAdminCallRow(call({ priceAt: "2026-09-20T20:00:00Z", calledAtMs: SAT }), SAT)).toEqual({ skip: "stale_price" });
    // no priceAt: logged with priceAgeMin null
    const noAt = buildAdminCallRow(call({ priceAt: null }), RTH);
    expect("row" in noAt && noAt.row.trace.priceAgeMin).toBeNull();
  });
});

describe("recordAdminCalls", () => {
  it("dedupes within the batch and against today's rows, inserts the rest as pending", async () => {
    m.q.mockImplementation(async (sql: unknown) =>
      String(sql).includes("SELECT workspace_id") ? [{ workspace_id: "admin-call:priority-desk", symbol: "MSFT", trade_bias: "long", ny_day: "2026-09-25" }] : [],
    );
    const res = await recordAdminCalls([
      call(),
      call({ verdict: "ARCA top" }), // same symbol / direction / day → duplicate
      call({ symbol: "MSFT" }), // already logged today
      call({ symbol: "NVDA", direction: "short" }),
      call({ symbol: "TSLA", direction: "neutral" }),
    ], RTH);
    expect(res).toEqual({ recorded: 2, duplicates: 2, skipped: { no_direction: 1 }, error: null });
    const [lookupSql, lookupParams] = m.q.mock.calls[0] as [string, unknown[]];
    expect(lookupSql).toContain("America/New_York");
    expect(lookupParams).toEqual([["admin-call:priority-desk"], ["AAPL", "MSFT", "NVDA"], ["2026-09-25"]]);
    const inserts = m.q.mock.calls.filter(([s]) => String(s).includes("INSERT INTO ai_signal_log"));
    expect(inserts).toHaveLength(2);
    expect(String(inserts[0][0])).toContain("'pending'");
    expect((inserts[0][1] as unknown[]).slice(0, 3)).toEqual(["admin-call:priority-desk", "AAPL", "equities"]);
    expect((inserts[1][1] as unknown[])[9]).toBe("SHORT");
    expect(JSON.parse(String((inserts[1][1] as unknown[])[15]))).toMatchObject({ adminCall: true, source: "priority-desk" });
  });

  it("never throws: a DB error is returned, not raised", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    m.q.mockRejectedValue(new Error("relation missing"));
    await expect(recordAdminCalls([call()], RTH)).resolves.toMatchObject({ recorded: 0, error: "relation missing" });
    warn.mockRestore();
  });

  it("does no DB work when nothing is loggable", async () => {
    expect(await recordAdminCalls([], RTH)).toMatchObject({ recorded: 0 });
    expect(await recordAdminCalls([call({ price: null })], RTH)).toMatchObject({ recorded: 0, skipped: { no_price: 1 } });
    expect(m.q).not.toHaveBeenCalled();
  });
});

describe("loadSavedScanPrices", () => {
  it("reads the newest saved-scan price per symbol, keyed upper-case", async () => {
    m.q.mockResolvedValue([{ symbol: "aapl", price: "190.25", at: "2026-09-25T13:55:00Z" }, { symbol: "MSFT", price: 0, at: null }]);
    const map = await loadSavedScanPrices("equity", ["aapl", "AAPL", "msft", ""]);
    expect(map.get("AAPL")).toEqual({ price: 190.25, at: "2026-09-25T13:55:00.000Z" });
    expect(map.has("MSFT")).toBe(false);
    expect(m.q.mock.calls[0][1]).toEqual(["EQUITIES", ["AAPL", "MSFT"]]);
  });

  it("returns an empty map on error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    m.q.mockRejectedValue(new Error("boom"));
    expect((await loadSavedScanPrices("CRYPTO", ["BTC"])).size).toBe(0);
    warn.mockRestore();
  });
});

describe("savedPacketCall", () => {
  const packet = {
    symbol: "NVDA", market: "EQUITIES", timeframe: "15m", bias: "bullish", trustAdjustedScore: 81, rawResearchScore: 77,
    lifecycle: "READY", packetId: "pk1",
    quote: { price: 120, lastScanAt: "2026-09-25T13:30:00Z" },
    snapshot: { regime: "TREND_UP", targets: { entry: 121, invalidation: 115, target1: 130, target2: 140 } },
    setup: { type: "breakout" },
    savedScan: { scannedAt: "2026-09-25T13:30:00Z", dataAsOf: "2026-09-25T13:15:00Z", quote: { price: 122.5, quoteAt: "2026-09-25T13:58:00Z" } },
  };

  it("prices from the saved bulk quote when present, with levels and scores", () => {
    const c = savedPacketCall(packet, "priority-desk", { verdict: "bestEquities #1", calledAtMs: RTH });
    expect(c).toMatchObject({
      source: "priority-desk", symbol: "NVDA", direction: "bullish", score: 81, secondaryScore: 77, price: 122.5,
      priceAt: "2026-09-25T13:58:00Z", priceSource: "saved-scan-quote", entry: 121, stop: 115, target1: 130, target2: 140,
      regime: "TREND_UP", verdict: "bestEquities #1", calledAtMs: RTH,
    });
    expect(c.trace).toMatchObject({ packetId: "pk1", setupType: "breakout", dataAsOf: "2026-09-25T13:15:00Z" });
  });

  it("falls back to the packet's scan price and scan time", () => {
    const c = savedPacketCall({ ...packet, savedScan: { scannedAt: "2026-09-25T13:30:00Z", quote: null } }, "arca");
    expect(c).toMatchObject({ price: 120, priceAt: "2026-09-25T13:30:00Z", priceSource: "saved-scan-packet", verdict: "READY" });
  });
});
