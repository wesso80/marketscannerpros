/**
 * Edge-packet do_nothing (admin_edge_packets): every LONG/SHORT packet since 16 May was do_nothing=true because
 * the TF_CONFLICT rule compared the 0..1 evidence axis crossMarketConfirmation against 30 (and VOL_NOT_READY
 * compared the 0..1 breakoutReadiness against 50).
 */
import { describe, expect, it } from "vitest";
import { evaluateDoNothing, to100 } from "@/lib/admin/doNothing";
import type { AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";

type Over = {
  bias?: "LONG" | "SHORT" | "NEUTRAL";
  crossMarket?: number | null;
  breakoutReadiness?: number;
  bbwp?: number;
  noEvidence?: boolean;
};

function packet(o: Over = {}): AdminResearchPacket {
  const bias = o.bias ?? "LONG";
  const long = bias !== "SHORT";
  return {
    snapshot: {
      bias,
      price: 100,
      indicators: { adx: 28, bbwpPercentile: o.bbwp ?? 60 },
      levels: { vwap: 98 },
      dve: { state: "EXPANSION", trap: false, exhaustion: false, breakoutReadiness: o.breakoutReadiness ?? 0.72 },
      // 2R into target 1, mirrored for SHORT
      targets: long ? { entry: 100, invalidation: 97, target1: 106 } : { entry: 100, invalidation: 103, target1: 94 },
      ...(o.noEvidence ? {} : { evidence: { crossMarketConfirmation: o.crossMarket === null ? undefined : o.crossMarket ?? 0.9, structureQuality: 0.8 } }),
    },
    dataTruth: { status: "LIVE", trustScore: 90 },
    internalResearchScore: { lifecycle: "READY" },
    newsContext: { status: "NORMAL" },
  } as unknown as AdminResearchPacket;
}

describe("to100", () => {
  it("scales 0..1 fractions and keeps 0..100 values", () => {
    expect(to100(0.9)).toBe(90);
    expect(to100(0)).toBe(0);
    expect(to100(1)).toBe(100);
    expect(to100(45)).toBe(45);
    expect(to100(Number.NaN)).toBe(0);
  });
});

describe("evaluateDoNothing on engine (0..1) evidence", () => {
  it("a clean directional packet is NOT do-nothing (was always TF_CONFLICT)", () => {
    expect(evaluateDoNothing(packet({ bias: "LONG" }))).toBeNull();
    expect(evaluateDoNothing(packet({ bias: "SHORT" }))).toBeNull();
  });
  it("TF_CONFLICT still fires for genuinely weak cross-market confirmation (< 0.30)", () => {
    expect(evaluateDoNothing(packet({ crossMarket: 0.2 }))?.code).toBe("TF_CONFLICT");
    expect(evaluateDoNothing(packet({ crossMarket: 0.35 }))).toBeNull();
    // 0..100-scaled evidence keeps the original meaning
    expect(evaluateDoNothing(packet({ crossMarket: 20 }))?.code).toBe("TF_CONFLICT");
    expect(evaluateDoNothing(packet({ crossMarket: 70 }))).toBeNull();
    // missing axis defaults to neutral 50 → no conflict
    expect(evaluateDoNothing(packet({ crossMarket: null }))).toBeNull();
  });
  it("VOL_NOT_READY uses breakoutReadiness on its own scale", () => {
    expect(evaluateDoNothing(packet({ breakoutReadiness: 0.3 }))?.code).toBe("VOL_NOT_READY");
    expect(evaluateDoNothing(packet({ breakoutReadiness: 0.6 }))).toBeNull();
    expect(evaluateDoNothing(packet({ breakoutReadiness: 0.3, bbwp: 20 }))).toBeNull();
  });
  it("LONG and SHORT get identical verdicts for mirrored inputs", () => {
    for (const o of [{}, { crossMarket: 0.1 }, { breakoutReadiness: 0.2 }] as Over[]) {
      expect(evaluateDoNothing(packet({ ...o, bias: "LONG" }))?.code ?? null).toBe(evaluateDoNothing(packet({ ...o, bias: "SHORT" }))?.code ?? null);
    }
  });
  it("NEUTRAL no-setup snapshots (no evidence, readiness 0) behave as before", () => {
    const neutral = (bbwp: number) => packet({ bias: "NEUTRAL", noEvidence: true, breakoutReadiness: 0, bbwp });
    expect(evaluateDoNothing(neutral(60))?.code).toBe("VOL_NOT_READY");
    expect(evaluateDoNothing(neutral(20))).toBeNull();
  });
  it("hard stops are unchanged", () => {
    const stale = packet();
    (stale as unknown as { dataTruth: { status: string } }).dataTruth.status = "STALE";
    expect(evaluateDoNothing(stale)?.code).toBe("DATA_DEGRADED");
  });
});


describe("position R:R basis preserves the remaining safeguards", () => {
  const levels = { status: "ok", direction: "LONG", entryTrigger: 100, stop: 90, tp1: 120,
    minRewardR: 1.5, belowMinR: false } as import("@/lib/admin/positionLevels").PositionLevelView;
  function poorIntraday() {
    const p = packet(); p.snapshot.targets.target1 = 101;
    return p;
  }
  it("keeps the intraday verdict but clears it for a valid 2R position", () => {
    const p = poorIntraday();
    expect(evaluateDoNothing(p)?.code).toBe("POOR_RR");
    expect(evaluateDoNothing(p, levels)).toBeNull();
  });
  it("uncovers macro risk that was hidden behind the first intraday failure", () => {
    const p = poorIntraday(); p.newsContext.status = "ELEVATED";
    expect(evaluateDoNothing(p, levels)?.code).toBe("MACRO_RISK");
  });
  it("still rejects volatility and conflicting evidence after replacing R:R", () => {
    expect(evaluateDoNothing(packet({ breakoutReadiness: 0.2 }), levels)?.code).toBe("VOL_NOT_READY");
    expect(evaluateDoNothing(packet({ crossMarket: 0.2 }), levels)?.code).toBe("TF_CONFLICT");
  });
  it.each([null, 0, 110, 114, Number.NaN])("rejects invalid or inadequate weekly target %s", tp1 => {
    expect(evaluateDoNothing(packet(), { ...levels, tp1 })?.code).toBe("POOR_RR");
  });
  it("supports shorts and refuses targets on the wrong side", () => {
    expect(evaluateDoNothing(packet({ bias: "SHORT" }), { ...levels, direction: "SHORT", stop: 110, tp1: 80 })).toBeNull();
    expect(evaluateDoNothing(packet(), { ...levels, tp1: 80 })?.code).toBe("POOR_RR");
  });
  it("never clears data degradation", () => {
    const p = poorIntraday(); p.dataTruth.status = "STALE";
    expect(evaluateDoNothing(p, levels)?.code).toBe("DATA_DEGRADED");
  });
});
