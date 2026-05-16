"use client";

/**
 * /admin/analogues — find historical edge-ledger setups similar to a
 * candidate, using pgvector cosine distance over a deterministic 32-dim
 * feature embedding.
 *
 * Use this BEFORE taking a trade: enter the candidate's regime, setup
 * type, IV percentile, etc., and review what happened to the closest
 * historical analogues (R-multiple, win rate, median distance).
 *
 * Boundary: RESEARCH ONLY. No execution.
 */

import { useState } from 'react';
import Link from 'next/link';

interface Analogue {
  setupId: number;
  symbol: string;
  surfacedAt: string;
  playbook: string | null;
  setupType: string;
  direction: string;
  regime: string | null;
  opportunityScore: number | null;
  evidenceQuality: number | null;
  distance: number;
  outcome: { classification: string | null; rMultiple: number | null; resolvedAt: string | null } | null;
}

interface Result {
  ok: boolean;
  reason?: string;
  analogues: Analogue[];
  summary: { count: number; avgRMultiple: number | null; winRate: number | null; medianDistance: number | null };
}

const REGIMES = ['trend-up', 'trend-down', 'chop', 'vol-expand', 'vol-contract', 'risk-off'];
const SETUP_TYPES = ['breakout', 'reversal', 'continuation', 'fade', 'mean-revert', 'event-driven'];
const MARKETS = ['equity', 'crypto', 'options', 'futures'];

export default function AnaloguesPage() {
  // Form state
  const [regime, setRegime] = useState('trend-up');
  const [setupType, setSetupType] = useState('breakout');
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [market, setMarket] = useState('equity');
  const [playbook, setPlaybook] = useState('');
  const [sector, setSector] = useState('');
  const [vix, setVix] = useState('');
  const [ivPct, setIvPct] = useState('');
  const [catDays, setCatDays] = useState('');
  const [evQual, setEvQual] = useState('');
  const [oppScore, setOppScore] = useState('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const [rr, setRr] = useState('');
  const [k, setK] = useState(10);

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  const search = async () => {
    setLoading(true); setError(null);
    try {
      const features = {
        regime, setupType, direction, market,
        playbook: playbook || null, sector: sector || null,
        vixLevel: vix ? Number(vix) : null,
        ivPercentile: ivPct ? Number(ivPct) : null,
        catalystProximityDays: catDays ? Number(catDays) : null,
        evidenceQuality: evQual ? Number(evQual) : null,
        opportunityScore: oppScore ? Number(oppScore) : null,
        confidence,
        rewardRisk: rr ? Number(rr) : null,
      };
      const res = await fetch('/api/admin/analogues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features, k }),
      });
      const j = await res.json() as Result;
      if (!res.ok && !j.reason) throw new Error(`HTTP ${res.status}`);
      setResult(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const backfill = async () => {
    setBackfillStatus('Running…');
    try {
      const res = await fetch('/api/admin/analogues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfill: true, limit: 1000 }),
      });
      const j = await res.json();
      setBackfillStatus(j.ok ? `Embedded ${j.updated} historical setups.` : `Failed: ${j.reason ?? j.error}`);
    } catch (e: unknown) {
      setBackfillStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Historical Analogue Search</h1>
        <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 760 }}>
          Find the closest historical setups (by feature similarity) and review their resolved R-multiples.
          Use as context, not as a forecast — outcomes are not predictions.
        </p>
      </div>

      {/* Form */}
      <section style={{ border: '1px solid #374151', background: '#0B1220', borderRadius: 10, padding: 18, marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Candidate features</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label="Regime"><select value={regime} onChange={(e) => setRegime(e.target.value)} style={inp}>
            {REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></Field>
          <Field label="Setup type"><select value={setupType} onChange={(e) => setSetupType(e.target.value)} style={inp}>
            {SETUP_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></Field>
          <Field label="Direction"><select value={direction} onChange={(e) => setDirection(e.target.value as 'long' | 'short')} style={inp}>
            <option value="long">long</option><option value="short">short</option>
          </select></Field>
          <Field label="Market"><select value={market} onChange={(e) => setMarket(e.target.value)} style={inp}>
            {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select></Field>
          <Field label="Confidence"><select value={confidence} onChange={(e) => setConfidence(e.target.value as 'high' | 'medium' | 'low')} style={inp}>
            <option value="high">high</option><option value="medium">medium</option><option value="low">low</option>
          </select></Field>
          <Field label="Playbook"><input value={playbook} onChange={(e) => setPlaybook(e.target.value)} style={inp} placeholder="vwap-reclaim" /></Field>
          <Field label="Sector"><input value={sector} onChange={(e) => setSector(e.target.value)} style={inp} placeholder="Technology" /></Field>
          <Field label="VIX"><input type="number" step="0.1" value={vix} onChange={(e) => setVix(e.target.value)} style={inp} /></Field>
          <Field label="IV %ile"><input type="number" step="1" min="0" max="100" value={ivPct} onChange={(e) => setIvPct(e.target.value)} style={inp} /></Field>
          <Field label="Catalyst (days)"><input type="number" step="1" min="0" value={catDays} onChange={(e) => setCatDays(e.target.value)} style={inp} /></Field>
          <Field label="Evidence quality"><input type="number" step="1" min="0" max="100" value={evQual} onChange={(e) => setEvQual(e.target.value)} style={inp} /></Field>
          <Field label="Opportunity score"><input type="number" step="1" min="0" max="100" value={oppScore} onChange={(e) => setOppScore(e.target.value)} style={inp} /></Field>
          <Field label="Reward:Risk"><input type="number" step="0.1" min="0" value={rr} onChange={(e) => setRr(e.target.value)} style={inp} /></Field>
          <Field label="Top K"><input type="number" step="1" min="1" max="50" value={k} onChange={(e) => setK(Number(e.target.value))} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={search} disabled={loading}
            style={{ background: '#10B981', color: '#0F172A', border: 'none', borderRadius: 6, padding: '10px 18px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Searching…' : 'Find analogues'}
          </button>
          <button onClick={backfill}
            style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
            Backfill embeddings
          </button>
          {backfillStatus && <span style={{ alignSelf: 'center', fontSize: 12, color: '#9CA3AF' }}>{backfillStatus}</span>}
        </div>
      </section>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && !result.ok && result.reason === 'pgvector-unavailable' && (
        <div style={{ background: '#3F2D0A', border: '1px solid #92400E', color: '#FCD34D', padding: 14, borderRadius: 8, marginBottom: 16 }}>
          <strong>pgvector not available.</strong> Install the extension in your Postgres instance (Neon: enable in dashboard, or run
          <code style={{ background: '#0F172A', padding: '0 4px', marginLeft: 4 }}>CREATE EXTENSION vector;</code>)
          and re-run migration 092.
        </div>
      )}

      {result?.ok && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Stat label="Analogues found" value={result.summary.count.toString()} />
            <Stat label="Avg R-multiple" value={result.summary.avgRMultiple === null ? '—' : result.summary.avgRMultiple.toFixed(2)}
              color={result.summary.avgRMultiple === null ? undefined : result.summary.avgRMultiple >= 0 ? '#10B981' : '#F87171'} />
            <Stat label="Win rate" value={result.summary.winRate === null ? '—' : `${(result.summary.winRate * 100).toFixed(0)}%`} />
            <Stat label="Median distance" value={result.summary.medianDistance === null ? '—' : result.summary.medianDistance.toFixed(3)} />
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#0B1220' }}>
                <tr>
                  <Th>Dist</Th><Th>Symbol</Th><Th>When</Th><Th>Playbook</Th><Th>Setup</Th><Th>Dir</Th>
                  <Th>Regime</Th><Th align="right">Opp</Th><Th align="right">Ev</Th>
                  <Th>Outcome</Th><Th align="right">R</Th>
                </tr>
              </thead>
              <tbody>
                {result.analogues.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 18, textAlign: 'center', color: '#6B7280' }}>
                    No analogues. Embed historical setups first (Backfill embeddings).
                  </td></tr>
                )}
                {result.analogues.map((a) => (
                  <tr key={a.setupId} style={{ borderTop: '1px solid #1F2937' }}>
                    <Td><span style={{ color: a.distance < 0.1 ? '#10B981' : a.distance < 0.3 ? '#F59E0B' : '#9CA3AF', fontFamily: 'monospace' }}>
                      {a.distance.toFixed(3)}
                    </span></Td>
                    <Td><strong>{a.symbol}</strong></Td>
                    <Td>{a.surfacedAt.slice(0, 10)}</Td>
                    <Td>{a.playbook ?? '—'}</Td>
                    <Td>{a.setupType}</Td>
                    <Td>{a.direction}</Td>
                    <Td>{a.regime ?? '—'}</Td>
                    <Td align="right">{a.opportunityScore?.toFixed(0) ?? '—'}</Td>
                    <Td align="right">{a.evidenceQuality?.toFixed(0) ?? '—'}</Td>
                    <Td>{a.outcome?.classification ?? <span style={{ color: '#6B7280' }}>unresolved</span>}</Td>
                    <Td align="right" style={{ color: a.outcome?.rMultiple == null ? '#6B7280' : a.outcome.rMultiple >= 0 ? '#10B981' : '#F87171' }}>
                      {a.outcome?.rMultiple == null ? '—' : a.outcome.rMultiple.toFixed(2)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        <Link href="/admin" style={{ color: '#10B981' }}>Back to admin</Link>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {children}
    </label>
  );
}
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
const inp: React.CSSProperties = {
  width: '100%', background: '#0F172A', border: '1px solid #374151',
  borderRadius: 6, padding: '8px 10px', color: '#E5E7EB', fontSize: 13,
};
