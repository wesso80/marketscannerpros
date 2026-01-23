"use client";

import { useState } from "react";

interface ConfluenceState {
  timestamp: number;
  price: number;
  stack: number;
  activeTFs: string[];
  mid50Levels: { tf: string; level: number; distance: number }[];
  clusters: { tf1: string; tf2: string; level: number }[];
  isHotZone: boolean;
  hotZoneTFs: string[];
}

interface Prediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;
  reasoning: string;
}

interface Forecast {
  symbol: string;
  timestamp: number;
  currentState: ConfluenceState;
  prediction: Prediction;
  historicalSimilar: {
    count: number;
    winRate: number;
    avgMove: number;
  };
  aiAnalysis: string;
}

export default function AIConfluenceScanner() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'full' | 'quick' | 'state-only'>('full');

  const handleScan = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setForecast(null);

    try {
      const response = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim(), mode }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
      } else {
        setForecast(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const directionColor = (dir: string) => {
    if (dir === 'bullish') return '#10B981';
    if (dir === 'bearish') return '#EF4444';
    return '#94A3B8';
  };

  const directionEmoji = (dir: string) => {
    if (dir === 'bullish') return '🟢';
    if (dir === 'bearish') return '🔴';
    return '⚪';
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
      padding: '2rem',
      color: 'white'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #A855F7, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🔮 AI Confluence Scanner
          </h1>
          <p style={{ color: '#94A3B8' }}>
            Multi-Timeframe Confluence Analysis + GPT-4 Forecasting
          </p>
        </div>

        {/* Search Bar */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '2rem'
        }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Enter symbol (e.g., AAPL, BTCUSD, SPY)"
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1.1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(168,85,247,0.3)',
              borderRadius: '12px',
              color: 'white',
              width: '300px',
              outline: 'none',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          />
          
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(168,85,247,0.3)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            <option value="full">Full AI Analysis</option>
            <option value="quick">Quick Check</option>
            <option value="state-only">State Only</option>
          </select>

          <button
            onClick={handleScan}
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1.1rem',
              background: loading ? 'rgba(168,85,247,0.5)' : 'linear-gradient(135deg, #A855F7, #7C3AED)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '600',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                Scanning...
              </>
            ) : (
              <>🔍 Scan</>
            )}
          </button>
        </div>

        {/* Quick Picks */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ color: '#64748B', marginRight: '0.5rem' }}>Quick picks:</span>
          {['AAPL', 'BTCUSD', 'SPY', 'TSLA', 'ETHUSD', 'NVDA'].map((s) => (
            <button
              key={s}
              onClick={() => { setSymbol(s); }}
              style={{
                margin: '0.25rem',
                padding: '0.4rem 0.8rem',
                background: 'rgba(59,130,246,0.2)',
                border: '1px solid rgba(59,130,246,0.5)',
                borderRadius: '8px',
                color: '#3B82F6',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.2)',
            border: '1px solid #EF4444',
            borderRadius: '12px',
            padding: '1rem',
            textAlign: 'center',
            marginBottom: '2rem',
          }}>
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {forecast && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Main Prediction Card */}
            <div style={{
              background: `linear-gradient(145deg, ${
                forecast.prediction.direction === 'bullish' ? 'rgba(16,185,129,0.15)' :
                forecast.prediction.direction === 'bearish' ? 'rgba(239,68,68,0.15)' :
                'rgba(100,116,139,0.15)'
              }, rgba(30,41,59,0.8))`,
              border: `2px solid ${directionColor(forecast.prediction.direction)}`,
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    {forecast.symbol}
                  </h2>
                  <div style={{ color: '#94A3B8' }}>
                    Current: ${forecast.currentState.price.toFixed(4)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    color: directionColor(forecast.prediction.direction),
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    {directionEmoji(forecast.prediction.direction)}
                    {forecast.prediction.direction.toUpperCase()}
                  </div>
                  <div style={{ 
                    fontSize: '1.2rem',
                    color: forecast.prediction.confidence >= 70 ? '#10B981' : 
                           forecast.prediction.confidence >= 50 ? '#F59E0B' : '#EF4444'
                  }}>
                    {forecast.prediction.confidence}% Confidence
                  </div>
                </div>
              </div>

              {/* Targets */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginTop: '1.5rem',
                padding: '1rem',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Target</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#10B981' }}>
                    ${forecast.prediction.targetPrice.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Stop Loss</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#EF4444' }}>
                    ${forecast.prediction.stopLoss.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Time Horizon</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#A855F7' }}>
                    {forecast.prediction.timeHorizon}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Historical Win Rate</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#3B82F6' }}>
                    {forecast.historicalSimilar.winRate.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(168,85,247,0.1)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#A855F7', marginBottom: '0.25rem' }}>Reasoning</div>
                <div style={{ color: '#E2E8F0' }}>{forecast.prediction.reasoning}</div>
              </div>
            </div>

            {/* Confluence State Card */}
            <div style={{
              background: 'rgba(30,41,59,0.8)',
              border: '1px solid rgba(168,85,247,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ color: '#A855F7', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📊 Confluence State
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 
                    forecast.currentState.stack >= 7 ? '#EF4444' :
                    forecast.currentState.stack >= 5 ? '#F59E0B' :
                    forecast.currentState.stack >= 3 ? '#10B981' : '#64748B'
                  }}>
                    {forecast.currentState.stack}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>STACK</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: forecast.currentState.clusters.length > 0 ? '#10B981' : '#64748B' }}>
                    {forecast.currentState.clusters.length}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>CLUSTERS</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: forecast.currentState.isHotZone ? '#F59E0B' : '#64748B' }}>
                    {forecast.currentState.isHotZone ? '🔥' : '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>HOT ZONE</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3B82F6' }}>
                    {forecast.historicalSimilar.count}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>SIMILAR PATTERNS</div>
                </div>
              </div>

              {/* 50% Levels */}
              {forecast.currentState.mid50Levels.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Nearest 50% Levels</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {forecast.currentState.mid50Levels.slice(0, 6).map((level, i) => (
                      <div key={i} style={{
                        background: Math.abs(level.distance) < 0.25 ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.2)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                      }}>
                        <span style={{ color: '#A855F7', fontWeight: 'bold' }}>{level.tf}</span>
                        <span style={{ color: '#64748B' }}> @ </span>
                        <span style={{ color: '#E2E8F0' }}>${level.level.toFixed(2)}</span>
                        <span style={{ 
                          color: level.distance > 0 ? '#10B981' : '#EF4444',
                          marginLeft: '0.25rem' 
                        }}>
                          ({level.distance > 0 ? '+' : ''}{level.distance.toFixed(2)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Analysis */}
            <div style={{
              background: 'rgba(30,41,59,0.8)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ color: '#3B82F6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🤖 AI Analysis
              </h3>
              <div style={{ 
                whiteSpace: 'pre-wrap', 
                color: '#E2E8F0',
                lineHeight: '1.6',
                fontSize: '0.95rem'
              }}>
                {forecast.aiAnalysis}
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '12px',
              padding: '1rem',
              fontSize: '0.8rem',
              color: '#F59E0B',
              textAlign: 'center'
            }}>
              ⚠️ This is AI-generated analysis for educational purposes only. Not financial advice. 
              Past performance does not guarantee future results. Always do your own research and consult a financial advisor.
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
