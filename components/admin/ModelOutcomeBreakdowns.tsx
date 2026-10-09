"use client";

import { useState } from 'react';
import type { BreakdownDimension, OutcomeBreakdowns } from '@/lib/admin/modelBreakdowns';

const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
export default function ModelOutcomeBreakdowns({ data, minimum }: { data: OutcomeBreakdowns; minimum: number }) {
  const [dimension, setDimension] = useState<BreakdownDimension>('asset');
  return <section aria-label="Outcome breakdowns" style={{ marginBottom: '1.5rem' }}>
    <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Outcomes by group</h2>
    <p style={{ color: '#94A3B8', fontSize: 12 }}>
      Each view partitions the same latest-1,000 sample by one recorded attribute. Groups are alphabetical, not ranked.
      Their date ranges and score mixes can differ. These are descriptive comparisons, not independent tests or proof of an edge.
      Regime is the recorded signal-time classification, not today’s market state.
    </p>
    <label style={{ display: 'block', marginBottom: 12 }}>Group outcomes by{' '}
      <select value={dimension} onChange={event => setDimension(event.target.value as BreakdownDimension)}
        style={{ minHeight: 44, background: '#0D1626', color: '#E5E7EB', border: '1px solid #475569', borderRadius: 8, padding: 8 }}>
        <option value="asset">Asset class</option><option value="timeframe">Timeframe</option><option value="regime">Recorded regime</option>
      </select>
    </label>
    {data[dimension].length === 0 && <p>No signals in this sample.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
      {data[dimension].map(group => <article aria-label={`${group.name} outcome summary`} key={group.name}
        style={{ background: 'rgba(13,22,38,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, overflowWrap: 'anywhere' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{group.name}</h3>
        <p>{group.signals} signals · {group.labelled} directional verdicts</p>
        <p>{group.wins} correct / {group.losses} wrong · hit rate {group.hitRate === null ? 'Not available' : `${group.hitRate}%`}</p>
        <p style={{ color: '#94A3B8', fontSize: 12 }}>{group.neutral} neutral · {group.pending} pending · {group.expired} expired · {group.excludedOrUnknown} excluded/unknown</p>
        {group.excludedScores > 0 && <p>{group.excludedScores} signals have scores outside the calibration bands; excluded from outcome statistics.</p>}
        <p style={{ color: '#94A3B8', fontSize: 12 }}>Signals dated {date(group.sampleFrom)} → {date(group.sampleTo)}. {group.undatedSignals > 0 ? `${group.undatedSignals} signal dates not recorded.` : ''}</p>
        {group.smallSample && <p style={{ color: '#FBBF24', fontSize: 12 }}>Too few labelled to compare (under {minimum}).</p>}
      </article>)}
    </div>
  </section>;
}
