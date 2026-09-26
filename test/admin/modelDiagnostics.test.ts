/**
 * Model Diagnostics reads ai_signal_log (confidence / outcome), not the nonexistent signal_outcomes columns.
 * correct → win, wrong → loss; only fixed-labeller verdicts (outcome_measured_at >= LABELLER_FIX_AT) count.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  sql: [] as string[],
  params: [] as unknown[][],
  signals: [] as { score: number; outcome: string | null }[],
  old: 0,
}));
vi.mock("@/lib/adminAuth", () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/db", () => ({
  q: vi.fn(async (sql: string, params: unknown[] = []) => {
    m.sql.push(sql);
    m.params.push(params);
    if (/FROM admin_research_cases/.test(sql)) return [{ score: 70, outcome: null }];
    if (/COUNT\(\*\) AS n\s+FROM ai_signal_log/.test(sql)) return [{ n: String(m.old) }];
    if (/FROM ai_signal_log/.test(sql)) return m.signals;
    return [];
  }),
}));

import { GET } from "../../app/api/admin/model-diagnostics/route";
import { computeCalibration, isWinningOutcome } from "@/lib/admin/modelDiagnostics";
import { LABELLER_FIX_AT } from "../../app/api/admin/signals/stats/route";

beforeEach(() => { m.sql = []; m.params = []; m.signals = []; m.old = 0; });

describe("isWinningOutcome", () => {
  it("maps ai_signal_log outcomes", () => {
    expect(isWinningOutcome("correct")).toBe(true);
    expect(isWinningOutcome("wrong")).toBe(false);
    expect(isWinningOutcome("neutral")).toBeNull();
    expect(isWinningOutcome("expired")).toBeNull();
    expect(isWinningOutcome("pending")).toBeNull();
    expect(isWinningOutcome("TP hit")).toBe(true);
    expect(isWinningOutcome("stopped")).toBe(false);
  });
});

describe("computeCalibration", () => {
  it("buckets by score and computes hit rate from labelled rows only", () => {
    const r = computeCalibration([
      { score: 80, outcome: "correct" }, { score: 85, outcome: "wrong" }, { score: 90, outcome: null }, { score: 10, outcome: "pending" },
    ]);
    const top = r.buckets.find((b) => b.band === "75–100")!;
    expect(top.cases).toBe(3);
    expect(top.hitRate).toBe(50);
    expect(r.totalLabelled).toBe(2);
    expect(r.overallHitRate).toBe(50);
  });
});

describe("GET /api/admin/model-diagnostics", () => {
  it("queries ai_signal_log for the operator workspace, gated by the labeller fix date", async () => {
    m.signals = [{ score: 80, outcome: "correct" }, { score: 65, outcome: "wrong" }, { score: 50, outcome: "pending" }];
    m.old = 4;
    const body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics"))).json();
    const all = m.sql.join("\n");
    expect(all).not.toMatch(/signal_outcomes|signals_outcomes/);
    expect(all).toMatch(/confidence AS score/);
    expect(all).toMatch(/outcome_measured_at/);
    const sigParams = m.params[m.sql.findIndex((s) => /FROM ai_signal_log/.test(s))];
    expect(sigParams).toEqual(["operator-terminal", LABELLER_FIX_AT]);
    expect(body.totalCases).toBe(4); // 1 research case + 3 signals
    expect(body.totalLabelled).toBe(2);
    expect(body.overallHitRate).toBe(50);
    expect(body.sources.oldMethodLabelled).toBe(4);
    expect(body.note).toMatch(/old labelling method/);
  });

  it("explains an empty hit rate when nothing is labelled by the fixed labeller yet", async () => {
    m.signals = [{ score: 80, outcome: null }];
    const body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics"))).json();
    expect(body.totalLabelled).toBe(0);
    expect(body.note).toMatch(/fixed labeller/);
  });
});
