"use client";

/**
 * /admin/pre-trade-checklist — interactive gate evaluator.
 *
 * Operator fills the form (or it's pre-populated from a setup_id), the
 * system runs all gates and returns go / caution / no-go with rationale.
 * Persisting the checklist writes to pre_trade_checklists for behavioral
 * drift analysis later.
 *
 * Boundary: DECISION-SUPPORT only. No broker execution.
 */

import { useCallback, useState } from "react";
import Link from "next/link";

type Recommendation = 'go' | 'caution' | 'no-go';
interface GateResult {
  key: string;
  label: string;
  passed: boolean | null;
  severity: 'blocking' | 'warning';
  detail?: string;
}
interface ChecklistResult {
  recommendation: Recommendation;
  gates: GateResult[];
  blockingGates: string[];
  warningGates: string[];
  rationale: string;
  playbook: { id: string; name: string } | null;
}
interface ApiResponse {
  ok: true;
  result: ChecklistResult;
  persistedId: number | null;
}

const PLAYBOOK_OPTIONS = [
  'vwap-reclaim-long', 'squeeze-break-long', 'range-fade-short',
  'gap-continuation-long', 'failed-breakout-short', 'earnings-iv-crush-fade',
];
const REGIME_OPTIONS = ['trend-up', 'trend-down', 'chop', 'vol-expand', 'vol-contract', 'risk-off'];
const IV_BUCKETS = ['iv<30', 'iv30-70', 'iv>70'];
const FRESHNESS = ['real-time', 'delayed', 'stale', 'missing'];

export default function PreTradeChecklistPage() {
  const [symbol, setSymbol] = useState('');
  const [playbookId, setPlaybookId] = useState('');
  const [observedRegime, setObservedRegime] = useState('');
  const [evidenceQuality, setEvidenceQuality] = useState<string>('70');
  const [ivBucket, setIvBucket] = useState('');
  const [freshness, setFreshness] = useState('real-time');
  const [proposedSizePct, setProposedSizePct] = useState<string>('1');
  const [sameSymbolPct, setSameSymbolPct] = useState<string>('0');
  const [sameSectorPct, setSameSectorPct] = useState<string>('0');

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async (persist: boolean, operatorAction?: 'taken' | 'skipped') => {
    if (!symbol.trim()) { setError('Symbol required'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/pre-trade-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          playbookId: playbookId || undefined,
          observedRegime: observedRegime || undefined,
          evidenceQuality: evidenceQuality ? Number(evidenceQuality) : undefined,
          ivBucket: ivBucket || undefined,
          freshness,
          proposedSizePct: proposedSizePct ? Number(proposedSizePct) : undefined,
          currentExposure: { sameSymbolPct: Number(sameSymbolPct), sameSectorPct: Number(sameSectorPct) },
          persist,
          operatorAction,
        }),
      });
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
  }, [symbol, playbookId, observedRegime, evidenceQuality, ivBucket, freshness, proposedSizePct, sameSymbolPct, sameSectorPct]);

  const recColor = (r: Recommendation): string =>
    r === 'go' ? 'var(--msp-bull)' : r === 'caution' ? 'var(--msp-warn)' : 'var(--msp-bear)';

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Pre-Trade Checklist</h1>
        <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 720 }}>
          Run a standardised gate evaluation before taking any setup. Blocking failures recommend
          no-go; warning failures recommend caution. Overrides are logged for behavioral drift analysis.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 12px' }}>Setup Inputs</h2>
          <Field label="Symbol *"><input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} placeholder="e.g. AAPL" /></Field>
          <Field label="Playbook">
            <select value={playbookId} onChange={(e) => setPlaybookId(e.target.value)} style={inputStyle}>
              <option value="">(none)</option>
              {PLAYBOOK_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Observed Regime">
            <select value={observedRegime} onChange={(e) => setObservedRegime(e.target.value)} style={inputStyle}>
              <option value="">(unknown)</option>
              {REGIME_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Evidence Quality (0–100)">
            <input type="number" min={0} max={100} value={evidenceQuality} onChange={(e) => setEvidenceQuality(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="IV Bucket">
            <select value={ivBucket} onChange={(e) => setIvBucket(e.target.value)} style={inputStyle}>
              <option value="">(unknown)</option>
              {IV_BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Data Freshness">
            <select value={freshness} onChange={(e) => setFreshness(e.target.value)} style={inputStyle}>
              {FRESHNESS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Proposed Size (% of account)">
            <input type="number" min={0} step={0.1} value={proposedSizePct} onChange={(e) => setProposedSizePct(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Current symbol exposure %">
              <input type="number" min={0} step={0.1} value={sameSymbolPct} onChange={(e) => setSameSymbolPct(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Current sector exposure %">
              <input type="number" min={0} step={0.1} value={sameSectorPct} onChange={(e) => setSameSectorPct(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => evaluate(false)} disabled={loading} style={primaryBtn}>
              {loading ? 'Evaluating…' : 'Evaluate'}
            </button>
            <button onClick={() => evaluate(true, 'taken')} disabled={loading || !data} style={secondaryBtn}>
              Log as Taken
            </button>
            <button onClick={() => evaluate(true, 'skipped')} disabled={loading || !data} style={secondaryBtn}>
              Log as Skipped
            </button>
          </div>
        </div>

        <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '0 0 12px' }}>Result</h2>
          {error && (
            <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 10, borderRadius: 6, marginBottom: 12 }}>
              {error}
            </div>
          )}
          {!data && !error && <div style={{ color: '#6B7280', fontSize: 13 }}>Fill the form and click Evaluate.</div>}
          {data && (
            <>
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, color: 'var(--msp-bg)', background: recColor(data.result.recommendation), textTransform: 'uppercase' }}>
                  {data.result.recommendation}
                </span>
                {data.persistedId && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#6B7280' }}>persisted #{data.persistedId}</span>
                )}
              </div>
              <p style={{ color: '#D1D5DB', fontSize: 13, marginTop: 0 }}>{data.result.rationale}</p>
              <div>
                {data.result.gates.map((g) => (
                  <div key={g.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #1F2937' }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#E5E7EB' }}>{g.label}</div>
                      {g.detail && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{g.detail}</div>}
                    </div>
                    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: 'var(--msp-bg)',
                      background: g.passed === true ? 'var(--msp-bull)' : g.passed === false ? (g.severity === 'blocking' ? 'var(--msp-bear)' : 'var(--msp-warn)') : '#6B7280' }}>
                      {g.passed === true ? 'pass' : g.passed === false ? 'fail' : 'n/a'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        <Link href="/admin" style={{ color: 'var(--msp-bull)' }}>Back to admin</Link>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#111827', color: '#E5E7EB',
  border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', fontSize: 13,
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6,
  padding: '8px 16px', fontWeight: 600, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6,
  padding: '8px 16px', fontWeight: 600, cursor: 'pointer',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
