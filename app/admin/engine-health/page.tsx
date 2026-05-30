'use client';

import { useEffect, useState } from 'react';

interface EngineHealth {
  engine: string;
  events_24h: number;
  events_7d: number;
  pct_neutral: number | null;
  mean_confidence: number | null;
  pct_floor_failed: number | null;
  pct_rg_blocked: number | null;
  pct_stale: number | null;
  outcomes_resolved: number | null;
  hit_rate: number | null;
  last_ts: string | null;
}

const cell: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: '#E5E7EB', borderBottom: '1px solid #1F2937' };
const head: React.CSSProperties = { ...cell, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 };

function fmtPct(n: number | null) {
  if (n == null) return '—';
  return `${n}%`;
}
function fmtNum(n: number | null) {
  if (n == null) return '—';
  return String(n);
}
function fmtTs(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return d.toISOString().slice(0, 10);
}

export default function EngineHealthPage() {
  const [rows, setRows] = useState<EngineHealth[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/brain/engine-health', { credentials: 'include' });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setRows(Array.isArray(j.engines) ? j.engines : []);
        setNotes(Array.isArray(j.notes) ? j.notes : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 24, color: '#E5E7EB', background: 'var(--msp-bg)', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Engine Health (Brain Layer)</h1>
      <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16 }}>
        Per-engine 24h observability — confidence, direction-floor failures, Risk Governor blocks, stale-data %, and 30d hit rate
        (sample-size gated). Admin-only.
      </p>

      {loading && <div style={{ color: '#9CA3AF' }}>Loading…</div>}
      {err && <div style={{ color: 'var(--msp-bear)' }}>Error: {err}</div>}

      {!loading && !err && (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0B1220' }}>
                  <th style={head}>Engine</th>
                  <th style={head}>Events 24h</th>
                  <th style={head}>Events 7d</th>
                  <th style={head}>% Neutral</th>
                  <th style={head}>Mean Conf</th>
                  <th style={head}>% Floor Failed</th>
                  <th style={head}>% RG Blocked</th>
                  <th style={head}>% Stale</th>
                  <th style={head}>Resolved 30d</th>
                  <th style={head}>Hit Rate</th>
                  <th style={head}>Last Event</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.engine}>
                    <td style={{ ...cell, fontWeight: 600 }}>{r.engine}</td>
                    <td style={cell}>{fmtNum(r.events_24h)}</td>
                    <td style={cell}>{fmtNum(r.events_7d)}</td>
                    <td style={{ ...cell, color: (r.pct_neutral ?? 0) > 70 ? 'var(--msp-warn)' : '#E5E7EB' }}>{fmtPct(r.pct_neutral)}</td>
                    <td style={cell}>{fmtNum(r.mean_confidence)}</td>
                    <td style={{ ...cell, color: (r.pct_floor_failed ?? 0) > 50 ? 'var(--msp-warn)' : '#E5E7EB' }}>{fmtPct(r.pct_floor_failed)}</td>
                    <td style={{ ...cell, color: (r.pct_rg_blocked ?? 0) > 0 ? 'var(--msp-bear)' : '#E5E7EB' }}>{fmtPct(r.pct_rg_blocked)}</td>
                    <td style={{ ...cell, color: (r.pct_stale ?? 0) > 30 ? 'var(--msp-warn)' : '#E5E7EB' }}>{fmtPct(r.pct_stale)}</td>
                    <td style={cell}>{fmtNum(r.outcomes_resolved)}</td>
                    <td style={{ ...cell, color: r.hit_rate == null ? '#6B7280' : r.hit_rate >= 55 ? 'var(--msp-bull)' : r.hit_rate >= 45 ? '#E5E7EB' : 'var(--msp-bear)' }}>
                      {fmtPct(r.hit_rate)}
                    </td>
                    <td style={cell}>{fmtTs(r.last_ts)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td style={cell} colSpan={11}>No data yet — engines have not recorded brain events in this window.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {notes.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: '#9CA3AF' }}>
              {notes.map((n, i) => (
                <div key={i}>• {n}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
