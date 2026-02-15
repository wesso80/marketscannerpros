"use client";

import React from 'react';

type FlowPayload = {
  market_mode: 'pin' | 'launch' | 'chop';
  gamma_state: 'Positive' | 'Negative' | 'Mixed';
  bias: 'bullish' | 'bearish' | 'neutral';
  conviction: number;
  dominant_expiry: '0DTE' | 'weekly' | 'monthly' | 'long_dated' | 'unknown';
  pin_strike: number | null;
  key_strikes: Array<{ strike: number; gravity: number; type: 'call-heavy' | 'put-heavy' | 'mixed' }>;
  flip_zones: Array<{ level: number; direction: 'bullish_above' | 'bearish_below' }>;
  liquidity_levels: Array<{ level: number; label: string; prob: number }>;
  most_likely_path: string[];
  risk: string[];
  probability_matrix?: {
    continuation: number;
    pinReversion: number;
    expansion: number;
    regime: 'TRENDING' | 'PINNING' | 'EXPANDING' | 'MIXED';
    deltaExpansion: number;
    acceleration: 'rising' | 'falling' | 'flat';
    decision: 'allow_trend_setups' | 'avoid_breakouts' | 'prep_breakout_strategies';
  };
  flow_state?: {
    state: 'ACCUMULATION' | 'POSITIONING' | 'LAUNCH' | 'EXHAUSTION';
    confidence: number;
    bias: 'bullish' | 'bearish' | 'neutral';
    rationale: string[];
    suggestedPlaybook: string;
    nextLiquidity: { above?: number; below?: number };
    riskMode: 'low' | 'medium' | 'high';
  };
  flow_trade_permission?: {
    tps: number;
    blocked: boolean;
    noTradeMode: {
      active: boolean;
      reason: string;
    };
    riskMode: 'low' | 'medium' | 'high';
    sizeMultiplier: number;
    stopStyle: 'tight_structural' | 'structural' | 'atr_trailing' | 'wider_confirmation';
    allowed: string[];
    blockedTrades: string[];
    selectedArchetype: string;
  };
  institutional_risk_governor?: {
    executionAllowed: boolean;
    hardBlocked: boolean;
    hardBlockReasons: string[];
    irs: number;
    riskMode: 'FULL_OFFENSE' | 'NORMAL' | 'DEFENSIVE' | 'LOCKDOWN';
    capital: {
      usedPercent: number;
      openRiskPercent: number;
      proposedRiskPercent: number;
      dailyRiskPercent: number;
      blocked: boolean;
      reason: string;
    };
    drawdown: {
      dailyR: number;
      action: string;
    };
    correlation: {
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      reason: string;
    };
    volatility: {
      regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    };
    behavior: {
      reason: string;
      cooldownActive: boolean;
      cooldownMinutes: number;
    };
    sizing: {
      baseSize: number;
      flowStateMultiplier: number;
      riskGovernorMultiplier: number;
      personalPerformanceMultiplier: number;
      finalSize: number;
    };
    allowed: string[];
    blocked: string[];
  };
  brain_decision?: {
    score: number;
    regimeFit: number;
    flowAlignment: number;
    setupQuality: number;
    riskPermission: number;
    dataHealth: number;
    mode: 'FULL_OFFENSE' | 'NORMAL' | 'DEFENSIVE' | 'LOCKDOWN';
    permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
    stateSummary: string;
    allowed: string[];
    blocked: string[];
    requiredTrigger: string;
    plan: {
      entryType: 'breakout' | 'pullback' | 'reclaim' | 'sweep' | 'none';
      triggers: string[];
      stopRule: string;
      targets: string[];
      management: string[];
      size: number;
    };
  };
  execution_allowed?: boolean;
};

export default function CapitalFlowCard({
  flow,
  compact = false,
}: {
  flow: FlowPayload | null | undefined;
  compact?: boolean;
}) {
  if (!flow) return null;

  const toNum = (value: unknown, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const likelyPath = Array.isArray(flow.most_likely_path) ? flow.most_likely_path : [];
  const keyStrikes = Array.isArray(flow.key_strikes) ? flow.key_strikes : [];
  const liquidityLevels = Array.isArray(flow.liquidity_levels) ? flow.liquidity_levels : [];
  const flipZones = Array.isArray(flow.flip_zones) ? flow.flip_zones : [];
  const riskLines = Array.isArray(flow.risk) ? flow.risk : [];

  const brainAllowed = Array.isArray(flow.brain_decision?.allowed) ? flow.brain_decision.allowed : [];
  const brainBlocked = Array.isArray(flow.brain_decision?.blocked) ? flow.brain_decision.blocked : [];

  const ftpAllowed = Array.isArray(flow.flow_trade_permission?.allowed) ? flow.flow_trade_permission.allowed : [];
  const ftpBlocked = Array.isArray(flow.flow_trade_permission?.blockedTrades) ? flow.flow_trade_permission.blockedTrades : [];

  const irgAllowed = Array.isArray(flow.institutional_risk_governor?.allowed) ? flow.institutional_risk_governor.allowed : [];
  const irgBlocked = Array.isArray(flow.institutional_risk_governor?.blocked) ? flow.institutional_risk_governor.blocked : [];
  const irgHardBlockReasons = Array.isArray(flow.institutional_risk_governor?.hardBlockReasons)
    ? flow.institutional_risk_governor.hardBlockReasons
    : [];

  const modeColor = flow.market_mode === 'pin' ? '#10B981' : flow.market_mode === 'launch' ? '#F59E0B' : '#94A3B8';
  const biasColor = flow.bias === 'bullish' ? '#10B981' : flow.bias === 'bearish' ? '#EF4444' : '#94A3B8';

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(2,6,23,0.88), rgba(15,23,42,0.8))',
      border: `1px solid ${modeColor}55`,
      borderRadius: '12px',
      padding: compact ? '0.7rem 0.85rem' : '0.9rem 1rem',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: '#93C5FD', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>Capital Flow Engine</div>
        <div style={{ color: modeColor, fontSize: '0.76rem', fontWeight: 800 }}>
          {flow.market_mode.toUpperCase()} • {flow.gamma_state} Gamma • {flow.dominant_expiry}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.45rem', marginBottom: '0.5rem' }}>
        <div style={{ color: '#CBD5E1', fontSize: '0.74rem' }}>
          <span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Flow Bias:</span>{' '}
          <span style={{ color: biasColor, fontWeight: 800 }}>{flow.bias.toUpperCase()}</span>
        </div>
        <div style={{ color: '#CBD5E1', fontSize: '0.74rem' }}>
          <span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Conviction:</span>{' '}
          <span style={{ color: '#E2E8F0', fontWeight: 800 }}>{flow.conviction}</span>
        </div>
        <div style={{ color: '#CBD5E1', fontSize: '0.74rem' }}>
          <span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Pin Strike:</span>{' '}
          <span style={{ color: '#E2E8F0', fontWeight: 800 }}>{flow.pin_strike ?? 'n/a'}</span>
        </div>
      </div>

      {flow.brain_decision && (
        <div style={{
          background: 'rgba(2,6,23,0.64)',
          border: `1px solid ${flow.brain_decision.permission === 'BLOCK' ? 'rgba(239,68,68,0.5)' : flow.brain_decision.permission === 'ALLOW_SMALL' ? 'rgba(245,158,11,0.45)' : 'rgba(16,185,129,0.4)'}`,
          borderRadius: '10px',
          padding: '0.62rem 0.72rem',
          marginBottom: '0.55rem',
          display: 'grid',
          gap: '0.35rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>MSP One Brain Card</div>
            <div style={{ color: '#E2E8F0', fontSize: '0.72rem', fontWeight: 800 }}>
              Brain Score {Math.round(flow.brain_decision.score)}/100 • {flow.brain_decision.permission}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.72rem', color: '#CBD5E1', fontSize: '0.71rem' }}>
            <span><strong>Regime Fit:</strong> {Math.round(flow.brain_decision.regimeFit)}/100</span>
            <span><strong>Flow Align:</strong> {Math.round(flow.brain_decision.flowAlignment)}/100</span>
            <span><strong>Setup Quality:</strong> {Math.round(flow.brain_decision.setupQuality)}/100</span>
            <span><strong>Risk Permission:</strong> {Math.round(flow.brain_decision.riskPermission)}/100</span>
            <span><strong>Data Health:</strong> {Math.round(flow.brain_decision.dataHealth)}/100</span>
          </div>

          <div style={{ color: '#E2E8F0', fontSize: '0.7rem' }}>
            <strong>Mode:</strong> {flow.brain_decision.mode.replace('_', ' ')} • <strong>State:</strong> {flow.brain_decision.stateSummary}
          </div>
          <div style={{ color: '#FCD34D', fontSize: '0.7rem' }}>
            <strong>Required Trigger:</strong> {flow.brain_decision.requiredTrigger}
          </div>
          <div style={{ color: '#A7F3D0', fontSize: '0.7rem' }}>
            <strong>Plan:</strong> {flow.brain_decision.plan.entryType.toUpperCase()} • Size {Math.round(flow.brain_decision.plan.size * 100)}% • {flow.brain_decision.plan.stopRule}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ color: '#A7F3D0', fontSize: '0.7rem' }}>
              <strong>✔ Allowed</strong>
              {brainAllowed.slice(0, 2).map((entry, index) => (
                <div key={`brain-allow-${index}`} style={{ color: '#CBD5E1' }}>• {entry}</div>
              ))}
            </div>
            <div style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
              <strong>✖ Blocked</strong>
              {brainBlocked.slice(0, 2).map((entry, index) => (
                <div key={`brain-block-${index}`} style={{ color: '#CBD5E1' }}>• {entry}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.55rem' }}>
        <div style={{ color: '#A7F3D0', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>Most Likely Path</div>
        {likelyPath.slice(0, 3).map((step, index) => (
          <div key={step + index} style={{ color: '#E2E8F0', fontSize: '0.78rem' }}>
            {index + 1}. {step}
          </div>
        ))}
      </div>

      {flow.probability_matrix && (
        <div style={{
          background: 'rgba(15,23,42,0.55)',
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: '10px',
          padding: '0.55rem 0.65rem',
          marginBottom: '0.55rem',
          display: 'grid',
          gap: '0.35rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>Institutional Probability Matrix</div>
            <div style={{ color: '#E2E8F0', fontSize: '0.68rem', fontWeight: 700 }}>{flow.probability_matrix.regime}</div>
          </div>

          {[
            { label: 'Trend Continuation', value: flow.probability_matrix.continuation, color: '#10B981' },
            { label: 'Pin / Reversion', value: flow.probability_matrix.pinReversion, color: '#F59E0B' },
            { label: 'Vol Expansion', value: flow.probability_matrix.expansion, color: '#EF4444' },
          ].map((row) => (
            <div key={row.label} style={{ display: 'grid', gap: '0.18rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#CBD5E1' }}>
                <span>{row.label}</span>
                <span style={{ fontWeight: 700 }}>{row.value}%</span>
              </div>
              <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(51,65,85,0.6)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, row.value))}%`, height: '100%', background: row.color }} />
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', color: '#94A3B8', fontSize: '0.68rem' }}>
            <span>Expansion Shift: {toNum(flow.probability_matrix.deltaExpansion) > 0 ? '+' : ''}{toNum(flow.probability_matrix.deltaExpansion).toFixed(1)}%</span>
            <span style={{ color: flow.probability_matrix.acceleration === 'rising' ? '#10B981' : flow.probability_matrix.acceleration === 'falling' ? '#EF4444' : '#94A3B8' }}>
              {flow.probability_matrix.acceleration.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {flow.flow_state && (
        <div style={{
          background: 'rgba(15,23,42,0.55)',
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: '10px',
          padding: '0.55rem 0.65rem',
          marginBottom: '0.55rem',
          display: 'grid',
          gap: '0.3rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>Institutional Flow State</div>
            <div style={{ color: '#E2E8F0', fontSize: '0.72rem', fontWeight: 800 }}>
              {flow.flow_state.state} ({Math.round(flow.flow_state.confidence)}%)
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', color: '#CBD5E1', fontSize: '0.72rem' }}>
            <span><strong>Bias:</strong> {flow.flow_state.bias.toUpperCase()}</span>
            <span><strong>Risk:</strong> {flow.flow_state.riskMode.toUpperCase()}</span>
            <span>
              <strong>Next:</strong>{' '}
              {flow.flow_state.nextLiquidity?.above ? `↑ ${toNum(flow.flow_state.nextLiquidity.above).toFixed(2)}` : '↑ n/a'} / {flow.flow_state.nextLiquidity?.below ? `↓ ${toNum(flow.flow_state.nextLiquidity.below).toFixed(2)}` : '↓ n/a'}
            </span>
          </div>
          <div style={{ color: '#A7F3D0', fontSize: '0.72rem' }}>
            <strong>Playbook:</strong> {flow.flow_state.suggestedPlaybook}
          </div>
        </div>
      )}

      {flow.flow_trade_permission && (
        <div style={{
          background: 'rgba(2,6,23,0.55)',
          border: `1px solid ${flow.flow_trade_permission.blocked ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.35)'}`,
          borderRadius: '10px',
          padding: '0.6rem 0.7rem',
          marginBottom: '0.55rem',
          display: 'grid',
          gap: '0.35rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>Flow Trade Permission Matrix</div>
            <div style={{ color: flow.flow_trade_permission.blocked ? '#EF4444' : '#10B981', fontSize: '0.72rem', fontWeight: 800 }}>
              TPS {toNum(flow.flow_trade_permission.tps).toFixed(0)} • {flow.flow_trade_permission.blocked ? 'BLOCKED' : 'PERMITTED'}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', color: '#CBD5E1', fontSize: '0.72rem' }}>
            <span><strong>Risk:</strong> {flow.flow_trade_permission.riskMode.toUpperCase()}</span>
            <span><strong>Size:</strong> {Math.round(toNum(flow.flow_trade_permission.sizeMultiplier) * 100)}%</span>
            <span><strong>Stop:</strong> {flow.flow_trade_permission.stopStyle.replace('_', ' ')}</span>
          </div>

          {flow.flow_trade_permission.noTradeMode?.active && (
            <div style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
              ⚠ {flow.flow_trade_permission.noTradeMode.reason || 'No-trade mode active'}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ color: '#A7F3D0', fontSize: '0.7rem' }}>
              <strong>✔ Allowed</strong>
              {ftpAllowed.slice(0, 3).map((entry, index) => (
                <div key={`allow-${index}`} style={{ color: '#CBD5E1' }}>• {entry}</div>
              ))}
            </div>
            <div style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
              <strong>✖ Blocked</strong>
              {ftpBlocked.slice(0, 3).map((entry, index) => (
                <div key={`block-${index}`} style={{ color: '#CBD5E1' }}>• {entry}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {flow.institutional_risk_governor && (
        <div style={{
          background: 'rgba(2,6,23,0.62)',
          border: `1px solid ${flow.institutional_risk_governor.executionAllowed ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.5)'}`,
          borderRadius: '10px',
          padding: '0.62rem 0.72rem',
          marginBottom: '0.55rem',
          display: 'grid',
          gap: '0.38rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>Institutional Risk Governor</div>
            <div style={{ color: flow.institutional_risk_governor.executionAllowed ? '#10B981' : '#EF4444', fontSize: '0.72rem', fontWeight: 800 }}>
              {flow.institutional_risk_governor.executionAllowed ? 'EXECUTION ALLOWED' : 'EXECUTION BLOCKED'}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', color: '#CBD5E1', fontSize: '0.72rem' }}>
            <span><strong>Risk Mode:</strong> {flow.institutional_risk_governor.riskMode.replace('_', ' ')}</span>
            <span><strong>IRS:</strong> {toNum(flow.institutional_risk_governor.irs).toFixed(2)}</span>
            <span><strong>Capital:</strong> {Math.round(toNum(flow.institutional_risk_governor.capital?.usedPercent) * 100)}% used</span>
            <span><strong>Correlation:</strong> {flow.institutional_risk_governor.correlation?.severity || 'N/A'}</span>
            <span><strong>Drawdown:</strong> {toNum(flow.institutional_risk_governor.drawdown?.dailyR).toFixed(1)}R</span>
          </div>

          <div style={{ color: '#E2E8F0', fontSize: '0.7rem' }}>
            <strong>Volatility:</strong> {flow.institutional_risk_governor.volatility?.regime || 'N/A'} • <strong>Behavior:</strong> {flow.institutional_risk_governor.behavior?.reason || 'N/A'}
          </div>

          {!flow.institutional_risk_governor.executionAllowed && (
            <div style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
              ⚠ {irgHardBlockReasons[0] || 'Risk governor lockout active'}
            </div>
          )}

          <div style={{ color: '#A7F3D0', fontSize: '0.7rem' }}>
            <strong>Size Formula:</strong>{' '}
            {toNum(flow.institutional_risk_governor.sizing?.baseSize).toFixed(2)} × {toNum(flow.institutional_risk_governor.sizing?.flowStateMultiplier).toFixed(2)} × {toNum(flow.institutional_risk_governor.sizing?.riskGovernorMultiplier).toFixed(2)} × {toNum(flow.institutional_risk_governor.sizing?.personalPerformanceMultiplier).toFixed(2)} = {toNum(flow.institutional_risk_governor.sizing?.finalSize).toFixed(2)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ color: '#A7F3D0', fontSize: '0.7rem' }}>
              <strong>✔ Allowed</strong>
              {irgAllowed.slice(0, 3).map((entry, index) => (
                <div key={`irg-allow-${index}`} style={{ color: '#CBD5E1' }}>• {entry}</div>
              ))}
            </div>
            <div style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
              <strong>✖ Blocked</strong>
              {irgBlocked.slice(0, 3).map((entry, index) => (
                <div key={`irg-block-${index}`} style={{ color: '#CBD5E1' }}>• {entry}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.45rem',
      }}>
        <div style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>
          <div style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Key Strikes</div>
          {keyStrikes.slice(0, 3).map((strike, index) => (
            <div key={strike.strike + index}>• {strike.strike} ({strike.type}, g={toNum(strike.gravity).toFixed(2)})</div>
          ))}
        </div>

        <div style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>
          <div style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Liquidity Magnets</div>
          {liquidityLevels.slice(0, 3).map((level, index) => (
            <div key={level.label + index}>• {level.label} {toNum(level.level).toFixed(2)} ({Math.round(toNum(level.prob) * 100)}%)</div>
          ))}
        </div>

        <div style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>
          <div style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Risk / Flip</div>
          {flipZones.slice(0, 2).map((zone, index) => (
            <div key={zone.level + index}>• {zone.direction === 'bullish_above' ? 'Bullish above' : 'Bearish below'} {toNum(zone.level).toFixed(2)}</div>
          ))}
          {riskLines.slice(0, 1).map((line, index) => (
            <div key={index}>• {line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
