import { describe, expect, it } from "vitest";
import { deriveInformationEdge } from "../../lib/admin/arca-brain/deriveInformationEdge";
import { computeInformationEdge } from "../../lib/admin/arca-brain/informationEdge";
import type { AdminEdgePacket } from "../../lib/admin/edgePacket";

function makePacket(overrides: Partial<AdminEdgePacket> = {}): AdminEdgePacket {
  return {
    packetId: "pkt_1",
    symbol: "AAPL",
    assetClass: "equity",
    market: "us",
    timeframe: "1h",
    generatedAt: new Date().toISOString(),
    staleAfter: new Date(Date.now() + 60_000).toISOString(),
    opportunityRank: 1,
    opportunityRankScore: 70,
    adminState: "WATCH" as never,
    thesisStatus: "DEVELOPING" as never,
    setupType: "test",
    bias: "long" as never,
    asymmetryScore: 70,
    timingScore: 65,
    volatilityScore: 60,
    liquidityScore: 70,
    optionsScore: 55,
    structureScore: 75,
    trapRiskScore: 20,
    invalidationClarityScore: 80,
    entry: { trigger: 100, aggressiveEntry: null, conservativeEntry: null, explanation: "" },
    stopLoss: { level: 95, reason: "" },
    takeProfit: { tp1: 110, tp2: 120, tp3: null, runner: null, reason: "" },
    riskReward: { rrToTp1: 2, rrToTp2: 4, rrToTp3: null },
    whyNow: "",
    whatChanged: "",
    bearCase: "",
    contradictionEvidence: [],
    doNotTradeReasons: [],
    liquidityTargets: {} as never,
    invalidationConditions: [],
    nextRequiredConfirmation: null,
    arcaDeskRead: null,
    crossAssetConfluence: null,
    evidenceQualityScore: 80,
    personalExposureFlag: "none",
    doNothing: null,
    sources: [],
    freshness: "real-time",
    simulated: true,
    missingFields: [],
    ...overrides,
  } as AdminEdgePacket;
}

describe("arca-brain / deriveInformationEdge", () => {
  it("returns neutral inputs and full missingInputs list when packet is null", () => {
    const r = deriveInformationEdge(null);
    expect(r.missingInputs.length).toBe(9);
    expect(r.confidence).toBe(0);
    expect(r.inputs.uniqueness).toBe(50);
    expect(r.inputs.personalHistoricalEdge).toBe(50);
  });

  it("derives inputs from a clean packet and records only fields without source", () => {
    const r = deriveInformationEdge(makePacket());
    // personalHistoricalEdge and crossAssetConfirmation have no source on
    // this packet shape and must be flagged as missing.
    expect(r.missingInputs).toContain("personalHistoricalEdge");
    expect(r.missingInputs).toContain("crossAssetConfirmation");
    expect(r.inputs.uniqueness).toBe(70);
    expect(r.inputs.earliness).toBe(65);
    expect(r.inputs.obviousness).toBe(20); // trapRiskScore
    expect(r.confidence).toBeLessThan(100);
    expect(r.confidence).toBeGreaterThan(50);
  });

  it("feeds compute correctly: high-asymmetry/low-trap packet scores above OBVIOUS_NOISE", () => {
    const r = deriveInformationEdge(makePacket({
      asymmetryScore: 90,
      timingScore: 85,
      trapRiskScore: 10,
      opportunityRankScore: 30,
    }));
    const { score, band } = computeInformationEdge(r.inputs);
    expect(score).toBeGreaterThan(25);
    expect(band).not.toBe("OBVIOUS_NOISE");
  });

  it("a trap-heavy/crowded packet derives to OBVIOUS_NOISE", () => {
    const r = deriveInformationEdge(makePacket({
      asymmetryScore: 10,
      timingScore: 10,
      trapRiskScore: 95,
      opportunityRankScore: 95,
      optionsScore: 10,
      volatilityScore: 10,
      structureScore: 10,
      invalidationClarityScore: 10,
      riskReward: { rrToTp1: 0.5, rrToTp2: 0.5, rrToTp3: null },
    }));
    const { band } = computeInformationEdge(r.inputs);
    expect(band).toBe("OBVIOUS_NOISE");
  });
});
