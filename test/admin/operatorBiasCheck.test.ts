import { describe, expect, it } from "vitest";
import { runOperatorBiasCheck } from "../../lib/admin/operatorBiasCheck";

describe("operatorBiasCheck", () => {
  it("returns no signals for balanced packet set", () => {
    const result = runOperatorBiasCheck({
      recentPackets: [
        { assetClass: "equity", bias: "LONG", lifecycle: "READY", trapDetection: { trapType: [] }, dataTruth: { status: "LIVE" }, contradictionFlags: [] },
        { assetClass: "crypto", bias: "SHORT", lifecycle: "DEVELOPING", trapDetection: { trapType: [] }, dataTruth: { status: "LIVE" }, contradictionFlags: [] },
      ] as any,
      savedCaseScores: [72, 68, 74],
      repeatedMistakeCount: 0,
    });

    expect(result.signals.length).toBe(0);
    expect(result.biasScore).toBe(100);
  });

  it("flags concentration and stale-data focus", () => {
    const packets = Array.from({ length: 6 }).map(() => ({
      assetClass: "equity",
      bias: "LONG",
      lifecycle: "EXHAUSTED",
      trapDetection: { trapType: ["LATE_MOVE"] },
      dataTruth: { status: "STALE" },
      contradictionFlags: ["c1", "c2", "c3"],
    }));

    const result = runOperatorBiasCheck({
      recentPackets: packets as any,
      savedCaseScores: [42, 40, 49, 51],
      repeatedMistakeCount: 4,
    });

    expect(result.signals.some((s) => s.code === "CHASING_LATE_MOVES")).toBe(true);
    expect(result.signals.some((s) => s.code === "IGNORING_STALE_DATA")).toBe(true);
    expect(result.signals.some((s) => s.code === "ASSET_CONCENTRATION")).toBe(true);
    expect(result.signals.some((s) => s.code === "BULLISH_CONCENTRATION")).toBe(true);
    expect(result.biasScore).toBeLessThan(70);
  });
});
