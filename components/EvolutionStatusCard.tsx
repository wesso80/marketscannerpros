"use client";

import { useEffect, useState } from 'react';

type EvolutionRow = {
  id: number;
  symbol_group: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  confidence: number;
  changes_json: Array<{
    parameter: string;
    old: number;
    new: number;
    reason: string;
  }>;
  metrics_json?: {
    timeOfDayEdge?: Array<{ bucket: 'OPEN' | 'MIDDAY' | 'CLOSE' | 'AFTERHOURS'; winRate: number; sampleSize: number }>;
  };
  created_at: string;
};

function formatAdaptationMessage(change: EvolutionRow['changes_json'][number]): string {
  const deltaPct = Math.abs(change.new - change.old) * 100;
  const direction = change.new > change.old ? 'increased' : 'decreased';

  if (change.parameter === 'capital_flow_weight') {
    return `Flow importance ${direction} ${deltaPct.toFixed(1)}%`;
  }
  if (change.parameter === 'armed_threshold') {
    return `Setup quality threshold ${direction} ${deltaPct.toFixed(1)}%`;
  }
  if (change.parameter === 'fast_jump_penalty') {
    return `Fast state jumps ${change.new > 1 ? 'penalized' : 'relaxed'} (${deltaPct.toFixed(1)}%)`;
  }

  return `${change.parameter.replace(/_/g, ' ')} ${direction} ${deltaPct.toFixed(1)}%`;
}

export default function EvolutionStatusCard({ compact = true }: { compact?: boolean }) {
  const [rows, setRows] = useState<EvolutionRow[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch('/api/evolution?limit=3', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok || !active) return;
        const payload = await response.json();
        if (active && payload?.success && Array.isArray(payload?.data)) {
          setRows(payload.data);
        }
      } catch {
        if (active) setRows([]);
      }
    };

    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!rows.length) return null;

  const latest = rows[0];
  const sessionEdge = latest.metrics_json?.timeOfDayEdge || [];
  const openEdge = sessionEdge.find((entry) => entry.bucket === 'OPEN');
  const middayEdge = sessionEdge.find((entry) => entry.bucket === 'MIDDAY');
  const openVsMidday = (openEdge && middayEdge)
    ? openEdge.winRate - middayEdge.winRate
    : null;

  return (
    <div style={{
      background: 'var(--msp-card)',
      border: '1px solid rgba(16,185,129,0.35)',
      borderRadius: '12px',
      padding: compact ? '0.65rem 0.8rem' : '0.9rem 1rem',
      marginBottom: '1rem',
      display: 'grid',
      gap: '0.3rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--msp-accent)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>
          System Adaptation Status
        </div>
        <div style={{ color: '#10B981', fontSize: '0.72rem', fontWeight: 800 }}>
          {latest.cadence.toUpperCase()} • CONF {Math.round(latest.confidence * 100)}%
        </div>
      </div>

      {latest.changes_json.slice(0, 2).map((change, index) => (
        <div key={index} style={{ color: '#E2E8F0', fontSize: '0.7rem' }}>
          ✔ {formatAdaptationMessage(change)}
        </div>
      ))}

      {openVsMidday !== null && (
        <div style={{ color: '#E2E8F0', fontSize: '0.7rem' }}>
          ✔ Open session edge {openVsMidday >= 0 ? 'strengthening' : 'weakening'} ({Math.abs(openVsMidday * 100).toFixed(1)}%)
        </div>
      )}
    </div>
  );
}
