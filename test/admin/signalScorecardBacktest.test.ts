/**
 * Scorecard and Backtest Lab (fix/admin-call-logging): fixed-labeller outcomes from ai_signal_log only, win rate =
 * W ÷ (W + L), moves signed to the call's direction. The Backtest Lab used to read tables that don't exist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  q: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
}));
vi.mock("@/lib/db", () => ({ q: m.q }));
vi.mock("@/lib/adminAuth", () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));

import { GET as scorecardGET } from "@/app/api/admin/signals/scorecard/route";
import { GET as backtestGET } from "@/app/api/admin/backtest-lab/route";
import { LABELLER_FIX_AT } from "@/lib/admin/signalStats";

beforeEach(() => {
  m.q.mockReset();
  m.q.mockImplementation(async () => []);
});

describe("GET /api/admin/signals/scorecard", () => {
  it("groups playbook × direction × regime over fixed-labeller shared-scan outcomes, min 10 by default", async () => {
    m.q.mockResolvedValue([{ playbook: "breakout", direction: "LONG", regime: "TREND_UP", sample: 12, wins: 7, losses: 3, neutral: 2, win_rate: "70.0", avg_move_pct: "0.84" }]);
    const body = await (await scorecardGET(new NextRequest("http://localhost/api/admin/signals/scorecard"))).json();
    const [sql, params] = m.q.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([10, "operator-terminal", LABELLER_FIX_AT]);
    expect(sql).toMatch(/GROUP BY 1, 2, 3/);
    expect(sql).toMatch(/UPPER\(trade_bias\) AS direction/);
    expect(sql).toMatch(/outcome_measured_at >= \$3/);
    expect(sql).toMatch(/UPPER\(trade_bias\) IN \('LONG', 'SHORT'\)/);
    // win rate over decided calls only; signed move replaces the fake ±1 avg_r
    expect(sql).toMatch(/NULLIF\(COUNT\(\*\) FILTER \(WHERE outcome IN \('correct', 'wrong'\)\), 0\)/);
    expect(sql).toContain("CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -pct_move_24h ELSE pct_move_24h END");
    expect(sql).not.toMatch(/expectancy_r/);
    expect(body.rows[0]).toMatchObject({ direction: "LONG", neutral: 2, avg_move_pct: "0.84" });
    expect(body.since).toBe(LABELLER_FIX_AT);
  });

  it("clamps minSample", async () => {
    await scorecardGET(new NextRequest("http://localhost/api/admin/signals/scorecard?minSample=500"));
    await scorecardGET(new NextRequest("http://localhost/api/admin/signals/scorecard?minSample=abc"));
    expect((m.q.mock.calls[0][1] as unknown[])[0]).toBe(100);
    expect((m.q.mock.calls[1][1] as unknown[])[0]).toBe(10);
  });
});

describe("GET /api/admin/backtest-lab", () => {
  it("aggregates shared-scan and admin-page calls from ai_signal_log with fixed-labeller wins and losses", async () => {
    m.q.mockResolvedValue([
      { setup: "PRIORITY-DESK", market: "EQUITIES", cases: 20, avg_score: "71.2", wins: 6, losses: 2, neutral: 1, pending: 11, avg_move_pct: "0.55" },
      { setup: "BREAKOUT", market: "CRYPTO", cases: 5, avg_score: "60", wins: 0, losses: 0, neutral: 0, pending: 5, avg_move_pct: null },
    ]);
    const body = await (await backtestGET(new NextRequest("http://localhost/api/admin/backtest-lab"))).json();
    const [sql, params] = m.q.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/FROM ai_signal_log/);
    expect(sql).not.toMatch(/signal_outcomes|signals_outcomes|admin_research_cases/);
    expect(sql).toMatch(/workspace_id = 'operator-terminal' OR workspace_id LIKE 'admin-call:%'/);
    expect(params).toEqual([LABELLER_FIX_AT]);
    expect(body.breakdown[0]).toEqual({ setup: "PRIORITY-DESK", market: "EQUITIES", cases: 20, avgScore: 71.2, hitRate: 75, wins: 6, losses: 2, neutral: 1, pending: 11, avgMovePct: 0.55 });
    expect(body.breakdown[1].hitRate).toBeNull();
    expect(body).toMatchObject({ totalCases: 25, totalWins: 6, totalLosses: 2, overallHitRate: 75, overallAvgScore: 69 }); // (71.2×20 + 60×5) ÷ 25 = 68.96
    expect(body.note).toBeNull();
  });

  it("explains empty and unmeasured states, and says it is unavailable when the log can't be read", async () => {
    let body = await (await backtestGET(new NextRequest("http://localhost/api/admin/backtest-lab"))).json();
    expect(body.note).toMatch(/No logged calls/);
    m.q.mockResolvedValue([{ setup: "JARVIS", market: "EQUITIES", cases: 3, avg_score: 50, wins: 0, losses: 0, neutral: 0, pending: 3, avg_move_pct: null }]);
    body = await (await backtestGET(new NextRequest("http://localhost/api/admin/backtest-lab"))).json();
    expect(body.note).toMatch(/none has been measured/);
    m.q.mockRejectedValue(new Error("boom"));
    body = await (await backtestGET(new NextRequest("http://localhost/api/admin/backtest-lab"))).json();
    expect(body.note).toMatch(/unavailable/);
    expect(body.error).toBe("boom");
  });
});
