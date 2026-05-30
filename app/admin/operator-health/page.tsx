"use client";

/**
 * /admin/operator-health — combined Behavioral Drift + Calibration view.
 *
 * Reads:
 *   GET /api/admin/behavioral-drift?days=30
 *   GET /api/admin/calibration
 *
 * Shows the operator how they're trading vs how they should be trading,
 * and how well the system's confidence labels correspond to realised wins.
 *
 * Boundary: SELF-AUDIT / RESEARCH. No execution.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface DriftSignal {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  value: number | string | null;
  detail: string;
}
interface DriftReport {
  workspaceId: string;
  windowDays: number;
  signals: DriftSignal[];
  generatedAt: string;
}
interface CalibrationBucket {
  bucket: string;
  setups: number;
  withOutcome: number;
  winRate: number | null;
  avgR5d: number | null;
  avgR20d: number | null;
}
interface CalibrationReport {
  workspaceId: string;
  byConfidence: CalibrationBucket[];
  byOppScore: CalibrationBucket[];
  byEvidenceQuality: CalibrationBucket[];
  generatedAt: string;
}

interface TimeToDecisionReport {
  status: 'ok' | 'insufficient' | 'error';
  workspaceId: string;
  windowDays: number;
  sampleSize: number;
  minRequired: number;
  surfacedCount: number;
  takenCount: number;
  skippedCount: number;
  actionRate: number | null;
  skipRate: number | null;
  latencyMinutes: { p50: number | null; p75: number | null; p90: number | null; max: number | null; mean: number | null } | null;
  notes: string[];
  computedAt: string;
}

function sevColor(s: DriftSignal['severity']): string {
  if (s === 'high') return 'var(--msp-bear)';
  if (s === 'medium') return 'var(--msp-warn)';
  return 'var(--msp-bull)';
}
function fmtPct(v: number | null, d = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(d)}%`;
}
function fmtR(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;
}

export default function OperatorHealthPage() {
  const [days, setDays] = useState(30);
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [calib, setCalib] = useState<CalibrationReport | null>(null);
  const [ttd, setTtd] = useState<TimeToDecisionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dRes, cRes, tRes] = await Promise.all([
        fetch(`/api/admin/behavioral-drift?days=${days}`, { cache: 'no-store' }),
        fetch(`/api/admin/calibration`, { cache: 'no-store' }),
        fetch(`/api/admin/time-to-decision?days=${days}`, { cache: 'no-store' }),
      ]);
      if (!dRes.ok) throw new Error(`drift HTTP ${dRes.status}`);
      if (!cRes.ok) throw new Error(`calibration HTTP ${cRes.status}`);
      if (!tRes.ok) throw new Error(`time-to-decision HTTP ${tRes.status}`);
      const dJson = await dRes.json();
      const cJson = await cRes.json();
      const tJson = await tRes.json();
      if (!dJson.ok) throw new Error(dJson.error);
      if (!cJson.ok) throw new Error(cJson.error);
      if (!tJson.ok) throw new Error(tJson.error);
      setDrift(dJson.report as DriftReport);
      setCalib(cJson.report as CalibrationReport);
      setTtd(tJson.report as TimeToDecisionReport);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Operator Health</h1>
          <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 800 }}>
            Behavioral drift + confidence calibration. The drift panel surfaces revenge trading,
            overtrading, and override patterns. The calibration panel reveals whether the
            system's confidence labels actually correspond to realised outcomes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#9CA3AF' }}>Drift window:</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ background: '#111827', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button onClick={fetchAll} disabled={loading}
            style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {drift && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>
            Behavioral Drift (last {drift.windowDays}d)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {drift.signals.map((s) => (
              <div key={s.key} style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: 'var(--msp-bg)', background: sevColor(s.severity) }}>
                    {s.severity}
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#F9FAFB', marginTop: 6 }}>{s.value ?? '—'}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{s.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ttd && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>
            Time to Decision (last {ttd.windowDays}d)
          </h2>
          {ttd.status === 'ok' && ttd.latencyMinutes ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <TtdCard label="Surfaced" value={String(ttd.surfacedCount)} sub="setups in window" color="#9CA3AF" />
              <TtdCard label="Taken" value={String(ttd.takenCount)} sub={ttd.actionRate != null ? `action rate ${(ttd.actionRate * 100).toFixed(1)}%` : '—'} color="#10B981" />
              <TtdCard label="Skipped" value={String(ttd.skippedCount)} sub={ttd.skipRate != null ? `skip rate ${(ttd.skipRate * 100).toFixed(1)}%` : '—'} color="#F59E0B" />
              <TtdCard label="p50 latency" value={fmtMin(ttd.latencyMinutes.p50)} sub="median READY -> taken" color="#60A5FA" />
              <TtdCard label="p75 latency" value={fmtMin(ttd.latencyMinutes.p75)} sub="3 in 4 within" color="#60A5FA" />
              <TtdCard label="p90 latency" value={fmtMin(ttd.latencyMinutes.p90)} sub="9 in 10 within" color="#60A5FA" />
            </div>
          ) : (
            <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 14, fontSize: 12, color: '#9CA3AF' }}>
              {ttd.notes[0] ?? (ttd.status === 'error' ? 'Time-to-decision query failed.' : 'Insufficient data yet.')}
            </div>
          )}
          <p style={{ marginTop: 8, fontSize: 11, color: '#6B7280' }}>
            Measured as <code>taken_at − surfaced_at</code> on <code>edge_ledger_setups</code>. Only setups with status=&apos;taken&apos; contribute to the latency distribution; skips are reported separately. Honest sample floor: {ttd.minRequired} taken setups.
          </p>
        </section>
      )}

      {calib && (
        <section>
          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>Confidence Calibration</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            <CalibTable title="By Confidence Label" rows={calib.byConfidence} />
            <CalibTable title="By Opportunity Score" rows={calib.byOppScore} />
            <CalibTable title="By Evidence Quality" rows={calib.byEvidenceQuality} />
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: '#6B7280' }}>
            A well-calibrated system shows monotonically rising win-rate &amp; avg R as the bucket
            improves. Inversions (e.g. low-confidence outperforming high-confidence) signal a
            calibration problem — review the scoring formula.
          </p>
        </section>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        <Link href="/admin" style={{ color: 'var(--msp-bull)' }}>Back to admin</Link>
      </div>
    </div>
  );
}

function CalibTable({ title, rows }: { title: string; rows: CalibrationBucket[] }) {
  return (
    <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: '#6B7280', fontSize: 12 }}>No taken setups yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <Th>Bucket</Th>
              <Th align="right">n</Th>
              <Th align="right">labelled</Th>
              <Th align="right">Win</Th>
              <Th align="right">Avg R 5d</Th>
              <Th align="right">Avg R 20d</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket} style={{ borderTop: '1px solid #1F2937' }}>
                <Td><strong>{r.bucket}</strong></Td>
                <Td align="right">{r.setups}</Td>
                <Td align="right">{r.withOutcome}</Td>
                <Td align="right">{fmtPct(r.winRate)}</Td>
                <Td align="right">{fmtR(r.avgR5d)}</Td>
                <Td align="right">{fmtR(r.avgR20d)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '6px 8px', fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase' }}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ textAlign: align ?? 'left', padding: '6px 8px', color: '#E5E7EB' }}>{children}</td>;
}

function fmtMin(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v < 1) return `${Math.round(v * 60)}s`;
  if (v < 60) return `${v.toFixed(1)}m`;
  const h = v / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function TtdCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{sub}</div>
    </div>
  );
}
