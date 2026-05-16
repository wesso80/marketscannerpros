/**
 * test/admin/recordNoTradeDecisionFromCandidate.test.ts
 *
 * Pure unit tests for the No-Trade Alpha funnel. Mocks the two
 * downstream writes (DB insert + journal) so we can assert:
 *   - every rejection stage maps to a legal `rejection_source` value
 *   - the exact stage label is preserved inside `rejection_reason`
 *   - the journal entry is written every time
 *   - dedupe by `${symbol}::${stage}` works when a shared Set is given
 *   - all optional fields appear in the reason / journal when supplied
 *
 * No DB, no network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const recordNoTradeRejectionMock = vi.fn();
const writeJournalMock = vi.fn();

vi.mock("@/lib/admin/arca-brain/noTradeAlpha", () => ({
  recordNoTradeRejection: (...args: unknown[]) => recordNoTradeRejectionMock(...args),
}));
vi.mock("@/lib/admin/portfolio-lab/journalEngine", () => ({
  writeJournal: (...args: unknown[]) => writeJournalMock(...args),
}));

import {
  recordNoTradeDecisionFromCandidate,
  type RejectionStage,
} from "@/lib/admin/arca-brain/recordNoTradeDecisionFromCandidate";

const baseInput = {
  workspaceId: "ws-1",
  portfolioId: "pf-1",
  symbol: "AAPL",
  rejectionReason: "test reason",
};

beforeEach(() => {
  recordNoTradeRejectionMock.mockReset();
  writeJournalMock.mockReset();
  recordNoTradeRejectionMock.mockResolvedValue({ id: "nt-1" });
  writeJournalMock.mockResolvedValue({ id: "j-1" });
});

describe("recordNoTradeDecisionFromCandidate — stage → source mapping", () => {
  const cases: Array<{ stage: RejectionStage; source: string }> = [
    { stage: "STALE_DATA",              source: "DATA_QUALITY" },
    { stage: "MISSING_DATA",            source: "DATA_QUALITY" },
    { stage: "DATA_TRUST",              source: "DATA_QUALITY" },
    { stage: "DO_NOTHING",              source: "DATA_QUALITY" },
    { stage: "REGIME_MATRIX",           source: "REGIME_MATRIX" },
    { stage: "DISABLED_PLAYBOOK",       source: "REGIME_MATRIX" },
    { stage: "WAIT_FOR_CONFIRMATION",   source: "REGIME_MATRIX" },
    { stage: "UNKNOWN_REGIME",          source: "REGIME_MATRIX" },
    { stage: "UNKNOWN_PLAYBOOK",        source: "REGIME_MATRIX" },
    { stage: "CAPITAL_ALLOCATION",      source: "CAP_ALLOC" },
    { stage: "PRE_TRADE_RISK",          source: "CAP_ALLOC" },
    { stage: "RISK_CAP",                source: "CAP_ALLOC" },
    { stage: "PORTFOLIO_HEAT",          source: "CAP_ALLOC" },
    { stage: "MISSING_TRADE_STRUCTURE", source: "CAP_ALLOC" },
    { stage: "POOR_RISK_REWARD",        source: "CAP_ALLOC" },
    { stage: "DUPLICATE_EXPOSURE",      source: "CAP_ALLOC" },
    { stage: "EVENT_RISK",              source: "CAP_ALLOC" },
    { stage: "SIZING_FAILED",           source: "CAP_ALLOC" },
    { stage: "INFO_EDGE_OBVIOUS_NOISE", source: "CAP_ALLOC" },
    { stage: "DEBATE_REJECT",           source: "DEBATE" },
    { stage: "PROSECUTOR_REJECT",       source: "DEBATE" },
  ];

  it.each(cases)("stage=$stage → source=$source", async ({ stage, source }) => {
    await recordNoTradeDecisionFromCandidate({ ...baseInput, rejectionStage: stage });
    expect(recordNoTradeRejectionMock).toHaveBeenCalledTimes(1);
    const arg = recordNoTradeRejectionMock.mock.calls[0][0] as {
      rejectionSource: string;
      rejectionReason: string;
    };
    expect(arg.rejectionSource).toBe(source);
    // The exact stage must survive the bucketing, inside reason text.
    expect(arg.rejectionReason).toContain(`[STAGE=${stage}]`);
    expect(arg.rejectionReason).toContain(`[SOURCE=${source}]`);
  });
});

describe("recordNoTradeDecisionFromCandidate — journal + dedupe + fields", () => {
  it("writes one journal entry per call", async () => {
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "STALE_DATA",
    });
    expect(writeJournalMock).toHaveBeenCalledTimes(1);
    const arg = writeJournalMock.mock.calls[0][0] as { journalType: string; title: string };
    expect(arg.journalType).toBe("REJECTED");
    expect(arg.title).toContain("AAPL");
    expect(arg.title).toContain("STALE_DATA");
  });

  it("uses RISK_BLOCK journal type for risk-flavoured stages", async () => {
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "PRE_TRADE_RISK",
    });
    const arg = writeJournalMock.mock.calls[0][0] as { journalType: string };
    expect(arg.journalType).toBe("RISK_BLOCK");
  });

  it("uses REJECTED journal type with DEFERRED title prefix for WAIT_FOR_CONFIRMATION", async () => {
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "WAIT_FOR_CONFIRMATION",
    });
    const arg = writeJournalMock.mock.calls[0][0] as { journalType: string; title: string };
    // DB CHECK on arca_trade_journal.journal_type does not admit DEFERRED — the
    // semantics live in the title prefix instead.
    expect(arg.journalType).toBe("REJECTED");
    expect(arg.title.startsWith("DEFERRED ")).toBe(true);
  });

  it("dedupes by symbol+stage when given a shared Set", async () => {
    const dedupeKeys = new Set<string>();
    const a = await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "DO_NOTHING",
      dedupeKeys,
    });
    const b = await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "DO_NOTHING",
      dedupeKeys,
    });
    expect(a.written).toBe(true);
    expect(b.written).toBe(false);
    expect(b.skippedReason).toBe("duplicate");
    expect(recordNoTradeRejectionMock).toHaveBeenCalledTimes(1);
    expect(writeJournalMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT dedupe a different stage for the same symbol", async () => {
    const dedupeKeys = new Set<string>();
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "DO_NOTHING",
      dedupeKeys,
    });
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "STALE_DATA",
      dedupeKeys,
    });
    expect(recordNoTradeRejectionMock).toHaveBeenCalledTimes(2);
  });

  it("emits freshness, info-edge, alloc, regime and debate fragments in reason text", async () => {
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "DEBATE_REJECT",
      dataFreshness: "stale",
      regime: "RISK_ON_TREND",
      playbookId: "breakout",
      regimePlaybookDecision: {
        regime: "RISK_ON_TREND",
        playbookId: "breakout",
        status: "ENABLED",
        sizeMultiplier: 1,
        reason: "ok",
        requiredConfirmations: ["volume_confirm"],
        disqualifiers: [],
        sourceRuleId: "rule-1",
      },
      informationEdge: {
        score: 42,
        band: "MODERATE_EDGE",
        missingInputs: ["analystDispersion"],
        derivationConfidence: 0.7,
      },
      capitalAllocation: {
        grade: "B_GRADE",
        reason: "composite=55",
        riskPercent: 0.5,
      },
      debate: {
        id: "dbt-9",
        reason: "prosecutor: poor RR",
        finalDecision: "PROSECUTOR_WIN",
      },
      entry: 100,
      stopLoss: 95,
      takeProfit: 110,
      hypotheticalSizeDollars: 2500,
    });
    const arg = recordNoTradeRejectionMock.mock.calls[0][0] as {
      rejectionReason: string;
      debateId: string | null;
      hypotheticalEntry: number | null;
      hypotheticalStop: number | null;
      hypotheticalTarget: number | null;
      hypotheticalSizeDollars: number | null;
    };
    expect(arg.rejectionReason).toContain("freshness=stale");
    expect(arg.rejectionReason).toContain("info_edge=42(MODERATE_EDGE)");
    expect(arg.rejectionReason).toContain("cap_alloc=B_GRADE");
    expect(arg.rejectionReason).toContain("regime=RISK_ON_TREND/playbook=breakout/ENABLED");
    expect(arg.rejectionReason).toContain("debate=PROSECUTOR_WIN(dbt-9)");
    expect(arg.debateId).toBe("dbt-9");
    expect(arg.hypotheticalEntry).toBe(100);
    expect(arg.hypotheticalStop).toBe(95);
    expect(arg.hypotheticalTarget).toBe(110);
    expect(arg.hypotheticalSizeDollars).toBe(2500);

    const j = writeJournalMock.mock.calls[0][0] as {
      reasoning: string;
      evidence: string[];
      dataFreshness?: string;
      sourcePacketIds: string[];
    };
    expect(j.reasoning).toContain("Stage: DEBATE_REJECT");
    expect(j.reasoning).toContain("Would become valid if:");
    expect(j.evidence.join("|")).toContain("required: volume_confirm");
    expect(j.evidence.join("|")).toContain("missing inputs: analystDispersion");
    expect(j.dataFreshness).toBe("stale");
  });

  it("returns written=true even if recordNoTradeRejection throws (soft-fail)", async () => {
    recordNoTradeRejectionMock.mockRejectedValueOnce(new Error("db down"));
    const r = await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "STALE_DATA",
    });
    // The funnel must NOT bubble the error — the cycle keeps moving.
    expect(r.written).toBe(true);
    expect(writeJournalMock).toHaveBeenCalledTimes(1);
  });

  it("forwards edgePacketId into journal sourcePacketIds", async () => {
    await recordNoTradeDecisionFromCandidate({
      ...baseInput,
      rejectionStage: "DO_NOTHING",
      edgePacketId: "pkt-123",
    });
    const j = writeJournalMock.mock.calls[0][0] as { sourcePacketIds: string[] };
    expect(j.sourcePacketIds).toEqual(["pkt-123"]);
  });
});
