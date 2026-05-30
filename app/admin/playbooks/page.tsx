"use client";

/**
 * /admin/playbooks — reference page listing all registered playbooks
 * with their triggers, invalidations, regime/IV bias, and expected hold.
 *
 * This is the canonical reference operators use when manually classifying
 * setups or auditing why the classifier picked a given playbook.
 *
 * Boundary: RESEARCH/REFERENCE. No execution.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface PlaybookTrigger { label: string; key?: string; }
interface PlaybookInvalidation { label: string; key?: string; }
interface Playbook {
  id: string;
  name: string;
  type: string;
  direction: 'long' | 'short';
  preferredRegime: string;
  ivBias: string;
  expectedHoldBars: number;
  defaultRR: number;
  triggers: PlaybookTrigger[];
  invalidations: PlaybookInvalidation[];
  summary: string;
  featureHints?: Record<string, string>;
}

interface ApiResponse { ok: true; count: number; playbooks: Playbook[]; }

export default function PlaybooksPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = filter === 'all' ? '' : `?direction=${filter}`;
      const res = await fetch(`/api/admin/playbooks${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setData(json as ApiResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Playbook Registry</h1>
          <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 720 }}>
            Canonical setup templates. The scanner classifies discovered setups against these so the Edge Ledger
            can group outcomes meaningfully. Reference-only: this page does not place trades.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#9CA3AF' }}>Direction:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'long' | 'short')}
            style={{ background: '#111827', color: '#E5E7EB', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}>
            <option value="all">All</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ color: '#9CA3AF' }}>Loading…</div>}
      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {data.playbooks.map((pb) => (
            <div key={pb.id} style={{ background: '#0B1220', border: '1px solid #1F2937', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#F9FAFB' }}>{pb.name}</h3>
                  <code style={{ fontSize: 11, color: '#6B7280' }}>{pb.id}</code>
                </div>
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: 'var(--msp-bg)', background: pb.direction === 'long' ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                  {pb.direction.toUpperCase()}
                </span>
              </div>
              <p style={{ color: '#D1D5DB', fontSize: 13, margin: '10px 0 12px' }}>{pb.summary}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, marginBottom: 12 }}>
                <Meta label="Type" value={pb.type} />
                <Meta label="Regime" value={pb.preferredRegime} />
                <Meta label="IV Bias" value={pb.ivBias} />
                <Meta label="Hold" value={`${pb.expectedHoldBars} bars`} />
                <Meta label="Default R/R" value={pb.defaultRR.toFixed(1)} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Triggers</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#D1D5DB' }}>
                  {pb.triggers.map((t, i) => <li key={i}>{t.label}{t.key && <span style={{ color: '#6B7280' }}> · <code>{t.key}</code></span>}</li>)}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Invalidations</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#FCA5A5' }}>
                  {pb.invalidations.map((inv, i) => <li key={i}>{inv.label}{inv.key && <span style={{ color: '#6B7280' }}> · <code>{inv.key}</code></span>}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        <Link href="/admin" style={{ color: 'var(--msp-bull)' }}>Back to admin</Link>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: '#E5E7EB' }}>{value}</div>
    </div>
  );
}
