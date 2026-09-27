/**
 * PR B: Edge Packet rank score on the right scale, Priority Desk volatility list, one direction per coin per day.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock("@/lib/db", () => ({ q: mocks.q }));
vi.mock("@/lib/admin/adminCallLog", () => ({ recordAdminCalls: vi.fn(async () => undefined) }));

import { projectEdgePacket, type AdminEdgePacket } from "../../lib/admin/edgePacket";
import type { AdminResearchPacket } from "../../lib/admin/getAdminResearchPacket";
import { oneDirectionPerDay, packetDirection, persistEdgePackets, symbolDayKey } from "../../lib/admin/edgePacketSnapshots";

function basePacket(overrides: Partial<AdminResearchPacket> = {}): AdminResearchPacket {
  return {
    packetId: "pkt-test-1",
    createdAt: new Date().toISOString(),
    symbol: "AAPL",
    market: "EQUITIES",
    assetClass: "equity",
    timeframe: "15m",
    quote: { price: 200, changePercent: 0, lastScanAt: new Date().toISOString() },
    snapshot: {
      symbol: "AAPL", timeframe: "15m", session: "RTH", price: 201, changePercent: 0,
      bias: "LONG", regime: "TREND_UP", permission: "GO", confidence: 0.7,
      symbolTrust: 0.6, sizeMultiplier: 1, lastScanAt: new Date().toISOString(),
      blockReasons: [], penalties: [],
      indicators: { ema20: 195, ema50: 190, ema200: 180, vwap: 198, atr: 2, bbwpPercentile: 50, adx: 28, rvol: 1.5 },
      dve: { state: "TREND", direction: "UP", persistence: 0.7, breakoutReadiness: 0.5, trap: false, exhaustion: false },
      timeConfluence: { score: 0.6, hotWindow: false, alignmentCount: 2, nextClusterAt: new Date().toISOString() },
      levels: { pdh: 205, pdl: 195, weeklyHigh: 210, weeklyLow: 190, monthlyHigh: 220, monthlyLow: 180, midpoint: 200, vwap: 198 },
      targets: { entry: 200, invalidation: 195, target1: 205, target2: 210, target3: 215 },
    } as unknown as AdminResearchPacket["snapshot"],
    dataTruth: { status: "LIVE", trustScore: 80 } as AdminResearchPacket["dataTruth"],
    internalResearchScore: {
      score: 65, lifecycle: "READY", dominantAxis: "trend",
      axes: { trend: 70, time: 60, volatility: 50, structure: 60, options: 50, flow: 55, regime: 60, news: 50, history: 60 },
      penalties: [], boosts: [],
    } as unknown as AdminResearchPacket["internalResearchScore"],
    rawResearchScore: 65, dataTrustScore: 80, trustAdjustedScore: 65, scoreDecayReason: "",
    setup: { type: "TREND_CONTINUATION", label: "Trend continuation", description: "" } as AdminResearchPacket["setup"],
    volatilityState: { state: "EXPANDING", persistence: 0.6, breakoutReadiness: 0.6, trap: false, exhaustion: false },
    timeConfluence: { score: 0.6, hotWindow: false, alignmentCount: 2, nextClusterAt: new Date().toISOString() },
    optionsIntelligence: { available: false } as AdminResearchPacket["optionsIntelligence"],
    macroContext: { regime: "NEUTRAL", note: "" },
    newsContext: { status: "CALM", note: "" },
    earningsContext: {} as AdminResearchPacket["earningsContext"],
    cryptoContext: { enabled: false, note: "n/a" },
    liquidityLevels: { pdh: 205, pdl: 195, weeklyHigh: 210, weeklyLow: 190, monthlyHigh: 220, monthlyLow: 180, vwap: 198 },
    journalLearningMatch: { matched: false, fit: 0, reason: "" },
    contradictionFlags: [],
    invalidationConditions: ["Close below 195"],
    nextResearchChecks: ["Confirm hold above VWAP"],
    trapDetection: { trapRiskScore: 20 } as AdminResearchPacket["trapDetection"],
    lifecycle: "READY", bias: "LONG",
    primaryReason: "Trend continuation",
    mainRisk: "Loss of momentum below VWAP",
    whatChanged: "ADX expanded above 25",
    alertEligibility: { eligible: true } as AdminResearchPacket["alertEligibility"],
    ...overrides,
  };
}


function withScales(p: AdminResearchPacket, readiness: number, structure: number): AdminResearchPacket {
  return {
    ...p,
    volatilityState: { ...p.volatilityState, breakoutReadiness: readiness },
    snapshot: { ...p.snapshot, evidence: { ...(p.snapshot as any).evidence, structureQuality: structure } } as AdminResearchPacket["snapshot"],
  };
}

describe("Edge Packet rank score scale", () => {
  it("0..1 breakoutReadiness / structureQuality become 0..100 axis scores (they used to round to 0 or 1)", () => {
    const ep = projectEdgePacket(withScales(basePacket(), 0.6, 0.7));
    expect(ep.volatilityScore).toBe(60);
    expect(ep.structureScore).toBe(70);
    expect(ep.liquidityScore).toBe(Math.round(0.6 * 70 + 0.4 * 100));
  });

  it("gives the same rank for the same inputs on either scale", () => {
    const a = projectEdgePacket(withScales(basePacket(), 0.6, 0.7));
    const b = projectEdgePacket(withScales(basePacket(), 60, 70));
    expect(a.opportunityRankScore).toBe(b.opportunityRankScore);
  });

  it("a strong, clean setup can now reach the 65 gate", () => {
    const strong = withScales(basePacket({
      dataTruth: { status: "LIVE", trustScore: 95 } as AdminResearchPacket["dataTruth"],
      timeConfluence: { score: 0.85, hotWindow: false, alignmentCount: 3, nextClusterAt: new Date().toISOString() },
      invalidationConditions: ["Close below 195", "Loses VWAP"],
      trapDetection: { trapRiskScore: 10 } as AdminResearchPacket["trapDetection"],
      internalResearchScore: { ...basePacket().internalResearchScore, axes: { ...basePacket().internalResearchScore.axes, options: 60 } } as AdminResearchPacket["internalResearchScore"],
    }), 0.8, 0.8);
    (strong.snapshot as any).targets = { entry: 200, invalidation: 196, target1: 210, target2: 215, target3: 220 };
    const ep = projectEdgePacket(strong);
    expect(ep.opportunityRankScore).toBeGreaterThanOrEqual(65);
    // The same packet scored the old way (both axes rounded to 0 or 1) stayed well under the gate.
    const old = projectEdgePacket(withScales(strong, 0.01, 0.01));
    expect(old.opportunityRankScore).toBeLessThan(65);
  });

  it("an average setup stays below the gate (the fix doesn't pass everything)", () => {
    const avg = withScales(basePacket({ dataTruth: { status: "CACHED", trustScore: 70 } as AdminResearchPacket["dataTruth"] }), 0.5, 0.5);
    const ep = projectEdgePacket(avg);
    expect(ep.opportunityRankScore).toBeLessThan(65);
    expect(ep.opportunityRankScore).toBeGreaterThan(0);
  });
});

describe("Priority Desk volatility list", () => {
  it("compares breakoutReadiness on the 0..100 scale", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/priority-desk/route.ts"), "utf8");
    expect(src).toContain("to100(p.volatilityState.breakoutReadiness) >= 60");
    expect(src).not.toMatch(/p\.volatilityState\.breakoutReadiness >= 60/);
  });
});

type Pkt = Pick<AdminEdgePacket, "symbol" | "market" | "bias" | "generatedAt" | "opportunityRankScore"> & { id: string };
const pkt = (id: string, symbol: string, bias: string, score: number, at = "2026-09-25T15:00:00Z"): Pkt =>
  ({ id, symbol, market: "CRYPTO", bias: bias as AdminEdgePacket["bias"], generatedAt: at, opportunityRankScore: score });

describe("one direction per coin per day", () => {
  it("maps biases to a direction", () => {
    expect(packetDirection("LONG")).toBe("LONG");
    expect(packetDirection("BULLISH_RESEARCH")).toBe("LONG");
    expect(packetDirection("BEARISH_RESEARCH")).toBe("SHORT");
    expect(packetDirection("NEUTRAL")).toBeNull();
  });

  it("uses the New York day (22:00 NY and 23:59 NY are the same day; 00:30 NY is the next)", () => {
    expect(symbolDayKey("btc", "crypto", "2026-09-26T02:00:00Z")).toBe("BTC|CRYPTO|2026-09-25");
    expect(symbolDayKey("BTC", "CRYPTO", "2026-09-26T03:59:00Z")).toBe("BTC|CRYPTO|2026-09-25");
    expect(symbolDayKey("BTC", "CRYPTO", "2026-09-26T04:30:00Z")).toBe("BTC|CRYPTO|2026-09-26");
  });

  it("within a batch, the higher-score direction wins; NEUTRAL is always kept", () => {
    const { kept, dropped } = oneDirectionPerDay([
      pkt("a", "SOL", "LONG", 40), pkt("b", "SOL", "SHORT", 55), pkt("c", "SOL", "NEUTRAL", 10), pkt("d", "ETH", "LONG", 30),
    ]);
    expect(kept.map((p) => p.id)).toEqual(["b", "c", "d"]);
    expect(dropped.map((p) => p.id)).toEqual(["a"]);
  });

  it("a direction already stored that day wins over a later flip; the next day is free", () => {
    const locks = new Map([["SOL|CRYPTO|2026-09-25", "LONG" as const]]);
    const { kept, dropped } = oneDirectionPerDay([
      pkt("a", "SOL", "SHORT", 90), pkt("b", "SOL", "LONG", 20), pkt("c", "SOL", "SHORT", 50, "2026-09-26T15:00:00Z"),
    ], locks);
    expect(kept.map((p) => p.id)).toEqual(["b", "c"]);
    expect(dropped.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("persistEdgePackets writes one direction per coin per day", () => {
  beforeEach(() => { mocks.q.mockReset(); });

  it("skips a SHORT packet when a LONG was already stored for that coin today", async () => {
    const inserted: string[] = [];
    mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT symbol, market, bias, generated_at")) {
        return [{ symbol: "SOL", market: "CRYPTO", bias: "LONG", generated_at: "2026-09-25T14:00:00Z" }];
      }
      if (sql.includes("INSERT INTO admin_edge_packets")) inserted.push(`${params[2]}:${params[11]}`);
      return [];
    });
    const base = projectEdgePacket(basePacket());
    const mk = (symbol: string, bias: string): AdminEdgePacket =>
      ({ ...base, packetId: `${symbol}-${bias}`, symbol, market: "CRYPTO", bias: bias as AdminEdgePacket["bias"], generatedAt: "2026-09-25T18:00:00Z" });
    const written = await persistEdgePackets({ workspaceId: "ws", packets: [mk("SOL", "SHORT"), mk("ETH", "SHORT")] });
    expect(written).toBe(1);
    expect(inserted).toEqual(["ETH:SHORT"]);
  });
});
