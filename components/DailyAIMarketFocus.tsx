'use client';

import React, { useEffect, useState } from 'react';

interface MarketPick {
  assetClass: string;
  asset: string;
  name?: string;
  score?: number;
  phase: string;
  structure: string;
  risk: string;
  explanation: string | null;
}

interface MarketFocusData {
  date: string;
  picks: MarketPick[];
  status?: string;
  message?: string;
}

const assetColors: Record<string, { bg: string; border: string; accent: string }> = {
  Equity: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', accent: '#60a5fa' },
  Crypto: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', accent: '#fbbf24' },
  Commodity: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', accent: '#34d399' },
};

function getRelativeDate(dateStr: string): { text: string; isStale: boolean } {
  const pickDate = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - pickDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return { text: 'Today', isStale: false };
  if (diffDays === 1) return { text: 'Yesterday', isStale: false };
  if (diffDays <= 7) return { text: `${diffDays} days ago`, isStale: true };
  return { text: dateStr, isStale: true };
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
      status: 'empty',
    };

    const load = async () => {
      try {
        // Add cache-busting to ensure fresh data
        const res = await fetch(`/api/ai-market-focus?_t=${Date.now()}`, { 
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API ${res.status}: ${text || 'unknown error'}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        console.warn('AI Market Focus fetch error:', err);
        setError('Failed to load AI Market Focus. Click "Refresh AI Focus" to generate.');
        setData(fallback);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        border: '1px solid rgba(139, 92, 246, 0.2)',
      }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
        <div style={{ color: '#a78bfa', fontSize: 16 }}>Loading Daily AI Market Focus...</div>
      </div>
    );
  }

  if (error && (!data || data.status === 'empty')) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        border: '1px solid rgba(239, 68, 68, 0.3)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
        <div style={{ color: '#f87171', fontSize: 16, marginBottom: 8 }}>{error}</div>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          The AI Market Focus is generated daily. Use the refresh button above to trigger generation.
        </p>
      </div>
    );
  }

  if (!data || !data.picks) return null;

  const dateInfo = getRelativeDate(data.date);

  return (
    <section style={{
      background: 'var(--msp-card)',
      borderRadius: 20,
      padding: 32,
      color: '#fff',
      border: '1px solid rgba(139, 92, 246, 0.25)',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#a78bfa', fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎯</span> Today's AI Market Focus
          </h2>
          <p style={{ color: dateInfo.isStale ? '#f59e0b' : '#64748b', fontSize: 13, margin: '6px 0 0 0' }}>
            {dateInfo.isStale ? `⚠️ Generated ${dateInfo.text}` : `Generated: ${dateInfo.text}`} • AI-curated picks across asset classes
          </p>
        </div>
        {dateInfo.isStale && data.status !== 'empty' && (
          <span style={{
            padding: '6px 14px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 20,
            fontSize: 12,
            color: '#fbbf24',
          }}>
            Needs Refresh
          </span>
        )}
        {data.status === 'empty' && (
          <span style={{
            padding: '6px 14px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 20,
            fontSize: 12,
            color: '#fbbf24',
          }}>
            Awaiting Generation
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {data.picks.map((pick) => {
          const colors = assetColors[pick.assetClass] || assetColors.Equity;
          const score = pick.score ?? 0;
          const microBadge = score >= 70 
            ? { icon: '🟢', label: 'Trend-Favored', color: '#34d399' }
            : score >= 40 
            ? { icon: '🟡', label: 'Neutral / Range', color: '#fbbf24' }
            : { icon: '🔴', label: 'Risk-Off', color: '#f87171' };
          
          return (
            <div
              key={pick.assetClass}
              style={{
                background: colors.bg,
                borderRadius: 16,
                padding: 24,
                border: `1px solid ${colors.border}`,
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              {/* Micro-Badge for instant scan */}
              {score > 0 && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 20,
                  marginBottom: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: microBadge.color,
                }}>
                  <span>{microBadge.icon}</span>
                  <span>{microBadge.label}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <h3 style={{ color: colors.accent, fontSize: 20, fontWeight: 700, margin: 0 }}>
                  {pick.assetClass}
                </h3>
                {pick.score !== undefined && pick.score > 0 && (
                  <span style={{
                    padding: '4px 10px',
                    background: pick.score >= 70 ? 'rgba(16, 185, 129, 0.2)' : pick.score >= 50 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600,
                    color: pick.score >= 70 ? '#34d399' : pick.score >= 50 ? '#fbbf24' : '#f87171',
                  }}>
                    Score: {pick.score}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                  {pick.asset}
                </div>
                {pick.name && pick.name !== pick.asset && (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>{pick.name}</div>
                )}
              </div>

              <div className="grid-equal-2-col-responsive" style={{ marginBottom: 16 }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phase</div>
                  <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{pick.phase}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Structure</div>
                  <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{pick.structure}</div>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Risk Assessment</div>
                <div style={{ fontSize: 14, color: pick.risk.includes('Overbought') ? '#fbbf24' : pick.risk.includes('Oversold') ? '#f87171' : '#e2e8f0', fontWeight: 500 }}>
                  {pick.risk}
                </div>
              </div>

              <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: 14,
                borderRadius: 12,
                minHeight: 80,
              }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  AI Analysis
                </div>
                <div style={{ fontSize: 13, color: '#a3e635', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {pick.explanation || <span style={{ color: '#64748b', fontStyle: 'italic' }}>Explanation not yet generated.</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 24,
        padding: '14px 18px',
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>📊</span>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: '#c4b5fd' }}>How to use:</strong> This panel shows daily AI-curated picks based on multi-timeframe structure, phase logic, and volatility context. Use it for research, not as trade signals. Always do your own analysis.
        </p>
      </div>
    </section>
  );
}
