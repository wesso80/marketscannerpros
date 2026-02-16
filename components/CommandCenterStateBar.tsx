'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_OPERATOR_STATE,
  OPERATOR_STATE_KEY,
  readOperatorState,
  type OperatorFlowMode,
  type OperatorState,
} from '@/lib/operatorState';

type Regime = 'Trend' | 'Range' | 'Volatility Expansion' | 'Compression';

function deriveRegime(state: OperatorState): Regime {
  if (state.risk === 'HIGH') return 'Volatility Expansion';
  if (state.risk === 'LOW' && state.action === 'WAIT') return 'Compression';
  if (state.bias === 'NEUTRAL') return 'Range';
  return 'Trend';
}

function toneForBias(value: OperatorState['bias']) {
  if (value === 'BULLISH') return '#10b981';
  if (value === 'BEARISH') return '#ef4444';
  return '#fbbf24';
}

function toneForRisk(value: OperatorState['risk']) {
  if (value === 'LOW') return '#10b981';
  if (value === 'HIGH') return '#ef4444';
  return '#fbbf24';
}

function toneForAction(value: OperatorState['action']) {
  if (value === 'EXECUTE') return '#10b981';
  if (value === 'PREP') return '#fbbf24';
  return '#94a3b8';
}

interface CommandCenterStateBarProps {
  mode: OperatorFlowMode;
  actionableNow: string;
  nextStep?: string;
}

export default function CommandCenterStateBar({ mode, actionableNow, nextStep }: CommandCenterStateBarProps) {
  const [state, setState] = useState<OperatorState>(DEFAULT_OPERATOR_STATE);

  useEffect(() => {
    const sync = () => {
      const current = readOperatorState();
      setState({ ...current, mode });
    };

    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === OPERATOR_STATE_KEY) sync();
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mode]);

  const regime = useMemo(() => deriveRegime(state), [state]);

  return (
    <div style={{
      background: 'var(--msp-card)',
      border: '1px solid var(--msp-border-strong)',
      borderRadius: '14px',
      padding: '14px 16px',
      marginBottom: '16px',
      boxShadow: 'var(--msp-shadow)'
    }}>
      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        Command Center State
      </div>

      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
          <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Regime</div>
          <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 700 }}>{regime}</div>
        </div>

        <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
          <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Risk</div>
          <div style={{ color: toneForRisk(state.risk), fontSize: '14px', fontWeight: 700 }}>{state.risk}</div>
        </div>

        <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
          <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Market Bias</div>
          <div style={{ color: toneForBias(state.bias), fontSize: '14px', fontWeight: 700 }}>{state.bias}</div>
        </div>

        <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '10px', padding: '10px 12px' }}>
          <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Operator Mode</div>
          <div style={{ color: toneForAction(state.action), fontSize: '14px', fontWeight: 700 }}>{mode}</div>
        </div>
      </div>

      <div style={{
        marginTop: '10px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(16,185,129,0.3)',
        background: 'rgba(16,185,129,0.08)',
        display: 'grid',
        gap: '6px'
      }}>
        <div style={{ color: '#34d399', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Actionable Now
        </div>
        <div style={{ color: '#d1fae5', fontSize: '13px' }}>{actionableNow}</div>
        <div style={{ color: '#94a3b8', fontSize: '12px' }}>
          Next: {nextStep || state.next}
        </div>
      </div>
    </div>
  );
}
