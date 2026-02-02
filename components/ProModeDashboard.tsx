"use client";

import React from 'react';
import {
  ProbabilityResult,
  getProbabilityColor,
  getConfidenceBadgeStyle,
  formatKellySize,
} from '@/lib/signals/probability-engine';

// ═══════════════════════════════════════════════════════════════════════════
// PRO MODE DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ProModeDashboardProps {
  probability: ProbabilityResult;
  tradeLevels?: {
    entryZone: { low: number; high: number };
    stopLoss: number;
    stopLossPercent: number;
    target1: { price: number; reason: string; takeProfit: number };
    target2?: { price: number; reason: string; takeProfit: number } | null;
    target3?: { price: number; reason: string; takeProfit: number } | null;
    riskRewardRatio: number;
  } | null;
  currentPrice?: number;
  symbol?: string;
  compact?: boolean;
}

export function ProModeDashboard({
  probability,
  tradeLevels,
  currentPrice,
  symbol,
  compact = false,
}: ProModeDashboardProps) {
  const badgeStyle = getConfidenceBadgeStyle(probability.confidenceLabel);
  const probColor = getProbabilityColor(probability.winProbability);
  
  // Circular progress for probability
  const circumference = 2 * Math.PI * 45;
  const progress = (probability.winProbability / 100) * circumference;
  
  if (compact) {
    return (
      <div style={{
        background: 'linear-gradient(145deg, rgba(16,185,129,0.08), rgba(30,41,59,0.5))',
        borderRadius: '16px',
        border: '1px solid rgba(16,185,129,0.2)',
        padding: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Mini probability circle */}
          <div style={{ position: 'relative', width: '60px', height: '60px' }}>
            <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="4"
              />
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke={probColor}
                strokeWidth="4"
                strokeDasharray={2 * Math.PI * 25}
                strokeDashoffset={2 * Math.PI * 25 - (probability.winProbability / 100) * 2 * Math.PI * 25}
                strokeLinecap="round"
              />
            </svg>
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 'bold',
              color: probColor,
            }}>
              {probability.winProbability}%
            </div>
          </div>
          
          {/* Quick stats */}
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'inline-block',
              padding: '2px 8px',
              background: badgeStyle.bg,
              border: `1px solid ${badgeStyle.border}`,
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              color: badgeStyle.text,
              marginBottom: '4px',
            }}>
              {probability.confidenceLabel}
            </div>
            <div style={{ color: '#94A3B8', fontSize: '12px' }}>
              {probability.signalCount}/{probability.totalSignals} signals aligned
            </div>
            <div style={{ color: '#64748B', fontSize: '11px' }}>
              Kelly: {formatKellySize(probability.kellySizePercent)}
            </div>
          </div>
          
          {/* Direction arrow */}
          <div style={{
            fontSize: '24px',
            color: probability.direction === 'bullish' ? '#10B981' : probability.direction === 'bearish' ? '#EF4444' : '#64748B',
          }}>
            {probability.direction === 'bullish' ? '↗' : probability.direction === 'bearish' ? '↘' : '→'}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(16,185,129,0.05), rgba(30,41,59,0.6))',
      borderRadius: '20px',
      border: '1px solid rgba(16,185,129,0.2)',
      padding: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: '700',
            color: '#fff',
            letterSpacing: '0.5px',
          }}>
            🏦 PRO MODE
          </span>
          <span style={{ color: '#94A3B8', fontSize: '13px' }}>
            Institutional-Grade Analysis
          </span>
        </div>
        {symbol && (
          <span style={{ color: '#F1F5F9', fontWeight: '600' }}>
            {symbol}
          </span>
        )}
      </div>
      
      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        {/* Left: Probability Circle */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <div style={{ position: 'relative', width: '120px', height: '120px' }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke={probColor}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: probColor,
              }}>
                {probability.winProbability}%
              </span>
              <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase' }}>
                Win Prob
              </span>
            </div>
          </div>
          
          {/* Confidence Badge */}
          <div style={{
            padding: '6px 14px',
            background: badgeStyle.bg,
            border: `1px solid ${badgeStyle.border}`,
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            color: badgeStyle.text,
          }}>
            {probability.confidenceLabel}
          </div>
        </div>
        
        {/* Right: Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem',
        }}>
          {/* Kelly Size */}
          <div style={{
            background: 'rgba(30,41,59,0.5)',
            borderRadius: '12px',
            padding: '0.75rem',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
              KELLY SIZE
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#F1F5F9' }}>
              {probability.kellySizePercent.toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
              of Capital
            </div>
          </div>
          
          {/* Risk/Reward */}
          <div style={{
            background: 'rgba(30,41,59,0.5)',
            borderRadius: '12px',
            padding: '0.75rem',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
              RISK/REWARD
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#F1F5F9' }}>
              1:{tradeLevels?.riskRewardRatio?.toFixed(1) || probability.rMultiple.toFixed(1)}
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
              R-Multiple
            </div>
          </div>
          
          {/* Signal Confluence */}
          <div style={{
            background: 'rgba(30,41,59,0.5)',
            borderRadius: '12px',
            padding: '0.75rem',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
              CONFLUENCE
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#F1F5F9' }}>
              {probability.signalCount}/{probability.totalSignals}
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
              Signals Aligned
            </div>
          </div>
          
          {/* Direction */}
          <div style={{
            background: 'rgba(30,41,59,0.5)',
            borderRadius: '12px',
            padding: '0.75rem',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
              DIRECTION
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: probability.direction === 'bullish' ? '#10B981' 
                : probability.direction === 'bearish' ? '#EF4444' 
                : '#64748B',
            }}>
              {probability.direction === 'bullish' ? '↗ BULL' 
                : probability.direction === 'bearish' ? '↘ BEAR' 
                : '→ FLAT'}
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
              Bias
            </div>
          </div>
        </div>
      </div>
      
      {/* Trade Levels */}
      {tradeLevels && currentPrice && (
        <div style={{
          background: 'rgba(30,41,59,0.5)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: '600',
            color: '#94A3B8',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span>🎯</span> TRADE LEVELS
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.5rem',
            textAlign: 'center',
          }}>
            <div style={{
              padding: '0.5rem',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.3)',
            }}>
              <div style={{ fontSize: '9px', color: '#EF4444', marginBottom: '2px' }}>STOP</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#EF4444' }}>
                ${tradeLevels.stopLoss.toFixed(2)}
              </div>
              <div style={{ fontSize: '9px', color: '#F87171' }}>
                -{tradeLevels.stopLossPercent.toFixed(1)}%
              </div>
            </div>
            
            <div style={{
              padding: '0.5rem',
              background: 'rgba(59,130,246,0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(59,130,246,0.3)',
            }}>
              <div style={{ fontSize: '9px', color: '#3B82F6', marginBottom: '2px' }}>ENTRY</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#3B82F6' }}>
                ${currentPrice.toFixed(2)}
              </div>
              <div style={{ fontSize: '9px', color: '#60A5FA' }}>
                Current
              </div>
            </div>
            
            <div style={{
              padding: '0.5rem',
              background: 'rgba(16,185,129,0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(16,185,129,0.3)',
            }}>
              <div style={{ fontSize: '9px', color: '#10B981', marginBottom: '2px' }}>TARGET 1</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#10B981' }}>
                ${tradeLevels.target1.price.toFixed(2)}
              </div>
              <div style={{ fontSize: '9px', color: '#34D399' }}>
                Take {tradeLevels.target1.takeProfit}%
              </div>
            </div>
            
            {tradeLevels.target2 && (
              <div style={{
                padding: '0.5rem',
                background: 'rgba(16,185,129,0.15)',
                borderRadius: '8px',
                border: '1px solid rgba(16,185,129,0.4)',
              }}>
                <div style={{ fontSize: '9px', color: '#10B981', marginBottom: '2px' }}>TARGET 2</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#10B981' }}>
                  ${tradeLevels.target2.price.toFixed(2)}
                </div>
                <div style={{ fontSize: '9px', color: '#34D399' }}>
                  Take {tradeLevels.target2.takeProfit}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Signal Breakdown */}
      <div style={{
        background: 'rgba(30,41,59,0.5)',
        borderRadius: '12px',
        padding: '1rem',
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: '600',
          color: '#94A3B8',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>📊</span> SIGNAL BREAKDOWN
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {probability.components.map((component, idx) => {
            // Color based on contribution strength, not just direction
            const isStrong = component.contribution >= 60;
            const isMedium = component.contribution >= 30;
            const barColor = !component.triggered ? '#64748B'
              : component.direction === 'neutral' ? '#64748B' 
              : isStrong 
                ? (component.direction === 'bullish' ? '#10B981' : '#EF4444')
                : isMedium 
                  ? (component.direction === 'bullish' ? '#6EE7B7' : '#FCA5A5')
                  : '#94A3B8'; // Weak = grey
            
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem',
                  background: component.triggered 
                    ? isStrong
                      ? component.direction === 'bullish' 
                        ? 'rgba(16,185,129,0.1)'
                        : component.direction === 'bearish'
                        ? 'rgba(239,68,68,0.1)'
                        : 'rgba(100,116,139,0.1)'
                      : 'rgba(100,116,139,0.05)'
                    : 'transparent',
                  borderRadius: '8px',
                  opacity: component.triggered ? (isStrong ? 1 : isMedium ? 0.85 : 0.65) : 0.4,
                }}
              >
                {/* Direction indicator */}
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  background: component.triggered
                    ? `${barColor}30`
                    : 'rgba(100,116,139,0.2)',
                }}>
                  {component.triggered
                    ? component.direction === 'bullish' ? '↗' : component.direction === 'bearish' ? '↘' : '→'
                    : '○'}
                </div>
                
                {/* Name with weight */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: '#F1F5F9' }}>
                    {component.name}
                    <span style={{ 
                      fontSize: '9px', 
                      color: '#64748B',
                      marginLeft: '4px',
                      fontWeight: '400',
                    }}>({Math.round(component.confidence * 100)}%)</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    {component.reason}
                  </div>
                </div>
                
                {/* Contribution bar - color based on strength */}
                <div style={{ width: '60px' }}>
                  <div style={{
                    height: '6px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(component.contribution, 100)}%`,
                      background: barColor,
                      borderRadius: '3px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
                
                {/* Contribution % */}
                <div style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: component.triggered ? barColor : '#64748B',
                  minWidth: '35px',
                  textAlign: 'right',
                }}>
                  {component.triggered ? `${Math.round(component.contribution)}%` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Phase Detection Footer */}
      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: probability.direction === 'bullish'
          ? 'rgba(16,185,129,0.1)'
          : probability.direction === 'bearish'
          ? 'rgba(239,68,68,0.1)'
          : 'rgba(100,116,139,0.1)',
        borderRadius: '10px',
        border: `1px solid ${
          probability.direction === 'bullish'
            ? 'rgba(16,185,129,0.3)'
            : probability.direction === 'bearish'
            ? 'rgba(239,68,68,0.3)'
            : 'rgba(100,116,139,0.3)'
        }`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
      }}>
        <span style={{ fontSize: '16px' }}>
          {probability.direction === 'bullish' ? '🟢' : probability.direction === 'bearish' ? '🔴' : '🟡'}
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: '600',
          color: probability.direction === 'bullish'
            ? '#10B981'
            : probability.direction === 'bearish'
            ? '#EF4444'
            : '#94A3B8',
        }}>
          {probability.direction === 'bullish'
            ? 'BULLISH BIAS — Consider Long Entries'
            : probability.direction === 'bearish'
            ? 'BEARISH BIAS — Consider Short Entries'
            : 'NEUTRAL — Wait for Confirmation'}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFLUENCE MAP VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════

interface ConfluenceMapProps {
  components: ProbabilityResult['components'];
}

export function ConfluenceMap({ components }: ConfluenceMapProps) {
  const triggeredComponents = components.filter(c => c.triggered);
  
  return (
    <div style={{
      background: 'rgba(30,41,59,0.5)',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: '600',
        color: '#94A3B8',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span>🎯</span> SIGNAL CONFLUENCE MAP
      </div>
      
      {/* Visual node map */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '1rem',
      }}>
        {triggeredComponents.map((c, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: c.direction === 'bullish'
                ? 'linear-gradient(135deg, #10B981, #059669)'
                : c.direction === 'bearish'
                ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                : 'linear-gradient(135deg, #64748B, #475569)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${
                c.direction === 'bullish'
                  ? 'rgba(16,185,129,0.4)'
                  : c.direction === 'bearish'
                  ? 'rgba(239,68,68,0.4)'
                  : 'rgba(100,116,139,0.4)'
              }`,
            }}>
              <span style={{ color: 'white', fontSize: '14px' }}>
                {c.direction === 'bullish' ? '●' : c.direction === 'bearish' ? '●' : '○'}
              </span>
            </div>
            <span style={{
              fontSize: '9px',
              color: '#94A3B8',
              textAlign: 'center',
              maxWidth: '60px',
            }}>
              {c.name.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '1.5rem',
        marginTop: '0.5rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontSize: '10px', color: '#94A3B8' }}>Bullish</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#64748B' }} />
          <span style={{ fontSize: '10px', color: '#94A3B8' }}>Neutral</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444' }} />
          <span style={{ fontSize: '10px', color: '#94A3B8' }}>Bearish</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE DETECTION STRIP
// ═══════════════════════════════════════════════════════════════════════════

interface PhaseStripProps {
  currentPhase: 'bearish_trend' | 'bearish_pullback' | 'consolidation' | 'bullish_pullback' | 'bullish_trend';
}

export function PhaseStrip({ currentPhase }: PhaseStripProps) {
  const phases = [
    { key: 'bearish_trend', label: 'Bearish Trend', color: '#EF4444' },
    { key: 'bearish_pullback', label: 'Bear Pullback', color: '#F97316' },
    { key: 'consolidation', label: 'Consolidation', color: '#64748B' },
    { key: 'bullish_pullback', label: 'Bull Pullback', color: '#F59E0B' },
    { key: 'bullish_trend', label: 'Bullish Trend', color: '#10B981' },
  ];
  
  return (
    <div style={{
      background: 'rgba(30,41,59,0.5)',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: '600',
        color: '#94A3B8',
        marginBottom: '0.75rem',
      }}>
        MARKET PHASE
      </div>
      
      <div style={{
        display: 'flex',
        gap: '0.25rem',
      }}>
        {phases.map((phase) => {
          const isActive = phase.key === currentPhase;
          return (
            <div
              key={phase.key}
              style={{
                flex: 1,
                padding: '0.5rem 0.25rem',
                background: isActive ? phase.color : 'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                textAlign: 'center',
                transition: 'all 0.3s ease',
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                boxShadow: isActive ? `0 0 15px ${phase.color}40` : 'none',
              }}
            >
              <div style={{
                fontSize: '16px',
                marginBottom: '2px',
              }}>
                {isActive ? '●' : '○'}
              </div>
              <div style={{
                fontSize: '9px',
                color: isActive ? 'white' : '#64748B',
                fontWeight: isActive ? '600' : '400',
              }}>
                {phase.label.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProModeDashboard;
