/**
 * Phase 7 — Journal Learning engine tests
 *
 * Locks down:
 *   1. Pattern grouping by setup × market × bias is correct.
 *   2. Match detection respects score-band tolerance.
 *   3. Boost computation requires ≥3 cases in band; weight is bounded.
 *   4. Sample symbols deduplicate and cap at 8.
 *   5. Empty / malformed inputs degrade safely.
 */

import { describe, expect, it } from "vitest";
import {
  buildJournalDNA,
  buildPatternGroups,
  computeJournalPatternBoost,
  findJournalMatches,
  type JournalCaseRow,
  type JournalCurrent,
} from "../../lib/engines/journalLearning";

function row(overrides: Partial<JournalCaseRow> = {}): JournalCaseRow {
  return {
    symbol: "AAPL",
    market: "EQUITIES",
    timeframe: "15m",
    bias: "LONG",
    setupType: "TREND_CONTINUATION",
    score: 78,
    lifecycle: "READY",
    dataTrustScore: 80,
    createdAt: "2026-04-29T12:00:00Z",
    ...overrides,
  };
}

function current(overrides: Partial<JournalCurrent> = {}): JournalCurrent {
  return {
    symbol: "AAPL",
    market: "EQUITIES",
    timeframe: "15m",
    bias: "LONG",
    setupType: "TREND_CONTINUATION",
    score: 78,
    ...overrides,
  };
}

describe("Phase 7 — pattern grouping", () => {
  it("groups by setupType × market × bias and aggregates count + avgScore", () => {
    const groups = buildPatternGroups([
      row({ symbol: "AAPL", score: 80 }),
      row({ symbol: "MSFT", score: 76 }),
      row({ symbol: "TSLA", score: 84 }),
      row({ symbol: "BTCUSD", market: "CRYPTO", score: 70 }),
    ]);
    const eq = groups.find((g) => g.market === "EQUITIES");
    const cr = groups.find((g) => g.market === "CRYPTO");
    expect(eq?.count).toBe(3);
    expect(eq?.avgScore).toBe(80); // (80+76+84)/3
    expect(cr?.count).toBe(1);
  });

  it("dedupes sample symbols and caps at 8", () => {
    const rows: JournalCaseRow[] = [];
    for (let i = 0; i < 20; i++) rows.push(row({ symbol: i < 5 ? "AAPL" : `SYM${i}` }));
    const [g] = buildPatternGroups(rows);
    expect(g.sampleSymbols.length).toBeLessThanOrEqual(8);
    expect(new Set(g.sampleSymbols).size).toBe(g.sampleSymbols.length);
  });

  it("sorts by count desc then avgScore desc", () => {
    const rows: JournalCaseRow[] = [
      ...Array.from({ length: 5 }, (_, i) => row({ symbol: `A${i}`, setupType: "RANGE_BREAKOUT", score: 60 })),
      ...Array.from({ length: 7 }, (_, i) => row({ symbol: `B${i}`, setupType: "TREND_CONTINUATION", score: 80 })),
    ];
    const groups = buildPatternGroups(rows);
    expect(groups[0].setupType).toBe("TREND_CONTINUATION");
    expect(groups[1].setupType).toBe("RANGE_BREAKOUT");
  });
});

describe("Phase 7 — match detection", () => {
  const groups = buildPatternGroups([
    row({ symbol: "AAPL", score: 78 }),
    row({ symbol: "MSFT", score: 80 }),
    row({ symbol: "GOOG", score: 82 }),
    row({ symbol: "TSLA", score: 76 }),
  ]);

  it("returns a match when setup × market × bias align", () => {
    const matches = findJournalMatches(groups, current({ score: 80 }));
    expect(matches.length).toBe(1);
    expect(matches[0].inScoreBand).toBe(true);
    expect(matches[0].fit).toBeGreaterThan(0);
  });

  it("flags out-of-band when score is too far from group avg", () => {
    const matches = findJournalMatches(groups, current({ score: 30 }));
    expect(matches[0].inScoreBand).toBe(false);
  });

  it("returns empty when bias mismatch", () => {
    const matches = findJournalMatches(groups, current({ bias: "SHORT" }));
    expect(matches.length).toBe(0);
  });
});

describe("Phase 7 — boost computation", () => {
  it("requires ≥3 cases AND in-band score for a boost", () => {
    const groups = buildPatternGroups([row(), row({ symbol: "MSFT" })]); // only 2
    const matches = findJournalMatches(groups, current());
    expect(computeJournalPatternBoost(matches)).toBeNull();
  });

  it("emits a boost in the bounded range when qualified", () => {
    const groups = buildPatternGroups([
      row({ symbol: "A1", score: 78 }),
      row({ symbol: "A2", score: 79 }),
      row({ symbol: "A3", score: 80 }),
      row({ symbol: "A4", score: 81 }),
    ]);
    const matches = findJournalMatches(groups, current({ score: 79 }));
    const boost = computeJournalPatternBoost(matches);
    expect(boost).not.toBeNull();
    expect(boost!.weight).toBeGreaterThanOrEqual(2);
    expect(boost!.weight).toBeLessThanOrEqual(6);
    expect(boost!.reason).toContain("TREND_CONTINUATION");
  });

  it("returns null on out-of-band candidate even with many cases", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ symbol: `S${i}`, score: 78 }));
    const groups = buildPatternGroups(rows);
    const matches = findJournalMatches(groups, current({ score: 30 }));
    expect(computeJournalPatternBoost(matches)).toBeNull();
  });
});

describe("Phase 7 — DNA summary", () => {
  it("hasMeaningfulMatch true when ≥3 cases and in-band", () => {
    const cases = Array.from({ length: 3 }, (_, i) => row({ symbol: `S${i}`, score: 78 }));
    const dna = buildJournalDNA(cases, current({ score: 78 }));
    expect(dna.hasMeaningfulMatch).toBe(true);
  });

  it("hasMeaningfulMatch false when fewer than 3 cases", () => {
    const cases = [row(), row({ symbol: "MSFT" })];
    const dna = buildJournalDNA(cases, current());
    expect(dna.hasMeaningfulMatch).toBe(false);
  });

  it("degrades safely on empty input", () => {
    const dna = buildJournalDNA([], null);
    expect(dna.totalCases).toBe(0);
    expect(dna.groups).toEqual([]);
    expect(dna.matches).toEqual([]);
    expect(dna.hasMeaningfulMatch).toBe(false);
  });
});
