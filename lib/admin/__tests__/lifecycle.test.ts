import { describe, expect, it } from "vitest";
import {
  ADMIN_LIFECYCLE_STATES,
  TERMINAL_STATES,
  isValidTransition,
  mapResearchLifecycleToAdminState,
  type AdminLifecycleState,
} from "@/lib/admin/lifecycle";

describe("admin lifecycle transitions", () => {
  it("terminal states emit no outgoing transitions", () => {
    for (const t of TERMINAL_STATES) {
      for (const next of ADMIN_LIFECYCLE_STATES) {
        if (next === t) continue;
        expect(isValidTransition(t as AdminLifecycleState, next)).toBe(false);
      }
    }
  });

  it("WATCH cannot jump straight to TRIGGERED", () => {
    expect(isValidTransition("WATCH", "TRIGGERED")).toBe(false);
  });

  it("PRIME → TRIGGERED is allowed", () => {
    expect(isValidTransition("PRIME", "TRIGGERED")).toBe(true);
  });

  it("non-terminal action states can be invalidated", () => {
    for (const s of ["BUILDING", "PRIME", "TRIGGERED", "CONFIRMED"] as const) {
      expect(isValidTransition(s, "INVALIDATED")).toBe(true);
    }
  });
});

describe("mapResearchLifecycleToAdminState", () => {
  it("DATA_DEGRADED maps to IGNORE regardless of score", () => {
    expect(
      mapResearchLifecycleToAdminState("DATA_DEGRADED", {
        score: 95,
        doNothing: false,
      }),
    ).toBe("IGNORE");
  });

  it("DoNothing demotes a high-scoring FRESH packet to IGNORE", () => {
    expect(
      mapResearchLifecycleToAdminState("FRESH", {
        score: 85,
        doNothing: true,
      }),
    ).toBe("IGNORE");
  });

  it("score >= 80 with no DoNothing → PRIME", () => {
    expect(
      mapResearchLifecycleToAdminState("READY", {
        score: 82,
        doNothing: false,
      }),
    ).toBe("PRIME");
  });

  it("TRAPPED collapses to INVALIDATED for queue purposes", () => {
    expect(
      mapResearchLifecycleToAdminState("TRAPPED", {
        score: 50,
        doNothing: false,
      }),
    ).toBe("INVALIDATED");
  });
});
