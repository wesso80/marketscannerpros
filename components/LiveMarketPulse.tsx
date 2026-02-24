'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Simulated example signals for demo/marketing — NOT live data
const LIVE_SIGNALS = [
  {
    symbol: 'NVDA',
    type: 'Bullish Breakout',
    confidence: 94,
    price: '$142.85',
    change: '+3.2%',
    aiInsight: 'Breaking above 200 EMA with volume surge. RSI momentum confirming strength.',
    timeAgo: '2 min ago',
    asset: 'equity'
  },
  {
    symbol: 'BTC',
    type: 'Accumulation Zone',
    confidence: 87,
    price: '$104,250',
    change: '+1.8%',
    aiInsight: 'Wyckoff spring detected. Institutional buying pressure at key support.',
    timeAgo: '5 min ago',
    asset: 'crypto'
  },
  {
    symbol: 'TSLA',
    type: 'Momentum Shift',
    confidence: 91,
    price: '$421.20',
    change: '+2.1%',
    aiInsight: 'MACD crossover on 1H. Multi-timeframe alignment suggests continuation.',
    timeAgo: '8 min ago',
    asset: 'equity'
  },
  {
    symbol: 'ETH',
    type: 'Bullish Divergence',
    confidence: 89,
    price: '$3,920',
    change: '+4.5%',
    aiInsight: 'Hidden bullish divergence on RSI. Price holding above VAH with strength.',
    timeAgo: '12 min ago',
    asset: 'crypto'
  },
  {
    symbol: 'AAPL',
    type: 'Range Breakout',
    confidence: 86,
    price: '$257.30',
    change: '+1.4%',
    aiInsight: 'Breaking 2-week consolidation. Volume profile shows acceptance above.',
    timeAgo: '15 min ago',
    asset: 'equity'
  },
  {
    symbol: 'SOL',
    type: 'Trend Continuation',
    confidence: 92,
    price: '$198.45',
    change: '+6.2%',
    aiInsight: 'Strong momentum with ADX above 40. Pullback to 20 EMA complete.',
    timeAgo: '18 min ago',
    asset: 'crypto'
  }
];

const STATS = [
  { value: '—', label: 'Signals Today', icon: '📡' },
  { value: '—', label: 'AI Accuracy', icon: '🎯' },
  { value: '—', label: 'Scans Run', icon: '🔍' },
];

export default function LiveMarketPulse() {
  const [currentSignal, setCurrentSignal] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [pulseCount, setPulseCount] = useState(0);

  // Rotate through signals
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(false);
      setTimeout(() => {
        setCurrentSignal((prev) => (prev + 1) % LIVE_SIGNALS.length);
        setIsAnimating(true);
      }, 150);
    }, 4000);

    return () => clearInterval(interval);
  }, []);;


  const signal = LIVE_SIGNALS[currentSignal];

  return (
    <section style={{
      width: '100%',
      background: 'var(--msp-bg)',
      borderBottom: '1px solid rgba(34,197,94,0.2)',
      padding: '0',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background grid */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'none',
        backgroundSize: '50px 50px',
        animation: 'gridMove 20s linear infinite'
      }} />
      
      <style>{`
        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.3), 0 0 40px rgba(34,197,94,0.1); }
          50% { box-shadow: 0 0 30px rgba(34,197,94,0.5), 0 0 60px rgba(34,197,94,0.2); }
        }
        @keyframes liveDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px', position: 'relative', zIndex: 1 }}>
        {/* Header with live indicator */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 999,
            padding: '8px 16px',
            marginBottom: 16
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#22c55e',
              animation: 'liveDot 1.5s ease-in-out infinite',
              boxShadow: '0 0 10px #22c55e'
            }} />
            <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 13 }}>LIVE MARKET INTELLIGENCE</span>
          </div>
          
          <h2 style={{
            fontSize: 'clamp(28px, 5vw, 42px)',
            fontWeight: 800,
            color: '#f9fafb',
            marginBottom: 12,
            lineHeight: 1.1
          }}>
            See What Our AI is Finding <span style={{ color: '#22c55e' }}>Right Now</span>
          </h2>
          <p style={{ color: '#9ca3af', fontSize: 16, maxWidth: 600, margin: '0 auto' }}>
            Real signals. Real explanations. Real edge. Watch the market intelligence unfold.
          </p>
        </div>

        {/* Main signal card - the WOW factor */}
        <div style={{
          maxWidth: 700,
          margin: '0 auto 32px',
          background: 'var(--msp-card)',
          borderRadius: 20,
          border: '1px solid rgba(34,197,94,0.3)',
          padding: '28px',
          position: 'relative',
          animation: isAnimating ? 'glow 3s ease-in-out infinite' : 'none',
          overflow: 'hidden'
        }}>
          {/* Gradient accent */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'var(--msp-accent)',
            borderRadius: '20px 20px 0 0'
          }} />

          {/* Signal header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{
              animation: isAnimating ? 'slideIn 0.4s ease-out' : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: '#f9fafb',
                  letterSpacing: '-0.02em'
                }}>
                  {signal.symbol}
                </span>
                <span style={{
                  background: signal.asset === 'crypto' ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.15)',
                  color: signal.asset === 'crypto' ? '#fbbf24' : '#60a5fa',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  {signal.asset}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#e5e7eb', fontSize: 20, fontWeight: 600 }}>{signal.price}</span>
                <span style={{
                  color: signal.change.startsWith('+') ? '#22c55e' : '#ef4444',
                  fontSize: 16,
                  fontWeight: 600,
                  background: signal.change.startsWith('+') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  padding: '4px 10px',
                  borderRadius: 6
                }}>
                  {signal.change}
                </span>
              </div>
            </div>

            <div style={{
              textAlign: 'right',
              animation: isAnimating ? 'slideIn 0.4s ease-out 0.1s both' : 'none'
            }}>
              <div style={{
                background: 'rgba(16,185,129,0.14)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 6
              }}>
                <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 }}>
                  Confidence
                </div>
                <div style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: '#22c55e'
                }}>
                  {signal.confidence}%
                </div>
              </div>
              <span style={{ color: '#6b7280', fontSize: 12 }}>{signal.timeAgo}</span>
            </div>
          </div>

          {/* Signal type badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(34,197,94,0.4)',
            borderRadius: 999,
            padding: '10px 18px',
            marginBottom: 16,
            animation: isAnimating ? 'slideIn 0.4s ease-out 0.15s both' : 'none'
          }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 15 }}>{signal.type}</span>
          </div>

          {/* AI Insight - the magic */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 12,
            padding: '18px 20px',
            borderLeft: '3px solid #22c55e',
            animation: isAnimating ? 'slideIn 0.4s ease-out 0.2s both' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>🤖</span>
              <span style={{ color: 'var(--msp-accent)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>
                MSP AI Analysis
              </span>
            </div>
            <p style={{
              color: '#e5e7eb',
              fontSize: 16,
              lineHeight: 1.6,
              margin: 0,
              fontStyle: 'italic'
            }}>
              "{signal.aiInsight}"
            </p>
          </div>

          {/* Navigation dots */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginTop: 20
          }}>
            {LIVE_SIGNALS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setIsAnimating(false);
                  setTimeout(() => {
                    setCurrentSignal(i);
                    setIsAnimating(true);
                  }, 100);
                }}
                style={{
                  width: i === currentSignal ? 24 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === currentSignal ? 'var(--msp-accent)' : 'rgba(148,163,184,0.3)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </div>
        </div>

        {/* Live stats bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 32,
          flexWrap: 'wrap',
          marginBottom: 32
        }}>
          {STATS.map((stat, i) => (
            <div key={i} style={{
              textAlign: 'center',
              padding: '16px 24px',
              background: 'rgba(15,23,42,0.5)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.1)'
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#f9fafb',
                marginBottom: 4
              }}>
                {i === 0 ? pulseCount.toLocaleString() : stat.value}
              </div>
              <div style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href="/tools/scanner"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--msp-accent)',
              color: '#0b1120',
              padding: '16px 32px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 17,
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(34,197,94,0.4), 0 0 40px rgba(34,197,94,0.1)',
              transition: 'all 0.3s ease'
            }}
          >
            <span>🚀</span>
            <span>Start Finding Signals Now — It's Free</span>
          </Link>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 12 }}>
            No credit card · Instant access · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
