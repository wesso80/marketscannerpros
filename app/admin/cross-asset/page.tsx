"use client";

/**
 * /admin/cross-asset — cross-asset confluence panel.
 *
 * Enter a target symbol → see its 20d & 60d correlations against the
 * macro basket (SPY/QQQ/TLT/GLD/USO/UUP) and the current risk-tilt regime.
 *
 * Boundary: RESEARCH. No execution.
 */

import { useCallback, useState } from "react";
import Link from "next/link";

interface CorrPair {
  symbol: string;
  windowDays: number;
  corr: number | null;
  bars: number;
  freshness: string;
}
interface RegimeMember {
  symbol: string;
  lastClose: number | null;
  ema50: number | null;
  aboveEma50: boolean | null;
  trend1m: number | null;
  freshness: string;
}
interface Report {
  target: string;
  generatedAt: string;
  correlations20d: CorrPair[];
  correlations60d: CorrPair[];
  basket: RegimeMember[];
  riskTilt: 'risk-on' | 'risk-off' | 'mixed' | 'unknown';
  riskTiltScore: number;
  notes: string[];
}

function tiltColor(t: Report['riskTilt']): string {
  if (t === 'risk-on') return '#10B981';
  if (t === 'risk-off') return '#EF4444';
  if (t === 'mixed') return '#F59E0B';
  return '#6B7280';
}
function corrColor(c: number | null): string {
  if (c === null) return '#6B7280';
  const a = Math.abs(c);
  if (a >= 0.7) return c > 0 ? '#10B981' : '#EF4444';
  if (a >= 0.4) return c > 0 ? '#34D399' : '#F87171';
  return '#9CA3AF';
}
function fmtCorr(c: number | null): string {
  if (c === null) return '—';
  return c.toFixed(2);
}
function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export default function CrossAssetPage() {
  const [symbol, setSymbol] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) { setError('Enter a symbol'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/cross-asset?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setData(json.report as Report);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [symbol]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Cross-Asset Confluence</h1>
      <p style={{ margin: '8px 0 20px', color: '#9CA3AF', fontSize: 14, maxWidth: 720 }}>
        Target symbol vs macro basket. 20d &amp; 60d Pearson on daily returns. Risk-tilt
        derived from how many basket members are above their 50-EMA.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. AAPL"
          onKeyDown={(e) => { if (e.key === 'Enter') fetchData(); }}
          style={{ background: '#111827', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '8px 12px', fontSize: 14, flex: 1, maxWidth: 240 }} />
        <button onClick={fetchData} disabled={loading}
          style={{ background: '#10B981', color: '#0F172A', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Loading…' : 'Analyse'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Target</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#F9FAFB' }}>{data.target}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Risk Tilt</div>
              <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#0F172A', background: tiltColor(data.riskTilt) }}>
                {data.riskTilt.toUpperCase()} ({data.riskTiltScore >= 0 ? '+' : ''}{data.riskTiltScore})
              </span>
            </div>
          </div>

          {data.notes.length > 0 && (
            <div style={{ background: '#451A03', border: '1px solid #92400E', color: '#FCD34D', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {data.notes.map((n, i) => <div key={i}>⚠ {n}</div>)}
            </div>
          )}

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>Macro Basket (1m trend &amp; vs 50-EMA)</h2>
            <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#0B1220' }}>
                  <tr>
                    <Th>Symbol</Th>
                    <Th align="right">Last</Th>
                    <Th align="right">50-EMA</Th>
                    <Th align="right">Above</Th>
                    <Th align="right">1m Trend</Th>
                    <Th>Freshness</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.basket.map((m) => (
                    <tr key={m.symbol} style={{ borderTop: '1px solid #1F2937' }}>
                      <Td><strong>{m.symbol}</strong></Td>
                      <Td align="right">{m.lastClose?.toFixed(2) ?? '—'}</Td>
                      <Td align="right">{m.ema50?.toFixed(2) ?? '—'}</Td>
                      <Td align="right">
                        <span style={{ color: m.aboveEma50 === null ? '#6B7280' : m.aboveEma50 ? '#10B981' : '#EF4444', fontWeight: 700 }}>
                          {m.aboveEma50 === null ? '—' : m.aboveEma50 ? '▲' : '▼'}
                        </span>
                      </Td>
                      <Td align="right" style={{ color: m.trend1m === null ? '#6B7280' : m.trend1m >= 0 ? '#10B981' : '#EF4444' }}>
                        {fmtPct(m.trend1m)}
                      </Td>
                      <Td><span style={{ fontSize: 11, color: '#9CA3AF' }}>{m.freshness}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 10px' }}>Correlation Matrix</h2>
            <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#0B1220' }}>
                  <tr>
                    <Th>Pair</Th>
                    <Th align="right">20d</Th>
                    <Th align="right">60d</Th>
                    <Th align="right">Bars 20d</Th>
                    <Th align="right">Bars 60d</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.correlations20d.map((c20, i) => {
                    const c60 = data.correlations60d[i];
                    return (
                      <tr key={c20.symbol} style={{ borderTop: '1px solid #1F2937' }}>
                        <Td><strong>{data.target}</strong> ↔ {c20.symbol}</Td>
                        <Td align="right" style={{ color: corrColor(c20.corr), fontWeight: 600 }}>{fmtCorr(c20.corr)}</Td>
                        <Td align="right" style={{ color: corrColor(c60?.corr ?? null), fontWeight: 600 }}>{fmtCorr(c60?.corr ?? null)}</Td>
                        <Td align="right">{c20.bars}</Td>
                        <Td align="right">{c60?.bars ?? 0}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 8, fontSize: 11, color: '#6B7280' }}>
              |ρ| ≥ 0.7 strong · 0.4–0.7 moderate · &lt; 0.4 weak. Bright green / red flag strong same/inverse coupling.
            </p>
          </section>

          <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
            Generated at {new Date(data.generatedAt).toLocaleString()} ·{' '}
            <Link href="/admin" style={{ color: '#10B981' }}>Back to admin</Link>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '8px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties }) {
  return <td style={{ textAlign: align ?? 'left', padding: '8px 10px', color: '#E5E7EB', ...style }}>{children}</td>;
}
