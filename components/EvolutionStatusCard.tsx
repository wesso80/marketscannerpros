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
  created_at: string;
};

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

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
      border: '1px solid rgba(16,185,129,0.35)',
      borderRadius: '12px',
      padding: compact ? '0.65rem 0.8rem' : '0.9rem 1rem',
      marginBottom: '1rem',
      display: 'grid',
      gap: '0.3rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>
          System Adaptation Status
        </div>
        <div style={{ color: '#10B981', fontSize: '0.72rem', fontWeight: 800 }}>
          {latest.cadence.toUpperCase()} • CONF {Math.round(latest.confidence * 100)}%
        </div>
      </div>

      {latest.changes_json.slice(0, 3).map((change, index) => (
        <div key={index} style={{ color: '#E2E8F0', fontSize: '0.7rem' }}>
          ✔ {change.parameter.replace(/_/g, ' ')} {change.new > change.old ? 'increased' : 'decreased'} ({(Math.abs(change.new - change.old) * 100).toFixed(1)}%)
        </div>
      ))}
    </div>
  );
}
