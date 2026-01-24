"use client";

import { useState } from "react";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import TimeConfluenceWidget from "@/components/TimeConfluenceWidget";

// Hierarchical Scan Result type
interface HierarchicalResult {
  mode: string;
  modeLabel: string;
  primaryTF: string;
  currentPrice: number;
  isLivePrice: boolean;
  includedTFs: string[];
  decompression: {
    decompressions: { tf: string; isDecompressing: boolean; minsToClose: number; mid50Level: number; pullDirection: string; pullStrength: number; distanceToMid50: number }[];
    activeCount: number;
    netPullDirection: string;
    netPullStrength: number;
    pullBias: number;
    reasoning: string;
  };
  mid50Levels: { tf: string; level: number; distance: number; isDecompressing: boolean }[];
  clusters: { levels: number[]; tfs: string[]; avgLevel: number }[];
  prediction: {
    direction: string;
    confidence: number;
    reasoning: string;
    targetLevel: number;
    expectedMoveTime: string;
  };
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
}

type ScanModeType = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

// Simple timeframe options - user picks what candle they're trading
const TIMEFRAME_OPTIONS: { value: ScanModeType; label: string; tf: string }[] = [
  { value: 'scalping', label: '5m / 10m / 15m', tf: '15m' },
  { value: 'intraday_30m', label: '30 Minute', tf: '30m' },
  { value: 'intraday_1h', label: '1 Hour', tf: '1H' },
  { value: 'intraday_4h', label: '4 Hour', tf: '4H' },
  { value: 'swing_1d', label: 'Daily', tf: '1D' },
  { value: 'swing_3d', label: '3 Day', tf: '3D' },
  { value: 'swing_1w', label: 'Weekly', tf: '1W' },
  { value: 'macro_monthly', label: 'Monthly', tf: '1M' },
  { value: 'macro_yearly', label: 'Yearly', tf: '1Y' },
];

export default function AIConfluenceScanner() {
  const { tier } = useUserTier();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [hierarchicalResult, setHierarchicalResult] = useState<HierarchicalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTF, setSelectedTF] = useState<ScanModeType>('intraday_1h');
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
    setHierarchicalResult(null);
    setIsCached(false);

    try {
      // Always use hierarchical mode - backend does all the work
      const response = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: symbol.trim(), 
          mode: 'hierarchical', 
          scanMode: selectedTF,
          forceRefresh 
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
      } else {
        setIsCached(!!data.cached);
        setLastUpdated(new Date());
        setHierarchicalResult(data.data as HierarchicalResult);
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
            🔮 Time Confluence Scanner
          </h1>
          <p style={{ color: '#94A3B8' }}>
            Select your trading timeframe • Get probability direction based on all decompressing candles
          </p>
        </div>

        {/* Simple UI: Symbol + Timeframe + Scan */}
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '1.5rem'
        }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (SPY, AAPL, BTCUSD)"
            style={{
              padding: '0.75rem 1.25rem',
              fontSize: '1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(168,85,247,0.3)',
              borderRadius: '12px',
              color: 'white',
              width: '220px',
              outline: 'none',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          />
          
          {/* Timeframe Selector - the ONLY choice user needs to make */}
          <select
            value={selectedTF}
            onChange={(e) => setSelectedTF(e.target.value as ScanModeType)}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(245,158,11,0.5)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            <optgroup label="Scalping">
              <option value="scalping">5m / 10m / 15m</option>
            </optgroup>
            <optgroup label="Intraday">
              <option value="intraday_30m">30 Minute</option>
              <option value="intraday_1h">1 Hour</option>
              <option value="intraday_4h">4 Hour</option>
            </optgroup>
            <optgroup label="Swing">
              <option value="swing_1d">Daily</option>
              <option value="swing_3d">3 Day</option>
              <option value="swing_1w">Weekly</option>
            </optgroup>
            <optgroup label="Macro">
              <option value="macro_monthly">Monthly</option>
              <option value="macro_yearly">Yearly</option>
            </optgroup>
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
                Analyzing decompressions...
              </>
            ) : (
              <>🎯 Scan</>
            )}
          </button>

          {/* Refresh Button */}
          {hierarchicalResult && !loading && (
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
              }}
              title="Force refresh"
            >
              🔄
            </button>
          )}
        </div>

        {/* Quick Picks */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
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

        {/* 🔮 Time Confluence Engine - Elite Feature */}
        <div style={{ marginBottom: '2rem' }}>
          <TimeConfluenceWidget 
            showMacro={true}
            showMicro={true}
            showTWAP={true}
            showCalendar={true}
            compact={false}
          />
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

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HIERARCHICAL SCAN RESULTS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {hierarchicalResult && (
          <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Signal Card */}
            <div style={{
              background: `linear-gradient(145deg, ${
                hierarchicalResult.signalStrength === 'strong' ? 'rgba(16,185,129,0.2)' :
                hierarchicalResult.signalStrength === 'moderate' ? 'rgba(245,158,11,0.2)' :
                hierarchicalResult.signalStrength === 'weak' ? 'rgba(239,68,68,0.1)' :
                'rgba(100,116,139,0.1)'
              }, rgba(30,41,59,0.9))`,
              border: `2px solid ${
                hierarchicalResult.signalStrength === 'strong' ? '#10B981' :
                hierarchicalResult.signalStrength === 'moderate' ? '#F59E0B' :
                hierarchicalResult.signalStrength === 'weak' ? '#EF4444' :
                '#64748B'
              }`,
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: 0 }}>
                      {symbol}
                    </h2>
                    <span style={{
                      background: 'rgba(168,85,247,0.2)',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      color: '#A855F7',
                      fontWeight: 600,
                    }}>
                      {hierarchicalResult.modeLabel}
                    </span>
                  </div>
                  <div style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      background: hierarchicalResult.isLivePrice ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: hierarchicalResult.isLivePrice ? '#10B981' : '#F59E0B',
                    }}>
                      {hierarchicalResult.isLivePrice ? '🟢 LIVE' : '⏱️ Delayed'}
                    </span>
                    ${hierarchicalResult.currentPrice.toFixed(2)} • Primary TF: {hierarchicalResult.primaryTF}
                  </div>
                  <div style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Scanning: {hierarchicalResult.includedTFs.join(', ')}
                  </div>
                </div>
                
                {/* Signal Strength Badge */}
                <div style={{
                  textAlign: 'center',
                  padding: '1rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                }}>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: hierarchicalResult.signalStrength === 'strong' ? '#10B981' :
                           hierarchicalResult.signalStrength === 'moderate' ? '#F59E0B' :
                           hierarchicalResult.signalStrength === 'weak' ? '#EF4444' : '#64748B',
                  }}>
                    {hierarchicalResult.signalStrength === 'strong' ? '🔥 STRONG' :
                     hierarchicalResult.signalStrength === 'moderate' ? '⚠️ MODERATE' :
                     hierarchicalResult.signalStrength === 'weak' ? '💤 WEAK' : '❌ NO SIGNAL'}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                    {hierarchicalResult.decompression.activeCount} TFs decompressing
                  </div>
                </div>
              </div>

              {/* Prediction */}
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: `linear-gradient(135deg, ${
                  hierarchicalResult.prediction.direction === 'bullish' ? 'rgba(16,185,129,0.15)' :
                  hierarchicalResult.prediction.direction === 'bearish' ? 'rgba(239,68,68,0.15)' :
                  'rgba(100,116,139,0.1)'
                }, transparent)`,
                borderRadius: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Direction</div>
                  <div style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 'bold',
                    color: directionColor(hierarchicalResult.prediction.direction),
                  }}>
                    {directionEmoji(hierarchicalResult.prediction.direction)} {hierarchicalResult.prediction.direction.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Confidence</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F59E0B' }}>
                    {hierarchicalResult.prediction.confidence}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Target</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3B82F6' }}>
                    ${hierarchicalResult.prediction.targetLevel.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Move Expected</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#A855F7' }}>
                    {hierarchicalResult.prediction.expectedMoveTime}
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '0.9rem' }}>
                💡 {hierarchicalResult.prediction.reasoning}
              </div>
            </div>

            {/* Decompression Analysis Card */}
            <div style={{
              background: 'rgba(30,41,59,0.9)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#F59E0B', fontSize: '1.1rem' }}>
                🔄 Decompression Pull Analysis
              </h3>
              
              {/* Pull Bias Meter */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#EF4444' }}>🔴 Bearish Pull</span>
                  <span style={{ color: '#10B981' }}>Bullish Pull 🟢</span>
                </div>
                <div style={{ 
                  height: '12px', 
                  background: 'linear-gradient(90deg, #EF4444, #64748B, #10B981)',
                  borderRadius: '6px',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    left: `${50 + hierarchicalResult.decompression.pullBias / 2}%`,
                    top: '-4px',
                    width: '20px',
                    height: '20px',
                    background: 'white',
                    borderRadius: '50%',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }} />
                </div>
                <div style={{ textAlign: 'center', marginTop: '0.5rem', color: '#94A3B8' }}>
                  Pull Bias: {hierarchicalResult.decompression.pullBias.toFixed(0)}% ({hierarchicalResult.decompression.netPullDirection})
                </div>
              </div>

              {/* Active Decompressions */}
              <div style={{ fontSize: '0.9rem', color: '#94A3B8', marginBottom: '1rem' }}>
                {hierarchicalResult.decompression.reasoning}
              </div>

              {/* TF Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '0.5rem',
              }}>
                {hierarchicalResult.decompression.decompressions.map((d) => (
                  <div key={d.tf} style={{
                    padding: '0.5rem',
                    background: d.isDecompressing 
                      ? d.pullDirection === 'up' ? 'rgba(16,185,129,0.2)' : 
                        d.pullDirection === 'down' ? 'rgba(239,68,68,0.2)' : 
                        'rgba(100,116,139,0.2)'
                      : 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    borderLeft: d.isDecompressing ? '3px solid' : 'none',
                    borderColor: d.pullDirection === 'up' ? '#10B981' : 
                                 d.pullDirection === 'down' ? '#EF4444' : '#64748B',
                  }}>
                    <div style={{ fontWeight: 600, color: d.isDecompressing ? 'white' : '#64748B' }}>
                      {d.tf} {d.isDecompressing && '🔄'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                      {d.minsToClose > 0 ? `${d.minsToClose}m to close` : 'Closed'}
                    </div>
                    {d.isDecompressing && (
                      <div style={{ fontSize: '0.75rem', color: d.pullDirection === 'up' ? '#10B981' : '#EF4444' }}>
                        → ${d.mid50Level.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 50% Levels & Clusters */}
            <div style={{
              background: 'rgba(30,41,59,0.9)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#3B82F6', fontSize: '1.1rem' }}>
                📏 50% Levels & Clusters
              </h3>
              
              {/* Clusters */}
              {hierarchicalResult.clusters.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ color: '#F59E0B', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    🎯 {hierarchicalResult.clusters.length} Cluster(s) Detected - Strong Targets!
                  </div>
                  {hierarchicalResult.clusters.map((c, i) => (
                    <div key={i} style={{
                      padding: '0.5rem 1rem',
                      background: 'rgba(245,158,11,0.15)',
                      borderRadius: '8px',
                      marginBottom: '0.5rem',
                    }}>
                      <div style={{ fontWeight: 600 }}>
                        Cluster @ ${c.avgLevel.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                        TFs: {c.tfs.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 50% Level Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.5rem',
              }}>
                {hierarchicalResult.mid50Levels.slice(0, 12).map((level) => (
                  <div key={level.tf} style={{
                    padding: '0.5rem',
                    background: level.isDecompressing ? 'rgba(168,85,247,0.2)' : 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 500 }}>{level.tf}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.9rem' }}>${level.level.toFixed(2)}</div>
                      <div style={{ 
                        fontSize: '0.7rem', 
                        color: level.distance > 0 ? '#10B981' : level.distance < 0 ? '#EF4444' : '#64748B'
                      }}>
                        {level.distance > 0 ? '+' : ''}{level.distance.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '12px',
          padding: '1rem',
          fontSize: '0.8rem',
          color: '#F59E0B',
          textAlign: 'center',
          marginTop: '2rem',
        }}>
          ⚠️ This is AI-generated analysis for educational purposes only. Not financial advice. 
          Past performance does not guarantee future results. Always do your own research and consult a financial advisor.
        </div>
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
