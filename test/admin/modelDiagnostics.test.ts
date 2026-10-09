/**
 * Model Diagnostics reads ai_signal_log (confluence_score by default / outcome), not the nonexistent signal_outcomes
 * columns, and no longer pads the buckets with outcome-less research cases.
 * correct → win, wrong → loss; only fixed-labeller verdicts (outcome_measured_at >= LABELLER_FIX_AT) count.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  sql: [] as string[],
  params: [] as unknown[][],
  signals: [] as { score: number; outcome: string | null; signedMove?: number | null; signal_at?: string }[],
  old: 0,
  fail: false,
}));
vi.mock("@/lib/adminAuth", () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/db", () => ({
  q: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (m.fail) throw new Error('private database failure');
    m.sql.push(sql);
    m.params.push(params);
    if (/FROM admin_research_cases/.test(sql)) return [{ score: 70, outcome: null }];
    if (/COUNT\(\*\) AS n\s+FROM ai_signal_log/.test(sql)) return [{ n: String(m.old) }];
    if (/FROM ai_signal_log/.test(sql)) return m.signals;
    return [];
  }),
}));

import { GET } from "../../app/api/admin/model-diagnostics/route";
import { ASSUMED_ROUND_TRIP_COST_PCT, MIN_LABELLED_FOR_COMPARISON, computeCalibration, isWinningOutcome } from "@/lib/admin/modelDiagnostics";
import { LABELLER_FIX_AT } from "@/lib/admin/signalStats";

beforeEach(() => { m.sql = []; m.params = []; m.signals = []; m.old = 0; m.fail = false; });

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
  it("accounts for every signal without treating unlabelled rows as losses", () => {
    const b = computeCalibration(['correct','wrong','neutral','pending','expired',null,'unknown'].map(outcome => ({score: 80,outcome}))).buckets[4];
    expect(b).toMatchObject({cases:7,labelled:2,wins:1,losses:1,neutral:1,pending:1,expired:1,excludedOrUnknown:2,hitRate:50});
    expect(b.wins+b.losses+b.neutral+b.pending+b.expired+b.excludedOrUnknown).toBe(b.cases);
  });
  it("shows no hit rate for a sample containing only neutral and pending outcomes", () => {
    const r = computeCalibration([{score:65,outcome:'neutral'},{score:65,outcome:'pending'}]);
    expect(r.overallHitRate).toBeNull();
    expect(r.drift).toEqual([]);
    expect(r.buckets[3]).toMatchObject({labelled:0,neutral:1,pending:1});
  });
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

describe("computeCalibration denominators, moves and drift", () => {
  const rows = (score: number, wins: number, losses: number, neutral = 0, pending = 0, move = 0) => [
    ...Array.from({ length: wins }, () => ({ score, outcome: "correct", signedMove: move })),
    ...Array.from({ length: losses }, () => ({ score, outcome: "wrong", signedMove: -move })),
    ...Array.from({ length: neutral }, () => ({ score, outcome: "neutral", signedMove: 0.2 })),
    ...Array.from({ length: pending }, () => ({ score, outcome: "pending", signedMove: null })),
  ];

  it("reports labelled, wins, losses and neutral separately from all signals", () => {
    const top = computeCalibration(rows(80, 3, 2, 4, 16)).buckets.find((b) => b.band === "75–100")!;
    expect(top).toMatchObject({ cases: 25, labelled: 5, wins: 3, losses: 2, neutral: 4, hitRate: 60, smallSample: true });
  });

  it("averages the signed 24h move over measured rows and subtracts the assumed cost", () => {
    const b = computeCalibration([
      { score: 65, outcome: "correct", signedMove: 3 }, { score: 65, outcome: "wrong", signedMove: -1.5 },
      { score: 65, outcome: "neutral", signedMove: 0.3 }, { score: 65, outcome: "pending", signedMove: null },
      { score: 65, outcome: "correct", signedMove: 500 },
    ]).buckets.find((x) => x.band === "60–74")!;
    expect(b.measured).toBe(3); // the 500% bad print is ignored
    expect(b.avgSignedMove).toBe(0.6);
    expect(b.avgSignedMoveAfterCost).toBe(Math.round((0.6 - ASSUMED_ROUND_TRIP_COST_PCT) * 100) / 100);
  });

  it("warns on drift only when both bands have enough labelled verdicts", () => {
    const thin = computeCalibration([...rows(65, 40, 40), ...rows(80, 2, 9, 0, 14)]);
    expect(thin.drift).toEqual([]); // 25 signals but only 11 labelled in the top band
    const n = MIN_LABELLED_FOR_COMPARISON;
    const thick = computeCalibration([...rows(65, n, n), ...rows(80, Math.floor(n / 2), n)]);
    expect(thick.drift).toEqual([{ from: "60–74", to: "75–100", delta: -16.7, fromLabelled: 2 * n, toLabelled: n + Math.floor(n / 2) }]);
  });
});

describe("GET /api/admin/model-diagnostics", () => {
  it("reports a database failure as unavailable without counts or raw error text", async () => {
    m.fail = true;
    const response = await GET(new NextRequest('http://localhost/api/admin/model-diagnostics'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.totalSignals).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('private database');
  });
  it("returns the sample definition, labelling rule, cost basis and legacy score-0 note", async () => {
    m.signals = [
      { score: 0, outcome: "correct", signedMove: 2, signal_at: "2026-09-27T10:00:00Z" },
      { score: 70, outcome: "wrong", signedMove: -1.4, signal_at: "2026-10-08T10:00:00Z" },
    ];
    const body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics"))).json();
    const sigSql = m.sql.find((x) => /FROM ai_signal_log/.test(x) && /AS score/.test(x))!;
    expect(sigSql).toMatch(/outcome_measured_at >= \$2::timestamptz\s+THEN \(CASE WHEN UPPER\(trade_bias\) = 'SHORT' THEN -pct_move_24h ELSE pct_move_24h END\) ELSE NULL END AS "signedMove"/);
    expect(body.definition).toMatchObject({
      sampleFrom: "2026-09-27T10:00:00.000Z", sampleTo: "2026-10-08T10:00:00.000Z",
      labelledSince: LABELLER_FIX_AT, minLabelledForComparison: MIN_LABELLED_FOR_COMPARISON, zeroScoreSignals: 1,
    });
    expect(body.definition.label).toMatch(/First completed close at or after 24h.*correct >= \+1%.*wrong <= -1%/);
    expect(body.definition.costs).toMatch(/before costs.*assumed 0.2% round trip/);
    expect(body.definition.zeroScoreNote).toMatch(/recorded score of 0, not a missing value/);
    expect(body.buckets.find((b: { band: string }) => b.band === "60–74")).toMatchObject({ labelled: 1, losses: 1, avgSignedMove: -1.4 });
  });


  it("queries ai_signal_log for the operator workspace, gated by the labeller fix date", async () => {
    m.signals = [{ score: 80, outcome: "correct" }, { score: 65, outcome: "wrong" }, { score: 50, outcome: "pending" }];
    m.old = 4;
    const body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics"))).json();
    const all = m.sql.join("\n");
    expect(all).not.toMatch(/signal_outcomes|signals_outcomes/);
    expect(all).toMatch(/confluence_score AS score/);
    expect(all).not.toMatch(/admin_research_cases/);
    expect(all).toMatch(/outcome_measured_at/);
    const sigParams = m.params[m.sql.findIndex((s) => /FROM ai_signal_log/.test(s))];
    expect(sigParams).toEqual(["operator-terminal", LABELLER_FIX_AT]);
    expect(body.totalSignals).toBe(3); // signals only — research cases no longer pad the counts
    expect(body.scoreField).toBe("confluence");
    expect(body.totalLabelled).toBe(2);
    expect(body.overallHitRate).toBe(50);
    expect(body.sources.oldMethodLabelled).toBe(4);
    expect(body.note).toMatch(/old labelling method/);
    expect(body.note).toMatch(/across all workspace history, not just this sample/);
  });

  it("explains an empty hit rate when nothing is labelled by the fixed labeller yet", async () => {
    m.signals = [{ score: 80, outcome: null }];
    const body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics"))).json();
    expect(body.totalLabelled).toBe(0);
    expect(body.note).toMatch(/fixed labeller/);
  });

  it("buckets on elite_score (rounded) or confidence when asked, and ignores unknown score names", async () => {
    m.signals = [{ score: 80, outcome: "correct" }];
    let body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics?score=elite"))).json();
    expect(m.sql.join("\n")).toMatch(/ROUND\(elite_score\) AS score/);
    expect(m.sql.join("\n")).toMatch(/elite_score IS NOT NULL/);
    expect(body.scoreField).toBe("elite");
    m.sql = [];
    body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics?score=confidence"))).json();
    expect(m.sql.join("\n")).toMatch(/confidence AS score/);
    m.sql = [];
    body = await (await GET(new NextRequest("http://localhost/api/admin/model-diagnostics?score=1;DROP"))).json();
    expect(body.scoreField).toBe("confluence");
    expect(m.sql.join("\n")).not.toMatch(/DROP/);
  });
});
