"use client";

/**
 * /admin/transcripts — Earnings call transcript summaries.
 *
 * Workflow:
 * 1) Enter symbol + quarter (e.g. AAPL / 2025Q4).
 * 2) "Ingest + summarise" pulls transcript from AV and runs LLM summary.
 * 3) Re-summarising creates a new version — history is preserved.
 *
 * The LLM is constrained to facts in the transcript only. If guidance
 * isn't mentioned, the guidanceChanges list is empty by design.
 *
 * Boundary: RESEARCH ONLY. No execution.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  oneLiner: string;
  keyThemes: string[];
  guidanceChanges: string[];
  redFlags: string[];
  tone: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  surpriseDirection: 'beat' | 'miss' | 'in_line' | 'unknown';
}

interface StoredSummary {
  symbol: string;
  quarter: string;
  version: number;
  model: string;
  summary: Summary;
  tone: string | null;
  surpriseDirection: string | null;
  generatedAt: string;
  fetchedAt: string | null;
  wordCount: number | null;
  speakerCount: number | null;
}

const TONE_COLOR: Record<string, string> = {
  bullish: 'var(--msp-bull)', bearish: 'var(--msp-bear)', mixed: 'var(--msp-warn)', neutral: '#9CA3AF',
};
const SURPRISE_COLOR: Record<string, string> = {
  beat: 'var(--msp-bull)', miss: 'var(--msp-bear)', in_line: '#9CA3AF', unknown: '#6B7280',
};

export default function TranscriptsPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [quarter, setQuarter] = useState('2025Q4');
  const [stored, setStored] = useState<StoredSummary | null>(null);
  const [quarters, setQuarters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!symbol || !quarter) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/transcripts?symbol=${encodeURIComponent(symbol)}&quarter=${encodeURIComponent(quarter)}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setStored(j.summary as StoredSummary | null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [symbol, quarter]);

  const fetchQuarters = useCallback(async () => {
    if (!symbol) return;
    try {
      const res = await fetch(`/api/admin/transcripts?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const j = await res.json();
      if (j.ok) setQuarters(j.quarters as string[]);
    } catch { /* non-fatal */ }
  }, [symbol]);

  useEffect(() => { fetchSummary(); fetchQuarters(); }, [fetchSummary, fetchQuarters]);

  const run = async (action: 'ingest' | 'summarise' | 'both') => {
    setBusy(true); setError(null); setStatus(null);
    try {
      const res = await fetch('/api/admin/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, quarter, action }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? j?.ingest?.reason ?? j?.summarise?.reason ?? `HTTP ${res.status}`);
      const parts: string[] = [];
      if (j.ingest) parts.push(`ingest: ${j.ingest.ok ? `${j.ingest.segments ?? 0} segments` : j.ingest.reason}`);
      if (j.summarise) parts.push(`summary: ${j.summarise.ok ? `v${j.summarise.version}` : j.summarise.reason}`);
      setStatus(parts.join(' · '));
      await Promise.all([fetchSummary(), fetchQuarters()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Earnings Call Transcripts</h1>
        <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 760 }}>
          Pulls transcripts from Alpha Vantage and runs a constrained LLM summary
          (themes, guidance changes, red flags, tone, surprise direction). Output is
          fact-restricted to the transcript — no invented numbers.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'end' }}>
        <label>
          <div style={lbl}>Symbol</div>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={inp} maxLength={16} />
        </label>
        <label>
          <div style={lbl}>Quarter</div>
          <input value={quarter} onChange={(e) => setQuarter(e.target.value.toUpperCase())} style={inp} placeholder="2025Q4" maxLength={10} />
        </label>
        <button onClick={() => run('both')} disabled={busy}
          style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Working…' : 'Ingest + summarise'}
        </button>
        <button onClick={() => run('summarise')} disabled={busy}
          style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}>
          Re-summarise
        </button>
        <button onClick={fetchSummary} disabled={loading}
          style={{ background: '#1F2937', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {quarters.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: 12, color: '#9CA3AF' }}>
          Available quarters for {symbol}:{' '}
          {quarters.map((q) => (
            <button key={q} onClick={() => setQuarter(q)}
              style={{
                marginRight: 6, marginBottom: 4,
                background: q === quarter ? 'var(--msp-bull)' : '#1F2937',
                color: q === quarter ? 'var(--msp-bg)' : '#E5E7EB',
                border: '1px solid #374151', borderRadius: 4,
                padding: '3px 8px', fontSize: 11, cursor: 'pointer',
              }}>{q}</button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {status && (
        <div style={{ background: '#064E3B', border: '1px solid #065F46', color: '#A7F3D0', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {status}
        </div>
      )}

      {!stored && !loading && !error && (
        <div style={{ background: '#0B1220', border: '1px solid #374151', borderRadius: 8, padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
          No summary yet for {symbol} {quarter}. Click <strong>Ingest + summarise</strong>.
        </div>
      )}

      {stored && (
        <div style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{stored.symbol} — {stored.quarter}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                model: {stored.model} · version: {stored.version} · generated: {new Date(stored.generatedAt).toLocaleString()}
                {stored.fetchedAt && ` · transcript fetched: ${new Date(stored.fetchedAt).toLocaleString()}`}
                {stored.wordCount !== null && ` · ${stored.wordCount.toLocaleString()} words`}
                {stored.speakerCount !== null && ` · ${stored.speakerCount} speakers`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Pill label="Tone" value={stored.tone ?? '—'} color={TONE_COLOR[stored.tone ?? ''] ?? '#9CA3AF'} />
              <Pill label="Surprise" value={stored.surpriseDirection ?? '—'} color={SURPRISE_COLOR[stored.surpriseDirection ?? ''] ?? '#9CA3AF'} />
            </div>
          </div>

          <div style={{ fontSize: 16, fontStyle: 'italic', color: '#F3F4F6', borderLeft: '3px solid #10B981', paddingLeft: 12, margin: '12px 0 20px' }}>
            {stored.summary.oneLiner}
          </div>

          <SummarySection title="Key themes" items={stored.summary.keyThemes} accent="#10B981" />
          <SummarySection title="Guidance changes" items={stored.summary.guidanceChanges} accent="#3B82F6" emptyHint="Not mentioned in transcript" />
          <SummarySection title="Red flags" items={stored.summary.redFlags} accent="#F87171" emptyHint="None flagged" />
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        Source: Alpha Vantage EARNINGS_CALL_TRANSCRIPT · summarised by gpt-4.1 ·{' '}
        <Link href="/admin" style={{ color: 'var(--msp-bull)' }}>Back to admin</Link>
      </div>
    </div>
  );
}

function SummarySection({ title, items, accent, emptyHint }: {
  title: string; items: string[]; accent: string; emptyHint?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6B7280', fontStyle: 'italic' }}>{emptyHint ?? '—'}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontSize: 13, color: '#E5E7EB', marginBottom: 4, borderLeft: `2px solid ${accent}`, paddingLeft: 8, listStyle: 'none' }}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ background: 'var(--msp-bg)', border: '1px solid #1F2937', borderRadius: 999, padding: '4px 10px', fontSize: 11, color: '#9CA3AF' }}>
      {label}: <strong style={{ color, marginLeft: 4, textTransform: 'capitalize' }}>{value.replace('_', ' ')}</strong>
    </span>
  );
}

const inp: React.CSSProperties = {
  background: 'var(--msp-bg)', border: '1px solid #374151', borderRadius: 6,
  padding: '8px 10px', color: '#E5E7EB', fontSize: 13, minWidth: 140,
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
