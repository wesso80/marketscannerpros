"use client";

/**
 * /admin/evening-packet — Evening Reconciliation Packet.
 *
 * What the system expected this morning vs what actually happened.
 * Closes the loop between surfaced opportunities, taken trades, and
 * outcomes labelled today. Discovery + accountability — no execution.
 */

import { useCallback, useEffect, useState } from 'react';

type Direction = 'long' | 'short';
type Status = 'surfaced' | 'taken' | 'skipped' | 'invalidated';

interface ReconciledSetup {
  id: number;
  symbol: string;
  market: string;
  setupType: string;
  playbook: string | null;
  direction: Direction;
  status: Status;
  opportunityScore: number | null;
  evidenceQuality: number | null;
  surfacedAt: string;
  outcomeStatus: 'pending' | 'partial' | 'complete' | null;
  realisedR5d: number | null;
  realisedR20d: number | null;
  hitTarget5d: boolean | null;
  hitStop5d: boolean | null;
  mfe5d: number | null;
  mae5d: number | null;
}

interface DayChangeSummary {
  eventType: string;
  count: number;
  criticalCount: number;
  topSymbols: string[];
}

interface DriftSignal {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  value: number | string | null;
  detail: string;
}
interface DriftReport {
  generatedAt: string;
  windowDays: number;
  signals: DriftSignal[];
}

interface EveningPacket {
  generatedAt: string;
  workspaceId: string;
  reconciledDate: string;
  surfacedToday: ReconciledSetup[];
  recommendationsThatWorked: ReconciledSetup[];
  recommendationsThatFailed: ReconciledSetup[];
  invalidatedToday: ReconciledSetup[];
  skippedWinners: ReconciledSetup[];
  skippedLosers: ReconciledSetup[];
  changeEventsToday: DayChangeSummary[];
  totalChangeEvents: number;
  drift: DriftReport | null;
  warnings: string[];
  scorecard: {
    setupsSurfaced: number;
    setupsTaken: number;
    setupsSkipped: number;
    avgRealisedR: number | null;
    winRate: number | null;
    invalidations: number;
    skippedWinnersCount: number;
    skippedLosersCount: number;
    skippedAlphaForgone: number | null;
  };
}

function fmtR(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}R`;
}
function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}
function rColor(v: number | null): string {
  if (v === null) return '#6B7280';
  if (v >= 1) return 'var(--msp-bull)';
  if (v > 0) return '#86EFAC';
  if (v >= -1) return 'var(--msp-warn)';
  return 'var(--msp-bear)';
}

export default function EveningPacketPage() {
  const [data, setData] = useState<EveningPacket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/evening-packet?date=${date}`, { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setData(json.packet);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', color: '#E5E7EB' }}>
      <header style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Evening Reconciliation Packet</h1>
          <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 760 }}>
            What the system expected this morning vs what actually happened. Closes the loop between surfaced setups,
            taken trades, and forward outcomes. Read-only — no execution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#9CA3AF' }}>Date:</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ background: '#111827', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }} />
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          {/* Scorecard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Card label="Surfaced" value={data.scorecard.setupsSurfaced} />
            <Card label="Taken" value={data.scorecard.setupsTaken} accent="#10B981" />
            <Card label="Skipped" value={data.scorecard.setupsSkipped} accent="#6B7280" />
            <Card label="Win Rate" value={fmtPct(data.scorecard.winRate)} />
            <Card label="Avg R" value={fmtR(data.scorecard.avgRealisedR)} accent={rColor(data.scorecard.avgRealisedR)} />
            <Card label="Invalidations" value={data.scorecard.invalidations} accent="#EF4444" />
            <Card label="Skipped Winners" value={data.scorecard.skippedWinnersCount} accent="#FBBF24"
              sub={data.scorecard.skippedAlphaForgone !== null ? `${fmtR(data.scorecard.skippedAlphaForgone)} forgone` : undefined} />
            <Card label="Change Events" value={data.totalChangeEvents} />
          </div>

          {data.warnings.length > 0 && (
            <div style={{ background: '#78350F', border: '1px solid #B45309', color: '#FDE68A', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <strong>Honest gaps:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <Section title={`Recommendations that worked (${data.recommendationsThatWorked.length})`}>
            <SetupTable rows={data.recommendationsThatWorked} emptyText="No taken setups resolved profitably today." />
          </Section>

          <Section title={`Recommendations that failed (${data.recommendationsThatFailed.length})`}>
            <SetupTable rows={data.recommendationsThatFailed} emptyText="No taken setups resolved as losers today." />
          </Section>

          <Section title={`Skipped winners — counterfactual alpha forgone (${data.skippedWinners.length})`}>
            <SetupTable rows={data.skippedWinners} emptyText="No skipped setups resolved as winners today." />
          </Section>

          <Section title={`Skipped losers — correctly avoided (${data.skippedLosers.length})`}>
            <SetupTable rows={data.skippedLosers} emptyText="No skipped setups resolved as losers today." />
          </Section>

          <Section title={`Invalidated mid-day (${data.invalidatedToday.length})`}>
            <SetupTable rows={data.invalidatedToday} emptyText="No invalidations today." />
          </Section>

          <Section title={`Change events today (${data.totalChangeEvents})`}>
            {data.changeEventsToday.length === 0 ? (
              <Empty text="No change events emitted today." />
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: '#0B1220' }}>
                    <tr>
                      <Th>Event Type</Th>
                      <Th align="right">Count</Th>
                      <Th align="right">Critical</Th>
                      <Th>Top Symbols</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.changeEventsToday.map((e) => (
                      <tr key={e.eventType} style={{ borderTop: '1px solid #1F2937' }}>
                        <Td>{e.eventType.replace(/_/g, ' ')}</Td>
                        <Td align="right">{e.count}</Td>
                        <Td align="right">
                          <span style={{ color: e.criticalCount > 0 ? 'var(--msp-bear)' : '#6B7280' }}>{e.criticalCount}</span>
                        </Td>
                        <Td>{e.topSymbols.join(', ') || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {data.drift && (
            <Section title="What to learn — behavioural drift snapshot">
              <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 8 }}>
                  Window: {data.drift.windowDays}d · {data.drift.signals.length} signal(s)
                </div>
                {data.drift.signals.length === 0 ? (
                  <div style={{ color: '#6B7280', fontSize: 13 }}>No drift signals.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                    {data.drift.signals.map((s, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <span style={{
                          display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, marginRight: 6,
                          background: s.severity === 'high' ? 'rgba(239,68,68,0.15)' : s.severity === 'medium' ? 'rgba(251,191,36,0.15)' : 'rgba(107,114,128,0.15)',
                          color: s.severity === 'high' ? '#FCA5A5' : s.severity === 'medium' ? '#FCD34D' : '#9CA3AF',
                        }}>{s.severity.toUpperCase()}</span>
                        <strong>{s.label}:</strong> {s.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>
          )}

          <div style={{ marginTop: 32, color: '#6B7280', fontSize: 11 }}>
            Generated {new Date(data.generatedAt).toLocaleString()} · reconciled date {data.reconciledDate}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, accent, sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? '#F9FAFB', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: '#6B7280', fontSize: 13, padding: 12, background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8 }}>{text}</div>;
}

function SetupTable({ rows, emptyText }: { rows: ReconciledSetup[]; emptyText: string }) {
  if (rows.length === 0) return <Empty text={emptyText} />;
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: '#0B1220' }}>
          <tr>
            <Th>Symbol</Th>
            <Th>Setup</Th>
            <Th>Playbook</Th>
            <Th>Dir</Th>
            <Th align="right">Opp</Th>
            <Th align="right">R 5d</Th>
            <Th align="right">R 20d</Th>
            <Th align="right">MFE</Th>
            <Th align="right">MAE</Th>
            <Th>Hit</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #1F2937' }}>
              <Td><strong>{r.symbol}</strong> <span style={{ color: '#6B7280', fontSize: 11 }}>{r.market}</span></Td>
              <Td>{r.setupType}</Td>
              <Td><span style={{ color: '#9CA3AF' }}>{r.playbook ?? '—'}</span></Td>
              <Td><span style={{ color: r.direction === 'long' ? 'var(--msp-bull)' : 'var(--msp-bear)', fontWeight: 700 }}>{r.direction.toUpperCase()}</span></Td>
              <Td align="right">{r.opportunityScore ?? '—'}</Td>
              <Td align="right"><span style={{ color: rColor(r.realisedR5d), fontWeight: 700 }}>{fmtR(r.realisedR5d)}</span></Td>
              <Td align="right"><span style={{ color: rColor(r.realisedR20d) }}>{fmtR(r.realisedR20d)}</span></Td>
              <Td align="right">{fmtR(r.mfe5d)}</Td>
              <Td align="right">{fmtR(r.mae5d)}</Td>
              <Td>
                {r.hitTarget5d === true && <span style={{ color: 'var(--msp-bull)', fontSize: 11, fontWeight: 700 }}>TGT </span>}
                {r.hitStop5d === true && <span style={{ color: 'var(--msp-bear)', fontSize: 11, fontWeight: 700 }}>STOP</span>}
                {r.hitTarget5d !== true && r.hitStop5d !== true && <span style={{ color: '#6B7280', fontSize: 11 }}>—</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align, padding: '8px 12px', fontSize: 11, color: '#9CA3AF',
      textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
    }}>
      {children}
    </th>
  );
}
function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ padding: '8px 12px', textAlign: align }}>{children}</td>;
}
