/**
 * Each admin page's calls → AdminCallInput (fix/admin-call-logging): Priority Desk, Morning Brief, research alerts,
 * Jarvis shortlist, edge packets. Pure mapping; recordAdminCalls (tested separately) does the writing.
 */
import { describe, it, expect, vi } from "vitest";

const m = vi.hoisted(() => ({ q: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []) }));
vi.mock("@/lib/db", () => ({ q: m.q }));
vi.mock("../../lib/db", () => ({ q: m.q }));

import { priorityDeskCalls } from "@/app/api/admin/priority-desk/route";
import { researchAlertCall } from "@/app/api/admin/research-alerts/route";
import { morningBriefCalls, type MorningBrief } from "@/lib/admin/morning-brief";
import { jarvisShortlistCalls, recordJarvisShortlist } from "@/lib/jarvis/radar/adminCalls";
import { edgePacketCall, edgeTrustScore } from "@/lib/admin/edgePacketSnapshots";
import { buildAdminCallRow, recordAdminCalls } from "@/lib/admin/adminCallLog";
import type { AdminEdgePacket } from "@/lib/admin/edgePacket";
import type { AdminResearchAlert } from "@/lib/admin/adminTypes";
import type { MorningReport } from "@/lib/jarvis/radar/types";

const NOW = Date.parse("2026-09-25T14:00:00Z");
type Packet = Parameters<typeof priorityDeskCalls>[0][number];

const packet = (symbol: string, market: string, bias: string, price: number): Packet => ({
  symbol, market, timeframe: "15m", bias, trustAdjustedScore: 80, rawResearchScore: 75, lifecycle: "READY", packetId: `pk-${symbol}`,
  quote: { price, lastScanAt: "2026-09-25T13:50:00Z" },
  snapshot: { regime: "TREND_UP", targets: { entry: price, invalidation: price * 0.97, target1: price * 1.03, target2: price * 1.06 } },
  setup: { type: "breakout" },
  savedScan: { scannedAt: "2026-09-25T13:50:00Z", dataAsOf: "2026-09-25T13:45:00Z", quote: { price, quoteAt: "2026-09-25T13:58:00Z" } },
} as unknown as Packet);

describe("priorityDeskCalls", () => {
  it("logs both best lists with their rank plus the ARCA top candidate", () => {
    const calls = priorityDeskCalls([packet("AAPL", "EQUITIES", "LONG", 190), packet("MSFT", "EQUITIES", "SHORT", 410)], [packet("BTC", "CRYPTO", "LONG", 65000)], packet("AAPL", "EQUITIES", "LONG", 190), NOW);
    expect(calls.map((c) => `${c.symbol}:${c.verdict}`)).toEqual(["AAPL:bestEquities #1", "MSFT:bestEquities #2", "BTC:bestCrypto #1", "AAPL:ARCA top"]);
    expect(calls.every((c) => c.source === "priority-desk" && c.calledAtMs === NOW)).toBe(true);
    expect(calls[2]).toMatchObject({ market: "CRYPTO", price: 65000, priceSource: "saved-scan-quote" });
  });

  it("the ARCA top candidate that is also in a best list is written once", async () => {
    m.q.mockReset();
    m.q.mockImplementation(async () => []);
    const res = await recordAdminCalls(priorityDeskCalls([packet("AAPL", "EQUITIES", "LONG", 190)], [], packet("AAPL", "EQUITIES", "LONG", 190), NOW), NOW);
    expect(res).toMatchObject({ recorded: 1, duplicates: 1 });
  });
});

describe("researchAlertCall", () => {
  it("prices a FIRED alert from the saved scan at the alert time", () => {
    const alert = { alertId: "a1", symbol: "NVDA", market: "EQUITIES", timeframe: "15m", bias: "BULLISH", setup: "breakout", score: 83, dataTrustScore: 70, createdAt: "2026-09-25T14:00:00.000Z" } as unknown as AdminResearchAlert;
    const c = researchAlertCall(alert, { price: 121.4, at: "2026-09-25T13:58:00.000Z" });
    expect(c).toMatchObject({ source: "research-alert", symbol: "NVDA", direction: "BULLISH", score: 83, secondaryScore: 70, price: 121.4, priceAt: "2026-09-25T13:58:00.000Z", verdict: "FIRED", calledAtMs: NOW });
    expect(buildAdminCallRow(c, NOW)).toHaveProperty("row.tradeBias", "LONG");
    expect(buildAdminCallRow(researchAlertCall(alert, undefined), NOW)).toEqual({ skip: "no_price" });
  });
});

describe("morningBriefCalls", () => {
  it("logs the top plays with the displayed elite score, falling back to confidence", () => {
    const brief = {
      briefId: "b1", generatedAt: "2026-09-25T14:00:00.000Z", market: "EQUITIES", timeframe: "15m", deskState: "TRADE",
      topPlays: [
        { symbol: "AAPL", bias: "bullish", confidence: 0.71, eliteScore: 88, eliteGrade: "A", playbook: "trend", regime: "TREND_UP" },
        { symbol: "tsla", bias: "bearish", confidence: 0.64 },
      ],
    } as unknown as MorningBrief;
    const prices = new Map([["AAPL", { price: 190, at: "2026-09-25T13:59:00.000Z" }], ["TSLA", { price: 250, at: "2026-09-25T13:59:00.000Z" }]]);
    const calls = morningBriefCalls(brief, prices, "cron");
    expect(calls[0]).toMatchObject({ source: "morning-brief", symbol: "AAPL", score: 88, secondaryScore: 71, price: 190, regime: "TREND_UP", verdict: "top play #1", calledAtMs: NOW });
    expect(calls[0].trace).toMatchObject({ briefId: "b1", briefSource: "cron", playbook: "trend", eliteGrade: "A" });
    expect(calls[1]).toMatchObject({ symbol: "tsla", score: 64, price: 250, direction: "bearish" });
  });
});

describe("jarvisShortlistCalls", () => {
  const report = {
    generatedAt: "2026-09-25T21:30:00.000Z", sessionDate: "2026-09-25",
    shortlist: [
      { symbol: "AMD", assetClass: "equity", direction: "up", score: 74, status: "NEW", rank: 1, opportunityType: "momentum", stage: "early", ret1: 2.1 },
      { symbol: "ETH", assetClass: "crypto", direction: "down", score: 66, status: "HELD", rank: 2 },
      { symbol: "KO", assetClass: "equity", direction: "flat", score: 50, status: "NEW", rank: 3 },
    ],
    snapshot: { "equity:AMD": { price: 160.2 }, "crypto:ETH": { price: 2400 }, "equity:KO": { price: 60 } },
  } as unknown as MorningReport;

  it("reads the day's move as a continuation call, priced from the run snapshot", () => {
    const calls = jarvisShortlistCalls(report);
    expect(calls[0]).toMatchObject({ source: "jarvis", symbol: "AMD", market: "equity", direction: "up", price: 160.2, verdict: "NEW #1", priceAt: "2026-09-25T21:30:00.000Z" });
    expect(calls[0].trace?.directionBasis).toMatch(/continuation/);
    expect(calls[1]).toMatchObject({ symbol: "ETH", market: "crypto", direction: "down", price: 2400 });
    // flat has no direction → skipped when written
    expect(buildAdminCallRow(calls[2], Date.parse(report.generatedAt))).toEqual({ skip: "no_direction" });
    // equities scored after the close are tagged session 'closed'
    expect(buildAdminCallRow(calls[0], Date.parse(report.generatedAt))).toHaveProperty("row.trace.session", "closed");
  });

  it("is a no-op without DATABASE_URL (local script runs)", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    await expect(recordJarvisShortlist(report)).resolves.toBeNull();
    if (prev !== undefined) process.env.DATABASE_URL = prev;
  });
});

describe("edge packets", () => {
  const ep = (over: Partial<AdminEdgePacket> = {}) => ({
    packetId: "e1", symbol: "AAPL", assetClass: "equity", timeframe: "15m", bias: "LONG", adminState: "READY",
    opportunityRank: 1, opportunityRankScore: 77, trustAdjustedScore: 61, evidenceQualityScore: 70, trapRiskScore: 10,
    setupType: "breakout", thesisStatus: "INTACT", generatedAt: "2026-09-25T13:59:00.000Z",
    price: 190, priceAt: "2026-09-25T13:58:00.000Z",
    entry: { trigger: 191 }, stopLoss: { level: 185 }, takeProfit: { tp1: 200, tp2: 210 },
    ...over,
  }) as unknown as AdminEdgePacket;

  it("stores the real trust-adjusted score (not the rank score)", () => {
    expect(edgeTrustScore(ep())).toBe(61);
    expect(edgeTrustScore(ep({ trustAdjustedScore: undefined }))).toBe(0);
    expect(edgeTrustScore(ep({ trustAdjustedScore: 130 }))).toBe(100);
  });

  it("maps a packet to a call; simulated and do-nothing packets are not calls", () => {
    expect(edgePacketCall(ep(), NOW)).toMatchObject({
      source: "edge-packet", market: "equity", direction: "LONG", score: 77, secondaryScore: 61, price: 190,
      priceAt: "2026-09-25T13:58:00.000Z", entry: 191, stop: 185, target1: 200, target2: 210, verdict: "READY",
    });
    expect(edgePacketCall(ep({ simulated: true } as Partial<AdminEdgePacket>), NOW)).toBeNull();
    expect(edgePacketCall(ep({ doNothing: true } as Partial<AdminEdgePacket>), NOW)).toBeNull();
  });
});

describe("ARCA simulator prices (source check)", () => {
  it("reads the edge-packet price (edgePacketPrice), not the nonexistent snapshot.price, and logs planned orders", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/admin/portfolio-lab/simulateCycle.ts", "utf8");
    expect(src).toContain("edgePacketPrice(r.packetJson)");
    expect(src).not.toMatch(/snapshot\?: \{ price\?: number \}/);
    expect(src).toMatch(/source: "arca"/);
    expect(src).toContain("recordAdminCalls(plannedCalls)");
  });
});
