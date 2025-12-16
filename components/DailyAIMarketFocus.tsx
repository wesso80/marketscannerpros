'use client';

import React, { useEffect, useState } from 'react';

interface MarketPick {
  assetClass: string;
  asset: string;
  phase: string;
  structure: string;
  risk: string;
  explanation: string | null;
}

interface MarketFocusData {
  date: string;
  picks: MarketPick[];
}

export default function DailyAIMarketFocus() {
  const [data, setData] = useState<MarketFocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fallback: MarketFocusData = {
      date: new Date().toISOString().slice(0, 10),
      picks: [
        { assetClass: 'Equity', asset: '—', phase: '—', structure: '—', risk: '—', explanation: null },
        { assetClass: 'Crypto', asset: '—', phase: '—', structure: '—', risk: '—', explanation: null },
        { assetClass: 'Commodity', asset: '—', phase: '—', structure: '—', risk: '—', explanation: null },
      ],
    };

    const load = async () => {
      try {
        const res = await fetch('/api/ai-market-focus', { credentials: 'include' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`AI Market Focus API ${res.status}: ${text || 'unknown error'}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.warn('AI Market Focus fetch error:', err);
        setError('Failed to load AI Market Focus.');
        setData(fallback);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) return <div>Loading Daily AI Market Focus...</div>;
  if (error) return <div style={{ color: '#EF4444' }}>{error}</div>;
  if (!data || !data.picks) return null;

  return (
    <section style={{ background: '#1e293b', borderRadius: 16, padding: 32, margin: '32px 0', color: '#fff' }}>
      <h2 style={{ color: '#a78bfa', fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Today’s AI Market Focus</h2>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {data.picks.map((pick) => (
          <div key={pick.assetClass} style={{ flex: 1, minWidth: 260, background: '#232e41', borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h3 style={{ color: '#38bdf8', fontSize: 22, fontWeight: 600 }}>{pick.assetClass}</h3>
            <div style={{ margin: '8px 0 4px 0', fontSize: 18 }}><b>Asset:</b> {pick.asset}</div>
            <div style={{ margin: '4px 0', fontSize: 16 }}><b>Phase:</b> {pick.phase}</div>
            <div style={{ margin: '4px 0', fontSize: 16 }}><b>Structure:</b> {pick.structure}</div>
            <div style={{ margin: '4px 0', fontSize: 16 }}><b>Risk:</b> {pick.risk}</div>
            <div style={{ marginTop: 12, color: '#a3e635', fontSize: 15, minHeight: 40 }}>
              {pick.explanation || <span style={{ color: '#94A3B8' }}>No explanation available.</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ color: '#94A3B8', fontSize: 13, marginTop: 16 }}>
        <b>Note:</b> This panel is curated daily by AI using multi-timeframe structure, phase logic, and volatility context. No trade advice.
      </div>
    </section>
  );
}
