import { describe, expect, it } from "vitest";
import { computeResearchDelta } from "../../lib/admin/researchDelta";

describe("researchDelta", () => {
  it("computes score and trust deltas", () => {
    const delta = computeResearchDelta({
      previous: { trustAdjustedScore: 64, lifecycle: "DEVELOPING", dataTrustScore: 72 },
      current: { trustAdjustedScore: 78, lifecycle: "READY", dataTrustScore: 85 },
    });

    expect(delta.scoreDelta).toBe(14);
    expect(delta.lifecycleDelta).toContain("DEVELOPING");
    expect(delta.dataTrustDelta).toBe(13);
  });

  it("tracks evidence and contradiction changes", () => {
    const delta = computeResearchDelta({
      previous: {
        trustAdjustedScore: 72,
        lifecycle: "READY",
        dataTrustScore: 88,
        evidence: ["trend", "macro"],
        contradictionFlags: ["stale-data"],
        risks: ["overextension"],
      },
      current: {
        trustAdjustedScore: 69,
        lifecycle: "DEVELOPING",
        dataTrustScore: 80,
        evidence: ["trend", "time"],
        contradictionFlags: ["trap-risk", "stale-data"],
        risks: ["overextension", "liquidity"],
      },
    });

    expect(delta.newEvidence).toContain("time");
    expect(delta.removedEvidence).toContain("macro");
    expect(delta.newContradictions).toContain("trap-risk");
    expect(delta.newRisks).toContain("liquidity");
  });
});
