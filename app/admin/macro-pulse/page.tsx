"use client";

/**
 * /admin/macro-pulse — current macro snapshot from FRED.
 *
 * Reads /api/admin/macro-pulse. Shows the latest value, prior value,
 * change, % change, and freshness age of every series ingested by
 * /api/cron/macro-ingest.
 *
 * Boundary: RESEARCH. No execution.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface MacroRow {
  seriesKey: string;
  description: string;
  units: string;
  category: string;
  cadence: string;
  latestValue: number | null;
  latestObservedOn: string | null;
  prevValue: number | null;
  prevObservedOn: string | null;
  change: number | null;
  changePct: number | null;
  freshnessAgeDays: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  rates: 'Rates', vol: 'Volatility', fx: 'FX', credit: 'Credit',
  liquidity: 'Liquidity', sentiment: 'Macro / Sentiment', other: 'Other',
};

function freshnessColor(age: number | null, cadence: string): string {
  if (age === null) return '#6B7280';
  const cap = cadence === 'daily' ? 3 : cadence === 'weekly' ? 10 : cadence === 'monthly' ? 45 : 120;
  if (age <= cap) return 'var(--msp-bull)';
  if (age <= cap * 2) return 'var(--msp-warn)';
  return 'var(--msp-bear)';
}

function fmtVal(v: number | null, units: string): string {
  if (v === null) return '—';
  if (units === '%') return `${v.toFixed(2)}%`;
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(2);
}

export default function MacroPulsePage() {
  const [snapshot, setSnapshot] = useState<MacroRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/macro-pulse', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSnapshot(json.snapshot as MacroRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  const runIngest = useCallback(async () => {
    setIngesting(true); setError(null);
    try {
      const res = await fetch('/api/cron/macro-ingest', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json?.error ?? json?.reason ?? `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setIngesting(false); }
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const byCategory = useMemo(() => {
    const groups: Record<string, MacroRow[]> = {};
    for (const r of snapshot ?? []) {
      const key = r.category ?? 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [snapshot]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Macro Pulse</h1>
          <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 720 }}>
            Latest FRED observations across rates, vol, FX, credit, and macro sentiment.
            Stale rows (older than expected cadence) are flagged.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={runIngest} disabled={ingesting}
            style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: ingesting ? 'wait' : 'pointer' }}>
            {ingesting ? 'Ingesting…' : 'Ingest now'}
          </button>
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
          {error.includes('no-api-key') && <div style={{ marginTop: 6 }}>Set <code>FRED_API_KEY</code> env var to enable ingest.</div>}
        </div>
      )}

      {snapshot && snapshot.length === 0 && (
        <div style={{ background: '#0B1220', border: '1px solid #374151', borderRadius: 8, padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
          No macro series ingested yet. Click <strong>Ingest now</strong> (requires FRED_API_KEY).
        </div>
      )}

      {snapshot && Object.entries(byCategory).map(([cat, rows]) => (
        <section key={cat} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>{CATEGORY_LABEL[cat] ?? cat}</h2>
          <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#0B1220' }}>
                <tr>
                  <Th>Series</Th>
                  <Th>Description</Th>
                  <Th align="right">Latest</Th>
                  <Th>As of</Th>
                  <Th align="right">Prev</Th>
                  <Th align="right">Δ</Th>
                  <Th align="right">Δ%</Th>
                  <Th align="right">Age (d)</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.seriesKey} style={{ borderTop: '1px solid #1F2937' }}>
                    <Td><strong>{r.seriesKey}</strong></Td>
                    <Td><span style={{ color: '#9CA3AF' }}>{r.description}</span></Td>
                    <Td align="right">{fmtVal(r.latestValue, r.units)}</Td>
                    <Td>{r.latestObservedOn ?? '—'}</Td>
                    <Td align="right">{fmtVal(r.prevValue, r.units)}</Td>
                    <Td align="right" style={{ color: r.change === null ? '#6B7280' : r.change >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                      {r.change === null ? '—' : (r.change >= 0 ? '+' : '') + r.change.toFixed(2)}
                    </Td>
                    <Td align="right" style={{ color: r.changePct === null ? '#6B7280' : r.changePct >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                      {r.changePct === null ? '—' : (r.changePct >= 0 ? '+' : '') + r.changePct.toFixed(2) + '%'}
                    </Td>
                    <Td align="right">
                      <span style={{ color: freshnessColor(r.freshnessAgeDays, r.cadence), fontWeight: 600 }}>
                        {r.freshnessAgeDays ?? '—'}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        <Link href="/admin" style={{ color: 'var(--msp-bull)' }}>Back to admin</Link>
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '8px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties }) {
  return <td style={{ textAlign: align ?? 'left', padding: '8px 10px', color: '#E5E7EB', ...style }}>{children}</td>;
}
