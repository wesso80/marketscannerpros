"use client";

import { useState } from "react";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface StrikeRecommendation {
  strike: number;
  type: 'call' | 'put';
  reason: string;
  distanceFromPrice: number;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  estimatedDelta: number;
  confidenceScore: number;
  targetLevel: number;
}

interface ExpirationRecommendation {
  dte: number;
  expirationDate: string;
  reason: string;
  thetaRisk: 'low' | 'moderate' | 'high';
  timeframe: string;
  confidenceScore: number;
}

interface GreeksAdvice {
  deltaTarget: string;
  thetaWarning: string | null;
  vegaConsideration: string | null;
  gammaAdvice: string | null;
  overallAdvice: string;
}

interface EntryTimingAdvice {
  idealEntryWindow: string;
  urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
  reason: string;
  avoidWindows: string[];
}

interface HighOIStrike {
  strike: number;
  openInterest: number;
  type: 'call' | 'put';
}

interface OpenInterestAnalysis {
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;
  maxPainStrike: number | null;
  highOIStrikes: HighOIStrike[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentReason: string;
  expirationDate: string;
}

interface OptionsSetup {
  symbol: string;
  currentPrice: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confluenceStack: number;
  decompressingTFs: string[];
  pullBias: number;
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  tradeQuality: 'A+' | 'A' | 'B' | 'C' | 'F';
  qualityReasons: string[];
  primaryStrike: StrikeRecommendation | null;
  alternativeStrikes: StrikeRecommendation[];
  primaryExpiration: ExpirationRecommendation | null;
  alternativeExpirations: ExpirationRecommendation[];
  openInterestAnalysis: OpenInterestAnalysis | null;
  greeksAdvice: GreeksAdvice;
  maxRiskPercent: number;
  stopLossStrategy: string;
  profitTargetStrategy: string;
  entryTiming: EntryTimingAdvice;
}

type ScanModeType = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

const TIMEFRAME_OPTIONS: { value: ScanModeType; label: string; desc: string }[] = [
  { value: 'scalping', label: '⚡ Scalping (5-15m)', desc: '0-2 DTE' },
  { value: 'intraday_30m', label: '📊 30 Minute', desc: '1-3 DTE' },
  { value: 'intraday_1h', label: '📊 1 Hour', desc: '2-5 DTE' },
  { value: 'intraday_4h', label: '📊 4 Hour', desc: '3-7 DTE' },
  { value: 'swing_1d', label: '📅 Daily', desc: '5-14 DTE' },
  { value: 'swing_3d', label: '📅 3-Day', desc: '1-3 weeks' },
  { value: 'swing_1w', label: '📅 Weekly', desc: '2-4 weeks' },
  { value: 'macro_monthly', label: '🏛️ Monthly', desc: '30-60 DTE' },
  { value: 'macro_yearly', label: '🏛️ LEAPS', desc: '60+ DTE' },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function OptionsConfluenceScanner() {
  const { tier, isAdmin } = useUserTier();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptionsSetup | null>(null);
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
            background: "linear-gradient(135deg, #10B981, #3B82F6)", 
            padding: "4px 12px", 
            borderRadius: "999px", 
            fontSize: "11px", 
            fontWeight: "600",
            color: "#fff"
          }}>PRO TRADER</span>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 700, color: "#f1f5f9", margin: "12px 0 8px" }}>
            🎯 Options Confluence Scanner
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px" }}>Strike & Expiration Recommendations Based on Time Confluence</p>
        </header>
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "0 1rem 2rem" }}>
          <UpgradeGate requiredTier="pro_trader" feature="Options Confluence Scanner" />
        </main>
      </div>
    );
  }

  // Coming Soon gate for non-admins (options data requires commercial license)
  if (!isAdmin) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
        padding: '2rem',
        color: 'white'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ 
              background: "linear-gradient(135deg, #10B981, #3B82F6)", 
              padding: "4px 12px", 
              borderRadius: "999px", 
              fontSize: "11px", 
              fontWeight: "600",
              color: "#fff",
              display: 'inline-block',
              marginBottom: '1rem'
            }}>PRO TRADER</span>
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #10B981, #3B82F6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem'
            }}>
              🎯 Options Confluence Scanner
            </h1>
            <p style={{ color: '#94A3B8', maxWidth: '600px', margin: '0 auto' }}>
              Get intelligent strike & expiration recommendations based on Time Confluence analysis.
            </p>
          </div>

          <div style={{ 
            background: 'linear-gradient(145deg, rgba(16,185,129,0.08), rgba(30,41,59,0.5))',
            borderRadius: '24px',
            border: '1px solid rgba(16,185,129,0.3)',
            padding: '4rem 2rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>🚀</div>
            <h2 style={{ 
              fontSize: '2rem', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #10B981, #3B82F6, #10B981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem'
            }}>
              Coming Soon
            </h2>
            <p style={{ 
              color: '#94A3B8', 
              fontSize: '1.1rem',
              maxWidth: '500px',
              margin: '0 auto 2rem',
              lineHeight: '1.6'
            }}>
              We&apos;re upgrading our options data infrastructure to bring you even better real-time analysis with Greeks, IV tracking, and unusual activity detection.
            </p>
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginBottom: '2rem'
            }}>
              {["Strike Recommendations", "Expiration Analysis", "Greeks Integration", "Max Pain Levels", "Open Interest Flow", "IV Rank & Percentile", "Unusual Activity Alerts", "Time Confluence Signals"].map((feature) => (
                <span key={feature} style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  color: '#10B981'
                }}>
                  {feature}
                </span>
              ))}
            </div>
            <a href="/tools" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              color: '#fff',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '0.95rem'
            }}>
              ← Back to Tools
            </a>
          </div>

          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>💡</span>
            <div>
              <h4 style={{ color: '#3B82F6', marginBottom: '0.5rem', fontWeight: '600' }}>In the meantime...</h4>
              <p style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: '1.5' }}>
                You can still use the <strong style={{ color: '#F59E0B' }}>Golden Egg Deep Analysis</strong> for comprehensive technical analysis, 
                AI insights, news sentiment, and earnings data. Options flow data will be added there too once available.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleScan = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setIsCached(false);

    try {
      const response = await fetch('/api/options-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: symbol.trim(), 
          scanMode: selectedTF,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
      } else {
        setLastUpdated(data.timestamp ? new Date(data.timestamp) : new Date());
        setResult(data.data as OptionsSetup);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const gradeColor = (grade: string) => {
    switch (grade) {
      case 'A+': return '#10B981';
      case 'A': return '#22C55E';
      case 'B': return '#F59E0B';
      case 'C': return '#F97316';
      default: return '#EF4444';
    }
  };

  const gradeEmoji = (grade: string) => {
    switch (grade) {
      case 'A+': return '🏆';
      case 'A': return '✅';
      case 'B': return '⚡';
      case 'C': return '⚠️';
      default: return '❌';
    }
  };

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return '#10B981';
      case 'within_hour': return '#F59E0B';
      case 'wait': return '#6B7280';
      default: return '#EF4444';
    }
  };

  const urgencyEmoji = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return '🚀';
      case 'within_hour': return '⏰';
      case 'wait': return '⏳';
      default: return '🚫';
    }
  };

  const thetaColor = (risk: string) => {
    switch (risk) {
      case 'low': return '#10B981';
      case 'moderate': return '#F59E0B';
      default: return '#EF4444';
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
      padding: 'clamp(1rem, 4vw, 2rem)',
      color: 'white'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ 
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', 
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🎯 Options Confluence Scanner
          </h1>
          <p style={{ color: '#94A3B8', maxWidth: '600px', margin: '0 auto', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', padding: '0 1rem' }}>
            Get intelligent strike & expiration recommendations based on Time Confluence analysis.
            Uses 50% levels, decompression timing, and Greeks-aware risk assessment.
          </p>
        </div>

        {/* Input Section */}
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
            placeholder="SPY, AAPL, QQQ, TSLA..."
            style={{
              padding: '0.75rem 1.25rem',
              fontSize: '1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(16,185,129,0.3)',
              borderRadius: '12px',
              color: 'white',
              minWidth: '150px',
              flex: '1 1 150px',
              maxWidth: '250px',
              outline: 'none',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          />
          
          <select
            value={selectedTF}
            onChange={(e) => setSelectedTF(e.target.value as ScanModeType)}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(59,130,246,0.5)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            {TIMEFRAME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.desc})
              </option>
            ))}
          </select>

          <button
            onClick={() => handleScan()}
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              background: loading 
                ? 'rgba(100,100,100,0.5)'
                : 'linear-gradient(135deg, #10B981, #3B82F6)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
          >
            {loading ? '🔄 Analyzing...' : '🎯 Scan for Options'}
          </button>

          {result && (
            <button
              onClick={() => handleScan()}
              disabled={loading}
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(100,100,100,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                color: '#94A3B8',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              🔄 Refresh
            </button>
          )}
        </div>

        {/* Status Bar */}
        {lastUpdated && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.8rem', color: '#64748B' }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
            {isCached && <span style={{ marginLeft: '8px', color: '#F59E0B' }}>(cached)</span>}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
            color: '#EF4444'
          }}>
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            
            {/* Top Row: Trade Quality + Direction + Entry Timing */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              
              {/* Trade Quality Card */}
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: `2px solid ${gradeColor(result.tradeQuality)}`,
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#E2E8F0', fontSize: '1rem' }}>Trade Quality</h3>
                  <span style={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    color: gradeColor(result.tradeQuality)
                  }}>
                    {gradeEmoji(result.tradeQuality)} {result.tradeQuality}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                  {result.qualityReasons.map((r, i) => (
                    <div key={i} style={{ marginBottom: '4px' }}>{r}</div>
                  ))}
                </div>
              </div>

              {/* Direction Card */}
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: `2px solid ${result.direction === 'bullish' ? '#10B981' : result.direction === 'bearish' ? '#EF4444' : '#6B7280'}`,
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <h3 style={{ margin: '0 0 0.75rem 0', color: '#E2E8F0', fontSize: '1rem' }}>Direction Signal</h3>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold',
                  color: result.direction === 'bullish' ? '#10B981' : result.direction === 'bearish' ? '#EF4444' : '#6B7280',
                  marginBottom: '0.5rem'
                }}>
                  {result.direction === 'bullish' ? '🟢 BULLISH — BUY CALLS' : 
                   result.direction === 'bearish' ? '🔴 BEARISH — BUY PUTS' : 
                   '⚪ NEUTRAL — WAIT'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
                  <div>Pull Bias: <span style={{ color: result.pullBias > 0 ? '#10B981' : result.pullBias < 0 ? '#EF4444' : '#6B7280' }}>
                    {result.pullBias > 0 ? '+' : ''}{result.pullBias.toFixed(1)}%
                  </span></div>
                  <div>Signal Strength: <span style={{ color: result.signalStrength === 'strong' ? '#10B981' : result.signalStrength === 'moderate' ? '#F59E0B' : '#6B7280' }}>
                    {result.signalStrength.toUpperCase()}
                  </span></div>
                </div>
              </div>

              {/* Entry Timing Card */}
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: `2px solid ${urgencyColor(result.entryTiming.urgency)}`,
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <h3 style={{ margin: '0 0 0.75rem 0', color: '#E2E8F0', fontSize: '1rem' }}>Entry Timing</h3>
                <div style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 'bold',
                  color: urgencyColor(result.entryTiming.urgency),
                  marginBottom: '0.5rem'
                }}>
                  {urgencyEmoji(result.entryTiming.urgency)} {result.entryTiming.urgency.replace('_', ' ').toUpperCase()}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                  {result.entryTiming.reason}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Window: {result.entryTiming.idealEntryWindow}
                </div>
                {result.entryTiming.avoidWindows.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#F97316', marginTop: '0.5rem' }}>
                    ⚠️ {result.entryTiming.avoidWindows[0]}
                  </div>
                )}
              </div>
            </div>

            {/* Confluence Info */}
            <div style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(168,85,247,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#A855F7' }}>🔮 Confluence Analysis</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{
                  background: 'rgba(168,85,247,0.2)',
                  padding: '1rem',
                  borderRadius: '12px',
                  textAlign: 'center',
                  minWidth: '120px'
                }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#A855F7' }}>
                    {result.confluenceStack}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>TFs Decompressing</div>
                </div>
                
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Active Timeframes:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {result.decompressingTFs.length > 0 ? result.decompressingTFs.map(tf => (
                      <span key={tf} style={{
                        background: 'rgba(168,85,247,0.3)',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        color: '#E9D5FF'
                      }}>
                        {tf}
                      </span>
                    )) : (
                      <span style={{ color: '#64748B', fontSize: '0.85rem' }}>No TFs actively decompressing</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Strike & Expiration Recommendations */}
            {result.direction !== 'neutral' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '1rem' }}>
                
                {/* Strike Recommendation */}
                <div style={{
                  background: 'rgba(30,41,59,0.6)',
                  border: '2px solid rgba(16,185,129,0.4)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#10B981' }}>🎯 Recommended Strike</h3>
                  
                  {result.primaryStrike ? (
                    <>
                      <div style={{
                        background: result.primaryStrike.type === 'call' 
                          ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))'
                          : 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
                        padding: '1.25rem',
                        borderRadius: '12px',
                        marginBottom: '1rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{
                            fontSize: '1.75rem',
                            fontWeight: 'bold',
                            color: result.primaryStrike.type === 'call' ? '#10B981' : '#EF4444'
                          }}>
                            ${result.primaryStrike.strike} {result.primaryStrike.type.toUpperCase()}
                          </span>
                          <span style={{
                            background: result.primaryStrike.moneyness === 'ATM' ? 'rgba(245,158,11,0.3)' : 'rgba(100,100,100,0.3)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            {result.primaryStrike.moneyness}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.75rem' }}>
                          {result.primaryStrike.reason}
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(45%, 120px), 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
                          <div>
                            <span style={{ color: '#64748B' }}>Est. Delta:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px', fontWeight: 'bold' }}>
                              {(result.primaryStrike.estimatedDelta * (result.primaryStrike.type === 'call' ? 1 : -1)).toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Distance:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryStrike.distanceFromPrice > 0 ? '+' : ''}{result.primaryStrike.distanceFromPrice.toFixed(2)}%
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Target Level:</span>
                            <span style={{ color: '#10B981', marginLeft: '6px' }}>
                              ${formatPrice(result.primaryStrike.targetLevel)}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Confidence:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryStrike.confidenceScore.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {result.alternativeStrikes.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '0.5rem' }}>Alternative Strikes:</div>
                          {result.alternativeStrikes.map((s, i) => (
                            <div key={i} style={{
                              background: 'rgba(100,100,100,0.2)',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              marginBottom: '0.5rem',
                              fontSize: '0.85rem'
                            }}>
                              <span style={{ fontWeight: 'bold', color: s.type === 'call' ? '#10B981' : '#EF4444' }}>
                                ${s.strike} {s.type.toUpperCase()}
                              </span>
                              <span style={{ color: '#64748B', marginLeft: '8px' }}>({s.moneyness})</span>
                              <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: '4px' }}>{s.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>
                      No clear strike recommendation - wait for directional signal
                    </div>
                  )}
                </div>

                {/* Expiration Recommendation */}
                <div style={{
                  background: 'rgba(30,41,59,0.6)',
                  border: '2px solid rgba(59,130,246,0.4)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#3B82F6' }}>📅 Recommended Expiration</h3>
                  
                  {result.primaryExpiration ? (
                    <>
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05))',
                        padding: '1.25rem',
                        borderRadius: '12px',
                        marginBottom: '1rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3B82F6' }}>
                            {result.primaryExpiration.dte} DTE
                          </span>
                          <span style={{
                            background: `rgba(${thetaColor(result.primaryExpiration.thetaRisk).slice(1).match(/.{2}/g)?.map(hex => parseInt(hex, 16)).join(',') || '100,100,100'},0.3)`,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: thetaColor(result.primaryExpiration.thetaRisk)
                          }}>
                            {result.primaryExpiration.thetaRisk.toUpperCase()} THETA
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '1rem', color: '#E2E8F0', marginBottom: '0.5rem' }}>
                          📆 {result.primaryExpiration.expirationDate}
                        </div>
                        
                        <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '0.75rem' }}>
                          {result.primaryExpiration.reason}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                          <div>
                            <span style={{ color: '#64748B' }}>Timeframe:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryExpiration.timeframe}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Confidence:</span>
                            <span style={{ color: '#E2E8F0', marginLeft: '6px' }}>
                              {result.primaryExpiration.confidenceScore.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {result.alternativeExpirations.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '0.5rem' }}>Alternative Expirations:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {result.alternativeExpirations.map((e, i) => (
                              <div key={i} style={{
                                background: 'rgba(100,100,100,0.2)',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem'
                              }}>
                                <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>{e.dte} DTE</span>
                                <span style={{ color: '#64748B', marginLeft: '6px' }}>({e.expirationDate})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>
                      No expiration recommendation available
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Open Interest Analysis */}
            {result.openInterestAnalysis ? (
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#8B5CF6' }}>📈 Open Interest Analysis</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ 
                      background: 'rgba(245,158,11,0.2)', 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem',
                      color: '#F59E0B'
                    }}>
                      📅 EOD Data
                    </span>
                    <span style={{ 
                      background: 'rgba(139,92,246,0.2)', 
                      padding: '4px 12px', 
                      borderRadius: '20px', 
                      fontSize: '0.85rem',
                      color: '#A78BFA'
                    }}>
                      Expiry: {result.openInterestAnalysis.expirationDate}
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  {/* P/C Ratio */}
                  <div style={{
                    background: 'rgba(139,92,246,0.15)',
                    padding: '1rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '4px' }}>Put/Call Ratio</div>
                    <div style={{ 
                      fontSize: '1.75rem', 
                      fontWeight: 'bold',
                      color: result.openInterestAnalysis.pcRatio > 1 ? '#EF4444' : result.openInterestAnalysis.pcRatio < 0.7 ? '#10B981' : '#F59E0B'
                    }}>
                      {result.openInterestAnalysis.pcRatio.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {result.openInterestAnalysis.pcRatio > 1 ? 'Bearish bias' : result.openInterestAnalysis.pcRatio < 0.7 ? 'Bullish bias' : 'Neutral'}
                    </div>
                  </div>
                  
                  {/* Max Pain */}
                  {result.openInterestAnalysis.maxPainStrike && (
                    <div style={{
                      background: 'rgba(245,158,11,0.15)',
                      padding: '1rem',
                      borderRadius: '12px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '4px' }}>Max Pain Strike</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#F59E0B' }}>
                        ${result.openInterestAnalysis.maxPainStrike}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {result.openInterestAnalysis.maxPainStrike > result.currentPrice ? 'Above price' : 'Below price'}
                      </div>
                    </div>
                  )}
                  
                  {/* O/I Sentiment */}
                  <div style={{
                    background: result.openInterestAnalysis.sentiment === 'bullish' 
                      ? 'rgba(16,185,129,0.15)' 
                      : result.openInterestAnalysis.sentiment === 'bearish' 
                        ? 'rgba(239,68,68,0.15)' 
                        : 'rgba(100,100,100,0.15)',
                    padding: '1rem',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '4px' }}>O/I Sentiment</div>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: result.openInterestAnalysis.sentiment === 'bullish' ? '#10B981' : result.openInterestAnalysis.sentiment === 'bearish' ? '#EF4444' : '#6B7280'
                    }}>
                      {result.openInterestAnalysis.sentiment === 'bullish' ? '🟢 BULLISH' : 
                       result.openInterestAnalysis.sentiment === 'bearish' ? '🔴 BEARISH' : '⚪ NEUTRAL'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {result.openInterestAnalysis.sentimentReason}
                    </div>
                  </div>
                </div>
                
                {/* O/I Volume Comparison */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(45%, 140px), 1fr))',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    background: 'rgba(16,185,129,0.1)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Call O/I</div>
                    <div style={{ fontWeight: 'bold', color: '#10B981' }}>
                      {(result.openInterestAnalysis.totalCallOI / 1000).toFixed(1)}K
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Put O/I</div>
                    <div style={{ fontWeight: 'bold', color: '#EF4444' }}>
                      {(result.openInterestAnalysis.totalPutOI / 1000).toFixed(1)}K
                    </div>
                  </div>
                </div>
                
                {/* High O/I Strikes */}
                {result.openInterestAnalysis.highOIStrikes.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>High Open Interest Strikes:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {result.openInterestAnalysis.highOIStrikes.slice(0, 6).map((s, i) => (
                        <span key={i} style={{
                          background: s.type === 'call' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                          border: `1px solid ${s.type === 'call' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.8rem'
                        }}>
                          <span style={{ fontWeight: 'bold', color: s.type === 'call' ? '#10B981' : '#EF4444' }}>
                            ${s.strike}
                          </span>
                          <span style={{ color: '#94A3B8', marginLeft: '6px' }}>
                            {(s.openInterest / 1000).toFixed(1)}K {s.type === 'call' ? 'C' : 'P'}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Alignment Check */}
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: (result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                              (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish')
                    ? 'rgba(16,185,129,0.15)'
                    : result.openInterestAnalysis.sentiment === 'neutral' 
                      ? 'rgba(245,158,11,0.15)'
                      : 'rgba(239,68,68,0.15)',
                  border: (result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                          (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish')
                    ? '1px solid rgba(16,185,129,0.3)'
                    : result.openInterestAnalysis.sentiment === 'neutral'
                      ? '1px solid rgba(245,158,11,0.3)'
                      : '1px solid rgba(239,68,68,0.3)',
                  fontSize: '0.85rem'
                }}>
                  {(result.direction === 'bullish' && result.openInterestAnalysis.sentiment === 'bullish') ||
                   (result.direction === 'bearish' && result.openInterestAnalysis.sentiment === 'bearish') ? (
                    <span style={{ color: '#10B981' }}>
                      ✅ O/I sentiment CONFIRMS confluence direction — higher confidence trade
                    </span>
                  ) : result.openInterestAnalysis.sentiment === 'neutral' ? (
                    <span style={{ color: '#F59E0B' }}>
                      ⚠️ O/I sentiment neutral — rely on confluence signals
                    </span>
                  ) : (
                    <span style={{ color: '#EF4444' }}>
                      ⚠️ O/I sentiment DIVERGES from confluence — proceed with caution
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* No Options Data Available - Show Placeholder */
              <div style={{
                background: 'rgba(30,41,59,0.6)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#8B5CF6' }}>📈 Open Interest Analysis</h3>
                  <span style={{ 
                    background: 'rgba(245,158,11,0.2)', 
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem',
                    color: '#F59E0B'
                  }}>
                    ⚠️ Data Unavailable
                  </span>
                </div>
                
                <div style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>�</div>
                  <div style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    Options Data Loading Issue
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    End-of-day options data is temporarily unavailable. This may be due to 
                    API rate limits, market hours, or the symbol not having options available.
                  </div>
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '0.75rem', 
                    background: 'rgba(16,185,129,0.1)', 
                    borderRadius: '8px',
                    color: '#10B981',
                    fontSize: '0.85rem'
                  }}>
                    ✅ Strike & Expiration recommendations still work based on price action confluence!
                  </div>
                </div>
              </div>
            )}

            {/* Greeks Advice */}
            <div style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#F59E0B' }}>📊 Greeks & Risk Advice</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Target Delta</div>
                  <div style={{ color: '#E2E8F0', fontWeight: 'bold' }}>{result.greeksAdvice.deltaTarget}</div>
                </div>
                
                {result.greeksAdvice.thetaWarning && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Theta Warning</div>
                    <div style={{ color: '#F97316', fontSize: '0.85rem' }}>{result.greeksAdvice.thetaWarning}</div>
                  </div>
                )}
                
                {result.greeksAdvice.gammaAdvice && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Gamma Advice</div>
                    <div style={{ color: '#E2E8F0', fontSize: '0.85rem' }}>{result.greeksAdvice.gammaAdvice}</div>
                  </div>
                )}
                
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>Overall Strategy</div>
                  <div style={{ color: '#E2E8F0' }}>{result.greeksAdvice.overallAdvice}</div>
                </div>
              </div>
            </div>

            {/* Risk Management */}
            <div style={{
              background: 'rgba(30,41,59,0.6)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#EF4444' }}>⚠️ Risk Management</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  padding: '1rem',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#EF4444' }}>
                    {result.maxRiskPercent}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Max Position Risk</div>
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>🛑 Stop Loss Strategy</div>
                    <div style={{ color: '#E2E8F0', fontSize: '0.85rem' }}>{result.stopLossStrategy}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '4px' }}>🎯 Profit Target Strategy</div>
                    <div style={{ color: '#10B981', fontSize: '0.85rem' }}>{result.profitTargetStrategy}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Trade Setup */}
            {result.primaryStrike && result.primaryExpiration && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))',
                border: '2px solid rgba(16,185,129,0.5)',
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#10B981' }}>📋 Trade Summary</h3>
                
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  fontFamily: 'monospace',
                  fontSize: '1rem'
                }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Symbol:</span>
                    <span style={{ color: '#E2E8F0', marginLeft: '8px', fontWeight: 'bold' }}>{result.symbol}</span>
                    <span style={{ color: '#64748B', marginLeft: '16px' }}>@</span>
                    <span style={{ color: '#3B82F6', marginLeft: '8px' }}>${formatPrice(result.currentPrice)}</span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Action:</span>
                    <span style={{ 
                      color: result.primaryStrike.type === 'call' ? '#10B981' : '#EF4444', 
                      marginLeft: '8px',
                      fontWeight: 'bold'
                    }}>
                      BUY {result.primaryStrike.type.toUpperCase()}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Strike:</span>
                    <span style={{ color: '#F59E0B', marginLeft: '8px', fontWeight: 'bold' }}>${result.primaryStrike.strike}</span>
                    <span style={{ color: '#64748B', marginLeft: '8px' }}>({result.primaryStrike.moneyness})</span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Expiration:</span>
                    <span style={{ color: '#3B82F6', marginLeft: '8px', fontWeight: 'bold' }}>{result.primaryExpiration.expirationDate}</span>
                    <span style={{ color: '#64748B', marginLeft: '8px' }}>({result.primaryExpiration.dte} DTE)</span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: '#64748B' }}>Quality:</span>
                    <span style={{ color: gradeColor(result.tradeQuality), marginLeft: '8px', fontWeight: 'bold' }}>
                      {gradeEmoji(result.tradeQuality)} {result.tradeQuality}
                    </span>
                    <span style={{ color: '#64748B', marginLeft: '8px' }}>|</span>
                    <span style={{ color: urgencyColor(result.entryTiming.urgency), marginLeft: '8px' }}>
                      {urgencyEmoji(result.entryTiming.urgency)} {result.entryTiming.urgency.toUpperCase()}
                    </span>
                  </div>
                  
                  <div style={{ 
                    borderTop: '1px solid rgba(255,255,255,0.1)', 
                    paddingTop: '0.75rem', 
                    marginTop: '0.75rem',
                    color: '#94A3B8',
                    fontSize: '0.85rem'
                  }}>
                    Target: ${formatPrice(result.primaryStrike.targetLevel)} (50% level) | 
                    Max Risk: {result.maxRiskPercent}% of portfolio
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Help Section */}
        {!result && !loading && (
          <div style={{
            background: 'rgba(30,41,59,0.4)',
            border: '1px solid rgba(100,100,100,0.3)',
            borderRadius: '16px',
            padding: '2rem',
            marginTop: '2rem'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: '#E2E8F0' }}>How It Works</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔮</div>
                <div style={{ fontWeight: 'bold', color: '#A855F7', marginBottom: '0.5rem' }}>Time Confluence</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Scans multiple timeframes for decompression events - when candles are gravitating toward their 50% levels.
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎯</div>
                <div style={{ fontWeight: 'bold', color: '#10B981', marginBottom: '0.5rem' }}>Strike Selection</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Recommends strikes based on 50% level clusters and target zones from decompressing timeframes.
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📅</div>
                <div style={{ fontWeight: 'bold', color: '#3B82F6', marginBottom: '0.5rem' }}>Expiration Logic</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Matches expiration to your trading timeframe - scalping gets 0-2 DTE, swing trading gets weekly/monthly options.
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
                <div style={{ fontWeight: 'bold', color: '#F59E0B', marginBottom: '0.5rem' }}>Greeks-Aware</div>
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                  Provides delta targets, theta decay warnings, and gamma considerations based on your chosen timeframe.
                </div>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '2rem', 
              padding: '1rem', 
              background: 'rgba(245,158,11,0.1)', 
              borderRadius: '12px',
              color: '#F59E0B',
              fontSize: '0.85rem'
            }}>
              ⚠️ <strong>Risk Warning:</strong> Options trading involves significant risk. This tool provides confluence-based analysis, not financial advice. 
              Always manage position sizes and use stops. Paper trade first!
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
