"use client";

import { useState, useEffect } from 'react';
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
}

export default function TimeConfluenceWidget({
  showMacro = true,
  showMicro = true,
  showTWAP = true,
  showCalendar = true,
  compact = false,
}: TimeConfluenceWidgetProps) {
  const [state, setState] = useState(() => getTimeConfluenceState());
  const [activeTab, setActiveTab] = useState<'now' | 'today' | 'macro' | 'calendar'>('now');

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setState(getTimeConfluenceState());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const impactColor = (impact: string) => {
    switch (impact) {
      case 'extreme':
      case 'maximum':
        return '#EF4444'; // Red
      case 'high':
      case 'very_high':
        return '#F59E0B'; // Orange
      case 'medium':
        return '#3B82F6'; // Blue
      default:
        return '#64748B'; // Gray
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
    const colors: Record<string, { bg: string; text: string }> = {
      pre: { bg: 'rgba(251,191,36,0.2)', text: '#FBBF24' },
      regular: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
      after: { bg: 'rgba(139,92,246,0.2)', text: '#8B5CF6' },
      closed: { bg: 'rgba(100,116,139,0.2)', text: '#64748B' },
    };
    const { bg, text } = colors[state.sessionType];
    return (
      <span style={{ background: bg, color: text, padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
        {state.sessionType === 'pre' ? '🌅 Pre-Market' :
         state.sessionType === 'regular' ? '🟢 Market Open' :
         state.sessionType === 'after' ? '🌙 After Hours' :
         '🔴 Closed'}
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
            <span style={{ color: '#64748B', fontSize: '0.8rem' }}>Now:</span>
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
        
        {state.nextMajor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#64748B', fontSize: '0.8rem' }}>Next:</span>
            <span style={{ color: '#A855F7', fontWeight: 600, fontSize: '0.9rem' }}>
              {state.nextMajor.timeET}
            </span>
            <span style={{ color: '#F59E0B', fontSize: '0.8rem' }}>
              ({formatCountdown(state.minutesToNextMajor)})
            </span>
          </div>
        )}

        {state.nextMacroConfluence && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#64748B', fontSize: '0.8rem' }}>Macro:</span>
            <span style={{ color: '#EF4444', fontWeight: 600, fontSize: '0.9rem' }}>
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
          <span style={{ fontSize: '1.3rem' }}>⏰</span>
          <h3 style={{ margin: 0, color: '#E2E8F0', fontSize: '1.1rem', fontWeight: 600 }}>
            Time Confluence Engine
          </h3>
        </div>
        {sessionBadge()}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(168,85,247,0.2)',
      }}>
        {[
          { id: 'now', label: '🔴 Live' },
          { id: 'today', label: '📅 Today' },
          { id: 'macro', label: '📊 Macro' },
          { id: 'calendar', label: '🗓️ Calendar' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: activeTab === tab.id ? 'rgba(168,85,247,0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #A855F7' : '2px solid transparent',
              color: activeTab === tab.id ? '#A855F7' : '#64748B',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
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
            }}>
              <div style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                CONFLUENCE SCORE
              </div>
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
                <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  CLOSING NOW
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {state.nowClosing.map((candle) => (
                    <span
                      key={candle}
                      style={{
                        background: candle.includes('Fib') ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)',
                        color: candle.includes('Fib') ? '#F59E0B' : '#3B82F6',
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
            {state.nextMajor && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(59,130,246,0.2))',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ color: '#A855F7', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  ⏳ NEXT MAJOR CONFLUENCE
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#E2E8F0' }}>
                      {state.nextMajor.timeET}
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                      {state.nextMajor.description}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: '#F59E0B',
                  }}>
                    {formatCountdown(state.minutesToNextMajor)}
                  </div>
                </div>
              </div>
            )}

            {/* TWAP Windows */}
            {showTWAP && (
              <div style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '10px',
                padding: '1rem',
              }}>
                <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                  🏦 INSTITUTIONAL TWAP WINDOWS
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
                      <span style={{ color: '#3B82F6', fontWeight: 500, fontSize: '0.85rem' }}>
                        {window.start} - {window.end}
                      </span>
                      <span style={{ color: '#64748B', fontSize: '0.75rem' }}>
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
            <div style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Medium+ impact confluences for today
            </div>
            
            {state.todayConfluences.length === 0 ? (
              <div style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem' }}>
                No major confluences scheduled
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
                      <div style={{ color: '#E2E8F0', fontWeight: 500 }}>{conf.timeET}</div>
                      <div style={{ color: '#64748B', fontSize: '0.75rem' }}>
                        {conf.closingCandles.slice(0, 4).join(', ')}
                        {conf.closingCandles.length > 4 && ` +${conf.closingCandles.length - 4}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: impactColor(conf.impactLevel), fontWeight: 'bold' }}>
                        {conf.confluenceScore}
                      </div>
                      {impactBadge(conf.impactLevel)}
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
                background: `linear-gradient(135deg, ${
                  state.nextMacroConfluence.isYearly ? 'rgba(239,68,68,0.2)' :
                  state.nextMacroConfluence.isQuarterly ? 'rgba(245,158,11,0.2)' :
                  'rgba(59,130,246,0.2)'
                }, rgba(30,41,59,0.8))`,
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1rem',
                border: `1px solid ${impactColor(state.nextMacroConfluence.impactLevel)}40`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                      NEXT MAJOR MACRO PIVOT
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#E2E8F0' }}>
                      {state.nextMacroConfluence.date.toLocaleDateString('en-US', { 
                        weekday: 'long',
                        month: 'long', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div style={{ color: '#94A3B8', marginTop: '0.25rem' }}>
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
                  <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    CANDLES CLOSING
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {state.nextMacroConfluence.closingCandles.map((candle) => (
                      <span
                        key={candle}
                        style={{
                          background: candle === 'Yearly' ? 'rgba(239,68,68,0.2)' :
                                     candle === 'Quarterly' ? 'rgba(245,158,11,0.2)' :
                                     'rgba(59,130,246,0.2)',
                          color: candle === 'Yearly' ? '#EF4444' :
                                 candle === 'Quarterly' ? '#F59E0B' :
                                 '#3B82F6',
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
              <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                MACRO TIMEFRAME GUIDE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem' }}>
                {[
                  { label: 'Daily', days: '1', color: '#64748B' },
                  { label: 'Weekly', days: '5', color: '#3B82F6' },
                  { label: 'Bi-weekly', days: '10', color: '#3B82F6' },
                  { label: '3-Week', days: '15', color: '#8B5CF6' },
                  { label: 'Monthly', days: '21', color: '#F59E0B' },
                  { label: 'Quarterly', days: '63', color: '#EF4444' },
                ].map((tf) => (
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
                    <div style={{ color: '#64748B', fontSize: '0.7rem' }}>
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
            <div style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: '1rem' }}>
              High-impact confluence dates
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
                          isYearly ? '#EF4444' :
                          isQuarterly ? '#F59E0B' :
                          '#3B82F6'
                        }`,
                      }}
                    >
                      <div>
                        <div style={{ color: '#E2E8F0', fontWeight: 500 }}>
                          {new Date(event.date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div style={{ color: '#64748B', fontSize: '0.75rem' }}>
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
