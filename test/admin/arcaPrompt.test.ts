/**
 * Phase 6 — ARCA Admin Research Copilot tests
 *
 * Locks down:
 *   1. The system prompt contains the explicit forbidden-verb refusal
 *      clause AND every forbidden verb token.
 *   2. The output validator accepts a canonical good payload.
 *   3. The output validator rejects payloads containing forbidden
 *      execution phrasing in any text field.
 *   4. All 9 modes are enumerable and labelled.
 */

import { describe, expect, it } from "vitest";
import {
  ARCA_ADMIN_MODES,
  ARCA_MODE_LABELS,
  validateArcaOutput,
  type ArcaAdminResearchOutput,
} from "../../lib/admin/arcaTypes";
import {
  ARCA_FORBIDDEN_VERBS,
  ARCA_REFUSAL_CLAUSE,
  buildArcaSystemPrompt,
  buildArcaUserPrompt,
} from "../../lib/admin/arcaPrompt";

describe("Phase 6 — ARCA system prompt", () => {
  const prompt = buildArcaSystemPrompt();

  it("contains the explicit refusal clause", () => {
    expect(prompt).toContain(ARCA_REFUSAL_CLAUSE);
    expect(prompt.toLowerCase()).toContain("you must refuse");
  });

  it("enumerates every forbidden verb in the boundary section", () => {
    for (const verb of ARCA_FORBIDDEN_VERBS) {
      expect(prompt.toLowerCase()).toContain(verb.toLowerCase());
    }
  });

  it("declares ARCA as research-only, not a broker", () => {
    expect(prompt).toContain("research");
    expect(prompt.toLowerCase()).toContain("not a broker");
  });

  it("declares the strict JSON output contract", () => {
    expect(prompt).toContain("classification");
    expect(prompt).toContain("ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION");
  });
});

describe("Phase 6 — ARCA user prompt", () => {
  it("embeds bound score, axes, and data truth context", () => {
    const user = buildArcaUserPrompt("EXPLAIN_RANK", {
      symbol: "AAPL",
      market: "EQUITIES",
      timeframe: "15m",
      bias: "LONG",
      setup: "TREND_CONTINUATION",
      score: {
        score: 78,
        lifecycle: "READY",
        axes: { trend: 80, momentum: 70, volatility: 50, time: 60, options: 55, liquidity: 65, macro: 60, sentiment: 50, fundamentals: 60 },
        dominantAxis: "trend",
      },
      dataTruth: { status: "FRESH", trustScore: 92 },
    });
    expect(user).toContain("AAPL");
    expect(user).toContain("trend=80");
    expect(user).toContain("DATA_TRUTH: status=FRESH");
    expect(user).toContain("TASK:");
  });
});

describe("Phase 6 — output validator", () => {
  const good: ArcaAdminResearchOutput = {
    mode: "EXPLAIN_RANK",
    symbol: "AAPL",
    headline: "Trend axis dominates a READY-state research thesis on 15m.",
    reasoning: ["Trend=80 is the dominant axis.", "Momentum at 70 supports continuation."],
    evidence: ["axes.trend=80", "dataTruth.status=FRESH"],
    risks: ["A break below the research invalidation level would weaken the thesis."],
    classification: "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION",
  };

  it("accepts a canonical, well-formed payload", () => {
    const v = validateArcaOutput(good, "EXPLAIN_RANK", "AAPL");
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("rejects mode mismatch", () => {
    const v = validateArcaOutput({ ...good, mode: "CHALLENGE_SETUP" }, "EXPLAIN_RANK", "AAPL");
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("mode mismatch");
  });

  it("rejects symbol mismatch", () => {
    const v = validateArcaOutput({ ...good, symbol: "MSFT" }, "EXPLAIN_RANK", "AAPL");
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("symbol mismatch");
  });

  it("rejects wrong classification", () => {
    const v = validateArcaOutput({ ...good, classification: "WHATEVER" as never }, "EXPLAIN_RANK", "AAPL");
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("classification");
  });

  it("rejects forbidden execution phrasing in any text field", () => {
    const phrases = ["buy now", "sell now", "place order", "execute trade", "deploy capital", "position size"];
    for (const phrase of phrases) {
      const v = validateArcaOutput(
        { ...good, headline: `You should ${phrase} immediately.` },
        "EXPLAIN_RANK",
        "AAPL",
      );
      expect(v.ok, `expected reject for "${phrase}"`).toBe(false);
      expect(v.errors.some((e) => e.toLowerCase().includes("forbidden"))).toBe(true);
    }
  });

  it("rejects forbidden phrasing inside reasoning bullets", () => {
    const v = validateArcaOutput(
      { ...good, reasoning: ["Trend looks great.", "Operator should buy now to capture move."] },
      "EXPLAIN_RANK",
      "AAPL",
    );
    expect(v.ok).toBe(false);
  });

  it("rejects non-array reasoning / evidence / risks", () => {
    const v = validateArcaOutput({ ...good, reasoning: "not an array" }, "EXPLAIN_RANK", "AAPL");
    expect(v.ok).toBe(false);
  });
});

describe("Phase 6 — mode catalog", () => {
  it("exposes exactly 9 modes", () => {
    expect(ARCA_ADMIN_MODES.length).toBe(9);
  });

  it("provides a label for every mode", () => {
    for (const m of ARCA_ADMIN_MODES) {
      expect(typeof ARCA_MODE_LABELS[m]).toBe("string");
      expect(ARCA_MODE_LABELS[m].length).toBeGreaterThan(0);
    }
  });
});
