"use client";

/**
 * /admin/portfolio-lab/analytics
 *
 * ARCA Quant Cockpit. Dense, evidence-rich analytics over the SIMULATED
 * paper portfolio. Powered by /api/admin/portfolio-lab/analytics, which
 * runs the pure-math `analyticsEngine` against snapshots + trades +
 * positions + benchmark.
 *
 * Sections:
 *   - Headline (CAGR, Sharpe, Sortino, Calmar, Ulcer, Pain, drawdown)
 *   - Open-book stress (if-all-stops, if-all-TP1, concentration)
 *   - Trade quality + R-distribution histogram (SVG)
 *   - Kelly overall + per-playbook (capped recommendation)
 *   - Risk-of-ruin estimate
 *   - Confidence calibration (observed vs expected, SVG)
 *   - Exit reasons + holding periods
 *   - Benchmark (β, R², IR, up/down capture, excess CAGR)
 *   - Rolling drawdown + 30d Sharpe (SVG)
 *   - Daily P&L stats, streaks
 *
 * SIMULATED only. No broker integration. No live execution path.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

interface KellyResult {
  trades: number;
  winRate: number | null;
  payoffRatio: number | null;
  kellyFraction: number | null;
  cappedFractionPct: number;
  recommendation: string;
}
interface PerPlaybookKelly extends KellyResult {
  playbookId: string;
  totalPnl: number;
  avgWinR: number | null;
  avgLossR: number | null;
}
interface RBin {
  bin: string;
  count: number;
  sumPnl: number;
}
interface CalibrationBucket {
  bucket: string;
  midpoint: number;
  trades: number;
  wins: number;
  losses: number;
  observedWinRatePct: number | null;
  expectedWinRatePct: number;
  deltaPct: number | null;
}
interface ExitReason {
  reason: string;
  count: number;
  pnl: number;
  avgR: number | null;
}
interface BenchmarkMetrics {
  symbol: string;
  pairs: number;
  beta: number | null;
  r2: number | null;
  trackingErrorPctAnn: number | null;
  informationRatio: number | null;
  upCapture: number | null;
  downCapture: number | null;
  arcaCagrPct: number | null;
  benchmarkCagrPct: number | null;
  excessCagrPct: number | null;
}
interface RollingPoint {
  date: string;
  equity: number;
  drawdownPct: number;
  rollingSharpe: number | null;
}
interface SymbolStats {
  positionId: string;
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  notional: number;
  observations: number;
  meanReturnPct: number | null;
  volatilityPct: number | null;
}
interface PairResult {
  symbolA: string;
  symbolB: string;
  positionIdA: string;
  positionIdB: string;
  pearson: number | null;
  paired: number;
  concentrationScore: number | null;
  flag: "concentrated" | "hedged" | "diversified" | "neutral" | "insufficient";
}
interface CorrelationResult {
  asOf: string;
  symbols: SymbolStats[];
  matrix: (number | null)[][];
  pairs: PairResult[];
  topAbs: PairResult[];
  averagePairwise: number | null;
  effectiveN: number | null;
  portfolioConcentration: number | null;
  warnings: string[];
}

interface MonteCarloEnvelopePoint {
  step: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
}
interface MonteCarloResult {
  config: {
    trials: number;
    horizon: number;
    startingEquity: number;
    riskPerTradePct: number;
    ruinDrawdownPct: number;
    rMultiplesCount: number;
    seed: number;
  };
  empirical: {
    avgR: number | null;
    expectancyPerTradeDollars: number | null;
    expectedTerminalEquity: number | null;
  };
  terminalEquity: {
    p5: number; p25: number; p50: number; p75: number; p95: number;
    mean: number; std: number; min: number; max: number;
  };
  totalReturnPct: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number };
  maxDrawdownPct: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number; worst: number };
  probabilityOfProfit: number;
  probabilityOfRuin: number;
  expectedShortfallPct: number | null;
  envelope: MonteCarloEnvelopePoint[];
  samplePaths: number[][];
  warnings: string[];
}

interface Analytics {
  asOf: string;
  daysActive: number;
  headline: {
    totalReturnPct: number;
    cagrPct: number | null;
    sharpe: number | null;
    sortino: number | null;
    calmar: number | null;
    ulcerIndex: number | null;
    painRatio: number | null;
    maxDrawdownPct: number;
    currentDrawdownPct: number;
    annualisedVolPct: number | null;
    daysActive: number;
    basedOnSnapshotDays: number;
  };
  daily: {
    bestDayPct: number | null;
    worstDayPct: number | null;
    avgUpDayPct: number | null;
    avgDownDayPct: number | null;
    positiveDayPct: number | null;
    dayCount: number;
  };
  tradeQuality: {
    closedTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRatePct: number | null;
    avgWinR: number | null;
    avgLossR: number | null;
    avgR: number | null;
    expectancyR: number | null;
    expectancyCi95R: [number, number] | null;
    payoffRatio: number | null;
    profitFactor: number | null;
    largestWin: number;
    largestLoss: number;
  };
  rDistribution: RBin[];
  exitReasons: ExitReason[];
  holdingPeriods: {
    winnersHours: number | null;
    losersHours: number | null;
    breakevenHours: number | null;
    overallHours: number | null;
  };
  kelly: { overall: KellyResult; byPlaybook: PerPlaybookKelly[] };
  riskOfRuin: { estimatePct: number; method: string; edgePerR: number | null; bankrollInR: number };
  calibration: CalibrationBucket[];
  stress: {
    openPositions: number;
    openRiskDollars: number;
    openRiskPct: number;
    totalNotional: number;
    notionalByClass: Record<string, number>;
    notionalPctByClass: Record<string, number>;
    maxSinglePositionPctOfEquity: number;
    top3ConcentrationPctOfEquity: number;
    ifAllStopsHitDollars: number;
    ifAllTp1HitDollars: number;
    netPlannedRR: number | null;
  };
  benchmark: BenchmarkMetrics | null;
  rolling: { window: number; series: RollingPoint[] };
  streaks: {
    longestWin: number;
    longestLoss: number;
    currentWin: number;
    currentLoss: number;
    longestProfitableSession: number;
    longestLosingSession: number;
  };
  health: { sufficientTrades: boolean; sufficientSnapshots: boolean; benchmarkAligned: boolean; warnings: string[] };
}

export default function PortfolioLabAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [meta, setMeta] = useState<{ source: string; freshness: string; confidence: string; reason: string; fetchedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monte Carlo state
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [mcMeta, setMcMeta] = useState<{ confidence: string; reason: string } | null>(null);
  const [mcLoading, setMcLoading] = useState(false);
  const [mcError, setMcError] = useState<string | null>(null);
  const [mcTrials, setMcTrials] = useState(2000);
  const [mcHorizon, setMcHorizon] = useState(100);
  const [mcRuinPct, setMcRuinPct] = useState(50);
  const [mcSeed, setMcSeed] = useState<number>(0xC0FFEE);

  // Correlation state
  const [corr, setCorr] = useState<CorrelationResult | null>(null);
  const [corrMeta, setCorrMeta] = useState<{ confidence: string; reason: string } | null>(null);
  const [corrLoading, setCorrLoading] = useState(false);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [corrLookback, setCorrLookback] = useState(90);
  const [corrMinPaired, setCorrMinPaired] = useState(10);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/portfolio-lab/analytics", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const a = j?.data?.analytics as Analytics | null;
      setData(a);
      setMeta({
        source: j?.source ?? "?",
        freshness: j?.freshness ?? "?",
        confidence: j?.confidence ?? "?",
        reason: j?.confidenceReason ?? "",
        fetchedAt: j?.fetchedAt ?? "",
      });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runMc = useCallback(async (opts?: { seed?: number }) => {
    setMcLoading(true); setMcError(null);
    try {
      const params = new URLSearchParams({
        trials: String(mcTrials),
        horizon: String(mcHorizon),
        ruinPct: String(mcRuinPct),
        seed: String(opts?.seed ?? mcSeed),
      });
      const r = await fetch(`/api/admin/portfolio-lab/monte-carlo?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMc((j?.data?.monteCarlo ?? null) as MonteCarloResult | null);
      setMcMeta({ confidence: j?.confidence ?? "?", reason: j?.confidenceReason ?? "" });
    } catch (e) { setMcError(e instanceof Error ? e.message : String(e)); }
    finally { setMcLoading(false); }
  }, [mcTrials, mcHorizon, mcRuinPct, mcSeed]);

  // Auto-run MC the first time analytics finishes loading and has trades.
  useEffect(() => {
    if (data && data.tradeQuality.closedTrades > 0 && !mc && !mcLoading) {
      void runMc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const runCorr = useCallback(async () => {
    setCorrLoading(true); setCorrError(null);
    try {
      const params = new URLSearchParams({
        lookbackDays: String(corrLookback),
        minPaired: String(corrMinPaired),
      });
      const r = await fetch(`/api/admin/portfolio-lab/correlation?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setCorr((j?.data?.correlation ?? null) as CorrelationResult | null);
      setCorrMeta({ confidence: j?.confidence ?? "?", reason: j?.confidenceReason ?? "" });
    } catch (e) { setCorrError(e instanceof Error ? e.message : String(e)); }
    finally { setCorrLoading(false); }
  }, [corrLookback, corrMinPaired]);

  // Auto-run correlation the first time analytics arrives and there are open positions.
  useEffect(() => {
    if (data && data.stress.openPositions > 0 && !corr && !corrLoading) {
      void runCorr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const reseedAndRun = () => {
    const next = (Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
    setMcSeed(next);
    void runMc({ seed: next });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <Header meta={meta} onReload={load} loading={loading} health={data?.health} />
        {error && <div style={errBox}>Error: {error}</div>}
        {!data ? (
          <div style={emptyBox}>{loading ? "Computing analytics…" : "No analytics available. Initialise the ARCA portfolio and run a sim cycle first."}</div>
        ) : (
          <>
            <Headline a={data} />
            <Stress a={data} />
            <TradeQualityRow a={data} />
            <KellySection a={data} />
            <RiskOfRuinAndCalibration a={data} />
            <ExitsAndHolding a={data} />
            {data.benchmark && data.benchmark.pairs >= 2 && <BenchmarkRow a={data} />}
            <Rolling a={data} />
            <MonteCarloSection
              mc={mc}
              meta={mcMeta}
              loading={mcLoading}
              error={mcError}
              trials={mcTrials} setTrials={setMcTrials}
              horizon={mcHorizon} setHorizon={setMcHorizon}
              ruinPct={mcRuinPct} setRuinPct={setMcRuinPct}
              seed={mcSeed}
              run={() => runMc()}
              reseed={reseedAndRun}
              closedTrades={data.tradeQuality.closedTrades}
            />
            <CorrelationSection
              corr={corr}
              meta={corrMeta}
              loading={corrLoading}
              error={corrError}
              lookback={corrLookback} setLookback={setCorrLookback}
              minPaired={corrMinPaired} setMinPaired={setCorrMinPaired}
              run={runCorr}
              openPositions={data.stress.openPositions}
            />
            <DailyAndStreaks a={data} />
            <HealthWarnings a={data} />
            <Disclaimer />
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════ Header ════════════════ */

function Header({
  meta,
  onReload,
  loading,
  health,
}: {
  meta: { source: string; freshness: string; confidence: string; reason: string; fetchedAt: string } | null;
  onReload: () => void;
  loading: boolean;
  health?: Analytics["health"];
}) {
  const healthTone = !health
    ? "#64748B"
    : health.warnings.length === 0
    ? "#10B981"
    : health.warnings.length <= 2
    ? "#FACC15"
    : "#F87171";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
      <div>
        <div style={crumb}>SIMULATED · NO BROKER · ANALYTICS LAYER</div>
        <h1 style={{ fontSize: 24, color: "#F8FAFC", margin: "4px 0" }}>ARCA Quant Cockpit</h1>
        <div style={{ fontSize: 12, color: "#64748B" }}>
          {meta ? `${meta.source} · ${meta.freshness} · confidence ${meta.confidence}` : "—"}
          {meta?.fetchedAt ? ` · ${new Date(meta.fetchedAt).toLocaleTimeString()}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {health && (
          <span title={health.warnings.join(" ") || "All checks green"} style={{ ...pill, background: "#0B1220", border: `1px solid ${healthTone}55`, color: healthTone }}>
            {health.warnings.length === 0 ? "data: green" : `data: ${health.warnings.length} warning${health.warnings.length === 1 ? "" : "s"}`}
          </span>
        )}
        <button onClick={onReload} disabled={loading} style={btnGhost}>{loading ? "…" : "Reload"}</button>
      </div>
    </div>
  );
}

/* ════════════════ Headline (8 KPIs) ════════════════ */

function Headline({ a }: { a: Analytics }) {
  const h = a.headline;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, marginBottom: 12 }}>
      <Kpi label="Total Return" value={pct(h.totalReturnPct)} tone={h.totalReturnPct >= 0 ? "good" : "bad"} sub={`day ${h.daysActive}`} />
      <Kpi label="CAGR" value={h.cagrPct == null ? "—" : pct(h.cagrPct)} tone={h.cagrPct != null && h.cagrPct >= 0 ? "good" : "bad"} sub="annualised" />
      <Kpi label="Sharpe" value={fmtNum(h.sharpe, 2)} tone={ratioTone(h.sharpe, 1)} sub={h.annualisedVolPct != null ? `vol ${h.annualisedVolPct.toFixed(1)}%` : ""} />
      <Kpi label="Sortino" value={fmtNum(h.sortino, 2)} tone={ratioTone(h.sortino, 1)} sub="downside only" />
      <Kpi label="Calmar" value={fmtNum(h.calmar, 2)} tone={ratioTone(h.calmar, 1)} sub="CAGR / maxDD" />
      <Kpi label="Ulcer" value={fmtNum(h.ulcerIndex, 2)} tone={h.ulcerIndex == null ? undefined : h.ulcerIndex < 3 ? "good" : h.ulcerIndex < 7 ? undefined : "bad"} sub="dd index" />
      <Kpi label="Pain Ratio" value={fmtNum(h.painRatio, 2)} tone={ratioTone(h.painRatio, 1)} sub="return / ulcer" />
      <Kpi label="Drawdown" value={pct(-h.currentDrawdownPct)} tone="bad" sub={`max ${h.maxDrawdownPct.toFixed(2)}%`} />
    </div>
  );
}

/* ════════════════ Stress (open book) ════════════════ */

function Stress({ a }: { a: Analytics }) {
  const s = a.stress;
  if (s.openPositions === 0) {
    return (
      <Section title="Open-Book Stress">
        <Empty text="No open positions." />
      </Section>
    );
  }
  return (
    <Section title="Open-Book Stress · what happens if every level hits today">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 10 }}>
        <Kpi label="Open Positions" value={String(s.openPositions)} />
        <Kpi label="If All Stops Hit" value={fmtUsd(s.ifAllStopsHitDollars)} tone="bad" />
        <Kpi label="If All TP1 Hit" value={fmtUsd(s.ifAllTp1HitDollars)} tone="good" />
        <Kpi label="Net Planned R:R" value={fmtNum(s.netPlannedRR, 2)} tone={ratioTone(s.netPlannedRR, 1)} sub="reward / risk" />
        <Kpi label="Open Risk" value={s.openRiskPct.toFixed(2) + "%"} sub={fmtUsd(s.openRiskDollars)} />
        <Kpi label="Top-3 Concentration" value={s.top3ConcentrationPctOfEquity.toFixed(1) + "%"} sub={`max single ${s.maxSinglePositionPctOfEquity.toFixed(1)}%`} />
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Asset class</th>
            <th style={thR}>Notional</th>
            <th style={thR}>% of equity</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(s.notionalByClass).map(([cls, notional]) => (
            <tr key={cls} style={trDiv}>
              <td style={td}>{cls}</td>
              <td style={tdR}>{fmtUsd(notional)}</td>
              <td style={tdR}>{(s.notionalPctByClass[cls] ?? 0).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/* ════════════════ Trade Quality + R distribution ════════════════ */

function TradeQualityRow({ a }: { a: Analytics }) {
  const tq = a.tradeQuality;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
      <div style={panel}>
        <SectionHeader title={`Trade Quality (${tq.closedTrades} closed)`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <Kpi label="Win Rate" value={tq.winRatePct == null ? "—" : tq.winRatePct.toFixed(1) + "%"} sub={`${tq.wins} W / ${tq.losses} L`} />
          <Kpi
            label="Expectancy"
            value={tq.expectancyR == null ? "—" : tq.expectancyR.toFixed(2) + "R"}
            sub={tq.expectancyCi95R ? `95% CI [${tq.expectancyCi95R[0]}, ${tq.expectancyCi95R[1]}]` : "—"}
            tone={tq.expectancyR == null ? undefined : tq.expectancyR > 0 ? "good" : "bad"}
          />
          <Kpi label="Payoff" value={fmtNum(tq.payoffRatio, 2)} sub="avgWin / |avgLoss|" />
          <Kpi label="Profit Factor" value={fmtNum(tq.profitFactor, 2)} tone={ratioTone(tq.profitFactor, 1.5)} sub="gross / |loss|" />
          <Kpi label="Avg Win R" value={fmtNum(tq.avgWinR, 2)} sub={tq.avgWinR == null ? "" : tq.avgWinR.toFixed(2) + "R"} />
          <Kpi label="Avg Loss R" value={fmtNum(tq.avgLossR, 2)} sub={tq.avgLossR == null ? "" : tq.avgLossR.toFixed(2) + "R"} />
          <Kpi label="Largest Win" value={fmtUsd(tq.largestWin)} tone="good" />
          <Kpi label="Largest Loss" value={fmtUsd(tq.largestLoss)} tone="bad" />
        </div>
      </div>
      <div style={panel}>
        <SectionHeader title="R-Multiple Distribution" />
        <RDistChart bins={a.rDistribution} />
      </div>
    </div>
  );
}

function RDistChart({ bins }: { bins: RBin[] }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const w = 600;
  const h = 180;
  const padding = 24;
  const barW = (w - padding * 2) / bins.length - 6;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
      {/* zero baseline */}
      <line x1={padding} x2={w - padding} y1={h - padding} y2={h - padding} stroke="#334155" strokeWidth={1} />
      {bins.map((b, i) => {
        const x = padding + i * ((w - padding * 2) / bins.length) + 3;
        const barH = (b.count / max) * (h - padding * 2);
        const y = h - padding - barH;
        const isWin = b.bin.startsWith("[") && b.bin.includes("R,") && !b.bin.startsWith("[-") ? true : b.bin === "≥3R";
        const color = b.bin.startsWith("<") || b.bin.startsWith("[-") ? "#F87171" : b.bin === "[0,1R)" ? "#94A3B8" : "#10B981";
        return (
          <g key={b.bin}>
            <rect x={x} y={y} width={barW} height={Math.max(0, barH)} fill={color} opacity={0.85} />
            {b.count > 0 && (
              <text x={x + barW / 2} y={y - 4} fontSize="10" fill="#E2E8F0" textAnchor="middle">{b.count}</text>
            )}
            <text x={x + barW / 2} y={h - padding + 12} fontSize="9" fill="#94A3B8" textAnchor="middle">{b.bin}</text>
            {isWin && false /* unused */}
          </g>
        );
      })}
    </svg>
  );
}

/* ════════════════ Kelly ════════════════ */

function KellySection({ a }: { a: Analytics }) {
  const k = a.kelly.overall;
  return (
    <div style={panel}>
      <SectionHeader title="Kelly Sizing — overall + per playbook (capped at maxSingleTradeRiskPct)" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 8, padding: 12 }}>
          <div style={subhead}>Overall</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
            <Tile label="Trades" value={String(k.trades)} />
            <Tile label="Win rate" value={k.winRate == null ? "—" : (k.winRate * 100).toFixed(1) + "%"} />
            <Tile label="Payoff" value={fmtNum(k.payoffRatio, 2)} />
            <Tile label="Kelly fraction" value={k.kellyFraction == null ? "—" : (k.kellyFraction * 100).toFixed(2) + "%"} tone={k.kellyFraction != null && k.kellyFraction > 0 ? "good" : "bad"} />
            <Tile label="Capped size" value={k.cappedFractionPct.toFixed(2) + "%"} tone={k.cappedFractionPct > 0 ? "good" : "bad"} />
            <Tile label="½-Kelly" value={k.kellyFraction != null && k.kellyFraction > 0 ? ((k.kellyFraction / 2) * 100).toFixed(2) + "%" : "—"} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>{k.recommendation}</div>
        </div>
        <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 8, padding: 4 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Playbook</th>
                <th style={thR}>Trades</th>
                <th style={thR}>WinRate</th>
                <th style={thR}>Payoff</th>
                <th style={thR}>Kelly %</th>
                <th style={thR}>Capped %</th>
                <th style={thR}>Total P&L</th>
                <th style={th}>Rec</th>
              </tr>
            </thead>
            <tbody>
              {a.kelly.byPlaybook.map((p) => (
                <tr key={p.playbookId} style={trDiv}>
                  <td style={td}><strong style={{ color: "#F8FAFC" }}>{p.playbookId}</strong></td>
                  <td style={tdR}>{p.trades}</td>
                  <td style={tdR}>{p.winRate == null ? "—" : (p.winRate * 100).toFixed(1) + "%"}</td>
                  <td style={tdR}>{fmtNum(p.payoffRatio, 2)}</td>
                  <td style={{ ...tdR, color: p.kellyFraction != null && p.kellyFraction > 0 ? "#10B981" : "#F87171" }}>
                    {p.kellyFraction == null ? "—" : (p.kellyFraction * 100).toFixed(2) + "%"}
                  </td>
                  <td style={tdR}>{p.cappedFractionPct.toFixed(2) + "%"}</td>
                  <td style={{ ...tdR, color: p.totalPnl >= 0 ? "#10B981" : "#F87171" }}>{fmtUsd(p.totalPnl)}</td>
                  <td style={{ ...td, fontSize: 11, color: "#94A3B8", maxWidth: 220 }}>{p.recommendation}</td>
                </tr>
              ))}
              {a.kelly.byPlaybook.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, color: "#64748B", textAlign: "center", padding: 12 }}>No closed trades yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Risk of Ruin + Calibration ════════════════ */

function RiskOfRuinAndCalibration({ a }: { a: Analytics }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginTop: 12, marginBottom: 12 }}>
      <div style={panel}>
        <SectionHeader title="Risk of Ruin (estimate)" />
        <div style={{ fontSize: 36, fontWeight: 700, color: rorTone(a.riskOfRuin.estimatePct), margin: "4px 0 8px" }}>
          {a.riskOfRuin.estimatePct.toFixed(2)}%
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>
          {a.riskOfRuin.estimatePct >= 99
            ? "Edge is non-positive or insufficient. Do not size up."
            : a.riskOfRuin.estimatePct >= 25
            ? "Material ruin risk at current bankroll. Reduce risk-per-trade or improve edge."
            : a.riskOfRuin.estimatePct >= 5
            ? "Tolerable but watch playbook quality."
            : "Bankroll well-capitalised vs current edge."}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>
          edge per R: <strong>{fmtNum(a.riskOfRuin.edgePerR, 3)}</strong> · bankroll: <strong>{a.riskOfRuin.bankrollInR}R</strong> · method: {a.riskOfRuin.method}<br/>
          <em>Vince-style geometric approximation — directional, not a precise forecast.</em>
        </div>
      </div>
      <div style={panel}>
        <SectionHeader title={`Confidence Calibration — arca_confidence bucket vs observed win rate`} />
        {a.calibration.length === 0 ? (
          <Empty text="No decisive trades with a confidence score yet." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <CalibrationChart buckets={a.calibration} />
            <div style={{ overflow: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Bucket</th>
                    <th style={thR}>n</th>
                    <th style={thR}>Wins</th>
                    <th style={thR}>Obs %</th>
                    <th style={thR}>Δ vs mid</th>
                  </tr>
                </thead>
                <tbody>
                  {a.calibration.map((c) => (
                    <tr key={c.bucket} style={trDiv}>
                      <td style={td}>{c.bucket}</td>
                      <td style={tdR}>{c.trades}</td>
                      <td style={tdR}>{c.wins}</td>
                      <td style={tdR}>{c.observedWinRatePct == null ? "—" : c.observedWinRatePct.toFixed(1) + "%"}</td>
                      <td style={{ ...tdR, color: c.deltaPct == null ? "#94A3B8" : c.deltaPct >= 0 ? "#10B981" : "#F87171" }}>
                        {c.deltaPct == null ? "—" : (c.deltaPct >= 0 ? "+" : "") + c.deltaPct.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalibrationChart({ buckets }: { buckets: CalibrationBucket[] }) {
  const w = 360;
  const h = 220;
  const pad = 28;
  const xScale = (mid: number) => pad + (mid / 100) * (w - pad * 2);
  const yScale = (pct: number) => h - pad - (pct / 100) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
      {/* axes */}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#334155" />
      {/* diagonal = perfect calibration */}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={pad} stroke="#475569" strokeDasharray="4 4" />
      {/* points */}
      {buckets.map((b) => b.observedWinRatePct != null && (
        <g key={b.bucket}>
          <circle
            cx={xScale(b.midpoint)}
            cy={yScale(b.observedWinRatePct)}
            r={Math.max(3, Math.min(8, Math.sqrt(b.trades) * 1.5))}
            fill={b.deltaPct != null && b.deltaPct >= 0 ? "#10B981" : "#F87171"}
            opacity={0.85}
          />
        </g>
      ))}
      {/* labels */}
      <text x={pad} y={h - 6} fontSize="10" fill="#94A3B8">0%</text>
      <text x={w - pad - 24} y={h - 6} fontSize="10" fill="#94A3B8">100%</text>
      <text x={4} y={pad + 4} fontSize="10" fill="#94A3B8">100%</text>
      <text x={4} y={h - pad + 4} fontSize="10" fill="#94A3B8">0%</text>
      <text x={pad + 4} y={pad - 8} fontSize="10" fill="#64748B">observed win rate vs predicted (diagonal)</text>
    </svg>
  );
}

/* ════════════════ Exits + Holding ════════════════ */

function ExitsAndHolding({ a }: { a: Analytics }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
      <div style={panel}>
        <SectionHeader title="Exit Reason Breakdown" />
        {a.exitReasons.length === 0 ? (
          <Empty text="No closed trades yet." />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Reason</th>
                <th style={thR}>Count</th>
                <th style={thR}>Total P&L</th>
                <th style={thR}>Avg R</th>
              </tr>
            </thead>
            <tbody>
              {a.exitReasons.map((e) => (
                <tr key={e.reason} style={trDiv}>
                  <td style={td}>{e.reason}</td>
                  <td style={tdR}>{e.count}</td>
                  <td style={{ ...tdR, color: e.pnl >= 0 ? "#10B981" : "#F87171" }}>{fmtUsd(e.pnl)}</td>
                  <td style={{ ...tdR, color: e.avgR == null ? "#94A3B8" : e.avgR >= 0 ? "#10B981" : "#F87171" }}>
                    {e.avgR == null ? "—" : e.avgR.toFixed(2) + "R"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={panel}>
        <SectionHeader title="Holding Periods (avg hours)" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Tile label="Winners" value={fmtHours(a.holdingPeriods.winnersHours)} tone="good" />
          <Tile label="Losers" value={fmtHours(a.holdingPeriods.losersHours)} tone="bad" />
          <Tile label="Breakeven" value={fmtHours(a.holdingPeriods.breakevenHours)} />
          <Tile label="Overall" value={fmtHours(a.holdingPeriods.overallHours)} />
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#64748B" }}>
          Winners holding ≫ losers is a sign of a healthy "let winners run, cut losers fast" pattern.
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Benchmark ════════════════ */

function BenchmarkRow({ a }: { a: Analytics }) {
  const b = a.benchmark!;
  return (
    <div style={panel}>
      <SectionHeader title={`Benchmark vs ${b.symbol} — ${b.pairs} paired days`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        <Kpi label="β (beta)" value={fmtNum(b.beta, 2)} sub="cov/var" />
        <Kpi label="R²" value={fmtNum(b.r2, 3)} sub="fit" />
        <Kpi label="Information Ratio" value={fmtNum(b.informationRatio, 2)} tone={ratioTone(b.informationRatio, 0.5)} sub="excess / TE" />
        <Kpi label="Tracking Error" value={b.trackingErrorPctAnn == null ? "—" : b.trackingErrorPctAnn.toFixed(2) + "%"} sub="ann" />
        <Kpi label="Up-Capture" value={fmtNum(b.upCapture, 2)} tone={ratioTone(b.upCapture, 1)} sub="vs bench up days" />
        <Kpi label="Down-Capture" value={fmtNum(b.downCapture, 2)} tone={b.downCapture == null ? undefined : b.downCapture < 1 ? "good" : "bad"} sub="vs bench down days" />
        <Kpi label="Excess CAGR" value={b.excessCagrPct == null ? "—" : pct(b.excessCagrPct)} tone={b.excessCagrPct != null && b.excessCagrPct > 0 ? "good" : "bad"} sub={`bench ${fmtNum(b.benchmarkCagrPct, 1)}%`} />
      </div>
    </div>
  );
}

/* ════════════════ Rolling DD + Sharpe ════════════════ */

function Rolling({ a }: { a: Analytics }) {
  if (a.rolling.series.length < 2) {
    return (
      <Section title="Rolling Drawdown + 30d Sharpe">
        <Empty text="Not enough snapshots to draw rolling series." />
      </Section>
    );
  }
  return (
    <Section title={`Rolling Drawdown + ${a.rolling.window}d Sharpe`}>
      <RollingChart series={a.rolling.series} />
    </Section>
  );
}

function RollingChart({ series }: { series: RollingPoint[] }) {
  const w = 1200;
  const h = 240;
  const pad = 36;
  const dds = series.map((p) => p.drawdownPct);
  const sharpes = series.map((p) => p.rollingSharpe).filter((s): s is number => s != null);
  const maxDd = Math.max(0.0001, ...dds);
  const sharpeMax = Math.max(2, ...sharpes.map((s) => Math.abs(s)));
  const xScale = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2);
  const yDd = (v: number) => pad + (v / maxDd) * (h / 2 - pad);          // top half = DD (down is worse)
  const ySharpe = (v: number) => h - pad - ((v + sharpeMax) / (2 * sharpeMax)) * (h / 2 - pad); // bottom half
  const ddPath = series.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yDd(p.drawdownPct).toFixed(1)}`).join(" ");
  const sharpePath = series
    .map((p, i) => (p.rollingSharpe == null ? null : `${xScale(i).toFixed(1)},${ySharpe(p.rollingSharpe).toFixed(1)}`))
    .filter((s): s is string => s != null)
    .join(" L ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 280 }}>
      {/* mid divider */}
      <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} stroke="#334155" />
      {/* DD fill */}
      <path d={`${ddPath} L ${xScale(series.length - 1).toFixed(1)},${pad} L ${xScale(0).toFixed(1)},${pad} Z`} fill="#F87171" opacity={0.1} />
      <path d={ddPath} stroke="#F87171" strokeWidth={1.5} fill="none" />
      {/* Sharpe zero line */}
      <line x1={pad} x2={w - pad} y1={ySharpe(0)} y2={ySharpe(0)} stroke="#475569" strokeDasharray="3 3" />
      {sharpePath && <path d={`M ${sharpePath}`} stroke="#10B981" strokeWidth={1.5} fill="none" />}
      {/* axis labels */}
      <text x={4} y={pad + 4} fontSize="10" fill="#94A3B8">DD: 0%</text>
      <text x={4} y={h / 2 - 4} fontSize="10" fill="#94A3B8">DD: {maxDd.toFixed(1)}%</text>
      <text x={4} y={h / 2 + 12} fontSize="10" fill="#94A3B8">Sharpe +{sharpeMax.toFixed(1)}</text>
      <text x={4} y={h - pad + 4} fontSize="10" fill="#94A3B8">Sharpe −{sharpeMax.toFixed(1)}</text>
      <text x={pad} y={h - 8} fontSize="10" fill="#64748B">{series[0]?.date} → {series[series.length - 1]?.date}</text>
    </svg>
  );
}

/* ════════════════ Monte Carlo ════════════════ */

interface MonteCarloSectionProps {
  mc: MonteCarloResult | null;
  meta: { confidence: string; reason: string } | null;
  loading: boolean;
  error: string | null;
  trials: number; setTrials: (n: number) => void;
  horizon: number; setHorizon: (n: number) => void;
  ruinPct: number; setRuinPct: (n: number) => void;
  seed: number;
  run: () => void;
  reseed: () => void;
  closedTrades: number;
}

function MonteCarloSection(p: MonteCarloSectionProps) {
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <SectionHeader title="Monte Carlo Equity Simulation — bootstrap from closed-trade R-multiples" />
          <div style={{ fontSize: 11, color: "#64748B", marginTop: -4 }}>
            {p.meta ? `confidence ${p.meta.confidence} · ${p.meta.reason}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <NumField label="trials" value={p.trials} step={500} min={100} max={5000} onChange={p.setTrials} />
          <NumField label="horizon" value={p.horizon} step={10} min={10} max={500} onChange={p.setHorizon} />
          <NumField label="ruin %" value={p.ruinPct} step={5} min={5} max={95} onChange={p.setRuinPct} />
          <span style={{ fontSize: 10, color: "#64748B" }}>seed {p.seed.toString(16)}</span>
          <button onClick={p.run} disabled={p.loading || p.closedTrades === 0} style={btnPrimary}>{p.loading ? "Simulating…" : "Run"}</button>
          <button onClick={p.reseed} disabled={p.loading || p.closedTrades === 0} style={btnGhost}>Reseed</button>
        </div>
      </div>

      {p.error && <div style={errBox}>Error: {p.error}</div>}

      {p.closedTrades === 0 ? (
        <Empty text="Close some sim trades first — the Monte Carlo bootstraps from realised R-multiples." />
      ) : !p.mc ? (
        <Empty text={p.loading ? "Running…" : "Click Run to project equity paths from current equity."} />
      ) : (
        <>
          {/* Headline cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 10 }}>
            <Tile label="Median terminal" value={fmtUsd(p.mc.terminalEquity.p50)} />
            <Tile
              label="P(profit)"
              value={(p.mc.probabilityOfProfit * 100).toFixed(1) + "%"}
              tone={p.mc.probabilityOfProfit >= 0.6 ? "good" : p.mc.probabilityOfProfit < 0.4 ? "bad" : undefined}
            />
            <Tile
              label={`P(ruin @ -${p.mc.config.ruinDrawdownPct}%)`}
              value={(p.mc.probabilityOfRuin * 100).toFixed(2) + "%"}
              tone={p.mc.probabilityOfRuin >= 0.25 ? "bad" : p.mc.probabilityOfRuin <= 0.05 ? "good" : undefined}
            />
            <Tile label="p95 max DD" value={p.mc.maxDrawdownPct.p95.toFixed(2) + "%"} tone="bad" />
            <Tile
              label="CVaR(95) return"
              value={p.mc.expectedShortfallPct == null ? "—" : pct(p.mc.expectedShortfallPct)}
              tone="bad"
            />
            <Tile label="p5 / p95 terminal" value={`${fmtUsd(p.mc.terminalEquity.p5)} / ${fmtUsd(p.mc.terminalEquity.p95)}`} />
          </div>

          {/* Distribution detail */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 8, padding: 10 }}>
              <div style={subhead}>Terminal Equity Distribution</div>
              <table style={{ ...tableStyle, marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={th}>Percentile</th>
                    <th style={thR}>Equity</th>
                    <th style={thR}>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["p5", p.mc.terminalEquity.p5, p.mc.totalReturnPct.p5],
                    ["p25", p.mc.terminalEquity.p25, p.mc.totalReturnPct.p25],
                    ["p50 (median)", p.mc.terminalEquity.p50, p.mc.totalReturnPct.p50],
                    ["mean", p.mc.terminalEquity.mean, p.mc.totalReturnPct.mean],
                    ["p75", p.mc.terminalEquity.p75, p.mc.totalReturnPct.p75],
                    ["p95", p.mc.terminalEquity.p95, p.mc.totalReturnPct.p95],
                  ] as Array<[string, number, number]>).map(([lbl, eq, ret]) => (
                    <tr key={lbl} style={trDiv}>
                      <td style={td}>{lbl}</td>
                      <td style={tdR}>{fmtUsd(eq)}</td>
                      <td style={{ ...tdR, color: ret >= 0 ? "#10B981" : "#F87171" }}>{pct(ret)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>
                empirical avg R: <strong>{fmtNum(p.mc.empirical.avgR, 3)}</strong>
                {p.mc.empirical.expectedTerminalEquity != null && (
                  <> · linear-expectancy reference: <strong>{fmtUsd(p.mc.empirical.expectedTerminalEquity)}</strong></>
                )}
              </div>
            </div>
            <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 8, padding: 10 }}>
              <div style={subhead}>Max Drawdown Distribution</div>
              <table style={{ ...tableStyle, marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={th}>Percentile</th>
                    <th style={thR}>Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["p5",  p.mc.maxDrawdownPct.p5],
                    ["p25", p.mc.maxDrawdownPct.p25],
                    ["p50 (median)", p.mc.maxDrawdownPct.p50],
                    ["mean", p.mc.maxDrawdownPct.mean],
                    ["p75", p.mc.maxDrawdownPct.p75],
                    ["p95", p.mc.maxDrawdownPct.p95],
                    ["worst case", p.mc.maxDrawdownPct.worst],
                  ] as Array<[string, number]>).map(([lbl, v]) => (
                    <tr key={lbl} style={trDiv}>
                      <td style={td}>{lbl}</td>
                      <td style={{ ...tdR, color: v >= 25 ? "#F87171" : v >= 10 ? "#FACC15" : "#10B981" }}>
                        {v.toFixed(2) + "%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>
                Plan around <strong>p95 max DD</strong> rather than the average — that's the drawdown a 1-in-20 path will visit.
              </div>
            </div>
          </div>

          {/* Envelope chart */}
          <div style={{ marginTop: 10 }}>
            <div style={subhead}>Equity Cone — {p.mc.config.trials} paths, {p.mc.config.horizon} trades, risk {p.mc.config.riskPerTradePct}% / trade</div>
            <MonteCarloChart mc={p.mc} />
          </div>

          {p.mc.warnings.length > 0 && (
            <div style={{ background: "#1F1208", border: "1px solid #92400E", color: "#FCD34D", padding: 10, borderRadius: 6, fontSize: 11, marginTop: 10 }}>
              <strong>MC data-health:</strong> {p.mc.warnings.join(" ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MonteCarloChart({ mc }: { mc: MonteCarloResult }) {
  const w = 1200;
  const h = 320;
  const pad = 48;
  if (mc.envelope.length < 2) return <Empty text="Envelope too short to chart." />;

  // Y range across the whole envelope + sample paths.
  let yMin = Infinity, yMax = -Infinity;
  for (const e of mc.envelope) {
    if (e.p5 < yMin) yMin = e.p5;
    if (e.p95 > yMax) yMax = e.p95;
  }
  for (const path of mc.samplePaths) {
    for (const v of path) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yScale = (v: number) => h - pad - ((v - yMin) / (yMax - yMin)) * (h - pad * 2);
  const xScaleE = (i: number) => pad + (i / (mc.envelope.length - 1)) * (w - pad * 2);
  const xScaleP = (i: number, len: number) => pad + (i / Math.max(1, len - 1)) * (w - pad * 2);

  const p95Path = mc.envelope.map((e, i) => `${i === 0 ? "M" : "L"}${xScaleE(i).toFixed(1)},${yScale(e.p95).toFixed(1)}`).join(" ");
  const p5Path  = mc.envelope.map((e, i) => `${xScaleE(i).toFixed(1)},${yScale(e.p5).toFixed(1)}`).reverse().join(" L ");
  const p75Path = mc.envelope.map((e, i) => `${i === 0 ? "M" : "L"}${xScaleE(i).toFixed(1)},${yScale(e.p75).toFixed(1)}`).join(" ");
  const p25Path = mc.envelope.map((e, i) => `${xScaleE(i).toFixed(1)},${yScale(e.p25).toFixed(1)}`).reverse().join(" L ");
  const medianPath = mc.envelope.map((e, i) => `${i === 0 ? "M" : "L"}${xScaleE(i).toFixed(1)},${yScale(e.p50).toFixed(1)}`).join(" ");
  const meanPath = mc.envelope.map((e, i) => `${i === 0 ? "M" : "L"}${xScaleE(i).toFixed(1)},${yScale(e.mean).toFixed(1)}`).join(" ");

  // baseline
  const startY = yScale(mc.config.startingEquity);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 360 }}>
      {/* p5..p95 shaded */}
      <path d={`${p95Path} L ${p5Path} Z`} fill="#60A5FA" opacity={0.12} />
      {/* p25..p75 shaded */}
      <path d={`${p75Path} L ${p25Path} Z`} fill="#60A5FA" opacity={0.22} />
      {/* sample paths */}
      {mc.samplePaths.map((path, i) => (
        <polyline
          key={i}
          points={path.map((v, j) => `${xScaleP(j, path.length).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="#94A3B8"
          strokeWidth={0.5}
          opacity={0.35}
        />
      ))}
      {/* mean (dashed) */}
      <path d={meanPath} stroke="#FACC15" strokeWidth={1.25} strokeDasharray="4 3" fill="none" />
      {/* median (solid) */}
      <path d={medianPath} stroke="#10B981" strokeWidth={2} fill="none" />
      {/* starting-equity baseline */}
      <line x1={pad} y1={startY} x2={w - pad} y2={startY} stroke="#475569" strokeDasharray="3 3" />
      {/* axes */}
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#334155" />
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" />
      {/* y labels */}
      <text x={4} y={pad + 4} fontSize="10" fill="#94A3B8">{fmtUsd(yMax)}</text>
      <text x={4} y={startY + 4} fontSize="10" fill="#94A3B8">{fmtUsd(mc.config.startingEquity)}</text>
      <text x={4} y={h - pad + 4} fontSize="10" fill="#94A3B8">{fmtUsd(yMin)}</text>
      {/* x labels */}
      <text x={pad} y={h - 16} fontSize="10" fill="#64748B">trade 0</text>
      <text x={w - pad - 50} y={h - 16} fontSize="10" fill="#64748B">trade {mc.config.horizon}</text>
      {/* legend */}
      <g transform={`translate(${pad + 8}, ${pad + 8})`}>
        <rect x={0} y={0} width={14} height={6} fill="#60A5FA" opacity={0.22} />
        <text x={20} y={6} fontSize="10" fill="#CBD5E1">p25–p75 band</text>
        <rect x={0} y={14} width={14} height={6} fill="#60A5FA" opacity={0.12} />
        <text x={20} y={20} fontSize="10" fill="#CBD5E1">p5–p95 band</text>
        <line x1={0} y1={32} x2={14} y2={32} stroke="#10B981" strokeWidth={2} />
        <text x={20} y={36} fontSize="10" fill="#CBD5E1">median</text>
        <line x1={0} y1={46} x2={14} y2={46} stroke="#FACC15" strokeDasharray="3 2" />
        <text x={20} y={50} fontSize="10" fill="#CBD5E1">mean</text>
        <line x1={0} y1={60} x2={14} y2={60} stroke="#475569" strokeDasharray="2 2" />
        <text x={20} y={64} fontSize="10" fill="#CBD5E1">start equity</text>
      </g>
    </svg>
  );
}

function NumField({ label, value, step, min, max, onChange }: { label: string; value: number; step: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94A3B8" }}>
      <span style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        style={{ width: 80, padding: "4px 6px", background: "#0B1220", color: "#F8FAFC", border: "1px solid #334155", borderRadius: 4, fontSize: 12 }}
      />
    </label>
  );
}

/* ════════════════ Correlation ════════════════ */

interface CorrelationSectionProps {
  corr: CorrelationResult | null;
  meta: { confidence: string; reason: string } | null;
  loading: boolean;
  error: string | null;
  lookback: number; setLookback: (n: number) => void;
  minPaired: number; setMinPaired: (n: number) => void;
  run: () => void;
  openPositions: number;
}

function CorrelationSection(p: CorrelationSectionProps) {
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div>
          <SectionHeader title="Open-Position Correlation Matrix — Pearson on daily returns" />
          <div style={{ fontSize: 11, color: "#64748B", marginTop: -4 }}>
            {p.meta ? `confidence ${p.meta.confidence} · ${p.meta.reason}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <NumField label="lookback d" value={p.lookback} step={15} min={10} max={365} onChange={p.setLookback} />
          <NumField label="min paired" value={p.minPaired} step={2} min={2} max={60} onChange={p.setMinPaired} />
          <button onClick={p.run} disabled={p.loading || p.openPositions < 2} style={btnPrimary}>{p.loading ? "Computing…" : "Recompute"}</button>
        </div>
      </div>

      {p.error && <div style={errBox}>Error: {p.error}</div>}

      {p.openPositions < 2 ? (
        <Empty text="Correlation requires at least 2 open positions." />
      ) : !p.corr ? (
        <Empty text={p.loading ? "Computing correlations…" : "Click Recompute."} />
      ) : (
        <>
          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
            <Tile
              label="Effective N"
              value={p.corr.effectiveN == null ? "—" : `${p.corr.effectiveN.toFixed(2)} / ${p.corr.symbols.length}`}
              tone={effNTone(p.corr.effectiveN, p.corr.symbols.length)}
            />
            <Tile
              label="Avg Pairwise r"
              value={p.corr.averagePairwise == null ? "—" : p.corr.averagePairwise.toFixed(3)}
              tone={p.corr.averagePairwise == null ? undefined : p.corr.averagePairwise >= 0.5 ? "bad" : p.corr.averagePairwise <= 0 ? "good" : undefined}
            />
            <Tile
              label="Directional Concentration"
              value={p.corr.portfolioConcentration == null ? "—" : p.corr.portfolioConcentration.toFixed(3)}
              tone={p.corr.portfolioConcentration == null ? undefined : p.corr.portfolioConcentration >= 0.4 ? "bad" : p.corr.portfolioConcentration <= 0 ? "good" : undefined}
            />
            <Tile
              label="Concentrated Pairs"
              value={String(p.corr.pairs.filter((x) => x.flag === "concentrated").length)}
              tone={p.corr.pairs.filter((x) => x.flag === "concentrated").length > 0 ? "bad" : "good"}
            />
          </div>

          {/* Two-column: heatmap + top pairs */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 8, padding: 10 }}>
              <div style={subhead}>Heatmap</div>
              <CorrelationHeatmap corr={p.corr} />
            </div>
            <div style={{ background: "#0B1220", border: "1px solid #1F2937", borderRadius: 8, padding: 10 }}>
              <div style={subhead}>Top |r| pairs</div>
              {p.corr.topAbs.length === 0 ? (
                <Empty text="No pair has enough data yet." />
              ) : (
                <table style={{ ...tableStyle, marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th style={th}>Pair</th>
                      <th style={thR}>r</th>
                      <th style={thR}>n</th>
                      <th style={th}>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.corr.topAbs.map((pair, i) => (
                      <tr key={i} style={trDiv}>
                        <td style={td}><strong>{pair.symbolA}</strong> ↔ <strong>{pair.symbolB}</strong></td>
                        <td style={{ ...tdR, color: corrTextColor(pair.pearson) }}>{pair.pearson == null ? "—" : pair.pearson.toFixed(3)}</td>
                        <td style={tdR}>{pair.paired}</td>
                        <td style={{ ...td, color: flagColor(pair.flag), fontSize: 11, fontWeight: 600 }}>{pair.flag}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>
                <strong>Flag legend:</strong><br/>
                <span style={{ color: "#F87171" }}>concentrated</span> — same effective bet (same side + r≥0.3, or opp side + r≤−0.3)<br/>
                <span style={{ color: "#FACC15" }}>hedged</span> — offsetting (opp side + r≥0.3)<br/>
                <span style={{ color: "#10B981" }}>diversified</span> — same side + r≤−0.3<br/>
                <span style={{ color: "#94A3B8" }}>neutral</span> — |r| &lt; 0.3
              </div>
            </div>
          </div>

          {/* Per-symbol stats */}
          <div style={{ marginTop: 10 }}>
            <div style={subhead}>Per-position daily-return stats</div>
            <table style={{ ...tableStyle, marginTop: 6 }}>
              <thead>
                <tr>
                  <th style={th}>Symbol</th>
                  <th style={th}>Class</th>
                  <th style={th}>Side</th>
                  <th style={thR}>Notional</th>
                  <th style={thR}>Obs</th>
                  <th style={thR}>μ daily</th>
                  <th style={thR}>σ daily</th>
                </tr>
              </thead>
              <tbody>
                {p.corr.symbols.map((s) => (
                  <tr key={s.positionId} style={trDiv}>
                    <td style={td}><strong>{s.symbol}</strong></td>
                    <td style={td}>{s.assetClass}</td>
                    <td style={{ ...td, color: s.side === "LONG" ? "#10B981" : "#F87171" }}>{s.side}</td>
                    <td style={tdR}>{fmtUsd(s.notional)}</td>
                    <td style={tdR}>{s.observations}</td>
                    <td style={{ ...tdR, color: s.meanReturnPct == null ? "#94A3B8" : s.meanReturnPct >= 0 ? "#10B981" : "#F87171" }}>
                      {s.meanReturnPct == null ? "—" : s.meanReturnPct.toFixed(3) + "%"}
                    </td>
                    <td style={tdR}>{s.volatilityPct == null ? "—" : s.volatilityPct.toFixed(3) + "%"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {p.corr.warnings.length > 0 && (
            <div style={{ background: "#1F1208", border: "1px solid #92400E", color: "#FCD34D", padding: 10, borderRadius: 6, fontSize: 11, marginTop: 10 }}>
              <strong>Correlation data-health:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {p.corr.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CorrelationHeatmap({ corr }: { corr: CorrelationResult }) {
  const n = corr.symbols.length;
  if (n < 2) return <Empty text="Need at least 2 positions." />;
  // Layout: square cells, with row + column labels.
  const labelW = 80;
  const cell = Math.max(28, Math.min(48, Math.floor(560 / n)));
  const gridW = labelW + cell * n + 20; // legend column on the right
  const gridH = labelW + cell * n + 30;
  return (
    <svg viewBox={`0 0 ${gridW} ${gridH}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", maxHeight: 560 }}>
      {/* column labels */}
      {corr.symbols.map((s, j) => (
        <text
          key={`col-${j}`}
          x={labelW + j * cell + cell / 2}
          y={labelW - 8}
          fontSize="10"
          fill="#CBD5E1"
          textAnchor="middle"
          transform={`rotate(-35, ${labelW + j * cell + cell / 2}, ${labelW - 8})`}
        >
          {s.symbol}
        </text>
      ))}
      {/* row labels + cells */}
      {corr.symbols.map((s, i) => (
        <g key={`row-${i}`}>
          <text
            x={labelW - 6}
            y={labelW + i * cell + cell / 2 + 3}
            fontSize="10"
            fill="#CBD5E1"
            textAnchor="end"
          >
            {s.symbol}
          </text>
          {corr.symbols.map((_, j) => {
            const v = corr.matrix[i][j];
            const fill = v == null ? "#1F2937" : cellColor(v);
            const x = labelW + j * cell;
            const y = labelW + i * cell;
            return (
              <g key={`${i}-${j}`}>
                <rect x={x} y={y} width={cell - 1} height={cell - 1} fill={fill} stroke="#0B1220" strokeWidth={0.5} />
                <text
                  x={x + cell / 2}
                  y={y + cell / 2 + 3}
                  fontSize={Math.max(8, Math.min(11, cell / 4))}
                  fill={v == null ? "#94A3B8" : cellTextColor(v)}
                  textAnchor="middle"
                >
                  {v == null ? "—" : v.toFixed(2)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {/* legend bar */}
      <g transform={`translate(${labelW}, ${labelW + n * cell + 8})`}>
        {Array.from({ length: 21 }).map((_, k) => {
          const v = -1 + (k / 20) * 2;
          return <rect key={k} x={k * 16} y={0} width={16} height={10} fill={cellColor(v)} />;
        })}
        <text x={0} y={26} fontSize="10" fill="#94A3B8">−1</text>
        <text x={150} y={26} fontSize="10" fill="#94A3B8" textAnchor="middle">0</text>
        <text x={320} y={26} fontSize="10" fill="#94A3B8" textAnchor="end">+1</text>
      </g>
    </svg>
  );
}

function cellColor(v: number): string {
  // Diverging red ↔ neutral ↔ green
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) {
    // 0 → #0B1220 (dark slate), 1 → #10B981 (emerald)
    const r = Math.round(0x0B + (0x10 - 0x0B) * t);
    const g = Math.round(0x12 + (0xB9 - 0x12) * t);
    const b = Math.round(0x20 + (0x81 - 0x20) * t);
    return `rgb(${r},${g},${b})`;
  }
  // 0 → dark slate, -1 → #F87171 (rose)
  const tn = -t;
  const r = Math.round(0x0B + (0xF8 - 0x0B) * tn);
  const g = Math.round(0x12 + (0x71 - 0x12) * tn);
  const b = Math.round(0x20 + (0x71 - 0x20) * tn);
  return `rgb(${r},${g},${b})`;
}
function cellTextColor(v: number): string {
  return Math.abs(v) > 0.45 ? "#0B1220" : "#E2E8F0";
}
function corrTextColor(v: number | null): string {
  if (v == null) return "#94A3B8";
  if (v >= 0.7) return "#F87171";
  if (v <= -0.7) return "#10B981";
  return "#E2E8F0";
}
function flagColor(flag: PairResult["flag"]): string {
  switch (flag) {
    case "concentrated": return "#F87171";
    case "hedged": return "#FACC15";
    case "diversified": return "#10B981";
    case "insufficient": return "#64748B";
    default: return "#94A3B8";
  }
}
function effNTone(eff: number | null, n: number): "good" | "bad" | undefined {
  if (eff == null) return undefined;
  if (n === 0) return undefined;
  const ratio = eff / n;
  if (ratio >= 0.8) return "good";
  if (ratio <= 0.4) return "bad";
  return undefined;
}

/* ════════════════ Daily + Streaks ════════════════ */

function DailyAndStreaks({ a }: { a: Analytics }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
      <div style={panel}>
        <SectionHeader title={`Daily P&L (${a.daily.dayCount} snapshot days)`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          <Tile label="Best Day" value={a.daily.bestDayPct == null ? "—" : pct(a.daily.bestDayPct)} tone="good" />
          <Tile label="Worst Day" value={a.daily.worstDayPct == null ? "—" : pct(a.daily.worstDayPct)} tone="bad" />
          <Tile label="Avg Up Day" value={a.daily.avgUpDayPct == null ? "—" : pct(a.daily.avgUpDayPct)} tone="good" />
          <Tile label="Avg Down Day" value={a.daily.avgDownDayPct == null ? "—" : pct(a.daily.avgDownDayPct)} tone="bad" />
          <Tile label="Positive Days" value={a.daily.positiveDayPct == null ? "—" : a.daily.positiveDayPct.toFixed(1) + "%"} />
        </div>
      </div>
      <div style={panel}>
        <SectionHeader title="Streaks" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <Tile label="Current Win Streak" value={String(a.streaks.currentWin)} tone="good" />
          <Tile label="Current Loss Streak" value={String(a.streaks.currentLoss)} tone="bad" />
          <Tile label="Longest Win" value={String(a.streaks.longestWin)} />
          <Tile label="Longest Loss" value={String(a.streaks.longestLoss)} />
          <Tile label="Best Up-Day Run" value={String(a.streaks.longestProfitableSession)} />
          <Tile label="Worst Down-Day Run" value={String(a.streaks.longestLosingSession)} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Health warnings ════════════════ */

function HealthWarnings({ a }: { a: Analytics }) {
  if (a.health.warnings.length === 0) return null;
  return (
    <div style={{ background: "#1F1208", border: "1px solid #92400E", color: "#FCD34D", padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
      <strong>Data-health notes:</strong>
      <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
        {a.health.warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    </div>
  );
}

function Disclaimer() {
  return (
    <div style={{ marginTop: 16, padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>
      ARCA Autonomous Portfolio Lab is admin-only SIMULATED paper trading. All metrics are computed from the internal
      ledger — no broker integration exists. Statistical scores are descriptive of paper performance only and do not
      constitute investment advice.
    </div>
  );
}

/* ════════════════ Primitives ════════════════ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={panel}>
      <SectionHeader title={title} />
      {children}
    </div>
  );
}
function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>{title}</div>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "#64748B", padding: 8 }}>{text}</div>;
}
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "#10B981" : tone === "bad" ? "#F87171" : "#F8FAFC";
  return (
    <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: c, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "#10B981" : tone === "bad" ? "#F87171" : "#F8FAFC";
  return (
    <div style={{ background: "#0F172A", border: "1px solid #1F2937", borderRadius: 6, padding: 8 }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: c, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ════════════════ formatting ════════════════ */

function pct(n: number): string {
  const s = n >= 0 ? "+" : "";
  return s + n.toFixed(2) + "%";
}
function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (v < 0 ? "−$" : "$") + formatted;
}
function fmtNum(n: number | null | undefined, decimals: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toFixed(decimals);
}
function fmtHours(n: number | null): string {
  if (n == null) return "—";
  if (n >= 48) return (n / 24).toFixed(1) + "d";
  return n.toFixed(1) + "h";
}
function ratioTone(v: number | null | undefined, target: number): "good" | "bad" | undefined {
  if (v == null) return undefined;
  if (v >= target) return "good";
  if (v < target * 0.5) return "bad";
  return undefined;
}
function rorTone(v: number): string {
  if (v >= 50) return "#F87171";
  if (v >= 10) return "#FACC15";
  return "#10B981";
}

/* ════════════════ styles ════════════════ */

const panel: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 14, marginBottom: 12 };
const crumb: React.CSSProperties = { fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" };
const subhead: React.CSSProperties = { fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #1F2937", color: "#64748B", fontWeight: 500, textAlign: "left" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "8px 10px", color: "#E2E8F0" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
const trDiv: React.CSSProperties = { borderTop: "1px solid #1F2937" };
const btnGhost: React.CSSProperties = { padding: "6px 12px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 12 };
const btnPrimary: React.CSSProperties = { padding: "6px 14px", background: "#10B981", color: "#0B1220", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const errBox: React.CSSProperties = { background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const emptyBox: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 };
const pill: React.CSSProperties = { padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600 };
