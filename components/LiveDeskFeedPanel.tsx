'use client';

import { useEffect, useMemo, useState } from 'react';

type FeedEvent = {
  symbol: string;
  event: string;
  confidence: number;
  tone: 'bull' | 'bear' | 'warn';
  ago: string;
};

const feedSets: FeedEvent[][] = [
  [
    { symbol: 'NVDA', event: 'Scanner Breakout', confidence: 84, tone: 'bull', ago: '12s' },
    { symbol: 'AAPL', event: 'Options Flow Pulse', confidence: 71, tone: 'bull', ago: '20s' },
    { symbol: 'TSLA', event: 'Regime Shift Watch', confidence: 66, tone: 'warn', ago: '41s' },
    { symbol: 'MSFT', event: 'Momentum Confirmation', confidence: 78, tone: 'bull', ago: '58s' },
  ],
  [
    { symbol: 'SPY', event: 'Liquidity Sweep', confidence: 62, tone: 'warn', ago: '09s' },
    { symbol: 'QQQ', event: 'Trend Continuation', confidence: 80, tone: 'bull', ago: '18s' },
    { symbol: 'IWM', event: 'Relative Weakness', confidence: 64, tone: 'bear', ago: '35s' },
    { symbol: 'AMD', event: 'AI Signal Alignment', confidence: 75, tone: 'bull', ago: '52s' },
  ],
  [
    { symbol: 'META', event: 'Trigger Ladder Armed', confidence: 73, tone: 'bull', ago: '08s' },
    { symbol: 'XLF', event: 'Options Skew Alert', confidence: 61, tone: 'warn', ago: '22s' },
    { symbol: 'DXY', event: 'Macro Pressure Rise', confidence: 68, tone: 'bear', ago: '39s' },
    { symbol: 'BTC', event: 'Volatility Expansion', confidence: 77, tone: 'bull', ago: '55s' },
  ],
];

function toneColor(tone: FeedEvent['tone']) {
  if (tone === 'bull') return 'var(--msp-bull)';
  if (tone === 'bear') return 'var(--msp-bear)';
  return 'var(--msp-warn)';
}

export default function LiveDeskFeedPanel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % feedSets.length);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const feed = useMemo(() => feedSets[index], [index]);
  const highProb = feed.filter((item) => item.confidence >= 75).length;
  const avgConfidence = Math.round(feed.reduce((acc, item) => acc + item.confidence, 0) / feed.length);

  return (
    <section
      style={{
        border: '1px solid var(--msp-border)',
        borderRadius: 12,
        background: 'var(--msp-panel)',
        padding: '0.8rem',
      }}
    >
      <style jsx>{`
        .msp-live-dot {
          animation: pulse 1.8s infinite;
        }
        .msp-bar {
          position: relative;
          overflow: hidden;
        }
        .msp-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.16) 45%, transparent 100%);
          transform: translateX(-120%);
          animation: sweep 3.2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes sweep {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--msp-text-faint)', fontWeight: 800 }}>
          Live Desk Feed
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--msp-text-muted)' }}>
          <span className="msp-live-dot" style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--msp-bull)', boxShadow: '0 0 8px rgba(16,185,129,0.8)' }} />
          <span>Stream Active</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.45fr_1fr] gap-3">
        <div style={{ border: '1px solid var(--msp-border)', borderRadius: 10, background: 'var(--msp-card)', padding: '0.6rem' }}>
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {feed.map((item) => (
              <div key={`${item.symbol}-${item.event}`} style={{ borderBottom: '1px solid var(--msp-divider)', paddingBottom: '0.4rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
                  <strong style={{ fontSize: 12 }}>{item.symbol}</strong>
                  <span style={{ color: 'var(--msp-text-muted)', fontSize: 12 }}>{item.event}</span>
                  <span style={{ color: toneColor(item.tone), fontSize: 12, fontWeight: 700 }}>{item.confidence}%</span>
                  <span style={{ color: 'var(--msp-text-faint)', fontSize: 11 }}>{item.ago}</span>
                </div>
                <div style={{ marginTop: '0.3rem', height: 5, borderRadius: 999, background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)' }}>
                  <div className="msp-bar" style={{ height: '100%', width: `${item.confidence}%`, borderRadius: 999, background: toneColor(item.tone) }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside style={{ border: '1px solid var(--msp-border)', borderRadius: 10, background: 'var(--msp-card)', padding: '0.6rem', display: 'grid', gap: '0.45rem' }}>
          <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--msp-text-faint)', fontWeight: 800 }}>
            MSP AI System Status
          </div>
          <div style={{ display: 'grid', gap: '0.28rem', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--msp-text-muted)' }}><span>Current Market Bias</span><strong style={{ color: 'var(--msp-warn)' }}>Neutral</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--msp-text-muted)' }}><span>High Probability Setups</span><strong style={{ color: 'var(--msp-bull)' }}>{highProb}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--msp-text-muted)' }}><span>Scanner Events</span><strong style={{ color: 'var(--msp-bull)' }}>Active</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--msp-text-muted)' }}><span>Avg Confidence</span><strong style={{ color: 'var(--msp-accent)' }}>{avgConfidence}%</strong></div>
          </div>

          <div style={{ marginTop: '0.2rem', borderTop: '1px solid var(--msp-divider)', paddingTop: '0.45rem', display: 'grid', gap: '0.28rem', fontSize: 11, color: 'var(--msp-text-muted)' }}>
            <div>Edge Score: <strong style={{ color: 'var(--msp-accent)' }}>73 / 100</strong></div>
            <div>Regime State: <strong style={{ color: 'var(--msp-warn)' }}>Balanced Rotation</strong></div>
            <div>Trigger Ladder: <strong style={{ color: 'var(--msp-bull)' }}>2 / 4 Armed</strong></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
