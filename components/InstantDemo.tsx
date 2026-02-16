'use client';

import { useState } from 'react';
import Link from 'next/link';

const DEMO_RESULTS: Record<string, {
  symbol: string;
  type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  price: string;
  insight: string;
  keyLevels: { support: string; resistance: string };
}> = {
  'AAPL': {
    symbol: 'AAPL',
    type: 'Momentum Continuation',
    direction: 'bullish',
    confidence: 88,
    price: '$257.30',
    insight: 'Breaking out of 3-week consolidation with volume. RSI 62 shows strength without being overbought. ADX rising confirms trend momentum.',
    keyLevels: { support: '$248.50', resistance: '$265.00' }
  },
  'TSLA': {
    symbol: 'TSLA',
    type: 'Bullish Breakout',
    direction: 'bullish',
    confidence: 91,
    price: '$421.20',
    insight: 'Above all major EMAs with accelerating volume. Multi-timeframe alignment bullish. Watch for pullback to $400 as potential re-entry.',
    keyLevels: { support: '$398.00', resistance: '$445.00' }
  },
  'NVDA': {
    symbol: 'NVDA',
    type: 'Trend Strength',
    direction: 'bullish',
    confidence: 94,
    price: '$142.85',
    insight: 'Powerful uptrend with ADX at 45+. Volume surge confirms institutional accumulation. MACD histogram expanding bullishly.',
    keyLevels: { support: '$135.00', resistance: '$155.00' }
  },
  'BTC': {
    symbol: 'BTC',
    type: 'Accumulation Phase',
    direction: 'bullish',
    confidence: 87,
    price: '$104,250',
    insight: 'Wyckoff accumulation pattern forming. Higher lows on 4H timeframe. On-chain data shows whale accumulation. Watch $100K as key support.',
    keyLevels: { support: '$98,500', resistance: '$110,000' }
  },
  'ETH': {
    symbol: 'ETH',
    type: 'Bullish Divergence',
    direction: 'bullish',
    confidence: 85,
    price: '$3,920',
    insight: 'Hidden bullish divergence on RSI forming. ETH/BTC pair showing relative strength. Gas fees normalizing suggests healthy network activity.',
    keyLevels: { support: '$3,650', resistance: '$4,200' }
  },
  'SPY': {
    symbol: 'SPY',
    type: 'Range-Bound',
    direction: 'neutral',
    confidence: 72,
    price: '$596.40',
    insight: 'Consolidating near all-time highs. Low VIX suggests complacency. Wait for clear breakout above $600 or support test at $585.',
    keyLevels: { support: '$585.00', resistance: '$605.00' }
  },
  'META': {
    symbol: 'META',
    type: 'Continuation Pattern',
    direction: 'bullish',
    confidence: 89,
    price: '$612.75',
    insight: 'Strong uptrend intact. Recent flag pattern resolving higher. AI narrative continues to drive institutional interest.',
    keyLevels: { support: '$580.00', resistance: '$650.00' }
  },
  'SOL': {
    symbol: 'SOL',
    type: 'Momentum Surge',
    direction: 'bullish',
    confidence: 92,
    price: '$198.45',
    insight: 'Outperforming Bitcoin on relative strength. DEX volume hitting new highs. Breaking key resistance with conviction.',
    keyLevels: { support: '$175.00', resistance: '$220.00' }
  }
};

const POPULAR_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'BTC', 'ETH', 'SPY'];

export default function InstantDemo() {
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState<typeof DEMO_RESULTS['AAPL'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handleScan = (symbol: string) => {
    const upperSymbol = symbol.toUpperCase().trim();
    setIsLoading(true);
    setShowResult(false);
    
    // Simulate API call delay for realism
    setTimeout(() => {
      const demoResult = DEMO_RESULTS[upperSymbol] || {
        symbol: upperSymbol,
        type: 'Analysis Available',
        direction: 'neutral' as const,
        confidence: 75 + Math.floor(Math.random() * 20),
        price: '$---.--',
        insight: `Full analysis for ${upperSymbol} is available in the scanner. Sign up free to get real-time AI insights, multi-timeframe analysis, and actionable trade ideas.`,
        keyLevels: { support: 'Login to view', resistance: 'Login to view' }
      };
      
      setResult(demoResult);
      setIsLoading(false);
      setShowResult(true);
    }, 1200);
  };

  return (
    <section style={{
      width: '100%',
      background: 'var(--msp-bg)',
      borderBottom: '1px solid rgba(34,197,94,0.15)',
      padding: '48px 0 56px'
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(20,184,166,0.1)',
            border: '1px solid rgba(20,184,166,0.3)',
            borderRadius: 999,
            padding: '6px 14px',
            marginBottom: 14
          }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ color: 'var(--msp-accent)', fontSize: 12, fontWeight: 600 }}>TRY IT NOW — NO SIGNUP</span>
          </div>
          
          <h2 style={{
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 800,
            color: '#f9fafb',
            marginBottom: 8
          }}>
            See the AI in Action
          </h2>
          <p style={{ color: '#9ca3af', fontSize: 15 }}>
            Type any symbol to get an instant AI analysis preview
          </p>
        </div>

        {/* Search input */}
        <div style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputValue.trim()) {
                handleScan(inputValue);
              }
            }}
            placeholder="Enter symbol (AAPL, BTC, TSLA...)"
            style={{
              width: 280,
              padding: '14px 20px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(15,23,42,0.8)',
              color: '#f9fafb',
              fontSize: 16,
              outline: 'none',
              transition: 'all 0.2s'
            }}
          />
          <button
            onClick={() => inputValue.trim() && handleScan(inputValue)}
            disabled={isLoading}
            style={{
              padding: '14px 28px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--msp-accent)',
              backgroundSize: isLoading ? '200% 100%' : '100% 100%',
              animation: isLoading ? 'shimmer 1.5s linear infinite' : 'none',
              color: '#0b1120',
              fontSize: 16,
              fontWeight: 700,
              cursor: isLoading ? 'wait' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {isLoading ? '🔍 Scanning...' : '⚡ Scan'}
          </button>
        </div>

        {/* Quick picks */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 24
        }}>
          <span style={{ color: '#6b7280', fontSize: 13, alignSelf: 'center' }}>Try:</span>
          {POPULAR_SYMBOLS.map((sym) => (
            <button
              key={sym}
              onClick={() => {
                setInputValue(sym);
                handleScan(sym);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(15,23,42,0.6)',
                color: '#9ca3af',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {sym}
            </button>
          ))}
        </div>

        {/* Result card */}
        {showResult && result && (
          <div style={{
            background: 'var(--msp-card)',
            borderRadius: 16,
            border: `1px solid ${
              result.direction === 'bullish' ? 'rgba(34,197,94,0.3)' : 
              result.direction === 'bearish' ? 'rgba(239,68,68,0.3)' : 
              'rgba(148,163,184,0.2)'
            }`,
            padding: '24px',
            animation: 'slideUp 0.4s ease-out',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: result.direction === 'bullish' 
                ? '#22c55e'
                : result.direction === 'bearish'
                ? '#ef4444'
                : '#94a3b8'
            }} />

            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#f9fafb' }}>
                    {result.symbol}
                  </span>
                  <span style={{
                    background: result.direction === 'bullish' 
                      ? 'rgba(34,197,94,0.15)' 
                      : result.direction === 'bearish'
                      ? 'rgba(239,68,68,0.15)'
                      : 'rgba(148,163,184,0.15)',
                    color: result.direction === 'bullish' 
                      ? '#22c55e' 
                      : result.direction === 'bearish'
                      ? '#ef4444'
                      : '#9ca3af',
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {result.direction}
                  </span>
                </div>
                <div style={{ color: '#e5e7eb', fontSize: 18 }}>{result.price}</div>
              </div>

              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 12,
                padding: '12px 16px',
                textAlign: 'center'
              }}>
                <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>
                  AI Confidence
                </div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: result.confidence >= 85 ? '#22c55e' : result.confidence >= 70 ? '#fbbf24' : '#ef4444'
                }}>
                  {result.confidence}%
                </div>
              </div>
            </div>

            {/* Signal type */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(20,184,166,0.1)',
              border: '1px solid rgba(20,184,166,0.3)',
              borderRadius: 999,
              padding: '8px 14px',
              marginBottom: 14
            }}>
              <span>🎯</span>
              <span style={{ color: 'var(--msp-accent)', fontWeight: 600, fontSize: 14 }}>{result.type}</span>
            </div>

            {/* AI Insight */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 10,
              padding: '14px 16px',
              borderLeft: '3px solid var(--msp-accent)',
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span>🤖</span>
                <span style={{ color: 'var(--msp-accent)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>
                  MSP AI Analysis
                </span>
              </div>
              <p style={{ color: '#e5e7eb', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                {result.insight}
              </p>
            </div>

            {/* Key levels */}
            <div style={{
              display: 'flex',
              gap: 12,
              marginBottom: 16,
              flexWrap: 'wrap'
            }}>
              <div style={{
                flex: 1,
                minWidth: 120,
                background: 'rgba(34,197,94,0.1)',
                borderRadius: 8,
                padding: '10px 14px',
                textAlign: 'center'
              }}>
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>SUPPORT</div>
                <div style={{ color: '#22c55e', fontWeight: 700 }}>{result.keyLevels.support}</div>
              </div>
              <div style={{
                flex: 1,
                minWidth: 120,
                background: 'rgba(239,68,68,0.1)',
                borderRadius: 8,
                padding: '10px 14px',
                textAlign: 'center'
              }}>
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>RESISTANCE</div>
                <div style={{ color: '#ef4444', fontWeight: 700 }}>{result.keyLevels.resistance}</div>
              </div>
            </div>

            {/* CTA */}
            <div style={{ textAlign: 'center' }}>
              <Link
                href="/tools/scanner"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--msp-accent)',
                  color: '#0b1120',
                  padding: '12px 24px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: 'none'
                }}
              >
                🚀 Get Full Analysis + Real-Time Updates — Free
              </Link>
              <p style={{ color: '#6b7280', fontSize: 12, marginTop: 10 }}>
                This is a preview. Full scanner includes 500+ symbols, real-time data, and deeper AI analysis.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
