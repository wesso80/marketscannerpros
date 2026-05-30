"use client";

/**
 * /admin/insider — recent Form 4 insider transactions per symbol.
 *
 * Use "Ingest now" to pull the latest filings from SEC EDGAR (requires
 * EDGAR_USER_AGENT env var with a real contact email per SEC policy).
 * Window selector shows summary buy/sell stats. Missing fields stay
 * blank — never silently filled.
 *
 * Boundary: RESEARCH ONLY. No execution.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface InsiderRow {
  id: number;
  reporterName: string | null;
  reporterRelationship: string | null;
  transactionDate: string;
  transactionCode: string | null;
  shares: number | null;
  pricePerShare: number | null;
  totalValue: number | null;
  sharesAfter: number | null;
  directOrIndirect: string | null;
  filingUrl: string | null;
}

interface InsiderSummary {
  symbol: string;
  windowDays: number;
  totalTransactions: number;
  buys: { count: number; shares: number; value: number };
  sells: { count: number; shares: number; value: number };
  uniqueInsiders: number;
  latestTransactionDate: string | null;
}

const CODE_LABEL: Record<string, string> = {
  P: 'Open-market buy', S: 'Open-market sale', A: 'Grant/award',
  D: 'Disposition (other)', M: 'Option exercise', F: 'Tax withholding',
  G: 'Gift', J: 'Other', K: 'Swap', L: 'Small acquisition',
};

function fmt(n: number | null, opts: { money?: boolean } = {}): string {
  if (n === null || Number.isNaN(n)) return '—';
  if (opts.money) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function InsiderPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [windowDays, setWindowDays] = useState(90);
  const [summary, setSummary] = useState<InsiderSummary | null>(null);
  const [rows, setRows] = useState<InsiderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/insider?symbol=${encodeURIComponent(sym)}&window=${windowDays}&limit=100`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setSummary(j.summary as InsiderSummary);
      setRows(j.transactions as InsiderRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [windowDays]);

  const runIngest = useCallback(async () => {
    if (!symbol) return;
    setIngesting(true); setError(null);
    try {
      const res = await fetch('/api/admin/insider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, maxFilings: 20 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchData(symbol);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setIngesting(false); }
  }, [symbol, fetchData]);

  useEffect(() => { fetchData(symbol); }, [symbol, fetchData]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Insider Transactions (SEC Form 4)</h1>
        <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 760 }}>
          Pulls directly from SEC EDGAR. Cluster buying by multiple insiders is generally a stronger signal than
          single-name selling, which can be driven by 10b5-1 plans or tax events. Always read filings before acting.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'end' }}>
        <label style={{ display: 'block' }}>
          <div style={lbl}>Symbol</div>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={inp} maxLength={16} />
        </label>
        <label style={{ display: 'block' }}>
          <div style={lbl}>Window (days)</div>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} style={inp}>
            <option value={30}>30</option>
            <option value={90}>90</option>
            <option value={180}>180</option>
            <option value={365}>365</option>
          </select>
        </label>
        <button onClick={() => fetchData(symbol)} disabled={loading}
          style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Loading…' : 'Load'}
        </button>
        <button onClick={runIngest} disabled={ingesting || !symbol}
          style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}>
          {ingesting ? 'Ingesting…' : 'Ingest from SEC'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          <Stat label="Transactions" value={summary.totalTransactions.toString()} />
          <Stat label="Unique insiders" value={summary.uniqueInsiders.toString()} />
          <Stat label="Buys (count)" value={summary.buys.count.toString()} color="#10B981" />
          <Stat label="Buy value" value={fmt(summary.buys.value, { money: true })} color="#10B981" />
          <Stat label="Sells (count)" value={summary.sells.count.toString()} color="#F87171" />
          <Stat label="Sell value" value={fmt(summary.sells.value, { money: true })} color="#F87171" />
          <Stat label="Latest tx" value={summary.latestTransactionDate ?? '—'} />
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#0B1220' }}>
            <tr>
              <Th>Date</Th><Th>Insider</Th><Th>Role</Th><Th>Code</Th>
              <Th align="right">Shares</Th><Th align="right">Price</Th>
              <Th align="right">Value</Th><Th align="right">After</Th>
              <Th>D/I</Th><Th>Filing</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 18, textAlign: 'center', color: '#6B7280' }}>
                {loading ? 'Loading…' : 'No transactions found. Click Ingest from SEC.'}
              </td></tr>
            )}
            {rows.map((r) => {
              const buy = r.transactionCode === 'P';
              const sell = r.transactionCode === 'S';
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #1F2937' }}>
                  <Td>{r.transactionDate}</Td>
                  <Td>{r.reporterName ?? '—'}</Td>
                  <Td><span style={{ color: '#9CA3AF', fontSize: 12 }}>{r.reporterRelationship ?? '—'}</span></Td>
                  <Td>
                    <span style={{ color: buy ? 'var(--msp-bull)' : sell ? 'var(--msp-bear)' : '#E5E7EB', fontWeight: 600 }}>
                      {r.transactionCode ?? '—'}
                    </span>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {r.transactionCode ? (CODE_LABEL[r.transactionCode] ?? '') : ''}
                    </div>
                  </Td>
                  <Td align="right">{fmt(r.shares)}</Td>
                  <Td align="right">{r.pricePerShare === null ? '—' : `$${r.pricePerShare.toFixed(2)}`}</Td>
                  <Td align="right" style={{ color: buy ? 'var(--msp-bull)' : sell ? 'var(--msp-bear)' : '#E5E7EB' }}>
                    {fmt(r.totalValue, { money: true })}
                  </Td>
                  <Td align="right">{fmt(r.sharesAfter)}</Td>
                  <Td>{r.directOrIndirect ?? '—'}</Td>
                  <Td>
                    {r.filingUrl
                      ? <a href={r.filingUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--msp-bull)', fontSize: 12 }}>EDGAR</a>
                      : '—'}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        Source: SEC EDGAR (free, public). Set <code>EDGAR_USER_AGENT</code> env var per SEC policy.
        {' '}<Link href="/admin" style={{ color: 'var(--msp-bull)' }}>Back to admin</Link>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  background: 'var(--msp-bg)', border: '1px solid #374151', borderRadius: 6,
  padding: '8px 10px', color: '#E5E7EB', fontSize: 13, minWidth: 140,
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '8px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties }) {
  return <td style={{ textAlign: align ?? 'left', padding: '8px 10px', color: '#E5E7EB', ...style }}>{children}</td>;
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? '#F9FAFB', marginTop: 4 }}>{value}</div>
    </div>
  );
}
