/**
 * test/admin/recordTradeClosureLearning.test.ts
 *
 * Unit tests for the P1 closed-trade learning funnel.
 *
 * Every closed simulated trade MUST flow through `recordTradeClosureLearning`
 * which:
 *   1. derives entry-time flags from admin_edge_packets / arca_simulated_orders
 *   2. classifies + persists a mistake label
 *   3. writes a REVIEW journal entry
 *   4. proposes POST_TRADE doctrine reviews for trigger mistakes
 *   5. re-rolls playbook performance
 *   6. soft-fails so the close path itself is never corrupted
 *
 * No DB, no network — all five downstream dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ArcaPortfolio, ArcaTrade } from "@/lib/admin/portfolio-lab/types";
import type { MistakeLabel } from "@/lib/admin/arca-brain/types";

const qMock = vi.fn();
const recordMistakeLabelMock = vi.fn();
const writeJournalMock = vi.fn();
const rollupPlaybookPerformanceMock = vi.fn();
const proposeDoctrineReviewMock = vi.fn();
const listDoctrineRulesMock = vi.fn();

vi.mock("@/lib/db", () => ({
  q: (...args: unknown[]) => qMock(...args),
}));
vi.mock("@/lib/admin/arca-brain/mistakeLabeler", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/arca-brain/mistakeLabeler")>(
    "@/lib/admin/arca-brain/mistakeLabeler",
  );
  return {
    ...actual,
    recordMistakeLabel: (...args: unknown[]) => recordMistakeLabelMock(...args),
  };
});
vi.mock("@/lib/admin/portfolio-lab/journalEngine", () => ({
  writeJournal: (...args: unknown[]) => writeJournalMock(...args),
}));
vi.mock("@/lib/admin/portfolio-lab/playbookEngine", () => ({
  rollupPlaybookPerformance: (...args: unknown[]) =>
    rollupPlaybookPerformanceMock(...args),
}));
vi.mock("@/lib/admin/arca-brain/doctrineEngine", () => ({
  proposeDoctrineReview: (...args: unknown[]) => proposeDoctrineReviewMock(...args),
  listDoctrineRules: (...args: unknown[]) => listDoctrineRulesMock(...args),
}));

import { recordTradeClosureLearning } from "@/lib/admin/arca-brain/recordTradeClosureLearning";

function makePortfolio(): ArcaPortfolio {
  return {
    id: "pf-1",
    workspaceId: "ws-1",
    name: "Test PF",
    mode: "PAPER",
    startingBalance: 100_000,
    currentCash: 99_000,
    realisedPnl: -1_000,
    unrealisedPnl: 0,
    totalEquity: 99_000,
    baseCurrency: "USD",
    status: "ACTIVE",
    settings: {} as ArcaPortfolio["settings"],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function makeTrade(overrides: Partial<ArcaTrade> = {}): ArcaTrade {
  return {
    id: "tr-1",
    workspaceId: "ws-1",
    portfolioId: "pf-1",
    positionId: "pos-1",
    symbol: "AAPL",
    assetClass: "EQUITY",
    instrumentType: "stock",
    side: "LONG",
    entryPrice: 100,
    exitPrice: 98,
    quantity: 10,
    notionalValue: 1000,
    stopLoss: 98,
    takeProfit1: 110,
    takeProfit2: null,
    takeProfit3: null,
    entryTime: "2025-01-01T10:00:00Z",
    exitTime: "2025-01-01T11:00:00Z",
    realisedPnl: -20,
    rMultiple: -1,
    feesEstimate: 0,
    slippageEstimate: 0,
    outcome: "LOSS",
    exitReason: "STOP_LOSS",
    playbookId: "pb-1",
    sourceEdgePacketId: "ep-1",
    sourceMarketPacketId: null,
    arcaConfidence: null,
    arcaReasonSummary: null,
    createdAt: "2025-01-01T11:00:00Z",
    ...overrides,
  };
}

function fakeLabel(over: Partial<MistakeLabel> = {}): MistakeLabel {
  return {
    id: "ml-1",
    workspaceId: "ws-1",
    tradeId: "tr-1",
    portfolioId: "pf-1",
    mistakeType: "NO_MISTAKE_SYSTEM_VALID",
    severity: "low",
    arcaReasoning: "test",
    evidenceJson: {},
    ruleViolatedId: null,
    labeler: "engine",
    labelerVersion: "v1",
    manualOverride: false,
    manualNote: null,
    createdAt: "2025-01-01T11:00:01Z",
    ...over,
  };
}

beforeEach(() => {
  qMock.mockReset();
  recordMistakeLabelMock.mockReset();
  writeJournalMock.mockReset();
  rollupPlaybookPerformanceMock.mockReset();
  proposeDoctrineReviewMock.mockReset();
  listDoctrineRulesMock.mockReset();

  // Default: no packet found, no override order.
  qMock.mockResolvedValue([]);
  recordMistakeLabelMock.mockResolvedValue(fakeLabel());
  writeJournalMock.mockResolvedValue({ id: "jr-1" });
  rollupPlaybookPerformanceMock.mockResolvedValue({
    playbooksUpdated: 1,
    totalTradesScanned: 1,
    computedAt: "2025-01-01T11:00:02Z",
  });
  listDoctrineRulesMock.mockResolvedValue([]);
  proposeDoctrineReviewMock.mockResolvedValue({ id: "dr-1" });
});

describe("recordTradeClosureLearning — happy path", () => {
  it("labels, journals, and rolls up on every close", async () => {
    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });

    expect(res.mistakeWritten).toBe(true);
    expect(res.journalWritten).toBe(true);
    expect(res.playbookRollupOk).toBe(true);
    expect(res.mistakeType).toBe("NO_MISTAKE_SYSTEM_VALID");
    expect(recordMistakeLabelMock).toHaveBeenCalledTimes(1);
    expect(writeJournalMock).toHaveBeenCalledTimes(1);
    expect(rollupPlaybookPerformanceMock).toHaveBeenCalledTimes(1);

    const journalArg = writeJournalMock.mock.calls[0][0] as {
      journalType: string;
      title: string;
      tradeId: string;
    };
    expect(journalArg.journalType).toBe("REVIEW");
    expect(journalArg.title).toContain("AAPL");
    expect(journalArg.tradeId).toBe("tr-1");
  });
});

describe("recordTradeClosureLearning — entry-context derivation", () => {
  it("flags dataStaleAtEntry when packet freshness is stale", async () => {
    qMock.mockImplementation((sql: string) => {
      if (sql.includes("admin_edge_packets")) {
        return Promise.resolve([
          { freshness: "stale", trap_risk_score: "10", thesis_status: null, admin_state: null },
        ]);
      }
      return Promise.resolve([]);
    });
    recordMistakeLabelMock.mockImplementation((input: { dataStaleAtEntry?: boolean }) => {
      // Echo back so we can verify the flag travelled.
      return Promise.resolve(fakeLabel({
        mistakeType: input.dataStaleAtEntry ? "STALE_DATA_DECISION" : "NO_MISTAKE_SYSTEM_VALID",
        severity: input.dataStaleAtEntry ? "high" : "low",
      }));
    });
    listDoctrineRulesMock.mockResolvedValue([]);

    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });
    expect(res.mistakeType).toBe("STALE_DATA_DECISION");
    const labelArg = recordMistakeLabelMock.mock.calls[0][0] as { dataStaleAtEntry?: boolean };
    expect(labelArg.dataStaleAtEntry).toBe(true);
  });

  it("flags brokeRule when source order reason mentions override", async () => {
    qMock.mockImplementation((sql: string) => {
      if (sql.includes("admin_edge_packets")) {
        return Promise.resolve([
          { freshness: "fresh", trap_risk_score: "0", thesis_status: null, admin_state: null },
        ]);
      }
      if (sql.includes("arca_simulated_orders")) {
        return Promise.resolve([{ arca_reason_summary: "operator OVERRIDE applied" }]);
      }
      return Promise.resolve([]);
    });
    recordMistakeLabelMock.mockResolvedValue(fakeLabel({
      mistakeType: "BROKE_RULE",
      severity: "critical",
    }));
    listDoctrineRulesMock.mockResolvedValue([
      { id: "rule-1", ruleText: "Never trade against an active rule", status: "ACTIVE" },
    ]);

    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });

    const labelArg = recordMistakeLabelMock.mock.calls[0][0] as { brokeRule?: boolean };
    expect(labelArg.brokeRule).toBe(true);
    expect(res.mistakeType).toBe("BROKE_RULE");
    expect(res.doctrineReviewsProposed).toBeGreaterThanOrEqual(1);
    expect(proposeDoctrineReviewMock).toHaveBeenCalled();
    const drArg = proposeDoctrineReviewMock.mock.calls[0][0] as {
      reviewType: string;
      proposedAction: string;
    };
    expect(drArg.reviewType).toBe("POST_TRADE");
    expect(drArg.proposedAction).toBe("MODIFY"); // severity=critical → MODIFY
  });
});

describe("recordTradeClosureLearning — doctrine trigger gating", () => {
  it("does NOT propose doctrine reviews for benign NO_MISTAKE outcomes", async () => {
    recordMistakeLabelMock.mockResolvedValue(fakeLabel());
    await recordTradeClosureLearning({
      trade: makeTrade({ exitReason: "TAKE_PROFIT", outcome: "WIN", rMultiple: 2 }),
      portfolio: makePortfolio(),
    });
    expect(proposeDoctrineReviewMock).not.toHaveBeenCalled();
    expect(listDoctrineRulesMock).not.toHaveBeenCalled();
  });

  it("proposes against multiple matching rules when no explicit ruleViolatedId", async () => {
    recordMistakeLabelMock.mockResolvedValue(fakeLabel({
      mistakeType: "POSITION_TOO_LARGE",
      severity: "high",
    }));
    listDoctrineRulesMock.mockResolvedValue([
      { id: "r-size-1", ruleText: "Cap position SIZE to 2% risk", status: "ACTIVE" },
      { id: "r-size-2", ruleText: "Reduce SIZE in elevated VIX", status: "ACTIVE" },
      { id: "r-unrelated", ruleText: "Avoid earnings windows", status: "ACTIVE" },
    ]);

    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });

    expect(res.doctrineReviewsProposed).toBe(2);
    expect(proposeDoctrineReviewMock).toHaveBeenCalledTimes(2);
  });
});

describe("recordTradeClosureLearning — soft-fail invariant", () => {
  it("never throws when recordMistakeLabel fails", async () => {
    recordMistakeLabelMock.mockRejectedValue(new Error("db down"));
    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });
    expect(res.mistakeWritten).toBe(false);
    expect(res.errors.some((e) => e.includes("mistake_label_failed"))).toBe(true);
    // Journal + rollup still attempted.
    expect(writeJournalMock).toHaveBeenCalled();
    expect(rollupPlaybookPerformanceMock).toHaveBeenCalled();
  });

  it("never throws when writeJournal fails", async () => {
    writeJournalMock.mockRejectedValue(new Error("journal table missing"));
    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });
    expect(res.journalWritten).toBe(false);
    expect(res.errors.some((e) => e.includes("journal_review_failed"))).toBe(true);
    expect(res.mistakeWritten).toBe(true);
  });

  it("never throws when rollupPlaybookPerformance fails", async () => {
    rollupPlaybookPerformanceMock.mockRejectedValue(new Error("rollup blew up"));
    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });
    expect(res.playbookRollupOk).toBe(false);
    expect(res.errors.some((e) => e.includes("playbook_rollup_failed"))).toBe(true);
  });

  it("never throws when doctrine engine fails", async () => {
    recordMistakeLabelMock.mockResolvedValue(fakeLabel({
      mistakeType: "STALE_DATA_DECISION",
      severity: "high",
    }));
    listDoctrineRulesMock.mockResolvedValue([
      { id: "r-1", ruleText: "Skip STALE data setups", status: "ACTIVE" },
    ]);
    proposeDoctrineReviewMock.mockRejectedValue(new Error("doctrine engine fault"));

    const res = await recordTradeClosureLearning({
      trade: makeTrade(),
      portfolio: makePortfolio(),
    });
    expect(res.doctrineReviewsProposed).toBe(0);
    expect(res.errors.some((e) => e.includes("doctrine_review_failed"))).toBe(true);
    // Other steps still ran.
    expect(res.mistakeWritten).toBe(true);
    expect(res.journalWritten).toBe(true);
    expect(res.playbookRollupOk).toBe(true);
  });
});

describe("recordTradeClosureLearning — manual close path", () => {
  it("forwards manualClose flag + reasoningNote into the label prefix", async () => {
    await recordTradeClosureLearning({
      trade: makeTrade({ exitReason: "MANUAL_SIM_CLOSE", outcome: "WIN", rMultiple: 0.2 }),
      portfolio: makePortfolio(),
      manualClose: true,
      overrides: { reasoningNote: "Brad bailed early on news" },
    });
    const labelArg = recordMistakeLabelMock.mock.calls[0][0] as {
      arcaReasoningPrefix?: string;
    };
    expect(labelArg.arcaReasoningPrefix).toContain("manual_close");
    expect(labelArg.arcaReasoningPrefix).toContain("Brad bailed early on news");
  });
});
