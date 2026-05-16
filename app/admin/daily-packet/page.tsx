"use client";

/**
 * /admin/daily-packet — pre-flight check before the trading day.
 *
 * Aggregates: kill switch, open setups, macro pulse, behavioral drift,
 * calibration, personal universe. Click "Open print-friendly PDF" to
 * render the HTML packet in a new tab where the browser's Save-as-PDF
 * works without a server-side renderer.
 *
 * Boundary: read-only. No execution.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Section { source: string; lastUpdated: string | null; freshness: 'fresh' | 'stale' | 'unknown'; notes?: string }
interface KillSwitch { enabled: boolean; reason: string | null; setAt: string | null }
interface OpenSetup {
  id: number; symbol: string; playbook: string | null; setupType: string;
  direction: string; regime: string | null;
  opportunityScore: number | null; evidenceQuality: number | null; surfacedAt: string;
}
interface MacroRow {
  seriesKey: string; description: string; category: string;
  latestValue: number | null; latestObservedOn: string | null;
  change: number | null; changePct: number | null; freshnessAgeDays: number | null;
}
interface DriftSignal { key: string; label: string; severity: 'low' | 'medium' | 'high'; value: number | string | null; detail: string }
interface DriftReport { signals: DriftSignal[] }
interface CalBucket { bucket: string; setups: number; withOutcome: number; winRate: number | null; avgR5d: number | null }
interface CalReport { byConfidence: CalBucket[]; byOppScore: CalBucket[]; byEvidenceQuality: CalBucket[] }

interface Packet {
  generatedAt: string;
  killSwitch: KillSwitch;
  universeSize: number;
  openSetups: OpenSetup[]; openSetupSection: Section;
  macro: MacroRow[]; macroSection: Section;
  drift: DriftReport | null; driftSection: Section;
  calibration: CalReport | null; calibrationSection: Section;
  warnings: string[];
}

const FRESHNESS_COLOR: Record<string, string> = { fresh: '#10B981', stale: '#F59E0B', unknown: '#9CA3AF' };
const SEV_COLOR: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' };

export default function DailyPacketPage() {
  const [packet, setPacket] = useState<Packet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/daily-packet?format=json', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setPacket(j.packet as Packet);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Daily Operator Packet</h1>
          <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 720 }}>
            Pre-flight check. Review macro, drift, calibration, and open setups before the open.
            Print-friendly version opens in a new tab.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/api/admin/daily-packet?format=html" target="_blank" rel="noopener noreferrer"
            style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '8px 14px', fontWeight: 600, textDecoration: 'none' }}>
            Open print-friendly PDF
          </a>
          <button onClick={fetchData} disabled={loading}
            style={{ background: '#10B981', color: '#0F172A', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {packet && (
        <>
          {packet.warnings.length > 0 && (
            <div style={{ background: '#3F2D0A', border: '1px solid #92400E', color: '#FCD34D', padding: 14, borderRadius: 8, marginBottom: 16 }}>
              <strong>Pre-flight warnings</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {packet.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div style={{
            background: packet.killSwitch.enabled ? '#3F0D0D' : '#0B1220',
            border: '1px solid ' + (packet.killSwitch.enabled ? '#B91C1C' : '#1F2937'),
            borderRadius: 8, padding: 14, marginBottom: 18,
          }}>
            <strong style={{ color: packet.killSwitch.enabled ? '#FCA5A5' : '#10B981' }}>
              Kill switch: {packet.killSwitch.enabled ? 'ON — alerts suppressed' : 'OFF'}
            </strong>
            {packet.killSwitch.reason && <div style={{ fontSize: 13, color: '#FECACA', marginTop: 4 }}>Reason: {packet.killSwitch.reason}</div>}
          </div>

          <Section title="Open setups (last 7 days)" sec={packet.openSetupSection}>
            {packet.openSetups.length === 0
              ? <Muted>No open setups in the last 7 days.</Muted>
              : <table style={tbl}><thead><tr>
                  <Th>Symbol</Th><Th>Setup</Th><Th>Dir</Th><Th>Playbook</Th><Th>Regime</Th>
                  <Th align="right">Opp</Th><Th align="right">Ev</Th><Th>Surfaced</Th>
                </tr></thead><tbody>
                  {packet.openSetups.map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #1F2937' }}>
                      <Td><strong>{s.symbol}</strong></Td>
                      <Td>{s.setupType}</Td><Td>{s.direction}</Td>
                      <Td>{s.playbook ?? '—'}</Td><Td>{s.regime ?? '—'}</Td>
                      <Td align="right">{s.opportunityScore?.toFixed(0) ?? '—'}</Td>
                      <Td align="right">{s.evidenceQuality?.toFixed(0) ?? '—'}</Td>
                      <Td>{new Date(s.surfacedAt).toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody></table>}
          </Section>

          <Section title="Macro Pulse" sec={packet.macroSection}>
            {packet.macro.length === 0 ? <Muted>No macro series ingested.</Muted>
              : <table style={tbl}><thead><tr>
                  <Th>Series</Th><Th>Description</Th><Th align="right">Latest</Th>
                  <Th>As of</Th><Th align="right">Δ</Th><Th align="right">Δ%</Th><Th align="right">Age (d)</Th>
                </tr></thead><tbody>
                  {packet.macro.map((r) => (
                    <tr key={r.seriesKey} style={{ borderTop: '1px solid #1F2937' }}>
                      <Td><strong>{r.seriesKey}</strong></Td>
                      <Td><span style={{ color: '#9CA3AF' }}>{r.description}</span></Td>
                      <Td align="right">{r.latestValue === null ? '—' : r.latestValue.toFixed(2)}</Td>
                      <Td>{r.latestObservedOn ?? '—'}</Td>
                      <Td align="right" style={{ color: r.change === null ? '#9CA3AF' : r.change >= 0 ? '#10B981' : '#EF4444' }}>
                        {r.change === null ? '—' : (r.change >= 0 ? '+' : '') + r.change.toFixed(2)}
                      </Td>
                      <Td align="right" style={{ color: r.changePct === null ? '#9CA3AF' : r.changePct >= 0 ? '#10B981' : '#EF4444' }}>
                        {r.changePct === null ? '—' : (r.changePct >= 0 ? '+' : '') + r.changePct.toFixed(2) + '%'}
                      </Td>
                      <Td align="right">{r.freshnessAgeDays ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody></table>}
          </Section>

          <Section title="Behavioral drift (last 30 days)" sec={packet.driftSection}>
            {!packet.drift || packet.drift.signals.length === 0 ? <Muted>No drift signals.</Muted>
              : <table style={tbl}><thead><tr><Th>Signal</Th><Th>Severity</Th><Th>Value</Th><Th>Detail</Th></tr></thead>
                <tbody>{packet.drift.signals.map((s) => (
                  <tr key={s.key} style={{ borderTop: '1px solid #1F2937' }}>
                    <Td>{s.label}</Td>
                    <Td><span style={{ color: SEV_COLOR[s.severity], fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>{s.severity}</span></Td>
                    <Td>{String(s.value ?? '—')}</Td>
                    <Td><span style={{ color: '#9CA3AF' }}>{s.detail}</span></Td>
                  </tr>
                ))}</tbody></table>}
          </Section>

          <Section title="Calibration" sec={packet.calibrationSection}>
            {!packet.calibration ? <Muted>Calibration unavailable.</Muted> : (
              <>
                <CalTable title="By confidence" rows={packet.calibration.byConfidence} />
                <CalTable title="By opportunity score" rows={packet.calibration.byOppScore} />
                <CalTable title="By evidence quality" rows={packet.calibration.byEvidenceQuality} />
              </>
            )}
          </Section>

          <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'center', marginTop: 20 }}>
            Generated {new Date(packet.generatedAt).toLocaleString()} · Universe: {packet.universeSize} symbols ·{' '}
            <Link href="/admin" style={{ color: '#10B981' }}>Back to admin</Link>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, sec, children }: { title: string; sec: Section; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24, border: '1px solid #1F2937', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, color: '#F3F4F6' }}>{title}</h2>
        <div style={{ fontSize: 10, color: '#9CA3AF', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            background: FRESHNESS_COLOR[sec.freshness], color: '#0F172A',
            padding: '2px 8px', borderRadius: 999, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>{sec.freshness}</span>
          <span>source: <code>{sec.source}</code></span>
          <span>updated: {sec.lastUpdated ? new Date(sec.lastUpdated).toLocaleString() : '—'}</span>
          {sec.notes && <span style={{ color: '#F59E0B' }}>{sec.notes}</span>}
        </div>
      </div>
      {children}
    </section>
  );
}
function CalTable({ title, rows }: { title: string; rows: CalBucket[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{title}</div>
      <table style={tbl}><thead><tr>
        <Th>Bucket</Th><Th align="right">Setups</Th><Th align="right">Resolved</Th>
        <Th align="right">Win rate</Th><Th align="right">Avg R (5d)</Th>
      </tr></thead><tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid #1F2937' }}>
            <Td>{r.bucket}</Td><Td align="right">{r.setups}</Td><Td align="right">{r.withOutcome}</Td>
            <Td align="right">{r.winRate === null ? '—' : (r.winRate * 100).toFixed(0) + '%'}</Td>
            <Td align="right" style={{ color: r.avgR5d === null ? '#9CA3AF' : r.avgR5d >= 0 ? '#10B981' : '#EF4444' }}>
              {r.avgR5d === null ? '—' : r.avgR5d.toFixed(2)}
            </Td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#6B7280', fontSize: 13, fontStyle: 'italic' }}>{children}</div>;
}
function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '6px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties }) {
  return <td style={{ textAlign: align ?? 'left', padding: '6px 10px', color: '#E5E7EB', ...style }}>{children}</td>;
}
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
