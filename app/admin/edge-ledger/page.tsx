"use client";

/**
 * /admin/edge-ledger — the personal alpha graph.
 *
 * Reads: GET /api/admin/edge-ledger
 *
 * Shows:
 *   - Coverage summary (setups surfaced, taken, skipped, outcomes labelled)
 *   - Edge matrix grid across 5 dimensions, with confidence band per cell
 *   - Recent setups table with status + opportunity score + R/R
 *
 * Boundary: DISCOVERY + RESEARCH only. Decision-support, not execution.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Dimension = 'playbook' | 'regime' | 'sector' | 'iv_bucket' | 'catalyst_proximity';
type Band = 'tight' | 'wide' | 'insufficient';

interface MatrixCell {
  dimension: Dimension;
  cellKey: string;
  setupsTotal: number;
  setupsTaken: number;
  setupsSkipped: number;
  winRate: number | null;
  avgR5d: number | null;
  avgR20d: number | null;
  hitTargetRate: number | null;
  hitStopRate: number | null;
  cfWinRate: number | null;
  cfAvgR5d: number | null;
  cfAvgR20d: number | null;
  minSample: number;
  confidenceBand: Band;
  rebuiltAt: string;
}

interface LedgerRow {
  id: number;
  setupKey: string;
  symbol: string;
  market: string;
  playbook: string | null;
  setupType: string;
  direction: 'long' | 'short';
  regime: string | null;
  sector: string | null;
  evidenceQuality: number | null;
  opportunityScore: number | null;
  confidence: string | null;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  rewardRisk: number | null;
  status: 'surfaced' | 'taken' | 'skipped' | 'invalidated';
  takenAt: string | null;
  skippedReason: string | null;
  surfacedAt: string;
}

interface ApiResponse {
  ok: true;
  summary: {
    total: number; taken: number; skipped: number;
    pendingOutcomes: number; completeOutcomes: number; days: number;
  };
  matrix: MatrixCell[];
  recentSetups: LedgerRow[];
  generatedAt: string;
}

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'playbook', label: 'Playbook' },
  { key: 'regime', label: 'Regime' },
  { key: 'sector', label: 'Sector' },
  { key: 'iv_bucket', label: 'IV Bucket' },
  { key: 'catalyst_proximity', label: 'Catalyst Proximity' },
];

function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtR(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}R`;
}

function fmtPrice(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function bandColor(b: Band): string {
  if (b === 'tight') return '#10B981';
  if (b === 'wide') return '#F59E0B';
  return '#6B7280';
}

function statusColor(s: LedgerRow['status']): string {
  if (s === 'taken') return '#10B981';
  if (s === 'skipped') return '#6B7280';
  if (s === 'invalidated') return '#EF4444';
  return '#3B82F6';
}

export default function EdgeLedgerPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [statusFilter, setStatusFilter] = useState<'all' | LedgerRow['status']>('all');

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ days: String(days), limit: '200' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/edge-ledger?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json() as ApiResponse | { ok: false; error: string };
      if (!json.ok) throw new Error((json as { error: string }).error || 'Unknown error');
      setData(json as ApiResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const matrixByDim = (dim: Dimension): MatrixCell[] =>
    (data?.matrix ?? []).filter((c) => c.dimension === dim).sort((a, b) => b.setupsTotal - a.setupsTotal);

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Edge Ledger</h1>
          <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 720 }}>
            Every setup the platform surfaces — taken or skipped — with forward MFE/MAE labelled from real bars.
            Counterfactual stats (what skipped setups would have done) appear alongside taken-performance.
            Research-only; no broker execution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#9CA3AF' }}>Window:</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ background: '#111827', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>
          <label style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | LedgerRow['status'])}
            style={{ background: '#111827', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>
            <option value="all">All</option>
            <option value="surfaced">Surfaced</option>
            <option value="taken">Taken</option>
            <option value="skipped">Skipped</option>
            <option value="invalidated">Invalidated</option>
          </select>
          <button onClick={fetchData} disabled={loading}
            style={{ background: '#10B981', color: '#0F172A', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ background: '#0B1220', border: '1px solid #374151', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#9CA3AF' }}>
        Edge matrix is rebuilt nightly by <code style={{ color: '#E5E7EB' }}>/api/cron/edge-rebuild-matrix</code>.
        Outcomes are labelled by <code style={{ color: '#E5E7EB' }}>/api/cron/edge-label-outcomes</code> from real OHLCV bars.
        Cells with insufficient sample (<code style={{ color: '#E5E7EB' }}>n &lt; 8</code>) are shown but flagged.
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <SummaryCard label="Setups Surfaced" value={data.summary.total} sub={`last ${data.summary.days}d`} />
            <SummaryCard label="Taken" value={data.summary.taken} accent="#10B981" />
            <SummaryCard label="Skipped" value={data.summary.skipped} accent="#6B7280" />
            <SummaryCard label="Outcomes Labelled" value={data.summary.completeOutcomes} sub={`${data.summary.pendingOutcomes} pending`} />
          </div>

          {DIMENSIONS.map((d) => {
            const cells = matrixByDim(d.key);
            if (cells.length === 0) return null;
            return (
              <section key={d.key} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>{d.label}</h2>
                <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
                    <thead style={{ background: '#0B1220' }}>
                      <tr>
                        <Th>Cell</Th>
                        <Th align="right">Total</Th>
                        <Th align="right">Taken</Th>
                        <Th align="right">Skipped</Th>
                        <Th align="right">Win Rate</Th>
                        <Th align="right">Avg R 5d</Th>
                        <Th align="right">Avg R 20d</Th>
                        <Th align="right">Hit Target</Th>
                        <Th align="right">Hit Stop</Th>
                        <Th align="right">CF Win</Th>
                        <Th align="right">CF Avg R 5d</Th>
                        <Th align="right">n</Th>
                        <Th>Band</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {cells.map((c) => (
                        <tr key={`${c.dimension}-${c.cellKey}`} style={{ borderTop: '1px solid #1F2937' }}>
                          <Td><strong>{c.cellKey}</strong></Td>
                          <Td align="right">{c.setupsTotal}</Td>
                          <Td align="right">{c.setupsTaken}</Td>
                          <Td align="right">{c.setupsSkipped}</Td>
                          <Td align="right">{fmtPct(c.winRate)}</Td>
                          <Td align="right">{fmtR(c.avgR5d)}</Td>
                          <Td align="right">{fmtR(c.avgR20d)}</Td>
                          <Td align="right">{fmtPct(c.hitTargetRate)}</Td>
                          <Td align="right">{fmtPct(c.hitStopRate)}</Td>
                          <Td align="right" muted>{fmtPct(c.cfWinRate)}</Td>
                          <Td align="right" muted>{fmtR(c.cfAvgR5d)}</Td>
                          <Td align="right">{c.minSample}</Td>
                          <Td>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#0F172A', background: bandColor(c.confidenceBand) }}>
                              {c.confidenceBand}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {data.matrix.length === 0 && (
            <div style={{ background: '#0B1220', border: '1px solid #374151', borderRadius: 8, padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
              No matrix cells yet. Surface some setups via the scanner and run the
              <code style={{ color: '#E5E7EB', margin: '0 4px' }}>edge-rebuild-matrix</code> cron.
            </div>
          )}

          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>
              Recent Setups ({data.recentSetups.length})
            </h2>
            <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 }}>
                <thead style={{ background: '#0B1220' }}>
                  <tr>
                    <Th>Surfaced</Th>
                    <Th>Symbol</Th>
                    <Th>Playbook</Th>
                    <Th>Type</Th>
                    <Th>Dir</Th>
                    <Th>Regime</Th>
                    <Th align="right">Opp</Th>
                    <Th align="right">EQ</Th>
                    <Th align="right">Entry</Th>
                    <Th align="right">Stop</Th>
                    <Th align="right">Target</Th>
                    <Th align="right">R/R</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSetups.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid #1F2937' }}>
                      <Td>{new Date(r.surfacedAt).toLocaleString()}</Td>
                      <Td><strong>{r.symbol}</strong></Td>
                      <Td>{r.playbook ?? '—'}</Td>
                      <Td>{r.setupType}</Td>
                      <Td>
                        <span style={{ color: r.direction === 'long' ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                          {r.direction}
                        </span>
                      </Td>
                      <Td>{r.regime ?? '—'}</Td>
                      <Td align="right">{r.opportunityScore?.toFixed(0) ?? '—'}</Td>
                      <Td align="right">{r.evidenceQuality?.toFixed(0) ?? '—'}</Td>
                      <Td align="right">{fmtPrice(r.entryPrice)}</Td>
                      <Td align="right">{fmtPrice(r.stopPrice)}</Td>
                      <Td align="right">{fmtPrice(r.targetPrice)}</Td>
                      <Td align="right">{r.rewardRisk?.toFixed(2) ?? '—'}</Td>
                      <Td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#0F172A', background: statusColor(r.status) }}>
                          {r.status}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.recentSetups.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', background: '#0B1220', border: '1px solid #374151', borderRadius: 8, marginTop: 8 }}>
                No setups in the selected window.
              </div>
            )}
          </section>

          <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
            Generated at {new Date(data.generatedAt).toLocaleString()} ·
            <Link href="/admin" style={{ color: '#10B981', marginLeft: 6 }}>Back to admin</Link>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? '#F9FAFB', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{ textAlign: align ?? 'left', padding: '8px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </th>
  );
}

function Td({ children, align, muted }: { children: React.ReactNode; align?: 'left' | 'right'; muted?: boolean }) {
  return (
    <td style={{ textAlign: align ?? 'left', padding: '8px 10px', color: muted ? '#6B7280' : '#E5E7EB' }}>
      {children}
    </td>
  );
}
