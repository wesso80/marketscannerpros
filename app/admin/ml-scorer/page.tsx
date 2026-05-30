"use client";

/**
 * /admin/ml-scorer — predicted-win-rate model dashboard.
 *
 * Trains on demand from edge_ledger_setups joined with outcomes.
 * Shows training-set size, log loss, accuracy, and the top weighted
 * features so the operator can audit WHY the model believes what it does.
 *
 * Boundary: research only. The model is a prior, not a recommendation.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface ModelStats {
  n: number;
  bias: number;
  trainedAt: string;
  trainLogLoss: number;
  trainAcc: number;
  topFeatures: { name: string; weight: number }[];
}

export default function MlScorerPage() {
  const [model, setModel] = useState<ModelStats | null>(null);
  const [reliable, setReliable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const train = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/ml-scorer', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setModel(j.model);
      setReliable(!!j.reliable);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { train(); }, [train]);

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: '#F9FAFB' }}>ML Win-Rate Scorer</h1>
          <p style={{ margin: '6px 0 0', color: '#9CA3AF', fontSize: 13, maxWidth: 640 }}>
            Logistic model trained on your resolved setups (5d realised R). Predicts the probability that a fresh setup with the same features ends 5d above water.
          </p>
        </div>
        <button onClick={train} disabled={loading}
          style={{ background: 'var(--msp-bull)', color: 'var(--msp-bg)', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Training…' : 'Re-train'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {model && (
        <>
          {!reliable && (
            <div style={{ background: '#3F2D0A', border: '1px solid #92400E', color: '#FCD34D', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              Training set is small (n={model.n}). Predictions are unreliable below ~30 resolved setups — treat outputs as priors only.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Stat label="Training set" value={String(model.n)} />
            <Stat label="Log loss" value={model.trainLogLoss.toFixed(3)} />
            <Stat label="Train accuracy" value={(model.trainAcc * 100).toFixed(0) + '%'} />
            <Stat label="Bias" value={model.bias.toFixed(3)} />
          </div>

          <h2 style={{ fontSize: 16, color: '#F3F4F6', margin: '20px 0 8px' }}>Top weighted features</h2>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
            Positive weight = feature pushes win probability up. Negative = pushes down. Magnitudes are comparable.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              <th style={th}>Feature</th>
              <th style={{ ...th, textAlign: 'right' }}>Weight</th>
              <th style={{ ...th, textAlign: 'left' }}>Direction</th>
            </tr></thead>
            <tbody>
              {model.topFeatures.map((f) => (
                <tr key={f.name} style={{ borderTop: '1px solid #1F2937' }}>
                  <td style={td}><code>{f.name}</code></td>
                  <td style={{ ...td, textAlign: 'right', color: f.weight >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                    {(f.weight >= 0 ? '+' : '') + f.weight.toFixed(3)}
                  </td>
                  <td style={td}>{f.weight >= 0 ? 'increases win prob' : 'decreases win prob'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, fontSize: 11, color: '#6B7280' }}>
            Trained {new Date(model.trainedAt).toLocaleString()} ·{' '}
            <Link href="/admin/edge-ledger" style={{ color: 'var(--msp-bull)' }}>edge ledger</Link> ·{' '}
            <Link href="/admin/operator-health" style={{ color: 'var(--msp-bull)' }}>calibration</Link>
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
