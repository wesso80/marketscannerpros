"use client";

import { useState } from "react";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

interface Mid50Level {
  tf: string;
  level: number;
  distance: number;
}

interface Prediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  expectedDecompMins: number;
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;
  reasoning: string;
}

interface FullForecast {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  
  currentState: {
    stack: number;
    activeTFs: string[];
    isHotZone: boolean;
    hotZoneTFs: string[];
    clusters: number;
    mid50Levels: Mid50Level[];
    nearestMid50: Mid50Level | null;
  };
  
  upcoming: {
    nextConfluenceIn: number;
    upcomingTFCloses: { tf: string; minsAway: number }[];
    nextHotZoneIn: number | null;
  };
  
  prediction: Prediction;
  
  historical: {
    similarEvents: number;
    winRate: number;
    avgMoveAfterSimilar: number;
    avgDecompMins: number;
    typicalMid50Reaction: string;
  };
  
  aiAnalysis: string;
}

export default function AIConfluenceScanner() {
  const { tier } = useUserTier();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<FullForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'forecast' | 'learn' | 'quick'>('forecast');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);

  // Pro Trader feature gate
  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)" }}>
        <header style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
          <span style={{ 
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", 
            padding: "4px 12px", 
            borderRadius: "999px", 
            fontSize: "11px", 
            fontWeight: "600",
            color: "#fff"
          }}>PRO TRADER</span>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 700, color: "#f1f5f9", margin: "12px 0 8px" }}>
            🔮 AI Confluence Scanner
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px" }}>Full History Learning + Decompression Timing Analysis</p>
        </header>
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "0 1rem 2rem" }}>
          <UpgradeGate requiredTier="pro_trader" feature="AI Confluence Scanner" />
        </main>
      </div>
    );
  }

  const handleScan = async (forceRefresh = false) => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setForecast(null);
    setIsCached(false);

    try {
      const response = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim(), mode, forceRefresh }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
      } else {
        // Track if cached
        setIsCached(!!data.cached);
        setLastUpdated(new Date());
        
        // Handle different response formats based on mode
        const result = data.data;
        
        // For 'learn' mode, we get { events, learning } structure
        if (mode === 'learn') {
          // Convert learn response to display format
          const learning = result.learning || result;
          setForecast({
            symbol: symbol.trim(),
            timestamp: Date.now(),
            currentPrice: 0,
            currentState: {
              stack: 0,
              activeTFs: [],
              isHotZone: false,
              hotZoneTFs: [],
              clusters: 0,
              mid50Levels: [],
              nearestMid50: null,
            },
            upcoming: {
              nextConfluenceIn: 0,
              upcomingTFCloses: [],
              nextHotZoneIn: null,
            },
            prediction: {
              direction: 'neutral',
              confidence: 0,
              expectedDecompMins: learning?.hotZoneStats?.avgDecompMins || 30,
              targetPrice: 0,
              stopLoss: 0,
              timeHorizon: '—',
              reasoning: `Deep learning complete! Analyzed ${result.events?.length || 0} historical confluence events.`,
            },
            historical: {
              similarEvents: learning?.totalEvents || result.events?.length || 0,
              winRate: learning?.hotZoneStats?.upPct || 50,
              avgMoveAfterSimilar: learning?.hotZoneStats?.avgMagnitude || 0,
              avgDecompMins: learning?.hotZoneStats?.avgDecompMins || 30,
              typicalMid50Reaction: 'Learning data stored',
            },
            aiAnalysis: `✅ Deep learning complete for ${symbol}!\n\nAnalyzed ${result.events?.length || 0} confluence events from historical data.\n\nNow run a "Forecast" scan to get AI predictions based on this learned data.`,
          });
        } else if (mode === 'quick') {
          // Quick mode returns simpler structure
          setForecast({
            symbol: symbol.trim(),
            timestamp: Date.now(),
            currentPrice: result.price || 0,
            currentState: {
              stack: result.stack || 0,
              activeTFs: result.activeTFs || [],
              isHotZone: result.isHotZone || false,
              hotZoneTFs: result.hotZoneTFs || [],
              clusters: result.clusters || 0,
              mid50Levels: result.mid50Levels || [],
              nearestMid50: result.mid50Levels?.[0] || null,
            },
            upcoming: {
              nextConfluenceIn: 0,
              upcomingTFCloses: result.upcomingTFCloses || [],
              nextHotZoneIn: null,
            },
            prediction: {
              direction: result.stack >= 5 ? 'bullish' : 'neutral',
              confidence: result.isHighConfluence ? 70 : 40,
              expectedDecompMins: 15,
              targetPrice: 0,
              stopLoss: 0,
              timeHorizon: '1h',
              reasoning: result.isHighConfluence 
                ? `High confluence detected! Stack: ${result.stack}`
                : `Low confluence. Stack: ${result.stack}`,
            },
            historical: {
              similarEvents: 0,
              winRate: 50,
              avgMoveAfterSimilar: 0,
              avgDecompMins: 15,
              typicalMid50Reaction: 'Use Deep Learn for historical analysis',
            },
            aiAnalysis: result.isHighConfluence 
              ? `⚡ Quick Check: HIGH CONFLUENCE\n\nStack: ${result.stack} active windows\nHot Zone: ${result.isHotZone ? 'YES 🔥' : 'No'}\n\nConsider running a full "Forecast" scan for AI analysis.`
              : `Quick Check: Standard confluence\n\nStack: ${result.stack} active windows\n\nNo immediate trading signals.`,
          });
        } else {
          // Forecast mode - full response, add null safety
          setForecast({
            ...result,
            currentState: result.currentState || {
              stack: 0,
              activeTFs: [],
              isHotZone: false,
              hotZoneTFs: [],
              clusters: 0,
              mid50Levels: [],
              nearestMid50: null,
            },
            upcoming: result.upcoming || {
              nextConfluenceIn: 0,
              upcomingTFCloses: [],
              nextHotZoneIn: null,
            },
            prediction: result.prediction || {
              direction: 'neutral',
              confidence: 0,
              expectedDecompMins: 30,
              targetPrice: 0,
              stopLoss: 0,
              timeHorizon: '—',
              reasoning: 'No prediction available',
            },
            historical: result.historical || {
              similarEvents: 0,
              winRate: 50,
              avgMoveAfterSimilar: 0,
              avgDecompMins: 30,
              typicalMid50Reaction: 'unknown',
            },
            aiAnalysis: result.aiAnalysis || 'No AI analysis available',
          });
        }
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

  const formatMins = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${Math.floor(mins / 1440)}d`;
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
      padding: '2rem',
      color: 'white'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
            🔮 AI Confluence Scanner v2
          </h1>
          <p style={{ color: '#94A3B8' }}>
            Full History Learning + Decompression Timing Analysis
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
            onChange={(e) => setMode(e.target.value as 'forecast' | 'learn' | 'quick')}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(168,85,247,0.3)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            <option value="forecast">🔮 AI Forecast (Recommended)</option>
            <option value="learn">📚 Deep Learn (Slow, Builds Profile)</option>
            <option value="quick">⚡ Quick Check</option>
          </select>

          <button
            onClick={() => handleScan()}
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
                {mode === 'learn' ? 'Learning from history...' : 'Scanning...'}
              </>
            ) : (
              <>🔍 Scan</>
            )}
          </button>

          {/* Force Refresh Button - always show when there's a forecast */}
          {forecast && !loading && (
            <button
              onClick={() => handleScan(true)}
              style={{
                padding: '0.75rem 1rem',
                fontSize: '0.9rem',
                background: 'rgba(59,130,246,0.2)',
                border: '1px solid rgba(59,130,246,0.5)',
                borderRadius: '12px',
                color: '#3B82F6',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              title="Force refresh with latest market data"
            >
              🔄 Refresh
            </button>
          )}
        </div>

        {/* Cache Status Indicator */}
        {forecast && lastUpdated && (
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <span style={{
              fontSize: '0.8rem',
              color: isCached ? '#FBBF24' : '#10B981',
              background: isCached ? 'rgba(251,191,36,0.1)' : 'rgba(16,185,129,0.1)',
              padding: '0.3rem 0.8rem',
              borderRadius: '6px',
            }}>
              {isCached ? '📦 Cached data' : '✨ Fresh data'} • Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Quick Picks */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ color: '#64748B', marginRight: '0.5rem' }}>Quick picks:</span>
          {['AAPL', 'BTCUSD', 'SPY', 'TSLA', 'ETHUSD', 'NVDA', 'GOOGL'].map((s) => (
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
                    Current: ${(forecast.currentPrice || 0).toFixed(4)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    color: directionColor(forecast.prediction?.direction || 'neutral'),
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    {directionEmoji(forecast.prediction?.direction || 'neutral')}
                    {(forecast.prediction?.direction || 'NEUTRAL').toUpperCase()}
                  </div>
                  <div style={{ 
                    fontSize: '1.2rem',
                    color: (forecast.prediction?.confidence || 0) >= 70 ? '#10B981' : 
                           (forecast.prediction?.confidence || 0) >= 50 ? '#F59E0B' : '#EF4444'
                  }}>
                    {forecast.prediction?.confidence || 0}% Confidence
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '1rem',
                marginTop: '1.5rem',
                padding: '1rem',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Target</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#10B981' }}>
                    ${(forecast.prediction?.targetPrice || 0).toFixed(4)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Stop Loss</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#EF4444' }}>
                    ${(forecast.prediction?.stopLoss || 0).toFixed(4)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Time Horizon</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#A855F7' }}>
                    {forecast.prediction?.timeHorizon || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>
                    ⏱️ Decompression In
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#F59E0B' }}>
                    ~{forecast.prediction?.expectedDecompMins || 0} mins
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Win Rate</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#3B82F6' }}>
                    {(forecast.historical?.winRate || 0).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(168,85,247,0.1)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: '#A855F7', marginBottom: '0.25rem' }}>Reasoning</div>
                <div style={{ color: '#E2E8F0' }}>{forecast.prediction?.reasoning || 'No reasoning available'}</div>
              </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
              
              {/* Confluence State Card */}
              <div style={{
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(168,85,247,0.3)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <h3 style={{ color: '#A855F7', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📊 Current Confluence State
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 
                      (forecast.currentState?.stack || 0) >= 7 ? '#EF4444' :
                      (forecast.currentState?.stack || 0) >= 5 ? '#F59E0B' :
                      (forecast.currentState?.stack || 0) >= 3 ? '#10B981' : '#64748B'
                    }}>
                      {forecast.currentState?.stack || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>STACK</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: (forecast.currentState?.clusters || 0) > 0 ? '#10B981' : '#64748B' }}>
                      {forecast.currentState?.clusters || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>CLUSTERS</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: forecast.currentState?.isHotZone ? '#F59E0B' : '#64748B' }}>
                      {forecast.currentState?.isHotZone ? '🔥 YES' : '—'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>HOT ZONE</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3B82F6' }}>
                      {forecast.historical?.similarEvents || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>LEARNED EVENTS</div>
                  </div>
                </div>

                {/* Active TFs */}
                {(forecast.currentState?.activeTFs?.length || 0) > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Active Windows</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {(forecast.currentState?.activeTFs || []).map((tf, i) => (
                        <span key={i} style={{
                          background: tf.includes('pre') ? 'rgba(245,158,11,0.3)' : 'rgba(168,85,247,0.3)',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          color: tf.includes('pre') ? '#F59E0B' : '#A855F7',
                        }}>
                          {tf}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 50% Levels */}
                {(forecast.currentState?.mid50Levels?.length || 0) > 0 && (
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                      Nearest 50% Levels ({forecast.historical?.typicalMid50Reaction || 'unknown'})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {(forecast.currentState?.mid50Levels || []).slice(0, 5).map((level, i) => (
                        <div key={i} style={{
                          background: Math.abs(level?.distance || 0) < 0.25 ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.2)',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                        }}>
                          <span style={{ color: '#A855F7', fontWeight: 'bold' }}>{level?.tf || '?'}</span>
                          <span style={{ color: '#64748B' }}> @ </span>
                          <span style={{ color: '#E2E8F0' }}>${(level?.level || 0).toFixed(2)}</span>
                          <span style={{ 
                            color: (level?.distance || 0) > 0 ? '#10B981' : '#EF4444',
                            marginLeft: '0.25rem' 
                          }}>
                            ({(level?.distance || 0) > 0 ? '+' : ''}{(level?.distance || 0).toFixed(2)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Upcoming Events Card */}
              <div style={{
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <h3 style={{ color: '#3B82F6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⏰ Upcoming TF Closes
                </h3>

                {(forecast.upcoming?.nextConfluenceIn || 0) > 0 && (
                  <div style={{ 
                    background: 'rgba(168,85,247,0.2)', 
                    padding: '1rem', 
                    borderRadius: '10px', 
                    marginBottom: '1rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#A855F7' }}>Next High Confluence (Stack ≥5)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#E2E8F0' }}>
                      ~{formatMins(forecast.upcoming?.nextConfluenceIn || 0)}
                    </div>
                  </div>
                )}

                {forecast.upcoming?.nextHotZoneIn && (
                  <div style={{ 
                    background: 'rgba(245,158,11,0.2)', 
                    padding: '1rem', 
                    borderRadius: '10px', 
                    marginBottom: '1rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#F59E0B' }}>🔥 Hot Zone Approaching</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#E2E8F0' }}>
                      ~{formatMins(forecast.upcoming?.nextHotZoneIn || 0)}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>TF Close Schedule</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(forecast.upcoming?.upcomingTFCloses || []).slice(0, 6).map((tf, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: (tf?.minsAway || 999) <= 5 ? 'rgba(239,68,68,0.2)' : 
                                  (tf?.minsAway || 999) <= 15 ? 'rgba(245,158,11,0.2)' : 'rgba(0,0,0,0.2)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                    }}>
                      <span style={{ fontWeight: 'bold', color: '#E2E8F0' }}>{tf?.tf || '?'}</span>
                      <span style={{ 
                        color: (tf?.minsAway || 999) <= 5 ? '#EF4444' : 
                               (tf?.minsAway || 999) <= 15 ? '#F59E0B' : '#94A3B8'
                      }}>
                        {formatMins(tf?.minsAway || 0)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Decompression Stats */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                    📈 Learned Decompression Timing
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Avg Time to Move</div>
                      <div style={{ fontWeight: 'bold', color: '#F59E0B' }}>
                        ~{forecast.historical?.avgDecompMins || 0} mins
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Avg Move Size</div>
                      <div style={{ fontWeight: 'bold', color: '#10B981' }}>
                        {(forecast.historical?.avgMoveAfterSimilar || 0).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            <div style={{
              background: 'rgba(30,41,59,0.8)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ color: '#3B82F6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🤖 AI Analysis (Powered by GPT-4)
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

            {/* Legend / How It Works */}
            <div style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(100,116,139,0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
            }}>
              <h4 style={{ color: '#94A3B8', marginBottom: '0.75rem' }}>📖 How This Works</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem', color: '#64748B' }}>
                <div>
                  <strong style={{ color: '#A855F7' }}>Stack</strong>: Number of active confluence windows (post-close + pre-close anticipatory)
                </div>
                <div>
                  <strong style={{ color: '#F59E0B' }}>Decompression</strong>: When price starts moving after TF closes (learned from history)
                </div>
                <div>
                  <strong style={{ color: '#10B981' }}>50% Levels</strong>: Prior bar midpoints act as dynamic S/R
                </div>
                <div>
                  <strong style={{ color: '#EF4444' }}>Hot Zone</strong>: 3+ TFs closing within 5 mins = high volatility
                </div>
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
