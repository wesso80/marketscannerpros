"use client";

/**
 * /admin/packet-replay — Stage 5 dashboard.
 *
 * Joins admin_market_packets with edge_ledger_setups + outcomes and
 * shows, per packet type:
 *  - packets built
 *  - setups linked / taken / skipped / resolved
 *  - win rate (R 5d > 0)
 *  - avg realised R, avg evidence quality, avg opportunity score
 *
 * Use it to spot pipeline drift: a packet type producing lots of packets
 * but no setups (or setups that don't win) is a flag.
 */

import { useCallback, useEffect, useState } from 'react';

interface Bucket {
  packetType: string;
  packetsBuilt: number;
  setupsLinked: number;
  setupsTaken: number;
  setupsSkipped: number;
  setupsResolved: number;
  winsR5d: number;
  avgRealisedR5d: number | null;
  avgEvidenceQuality: number | null;
  avgOpportunityScore: number | null;
}

interface Report {
  windowDays: number;
  generatedAt: string;
  buckets: Bucket[];
  totals: { packetsBuilt: number; setupsLinked: number; setupsResolved: number; winsR5d: number };
}

export default function PacketReplayPage() {
  const [window, setWindow] = useState(90);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/packet-replay?windowDays=${window}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setReport(j.report);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [window]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: '#F9FAFB' }}>Packet Replay Backtest</h1>
          <p style={{ margin: '6px 0 0', color: '#9CA3AF', fontSize: 13, maxWidth: 720 }}>
            Joins admin_market_packets with edge_ledger setups + outcomes. Answers: does every packet type actually produce setups that resolve profitably?
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#9CA3AF' }}>Window:</label>
          <select value={window} onChange={(e) => setWindow(parseInt(e.target.value, 10))}
            style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </select>
          <button onClick={load} disabled={loading}
            style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Loading…' : 'Reload'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Stat label="Packets built" value={String(report.totals.packetsBuilt)} />
            <Stat label="Setups linked" value={String(report.totals.setupsLinked)} />
            <Stat label="Resolved" value={String(report.totals.setupsResolved)} />
            <Stat label="Wins (5d R>0)" value={String(report.totals.winsR5d)} />
            <Stat label="Win rate" value={report.totals.setupsResolved > 0 ? ((report.totals.winsR5d / report.totals.setupsResolved) * 100).toFixed(0) + '%' : '—'} />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              <th style={th}>Packet type</th>
              <th style={{ ...th, textAlign: 'right' }}>Built</th>
              <th style={{ ...th, textAlign: 'right' }}>Linked</th>
              <th style={{ ...th, textAlign: 'right' }}>Taken</th>
              <th style={{ ...th, textAlign: 'right' }}>Skipped</th>
              <th style={{ ...th, textAlign: 'right' }}>Resolved</th>
              <th style={{ ...th, textAlign: 'right' }}>Win rate</th>
              <th style={{ ...th, textAlign: 'right' }}>Avg R (5d)</th>
              <th style={{ ...th, textAlign: 'right' }}>Avg Ev</th>
              <th style={{ ...th, textAlign: 'right' }}>Avg Opp</th>
            </tr></thead>
            <tbody>
              {report.buckets.map((b) => {
                const wr = b.setupsResolved > 0 ? (b.winsR5d / b.setupsResolved) : null;
                return (
                  <tr key={b.packetType} style={{ borderTop: '1px solid #1F2937' }}>
                    <td style={td}><strong>{b.packetType}</strong></td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.packetsBuilt}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.setupsLinked}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.setupsTaken}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.setupsSkipped}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.setupsResolved}</td>
                    <td style={{ ...td, textAlign: 'right', color: wr === null ? '#9CA3AF' : wr >= 0.5 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                      {wr === null ? '—' : (wr * 100).toFixed(0) + '%'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: b.avgRealisedR5d === null ? '#9CA3AF' : b.avgRealisedR5d >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                      {b.avgRealisedR5d === null ? '—' : b.avgRealisedR5d.toFixed(2)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.avgEvidenceQuality?.toFixed(0) ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.avgOpportunityScore?.toFixed(0) ?? '—'}</td>
                  </tr>
                );
              })}
              {report.buckets.length === 0 && (
                <tr><td colSpan={10} style={{ ...td, color: '#6B7280', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                  No packets or setups in this window.
                </td></tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 14, fontSize: 11, color: '#6B7280' }}>
            Generated {new Date(report.generatedAt).toLocaleString()} · Window {report.windowDays} days
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--msp-bg)', border: '1px solid #1F2937', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, color: '#F3F4F6', fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '6px 10px', color: '#E5E7EB' };
