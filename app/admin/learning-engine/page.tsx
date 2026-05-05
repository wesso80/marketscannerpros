'use client';

/**
 * /admin/learning-engine — Phase 9 Elite Quant Dashboard.
 *
 * Terminal-grade view of the Brain Layer:
 *   1. Edge Health
 *   2. Setup Performance (sortable)
 *   3. Regime Matrix
 *   4. Symbol Reliability
 *   5. Data Quality Monitor
 *   6. ARCA Accuracy Monitor
 *   7. Edge Decay Monitor
 *
 * Design rules (per Phase 9 spec):
 *   - terminal-grade, no retail hype, no marketing copy
 *   - clean tables, sortable columns
 *   - source + timestamp visible everywhere
 *   - sample-size warnings obvious (n < 30 highlighted)
 *   - stale/simulated EXCLUDED counts shown explicitly
 */

import { useEffect, useMemo, useState } from 'react';

// ── Types (mirror of route response) ────────────────────────────────────────
interface EdgeHealth {
  totalSetupsTracked: number;
  cleanLabelledOutcomes: number;
  unresolvedOutcomes: number;
  excludedStaleSimulated: number;
  averageEdgeDecayRatio: number | null;
  setupsWithDecay: number;
  strongestRegimes: Array<{ regime: string; sampleSize: number; followThroughRate: number }>;
  weakestRegimes: Array<{ regime: string; sampleSize: number; followThroughRate: number }>;
}
interface SetupRow {
  setupKey: string; regime: string | null; horizon: string;
  sampleSize: number; followThroughRate: number | null;
  avgMfePct: number | null; avgMaePct: number | null;
  falsePositiveRate: number | null; trapRate: number | null;
  expectancyProxy: number | null;
  wilsonLower95: number | null; wilsonUpper95: number | null;
  edgeTier: string; confidenceLabel: string; computedAt: string;
}
interface MatrixCell {
  setupKey: string; regime: string;
  edgeScore: number; edgeTier: string; sampleSize: number; confidenceLabel: string;
}
interface SymbolRow {
  symbol: string; sampleSize: number;
  cleanFollowThroughRate: number | null;
  falsePositiveRate: number | null;
  trapRate: number | null;
  classification: 'reliable' | 'noisy' | 'inconclusive' | 'unproven';
}
interface DataQuality {
  providerStatus: Array<{ source: string; events: number; staleCount: number; simulatedCount: number; lastSeen: string | null }>;
  staleEvents: number;
  simulatedEvents: number;
  missingFeatureBuckets: { options: number; derivatives: number; macro: number };
  cachedVsLiveRatio: { live: number; delayed: number; stale: number; simulated: number; unknown: number };
  providerFailures24h: Array<{ source: string; ts: string; reason: string }>;
}
interface ArcaAccuracy {
  verdictsIssued: number; verdictsDowngraded: number;
  overconfidenceCaught: number; missingSectionWarnings: number; sampleSizeWarnings: number;
  followThroughAfterVerdict: { sample: number; followedThrough: number | null };
}
interface DecayRow {
  setupKey: string; regime: string | null; horizon: string;
  edgeDecayScore: number | null; recentVsBaselineRatio: number | null;
  reason: string | null; sampleSize: number; computedAt: string;
}
interface DashboardResponse {
  generatedAt: string; windowDays: number;
  edgeHealth: EdgeHealth;
  setupPerformance: SetupRow[];
  regimeMatrix: { setupKeys: string[]; regimes: string[]; cells: MatrixCell[] };
  symbolReliability: { bestFollowThrough: SymbolRow[]; worstFalsePositive: SymbolRow[]; noisyOrInconclusive: SymbolRow[] };
  dataQuality: DataQuality;
  arcaAccuracy: ArcaAccuracy;
  edgeDecay: DecayRow[];
}

// ── Style tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0B1220',
  panel: '#0F172A',
  border: '#1F2937',
  text: '#E5E7EB',
  textDim: '#9CA3AF',
  accent: '#10B981',
  warn: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
};

const TIER_COLOR: Record<string, string> = {
  elite: '#10B981', strong: '#22D3EE', emerging: '#3B82F6',
  weak: '#F59E0B', noise: '#EF4444', insufficient_sample: '#6B7280',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null ? 'n/a' : (v * 100).toFixed(digits) + '%';
const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null ? 'n/a' : Number(v).toFixed(digits);
const fmtTs = (v: string | null | undefined) =>
  !v ? '—' : new Date(v).toISOString().replace('T', ' ').slice(0, 19) + 'Z';

function sampleWarn(n: number): { label: string; color: string } {
  if (n <= 0) return { label: 'NONE', color: C.danger };
  if (n < 10) return { label: 'INSUFFICIENT', color: C.danger };
  if (n < 30) return { label: 'THIN', color: C.warn };
  if (n < 100) return { label: 'DEVELOPING', color: C.info };
  return { label: 'MEANINGFUL', color: C.accent };
}

// ── Generic sortable table ──────────────────────────────────────────────────
type Col<T> = { key: string; label: string; render: (r: T) => React.ReactNode; sortVal?: (r: T) => number | string | null; align?: 'left' | 'right' };

function SortableTable<T>({ rows, cols, defaultSort }: { rows: T[]; cols: Col<T>[]; defaultSort?: { key: string; dir: 'asc' | 'desc' } }) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col || !col.sortVal) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortVal!(a);
      const vb = col.sortVal!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, sort, cols]);

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <table style={{ width: '100%', fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead style={{ background: '#0A1422', position: 'sticky', top: 0 }}>
          <tr>
            {cols.map((c) => {
              const active = sort?.key === c.key;
              const arrow = active ? (sort!.dir === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <th key={c.key}
                  onClick={() => c.sortVal && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}
                  style={{
                    textAlign: c.align ?? 'left', padding: '8px 10px',
                    color: C.textDim, fontWeight: 600, letterSpacing: 0.5,
                    cursor: c.sortVal ? 'pointer' : 'default',
                    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                  }}>
                  {c.label}{arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding: 16, textAlign: 'center', color: C.textDim }}>No rows.</td></tr>
          ) : sorted.map((r, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              {cols.map((c) => (
                <td key={c.key} style={{ padding: '6px 10px', color: C.text, textAlign: c.align ?? 'left', whiteSpace: 'nowrap' }}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section frame ───────────────────────────────────────────────────────────
function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 28 }}>
      <header style={{ marginBottom: 10 }}>
        <h2 style={{ color: C.accent, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 14, letterSpacing: 1.5, margin: 0 }}>
          {title.toUpperCase()}
        </h2>
        {subtitle && <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', minWidth: 160 }}>
      <div style={{ color: C.textDim, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: color ?? C.text, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 20, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function LearningEngineDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(90);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/learning-engine/dashboard?windowDays=${windowDays}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [windowDays]);

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: '20px 24px', fontFamily: 'ui-sans-serif,system-ui,sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 16, letterSpacing: 2, color: C.accent }}>
            LEARNING ENGINE / QUANT DESK
          </h1>
          <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
            ADMIN-ONLY · stale/simulated EXCLUDED from edge counts · all numerics carry sample size
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ color: C.textDim, fontSize: 11 }}>Window</label>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}
            style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: '4px 8px', borderRadius: 4, fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>
            {[7, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d}d</option>)}
          </select>
          <button onClick={load} disabled={loading}
            style={{ background: C.accent, color: '#02110A', border: 'none', padding: '6px 14px', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'LOADING…' : 'REFRESH'}
          </button>
          {data && <span style={{ color: C.textDim, fontSize: 10 }}>generated {fmtTs(data.generatedAt)}</span>}
        </div>
      </header>

      {error && <div style={{ color: C.danger, marginBottom: 16, fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>ERROR: {error}</div>}
      {!data && !error && <div style={{ color: C.textDim }}>Loading brain layer…</div>}
      {data && (
        <>
          <Section id="edge-health" title="1. Edge Health" subtitle={`Window: last ${data.windowDays}d · source: brain_events / brain_outcomes / brain_edge_scores`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <Stat label="Setups Tracked" value={data.edgeHealth.totalSetupsTracked} />
              <Stat label="Clean Outcomes" value={data.edgeHealth.cleanLabelledOutcomes} sub="learning_eligible = TRUE" color={C.accent} />
              <Stat label="Unresolved" value={data.edgeHealth.unresolvedOutcomes} color={C.warn} />
              <Stat label="Excluded (stale/simulated)" value={data.edgeHealth.excludedStaleSimulated} color={C.danger} sub="not counted in edge" />
              <Stat label="Avg Decay Ratio" value={fmtNum(data.edgeHealth.averageEdgeDecayRatio)} sub="< 0.6 = decay" />
              <Stat label="Setups w/ Decay" value={data.edgeHealth.setupsWithDecay} color={data.edgeHealth.setupsWithDecay > 0 ? C.warn : C.text} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>STRONGEST REGIMES</div>
                <SortableTable
                  rows={data.edgeHealth.strongestRegimes}
                  cols={[
                    { key: 'regime', label: 'Regime', render: (r) => r.regime, sortVal: (r) => r.regime },
                    { key: 'n', label: 'N', align: 'right', render: (r) => r.sampleSize, sortVal: (r) => r.sampleSize },
                    { key: 'ft', label: 'Follow-Through', align: 'right', render: (r) => fmtPct(r.followThroughRate), sortVal: (r) => r.followThroughRate },
                  ]}
                />
              </div>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>WEAKEST REGIMES</div>
                <SortableTable
                  rows={data.edgeHealth.weakestRegimes}
                  cols={[
                    { key: 'regime', label: 'Regime', render: (r) => r.regime, sortVal: (r) => r.regime },
                    { key: 'n', label: 'N', align: 'right', render: (r) => r.sampleSize, sortVal: (r) => r.sampleSize },
                    { key: 'ft', label: 'Follow-Through', align: 'right', render: (r) => <span style={{ color: r.followThroughRate < 0.4 ? C.danger : C.text }}>{fmtPct(r.followThroughRate)}</span>, sortVal: (r) => r.followThroughRate },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section id="setup-performance" title="2. Setup Performance" subtitle="Latest edge_score per (setup_key, regime, horizon). Wilson lower-95 is sample-size aware.">
            <SortableTable
              rows={data.setupPerformance}
              defaultSort={{ key: 'expectancy', dir: 'desc' }}
              cols={[
                { key: 'setup', label: 'Setup', render: (r) => r.setupKey, sortVal: (r) => r.setupKey },
                { key: 'regime', label: 'Regime', render: (r) => r.regime ?? '—', sortVal: (r) => r.regime ?? '' },
                { key: 'h', label: 'Horizon', render: (r) => r.horizon, sortVal: (r) => r.horizon },
                { key: 'n', label: 'N', align: 'right', render: (r) => {
                  const w = sampleWarn(r.sampleSize);
                  return <span style={{ color: w.color }} title={w.label}>{r.sampleSize}</span>;
                }, sortVal: (r) => r.sampleSize },
                { key: 'ft', label: 'Follow-Through', align: 'right', render: (r) => fmtPct(r.followThroughRate), sortVal: (r) => r.followThroughRate },
                { key: 'wlow', label: 'Wilson↓95', align: 'right', render: (r) => fmtPct(r.wilsonLower95), sortVal: (r) => r.wilsonLower95 },
                { key: 'mfe', label: 'Avg MFE%', align: 'right', render: (r) => fmtNum(r.avgMfePct), sortVal: (r) => r.avgMfePct },
                { key: 'mae', label: 'Avg MAE%', align: 'right', render: (r) => fmtNum(r.avgMaePct), sortVal: (r) => r.avgMaePct },
                { key: 'fp', label: 'FP-Rate', align: 'right', render: (r) => <span style={{ color: (r.falsePositiveRate ?? 0) > 0.4 ? C.warn : C.text }}>{fmtPct(r.falsePositiveRate)}</span>, sortVal: (r) => r.falsePositiveRate },
                { key: 'trap', label: 'Trap-Rate', align: 'right', render: (r) => <span style={{ color: (r.trapRate ?? 0) > 0.3 ? C.warn : C.text }}>{fmtPct(r.trapRate)}</span>, sortVal: (r) => r.trapRate },
                { key: 'expectancy', label: 'Expectancy', align: 'right', render: (r) => fmtNum(r.expectancyProxy, 3), sortVal: (r) => r.expectancyProxy },
                { key: 'tier', label: 'Tier', render: (r) => <span style={{ color: TIER_COLOR[r.edgeTier] ?? C.text, fontWeight: 700 }}>{r.edgeTier}</span>, sortVal: (r) => r.edgeTier },
                { key: 'conf', label: 'Conf', render: (r) => r.confidenceLabel, sortVal: (r) => r.confidenceLabel },
                { key: 'ts', label: 'Computed', render: (r) => fmtTs(r.computedAt), sortVal: (r) => r.computedAt },
              ]}
            />
          </Section>

          <Section id="regime-matrix" title="3. Regime Matrix" subtitle="Rows: setups · Columns: regimes · Cells: edge_score · n · confidence">
            <RegimeMatrix matrix={data.regimeMatrix} />
          </Section>

          <Section id="symbol-reliability" title="4. Symbol Reliability" subtitle="Min N=10 to appear. Symbols with N<30 marked unproven.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { title: 'BEST FOLLOW-THROUGH', rows: data.symbolReliability.bestFollowThrough, key: 'best' as const },
                { title: 'WORST FALSE-POSITIVE', rows: data.symbolReliability.worstFalsePositive, key: 'worst' as const },
                { title: 'NOISY / INCONCLUSIVE', rows: data.symbolReliability.noisyOrInconclusive, key: 'noisy' as const },
              ].map(({ title, rows, key }) => (
                <div key={key}>
                  <div style={{ color: C.textDim, fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>{title}</div>
                  <SortableTable
                    rows={rows}
                    cols={[
                      { key: 'sym', label: 'Sym', render: (r) => r.symbol, sortVal: (r) => r.symbol },
                      { key: 'n', label: 'N', align: 'right', render: (r) => {
                        const w = sampleWarn(r.sampleSize);
                        return <span style={{ color: w.color }}>{r.sampleSize}</span>;
                      }, sortVal: (r) => r.sampleSize },
                      { key: 'ft', label: 'FT', align: 'right', render: (r) => fmtPct(r.cleanFollowThroughRate), sortVal: (r) => r.cleanFollowThroughRate },
                      { key: 'fp', label: 'FP', align: 'right', render: (r) => fmtPct(r.falsePositiveRate), sortVal: (r) => r.falsePositiveRate },
                      { key: 'tr', label: 'Trap', align: 'right', render: (r) => fmtPct(r.trapRate), sortVal: (r) => r.trapRate },
                      { key: 'cls', label: 'Class', render: (r) => <span style={{ color: r.classification === 'reliable' ? C.accent : r.classification === 'noisy' ? C.warn : r.classification === 'unproven' ? C.textDim : C.info }}>{r.classification}</span>, sortVal: (r) => r.classification },
                    ]}
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section id="data-quality" title="5. Data Quality Monitor" subtitle="Provider freshness · missing buckets · 24h failures">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <Stat label="Live Events" value={data.dataQuality.cachedVsLiveRatio.live} color={C.accent} />
              <Stat label="Delayed" value={data.dataQuality.cachedVsLiveRatio.delayed} />
              <Stat label="Stale" value={data.dataQuality.cachedVsLiveRatio.stale} color={C.warn} />
              <Stat label="Simulated" value={data.dataQuality.cachedVsLiveRatio.simulated} color={C.danger} />
              <Stat label="Unknown" value={data.dataQuality.cachedVsLiveRatio.unknown} color={C.textDim} />
              <Stat label="Missing Options" value={data.dataQuality.missingFeatureBuckets.options} color={data.dataQuality.missingFeatureBuckets.options > 0 ? C.warn : C.text} />
              <Stat label="Missing Derivatives" value={data.dataQuality.missingFeatureBuckets.derivatives} color={data.dataQuality.missingFeatureBuckets.derivatives > 0 ? C.warn : C.text} />
              <Stat label="Missing Macro" value={data.dataQuality.missingFeatureBuckets.macro} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>PROVIDER STATUS</div>
                <SortableTable
                  rows={data.dataQuality.providerStatus}
                  defaultSort={{ key: 'events', dir: 'desc' }}
                  cols={[
                    { key: 'src', label: 'Source', render: (r) => r.source, sortVal: (r) => r.source },
                    { key: 'events', label: 'Events', align: 'right', render: (r) => r.events, sortVal: (r) => r.events },
                    { key: 'stale', label: 'Stale', align: 'right', render: (r) => <span style={{ color: r.staleCount > 0 ? C.warn : C.text }}>{r.staleCount}</span>, sortVal: (r) => r.staleCount },
                    { key: 'sim', label: 'Simulated', align: 'right', render: (r) => <span style={{ color: r.simulatedCount > 0 ? C.danger : C.text }}>{r.simulatedCount}</span>, sortVal: (r) => r.simulatedCount },
                    { key: 'last', label: 'Last Seen', render: (r) => fmtTs(r.lastSeen), sortVal: (r) => r.lastSeen },
                  ]}
                />
              </div>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>PROVIDER FAILURES (24H)</div>
                <SortableTable
                  rows={data.dataQuality.providerFailures24h}
                  cols={[
                    { key: 'src', label: 'Source', render: (r) => r.source, sortVal: (r) => r.source },
                    { key: 'reason', label: 'Reason', render: (r) => <span style={{ color: C.warn }}>{r.reason}</span>, sortVal: (r) => r.reason },
                    { key: 'ts', label: 'When', render: (r) => fmtTs(r.ts), sortVal: (r) => r.ts },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section id="arca-accuracy" title="6. ARCA Accuracy Monitor" subtitle="Tracked via brain_events.event_type='arca_verdict' meta flags">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Stat label="Verdicts Issued" value={data.arcaAccuracy.verdictsIssued} />
              <Stat label="Downgraded" value={data.arcaAccuracy.verdictsDowngraded} color={data.arcaAccuracy.verdictsDowngraded > 0 ? C.warn : C.text} />
              <Stat label="Overconfidence Caught" value={data.arcaAccuracy.overconfidenceCaught} color={data.arcaAccuracy.overconfidenceCaught > 0 ? C.danger : C.accent}
                sub="validator rejected response" />
              <Stat label="Missing-Section Warnings" value={data.arcaAccuracy.missingSectionWarnings} color={C.warn} />
              <Stat label="Sample-Size Warnings" value={data.arcaAccuracy.sampleSizeWarnings} color={C.warn} />
              <Stat label="Follow-Through Post-Verdict"
                value={fmtPct(data.arcaAccuracy.followThroughAfterVerdict.followedThrough)}
                sub={`N=${data.arcaAccuracy.followThroughAfterVerdict.sample}`}
                color={data.arcaAccuracy.followThroughAfterVerdict.sample < 30 ? C.warn : C.text} />
            </div>
          </Section>

          <Section id="edge-decay" title="7. Edge Decay Monitor" subtitle="Setups whose recent-half hit-rate is < 0.8 of baseline">
            <SortableTable
              rows={data.edgeDecay}
              defaultSort={{ key: 'decay', dir: 'asc' }}
              cols={[
                { key: 'setup', label: 'Setup', render: (r) => r.setupKey, sortVal: (r) => r.setupKey },
                { key: 'regime', label: 'Regime', render: (r) => r.regime ?? '—', sortVal: (r) => r.regime ?? '' },
                { key: 'h', label: 'Horizon', render: (r) => r.horizon, sortVal: (r) => r.horizon },
                { key: 'n', label: 'N', align: 'right', render: (r) => {
                  const w = sampleWarn(r.sampleSize);
                  return <span style={{ color: w.color }}>{r.sampleSize}</span>;
                }, sortVal: (r) => r.sampleSize },
                { key: 'decay', label: 'Decay Ratio', align: 'right',
                  render: (r) => <span style={{ color: (r.edgeDecayScore ?? 1) < 0.6 ? C.danger : C.warn, fontWeight: 700 }}>{fmtNum(r.edgeDecayScore)}</span>,
                  sortVal: (r) => r.edgeDecayScore },
                { key: 'reason', label: 'Reason', render: (r) => <span style={{ color: C.textDim }}>{r.reason ?? '—'}</span>, sortVal: (r) => r.reason ?? '' },
                { key: 'ts', label: 'Computed', render: (r) => fmtTs(r.computedAt), sortVal: (r) => r.computedAt },
              ]}
            />
          </Section>

          <footer style={{ color: C.textDim, fontSize: 10, marginTop: 24, borderTop: `1px solid ${C.border}`, paddingTop: 10, fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>
            ADMIN_ONLY · stale/simulated rows are excluded from edge counts and surfaced separately ·
            sample-size colours: red &lt;10, amber &lt;30, blue &lt;100, green ≥100 ·
            data is research/diagnostic only — NOT for broker execution.
          </footer>
        </>
      )}
    </main>
  );
}

// ── Regime Matrix ───────────────────────────────────────────────────────────
function RegimeMatrix({ matrix }: { matrix: DashboardResponse['regimeMatrix'] }) {
  const lookup = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of matrix.cells) m.set(`${c.setupKey}__${c.regime}`, c);
    return m;
  }, [matrix]);

  if (matrix.setupKeys.length === 0 || matrix.regimes.length === 0) {
    return <div style={{ color: C.textDim, padding: 12 }}>No regime data yet.</div>;
  }

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ background: '#0A1422', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.textDim, textAlign: 'left' }}>Setup ╲ Regime</th>
            {matrix.regimes.map((reg) => (
              <th key={reg} style={{ background: '#0A1422', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.textDim }}>{reg}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.setupKeys.map((sk) => (
            <tr key={sk}>
              <td style={{ padding: '6px 10px', color: C.text, borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{sk}</td>
              {matrix.regimes.map((reg) => {
                const cell = lookup.get(`${sk}__${reg}`);
                if (!cell) return <td key={reg} style={{ padding: '6px 10px', color: C.textDim, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>—</td>;
                const tierColor = TIER_COLOR[cell.edgeTier] ?? C.text;
                const w = sampleWarn(cell.sampleSize);
                return (
                  <td key={reg} title={`${cell.edgeTier} · ${cell.confidenceLabel} · n=${cell.sampleSize}`}
                    style={{ padding: '6px 10px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                    <div style={{ color: tierColor, fontWeight: 700 }}>{cell.edgeScore.toFixed(2)}</div>
                    <div style={{ color: w.color, fontSize: 9 }}>n={cell.sampleSize}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
