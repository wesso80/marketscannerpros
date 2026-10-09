"use client";

import { useState, useEffect } from 'react';
import { formatMarketTime } from '@/lib/market/priceStamp';
import { nyDateTime, nyWallTimeMs } from '@/lib/time/usSession';
import {
  getTimeConfluenceState,
  TimeConfluence,
  MacroConfluence,
  HIGH_IMPACT_DATES_2025,
  HIGH_IMPACT_DATES_2026,
} from '@/lib/time-confluence';

interface TimeConfluenceWidgetProps {
  showMacro?: boolean;
  showMicro?: boolean;
  showTWAP?: boolean;
  showCalendar?: boolean;
  compact?: boolean;
  /** Active ticker symbol for context display */
  symbol?: string;
  /** Asset class — controls macro candle computation (crypto uses TradingView UTC anchors) */
  assetClass?: 'crypto' | 'equity';
}

// Generate confidence explanation from current state
function getConfidenceExplanation(state: ReturnType<typeof getTimeConfluenceState>): string {
  const parts: string[] = [];
  
  if (state.nowClosing.length > 0) {
    const fibCount = state.nowClosing.filter(c => c.includes('Fib')).length;
    const standardCount = state.nowClosing.length - fibCount;
    if (fibCount > 0) parts.push(`${fibCount} Fib timeframe${fibCount > 1 ? 's' : ''}`);
    if (standardCount > 0) parts.push(`${standardCount} standard candle${standardCount > 1 ? 's' : ''} closing`);
  }
  
  if (state.nextMajor && state.minutesToNextMajor <= 5) {
    parts.push('major confluence imminent');
  }
  
  if (state.twapWindows.length > 0) {
    parts.push('TWAP analysis windows available');
  }
  
  if (state.daysToNextMacro <= 2) {
    parts.push('macro pivot approaching');
  }
  
  if (parts.length === 0) {
    return 'Low activity - waiting for timeframe alignments';
  }
  
  return parts.join(' + ');
}

export default function TimeConfluenceWidget({
  showMacro = true,
  showMicro = true,
  showTWAP = true,
  showCalendar = true,
  compact = false,
  symbol,
  assetClass = 'crypto',
}: TimeConfluenceWidgetProps) {
  const [state, setState] = useState(() => getTimeConfluenceState(new Date(), assetClass));
  const [activeTab, setActiveTab] = useState<'now' | 'today' | 'fib' | 'macro' | 'calendar'>(assetClass === 'crypto' ? 'macro' : 'now');
  useEffect(() => { setActiveTab(assetClass === 'crypto' ? 'macro' : 'now'); }, [assetClass]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [zone, setZone] = useState('UTC');
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  const clockTime = (date: Date) => formatMarketTime(date.toISOString(), zone) || 'Not collected';
  const equityWindowTime = (time: string) => {
    const match = /^(\d+):(\d+) (AM|PM)$/.exec(time);
    if (!match) return `${time} ET`;
    const hour = Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0);
    const day = nyDateTime(state.currentTime.getTime()).ymd;
    return formatMarketTime(nyWallTimeMs(day, hour * 60 + Number(match[2])), zone) || 'Not collected';
  };

  // Update every minute
  useEffect(() => {
    setState(getTimeConfluenceState(new Date(), assetClass));
    const interval = setInterval(() => {
      setState(getTimeConfluenceState(new Date(), assetClass));
    }, 60000);
    return () => clearInterval(interval);
  }, [assetClass]);

  const impactColor = (impact: string) => {
    switch (impact) {
      case 'extreme':
      case 'maximum':
        return 'var(--msp-bear)'; // Red
      case 'high':
      case 'very_high':
        return 'var(--msp-warn)'; // Orange
      case 'medium':
        return 'var(--msp-accent)';
      default:
        return 'var(--msp-text-muted)'; // Gray
    }
  };

  const impactBadge = (impact: string) => {
    const color = impactColor(impact);
    return (
      <span style={{
        background: `${color}20`,
        color,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}>
        {impact.replace('_', ' ')}
      </span>
    );
  };

  const sessionBadge = () => {
    if (assetClass === 'crypto') return <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">24/7 crypto</span>;
    const colors: Record<string, { bg: string; text: string }> = {
      pre: { bg: 'rgba(251,191,36,0.2)', text: 'var(--msp-warn)' },
      regular: { bg: 'rgba(16,185,129,0.2)', text: 'var(--msp-bull)' },
      after: { bg: 'rgba(148,163,184,0.2)', text: 'var(--msp-muted)' },
      closed: { bg: 'rgba(100,116,139,0.2)', text: 'var(--msp-text-muted)' },
    };
    const { bg, text } = colors[state.sessionType];
    return (
      <span style={{ background: bg, color: text, padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
        {state.sessionType === 'pre' ? <><span aria-hidden="true">🌅 </span>Pre-Market</> :
         state.sessionType === 'regular' ? <><span aria-hidden="true">🟢 </span>Market Open</> :
         state.sessionType === 'after' ? <><span aria-hidden="true">🌙 </span>After Hours</> :
         <><span aria-hidden="true">🔴 </span>Closed</>}
      </span>
    );
  };

  const formatCountdown = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  if (compact) {
    // Compact inline version
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem 1rem',
        background: 'rgba(30,41,59,0.8)',
        borderRadius: '10px',
        border: '1px solid rgba(168,85,247,0.2)',
        flexWrap: 'wrap',
      }}>
        {sessionBadge()}
        
        {state.nowConfluenceScore > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--msp-text-muted)', fontSize: '0.8rem' }}>Now:</span>
            <span style={{ 
              color: impactColor(state.nowImpact),
              fontWeight: 600,
              fontSize: '0.9rem',
            }}>
              {state.nowClosing.slice(0, 3).join(', ')}
              {state.nowClosing.length > 3 && ` +${state.nowClosing.length - 3}`}
            </span>
          </div>
        )}
        
        {assetClass !== 'crypto' && state.nextMajor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--msp-text-muted)', fontSize: '0.8rem' }}>Next:</span>
            <span style={{ color: '#A855F7', fontWeight: 600, fontSize: '0.9rem' }}>
              {clockTime(state.nextMajor.time)}
            </span>
            <span style={{ color: 'var(--msp-warn)', fontSize: '0.8rem' }}>
              ({formatCountdown(state.minutesToNextMajor)})
            </span>
          </div>
        )}

        {state.nextMacroConfluence && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--msp-text-muted)', fontSize: '0.8rem' }}>Macro:</span>
            <span style={{ color: 'var(--msp-bear)', fontWeight: 600, fontSize: '0.9rem' }}>
              {state.daysToNextMacro}d
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(30,41,59,0.9)',
      border: '1px solid rgba(168,85,247,0.3)',
      borderRadius: '16px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid rgba(168,85,247,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span aria-hidden="true" style={{ fontSize: '1.3rem' }}>⏰</span>
          <h3 style={{ margin: 0, color: 'var(--msp-text)', fontSize: '1.1rem', fontWeight: 600 }}>
            Close timing
          </h3>
        </div>
        {sessionBadge()}
      </div>

      {/* Tabs */}
      <div role="tablist" style={{
        display: 'flex',
        borderBottom: '1px solid rgba(168,85,247,0.2)',
      }}>
        {[
          ...(assetClass === 'equity' ? [{ id: 'now', icon: '🔴', text: 'Current' }] : []),
          ...(assetClass === 'equity' ? [{ id: 'today', icon: '📅', text: 'Today' }, { id: 'fib', icon: '🔢', text: 'Fib' }] : []),
          { id: 'macro', icon: '📊', text: 'Macro' },
          { id: 'calendar', icon: '🗓️', text: 'Calendar' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              flex: 1,
              padding: '0.75rem 0.35rem',
              background: activeTab === tab.id ? 'rgba(168,85,247,0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #A855F7' : '2px solid transparent',
              color: activeTab === tab.id ? '#A855F7' : 'var(--msp-text-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            <span aria-hidden="true">{tab.icon} </span>{tab.text}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '1.25rem' }}>
        
        {/* NOW Tab */}
        {activeTab === 'now' && (
          <div>
            {/* Current Confluence Meter */}
            <div style={{
              textAlign: 'center',
              marginBottom: '1.5rem',
              position: 'relative',
            }}>
              <div style={{ 
                color: 'var(--msp-text-muted)', 
                fontSize: '0.8rem', 
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}>
                WHAT TO CHECK
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(!showTooltip)}
                  aria-expanded={showTooltip}
                  aria-label="Reading breakdown info"
                  style={{
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(168,85,247,0.3)',
                    border: 'none',
                    color: '#A855F7',
                    fontSize: '0.7rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                  }}
                >
                  ?
                </button>
              </div>
              
              {/* Confidence Explanation Tooltip */}
              {showTooltip && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15,23,42,0.98)',
                  border: '1px solid rgba(168,85,247,0.4)',
                  borderRadius: '10px',
                  padding: '1rem',
                  width: '280px',
                  maxWidth: '90vw',
                  zIndex: 100,
                  textAlign: 'left',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ color: '#A855F7', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    <span aria-hidden="true">📊 </span>Reading Breakdown
                  </div>
                  <div style={{ color: 'var(--msp-text)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    {getConfidenceExplanation(state)}
                  </div>
                  <div style={{ 
                    marginTop: '0.75rem', 
                    paddingTop: '0.75rem', 
                    borderTop: '1px solid rgba(100,116,139,0.3)',
                    color: 'var(--msp-text-muted)',
                    fontSize: '0.75rem',
                  }}>
                    Higher readings = more timeframes aligning = stronger reversal/continuation readings
                  </div>
                </div>
              )}
              
              <div style={{
                fontSize: '3rem',
                fontWeight: 'bold',
                color: impactColor(state.nowImpact),
                lineHeight: 1,
              }}>
                {state.nowConfluenceScore}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                {impactBadge(state.nowImpact)}
              </div>
              
            </div>

            {/* Candles Closing Now */}
            {state.nowClosing.length > 0 && (
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  CLOSING NOW
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {state.nowClosing.map((candle) => (
                    <span
                      key={candle}
                      style={{
                        background: candle.includes('Fib') ? 'rgba(245,158,11,0.2)' : 'var(--msp-panel)',
                        color: candle.includes('Fib') ? 'var(--msp-warn)' : 'var(--msp-accent)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                      }}
                    >
                      {candle}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Next Major Confluence */}
            {assetClass !== 'crypto' && state.nextMajor && (
              <div style={{
                background: 'var(--msp-panel)',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ color: '#A855F7', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  <span aria-hidden="true">⏳ </span>Next scheduled agreement
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--msp-text)' }}>
                      {clockTime(state.nextMajor.time)}
                    </div>
                    <div style={{ color: 'var(--msp-flat)', fontSize: '0.85rem' }}>
                      {state.nextMajor.description}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: 'var(--msp-warn)',
                  }}>
                    {formatCountdown(state.minutesToNextMajor)}
                  </div>
                </div>
              </div>
            )}

            {/* TWAP Windows */}
            {showTWAP && assetClass !== 'crypto' && (
              <div style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '10px',
                padding: '1rem',
              }}>
                <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                  <span aria-hidden="true">🏦 </span>US equity session windows · viewer time
                </div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {state.twapWindows.slice(0, 3).map((window, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '6px',
                      }}
                    >
                      <span style={{ color: 'var(--msp-accent)', fontWeight: 500, fontSize: '0.85rem' }}>
                        {equityWindowTime(window.start)} – {equityWindowTime(window.end)}
                      </span>
                      <span style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                        {window.description.split(' - ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TODAY Tab */}
        {activeTab === 'today' && (
          <div>
            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Medium+ impact agreements for today
            </div>
            
            {state.todayConfluences.length === 0 ? (
              <div style={{ color: 'var(--msp-flat)', textAlign: 'center', padding: '2rem' }}>
                No major agreements scheduled
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                {state.todayConfluences.map((conf, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      borderLeft: `3px solid ${impactColor(conf.impactLevel)}`,
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--msp-text)', fontWeight: 500 }}>{clockTime(conf.time)}</div>
                      <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                        {conf.closingCandles.slice(0, 4).join(', ')}
                        {conf.closingCandles.length > 4 && ` +${conf.closingCandles.length - 4}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--msp-text-muted)', fontWeight: 'bold' }}>
                        {conf.closingCandles.length} timeframes
                      </div>
                      {impactBadge(conf.impactLevel)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FIB Tab */}
        {activeTab === 'fib' && (
          <div>
            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Fibonacci close timing — minutes where 2+ Fib intervals close simultaneously
            </div>

            {state.fibConfluenceWindows.length === 0 ? (
              <div style={{ color: 'var(--msp-flat)', textAlign: 'center', padding: '2rem' }}>
                {state.marketOpen ? 'No multi-Fib agreements remaining today' : 'Market closed — Fib windows available during RTH'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
                {state.fibConfluenceWindows.slice(0, 20).map((conf, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      borderLeft: `3px solid ${conf.fibCount >= 4 ? 'var(--msp-bear)' : conf.fibCount >= 3 ? 'var(--msp-warn)' : '#A855F7'}`,
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--msp-text)', fontWeight: 500 }}>{clockTime(conf.time)}</div>
                      <div style={{ color: 'var(--msp-warn)', fontSize: '0.75rem' }}>
                        {conf.closingCandles.filter(c => c.includes('Fib')).join(', ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <span style={{ color: 'var(--msp-warn)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {conf.fibScore.toFixed(1)}
                        </span>
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: conf.fibCount >= 4 ? 'rgba(239,68,68,0.2)' : conf.fibCount >= 3 ? 'rgba(245,158,11,0.2)' : 'rgba(168,85,247,0.2)',
                          color: conf.fibCount >= 4 ? 'var(--msp-bear)' : conf.fibCount >= 3 ? 'var(--msp-warn)' : '#A855F7',
                        }}>
                          {conf.fibCount}× Fib
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MACRO Tab */}
        {activeTab === 'macro' && showMacro && (
          <div>
            {/* Next Macro Event */}
            {state.nextMacroConfluence && (
              <div style={{
                background: `${
                  state.nextMacroConfluence.isYearly ? 'rgba(239,68,68,0.2)' :
                  state.nextMacroConfluence.isQuarterly ? 'rgba(245,158,11,0.2)' :
                  'var(--msp-panel)'
                }`,
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1rem',
                border: `1px solid ${impactColor(state.nextMacroConfluence.impactLevel)}40`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                      NEXT MAJOR MACRO PIVOT
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--msp-text)' }}>
                      {state.nextMacroConfluence.date.toLocaleDateString('en-US', { 
                        weekday: 'long',
                        month: 'long', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div style={{ color: 'var(--msp-flat)', marginTop: '0.25rem' }}>
                      {state.nextMacroConfluence.description}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '2rem',
                      fontWeight: 'bold',
                      color: impactColor(state.nextMacroConfluence.impactLevel),
                    }}>
                      {state.daysToNextMacro}d
                    </div>
                    {impactBadge(state.nextMacroConfluence.impactLevel)}
                  </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    CANDLES CLOSING
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {state.nextMacroConfluence.closingCandles.map((candle) => (
                      <span
                        key={candle}
                        style={{
                          background: candle === 'Yearly' ? 'rgba(239,68,68,0.2)' :
                                     candle === 'Quarterly' ? 'rgba(245,158,11,0.2)' :
                                     'var(--msp-panel)',
                          color: candle === 'Yearly' ? 'var(--msp-bear)' :
                                 candle === 'Quarterly' ? 'var(--msp-warn)' :
                                 'var(--msp-accent)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                        }}
                      >
                        {candle}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Macro Guide */}
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '10px',
              padding: '1rem',
            }}>
              <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                MACRO TIMEFRAME GUIDE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100px, 100%), 1fr))', gap: '0.5rem' }}>
                {(assetClass === 'crypto' ? [
                  { label: '1D', days: '1', color: 'var(--msp-text-muted)' },
                  { label: '3D', days: '3', color: 'var(--msp-accent)' },
                  { label: '10D', days: '10', color: 'var(--msp-accent)' },
                  { label: '18D', days: '18', color: 'var(--msp-muted)' },
                  { label: '30D', days: '30', color: 'var(--msp-warn)' },
                  { label: '3M', days: 'Q', color: 'var(--msp-bear)' },
                ] : [
                  { label: '1D', days: '1', color: 'var(--msp-text-muted)' },
                  { label: '4D', days: '4', color: 'var(--msp-accent)' },
                  { label: '22D', days: '22', color: 'var(--msp-accent)' },
                  { label: '1W', days: '5', color: 'var(--msp-muted)' },
                  { label: '4W', days: '~20', color: 'var(--msp-warn)' },
                  { label: '12W', days: '~60', color: 'var(--msp-bear)' },
                ]).map((tf) => (
                  <div
                    key={tf.label}
                    style={{
                      textAlign: 'center',
                      padding: '0.5rem',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ color: tf.color, fontWeight: 600, fontSize: '0.85rem' }}>
                      {tf.label}
                    </div>
                    <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.7rem' }}>
                      ~{tf.days}d
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR Tab */}
        {activeTab === 'calendar' && showCalendar && (
          <div>
            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              High-impact agreement dates
            </div>
            
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {[...HIGH_IMPACT_DATES_2025, ...HIGH_IMPACT_DATES_2026]
                .filter(d => new Date(d.date) >= new Date())
                .slice(0, 8)
                .map((event, i) => {
                  const isYearly = event.candles.includes('Yearly');
                  const isQuarterly = event.candles.includes('Quarterly');
                  
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem',
                        background: isYearly ? 'rgba(239,68,68,0.1)' :
                                   isQuarterly ? 'rgba(245,158,11,0.1)' :
                                   'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${
                          isYearly ? 'var(--msp-bear)' :
                          isQuarterly ? 'var(--msp-warn)' :
                          'var(--msp-accent)'
                        }`,
                      }}
                    >
                      <div>
                        <div style={{ color: 'var(--msp-text)', fontWeight: 500 }}>
                          {new Date(event.date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                          {event.description}
                        </div>
                      </div>
                      <div>
                        {impactBadge(isYearly ? 'maximum' : isQuarterly ? 'very_high' : 'high')}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
