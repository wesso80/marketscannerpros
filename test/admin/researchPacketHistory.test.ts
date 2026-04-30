import { beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotRow = {
  id: number;
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  assetClass: string;
  packetJson: any;
  rawResearchScore: number;
  trustAdjustedScore: number;
  lifecycle: string;
  dataTrustStatus: string;
  schedulerRunId?: string;
  scanMode?: string;
  createdAt: string;
};

let rows: SnapshotRow[] = [];
let nextId = 1;

vi.mock("../../lib/db", () => ({
  q: async (sql: string, params: any[] = []) => {
    if (sql.includes("SELECT 1 FROM admin_research_packet_snapshots")) {
      return [{ one: 1 }];
    }

    if (sql.includes("INSERT INTO admin_research_packet_snapshots") && sql.includes("RETURNING id")) {
      const row: SnapshotRow = {
        id: nextId++,
        workspaceId: params[0],
        symbol: params[1],
        market: params[2],
        timeframe: params[3],
        assetClass: params[4],
        packetJson: JSON.parse(params[5]),
        rawResearchScore: params[6],
        trustAdjustedScore: params[7],
        lifecycle: params[8],
        dataTrustStatus: params[9],
        schedulerRunId: params[10],
        scanMode: params[11],
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      return [{ id: row.id }];
    }

    if (sql.includes("FROM admin_research_packet_snapshots") && sql.includes("LIMIT 1")) {
      const workspaceId = params[0];
      const symbol = params[1];
      const market = params[2];
      const timeframe = params[3];
      const excludeId = params[4];

      const filtered = rows
        .filter((r) => r.workspaceId === workspaceId)
        .filter((r) => r.symbol === symbol)
        .filter((r) => r.market === market)
        .filter((r) => r.timeframe === timeframe)
        .filter((r) => (excludeId ? r.id !== excludeId : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return filtered.slice(0, 1);
    }

    if (sql.includes("FROM admin_research_packet_snapshots") && sql.includes("LIMIT $5")) {
      const workspaceId = params[0];
      const symbol = params[1];
      const market = params[2];
      const timeframe = params[3];
      const limit = params[4];

      return rows
        .filter((r) => r.workspaceId === workspaceId)
        .filter((r) => r.symbol === symbol)
        .filter((r) => r.market === market)
        .filter((r) => r.timeframe === timeframe)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }

    if (sql.includes("DELETE FROM admin_research_packet_snapshots")) {
      const count = rows.length;
      rows = [];
      return [{ count }];
    }

    return [];
  },
}));
import {
  snapshotResearchPacket,
  loadPriorPacketSnapshot,
  listPacketHistory,
  cleanupOldPacketSnapshots,
} from "../../lib/admin/researchPacketHistory";

describe("researchPacketHistory", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  const samplePacket = {
    packetId: "TEST:CRYPTO:15m:1234",
    createdAt: new Date().toISOString(),
    symbol: "BTC",
    market: "CRYPTO",
    assetClass: "crypto" as const,
    timeframe: "15m",
    quote: { price: 45000, changePercent: 2.5, lastScanAt: new Date().toISOString() },
    snapshot: {} as any,
    dataTruth: { status: "LIVE" as const, fetchedAt: new Date().toISOString(), cacheAgeSeconds: 0, coverage: 1, warnings: [] } as any,
    internalResearchScore: { score: 75, lifecycle: "READY" } as any,
    rawResearchScore: 75,
    dataTrustScore: 90,
    trustAdjustedScore: 70,
    scoreDecayReason: "Normal",
    setup: { type: "TREND_CONTINUATION" as const, label: "Trend", description: "Up trend", polarity: "LONG" as const },
    volatilityState: { state: "ELEVATED", persistence: 0.7, breakoutReadiness: 0.8, trap: false, exhaustion: false },
    timeConfluence: { score: 0.8, hotWindow: true, alignmentCount: 3, nextClusterAt: "" },
    optionsIntelligence: {
      symbol: "BTC",
      assetClass: "crypto" as const,
      optionsPressureScore: 65,
      unusualActivityScore: 50,
      putCallVolumeRatio: 1.1,
      putCallOIRatio: 1.2,
      volumeOpenInterestRatio: 1.5,
      ivPercentile: 60,
      ivRank: 60,
      ivCondition: "NORMAL" as const,
      ivTerm: "NEUTRAL" as const,
      expirationConcentration: 30,
      expirationClusters: [],
      strikeConcentration: 25,
      dominantStrikeZone: null,
      strikeZones: [],
      gammaFlipRisk: 35,
      highlyConcerned: false,
      massiveAddition: false,
      positionSquaring: false,
      volatilitySmile: false,
      skewBias: "NEUTRAL" as const,
      dataTruth: {} as any,
      missingInputs: [],
      note: "Normal options structure",
    } as any,
    macroContext: { regime: "RISK_ON" as const, note: "Bullish setup" },
    newsContext: { status: "CALM" as const, note: "No news shock" },
    earningsContext: { classification: "UNKNOWN" as const, riskLevel: "LOW" as const, assetClass: "crypto" as const, missingInputs: [], note: "N/A" } as any,
    cryptoContext: {
      timestamp: new Date().toISOString(),
      globalRegime: "BULL" as const,
      globalMarketCapUSD: 1e12,
      globalMarketCapChange24h: 2,
      globalMarketCapTrend: "UP" as const,
      totalVolume24h: 60e9,
      volumeTrend: "STABLE" as const,
      volumeToMarketCapRatio: 5,
      btcEthRelationship: { btcDominance: 48, btcDominanceTrend: "STABLE" as const, ethVsBTC: -0.2, leadership: "BALANCED" as const },
      liquidityCondition: "NORMAL" as const,
      riskLevel: "MODERATE" as const,
      communityTrendSignal: "POSITIVE" as const,
      trendingSymbols: [],
      justTransitioned: false,
      dataTruth: {} as any,
      missingInputs: [],
      note: "Normal regime",
    } as any,
    liquidityLevels: { pdh: 46000, pdl: 44000, weeklyHigh: 47000, weeklyLow: 43000, monthlyHigh: 50000, monthlyLow: 40000, vwap: 45500 },
    journalLearningMatch: { matched: false, fit: 0, reason: "No prior case" },
    contradictionFlags: [],
    invalidationConditions: [],
    nextResearchChecks: [],
    trapDetection: { trapRiskScore: 25, trapTypes: [], reasons: [], evidence: [], whatWouldReduceTrapRisk: [] } as any,
    lifecycle: "READY",
    bias: "BULLISH_RESEARCH",
    primaryReason: "Trend stack aligned",
    mainRisk: "None acute",
    whatChanged: "Snapshot created",
    alertEligibility: { eligible: true, reasons: [] },
    arcaContext: {} as any,
  };

  it("should snapshot a research packet", async () => {
    const result = await snapshotResearchPacket({
      workspaceId: "test-ws-1",
      packet: samplePacket,
      schedulerRunId: "run-123",
      scanMode: "WATCHLIST",
    });

    expect(result).not.toBeNull();
    expect(result?.symbol).toBe("BTC");
    expect(result?.market).toBe("CRYPTO");
    expect(result?.trustAdjustedScore).toBe(70);
    expect(result?.lifecycle).toBe("READY");
  });

  it("should load prior packet snapshot", async () => {
    // First snapshot
    const first = await snapshotResearchPacket({
      workspaceId: "test-ws-2",
      packet: samplePacket,
      schedulerRunId: "run-1",
    });

    expect(first).not.toBeNull();

    // Modify and re-snapshot
    const modified = { ...samplePacket, trustAdjustedScore: 80, lifecycle: "TRIGGERED" };
    const second = await snapshotResearchPacket({
      workspaceId: "test-ws-2",
      packet: modified,
      schedulerRunId: "run-2",
    });

    expect(second).not.toBeNull();

    // Load prior
    const prior = await loadPriorPacketSnapshot({
      workspaceId: "test-ws-2",
      symbol: "BTC",
      market: "CRYPTO",
      timeframe: "15m",
      excludeId: second!.id,
    });

    expect(prior).not.toBeNull();
    expect(prior?.trustAdjustedScore).toBe(70);
    expect(prior?.lifecycle).toBe("READY");
  });

  it("should list packet history with limit", async () => {
    const wsId = "test-ws-3";
    const packet1 = samplePacket;
    const packet2 = { ...samplePacket, trustAdjustedScore: 75 };
    const packet3 = { ...samplePacket, trustAdjustedScore: 80 };

    await snapshotResearchPacket({ workspaceId: wsId, packet: packet1 });
    await snapshotResearchPacket({ workspaceId: wsId, packet: packet2 });
    await snapshotResearchPacket({ workspaceId: wsId, packet: packet3 });

    const history = await listPacketHistory({
      workspaceId: wsId,
      symbol: "BTC",
      market: "CRYPTO",
      timeframe: "15m",
      limit: 2,
    });

    expect(history.length).toBeLessThanOrEqual(2);
    // Should be in reverse chronological order (newest first)
    if (history.length > 1) {
      expect(Date.parse(history[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(history[1].createdAt));
    }
  });

  it("should handle packet history for same symbol different markets", async () => {
    const wsId = "test-ws-4";
    const btcPacket = { ...samplePacket, symbol: "BTC", market: "CRYPTO" };
    const btcusdPacket = { ...samplePacket, symbol: "BTC", market: "FUTURES" };

    await snapshotResearchPacket({ workspaceId: wsId, packet: btcPacket });
    await snapshotResearchPacket({ workspaceId: wsId, packet: btcusdPacket });

    const cryptoHistory = await listPacketHistory({
      workspaceId: wsId,
      symbol: "BTC",
      market: "CRYPTO",
      timeframe: "15m",
    });

    const futuresHistory = await listPacketHistory({
      workspaceId: wsId,
      symbol: "BTC",
      market: "FUTURES",
      timeframe: "15m",
    });

    expect(cryptoHistory.length).toBeGreaterThan(0);
    expect(futuresHistory.length).toBeGreaterThan(0);
  });

  it("should handle gracefully when prior packet doesn't exist", async () => {
    const prior = await loadPriorPacketSnapshot({
      workspaceId: "nonexistent-ws",
      symbol: "NONEXISTENT",
      market: "CRYPTO",
      timeframe: "15m",
    });

    expect(prior).toBeNull();
  });

  it("should filter by excludeId correctly", async () => {
    const wsId = "test-ws-5";
    await snapshotResearchPacket({ workspaceId: wsId, packet: samplePacket, schedulerRunId: "run-1" });
    const latest = await snapshotResearchPacket({ workspaceId: wsId, packet: samplePacket, schedulerRunId: "run-2" });

    expect(latest).not.toBeNull();

    const prior = await loadPriorPacketSnapshot({
      workspaceId: wsId,
      symbol: "BTC",
      market: "CRYPTO",
      timeframe: "15m",
      excludeId: latest!.id,
    });

    // Should find the first snapshot
    expect(prior).not.toBeNull();
    expect(prior?.schedulerRunId).toBe("run-1");
  });
});
