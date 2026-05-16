/**
 * test/admin/regimePlaybookDecision.test.ts
 *
 * Pure unit tests for the Regime-Playbook Matrix decision wrapper.
 * No DB, no fetches.
 */
import { describe, it, expect } from "vitest";
import { evaluateRegimePlaybook } from "@/lib/admin/arca-brain/regimePlaybookDecision";
import type { RegimePlaybookMatrixRow } from "@/lib/admin/arca-brain/types";

function row(partial: Partial<RegimePlaybookMatrixRow>): RegimePlaybookMatrixRow {
  return {
    id: "rule-1",
    workspaceId: "ws-1",
    regime: "RISK_ON_TREND",
    enabledPlaybooks: [],
    reducedSizePlaybooks: [],
    disabledPlaybooks: [],
    preferredAssetClasses: [],
    avoidedAssetClasses: [],
    requiredConfirmations: [],
    notes: null,
    updatedBy: "test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("evaluateRegimePlaybook", () => {
  it("returns UNKNOWN_REGIME when no matrix row is loaded (strict)", () => {
    const d = evaluateRegimePlaybook(null, "breakout");
    expect(d.status).toBe("UNKNOWN_REGIME");
    expect(d.sizeMultiplier).toBe(0);
    expect(d.disqualifiers).toContain("regime_matrix_missing");
  });

  it("UNKNOWN_REGIME runs at reduced size when strict=false", () => {
    const d = evaluateRegimePlaybook(null, "breakout", { strict: false });
    expect(d.status).toBe("UNKNOWN_REGIME");
    expect(d.sizeMultiplier).toBe(0.5);
  });

  it("returns UNKNOWN_PLAYBOOK when playbookId is null", () => {
    const d = evaluateRegimePlaybook(row({}), null);
    expect(d.status).toBe("UNKNOWN_PLAYBOOK");
    expect(d.sizeMultiplier).toBe(0.25); // strict experimental
    expect(d.disqualifiers).toContain("playbook_id_missing");
  });

  it("returns DISABLED for playbook in disabledPlaybooks", () => {
    const d = evaluateRegimePlaybook(row({ disabledPlaybooks: ["mean_revert"] }), "mean_revert");
    expect(d.status).toBe("DISABLED");
    expect(d.sizeMultiplier).toBe(0);
    expect(d.reason).toMatch(/DISABLED/);
  });

  it("returns DISABLED when allow-list is set but candidate is not in it", () => {
    const d = evaluateRegimePlaybook(row({ enabledPlaybooks: ["breakout"] }), "scalp");
    expect(d.status).toBe("DISABLED");
    expect(d.sizeMultiplier).toBe(0);
    expect(d.disqualifiers[0]).toMatch(/not_in_allow_list/);
  });

  it("returns REDUCE_SIZE for playbook in reducedSizePlaybooks", () => {
    const d = evaluateRegimePlaybook(row({ reducedSizePlaybooks: ["scalp"] }), "scalp");
    expect(d.status).toBe("REDUCE_SIZE");
    expect(d.sizeMultiplier).toBe(0.5);
  });

  it("returns WAIT_FOR_CONFIRMATION when requiredConfirmations are present", () => {
    const d = evaluateRegimePlaybook(
      row({ requiredConfirmations: ["volume_expansion", "rs_leadership"] }),
      "breakout",
    );
    expect(d.status).toBe("WAIT_FOR_CONFIRMATION");
    expect(d.sizeMultiplier).toBe(0);
    expect(d.requiredConfirmations).toEqual(["volume_expansion", "rs_leadership"]);
  });

  it("returns DISABLED when asset class is avoided in the regime", () => {
    const d = evaluateRegimePlaybook(
      row({ avoidedAssetClasses: ["crypto"] }),
      "breakout",
      { assetClass: "crypto" },
    );
    expect(d.status).toBe("DISABLED");
    expect(d.sizeMultiplier).toBe(0);
    expect(d.disqualifiers).toContain("avoided_asset_class:crypto");
  });

  it("returns ENABLED when the matrix is empty / permissive", () => {
    const d = evaluateRegimePlaybook(row({}), "breakout", { assetClass: "equity" });
    expect(d.status).toBe("ENABLED");
    expect(d.sizeMultiplier).toBe(1);
    expect(d.sourceRuleId).toBe("rule-1");
  });

  it("DISABLED beats REDUCE_SIZE when a playbook appears in both lists", () => {
    const d = evaluateRegimePlaybook(
      row({ disabledPlaybooks: ["breakout"], reducedSizePlaybooks: ["breakout"] }),
      "breakout",
    );
    expect(d.status).toBe("DISABLED");
  });

  it("surfaces the matrix id as sourceRuleId for audit", () => {
    const d = evaluateRegimePlaybook(row({ id: "rule-RISK_ON_TREND-v3" }), "breakout");
    expect(d.sourceRuleId).toBe("rule-RISK_ON_TREND-v3");
  });
});
