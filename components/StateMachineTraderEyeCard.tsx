"use client";

import { useEffect, useMemo, useState } from 'react';

type StateMachineResponse = {
  success: boolean;
  data?: {
    symbol: string;
    state_machine?: {
      state: 'SCAN' | 'WATCH' | 'STALK' | 'ARMED' | 'EXECUTE' | 'MANAGE' | 'COOLDOWN' | 'BLOCKED';
      next_best_action?: {
        action: 'WAIT' | 'SET_ALERT' | 'PREP_ORDER' | 'EXECUTE' | 'MANAGE' | 'STANDBY' | 'REVIEW';
        when: string;
        notes: string;
      };
      block_reasons?: string[];
      gates?: {
        trigger?: {
          pass: boolean;
          definition: string;
          current: string;
          eta: string;
        };
        setup_quality?: {
          pass: boolean;
          missing: string[];
          invalidate_level: number | null;
        };
        risk_governor?: {
          pass: boolean;
          permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
          size_multiplier: number;
        };
      };
      audit?: {
        transition_reason: string;
      };
    };
  };
  error?: string;
};

export default function StateMachineTraderEyeCard({
  symbol,
  playbook,
  direction,
  compact = true,
}: {
  symbol?: string;
  playbook?: string;
  direction?: 'long' | 'short';
  compact?: boolean;
}) {
  const [payload, setPayload] = useState<StateMachineResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clean = (symbol || '').trim().toUpperCase();
    if (!clean) {
      setPayload(null);
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          symbol: clean,
          includeHistory: 'false',
        });
        if (playbook) params.set('playbook', playbook);
        if (direction) params.set('direction', direction);

        const response = await fetch(`/api/state-machine?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!active) return;
        if (!response.ok) {
          setPayload(null);
          return;
        }

        const data = (await response.json()) as StateMachineResponse;
        if (active && data.success) {
          setPayload(data.data ?? null);
        }
      } catch {
        if (active) setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    const interval = setInterval(run, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [symbol, playbook, direction]);

  const stateMachine = payload?.state_machine;

  const stateColor = useMemo(() => {
    if (!stateMachine) return '#94A3B8';
    if (stateMachine.state === 'BLOCKED') return '#EF4444';
    if (stateMachine.state === 'EXECUTE' || stateMachine.state === 'ARMED') return '#10B981';
    if (stateMachine.state === 'STALK' || stateMachine.state === 'WATCH') return '#F59E0B';
    return '#94A3B8';
  }, [stateMachine]);

  if (!symbol) return null;

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
      border: `1px solid ${stateColor}55`,
      borderRadius: '12px',
      padding: compact ? '0.65rem 0.8rem' : '0.9rem 1rem',
      marginBottom: '1rem',
      display: 'grid',
      gap: '0.32rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: '#93C5FD', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800 }}>
          Trader Eye State
        </div>
        <div style={{ color: stateColor, fontSize: '0.72rem', fontWeight: 800 }}>
          {stateMachine?.state ?? (loading ? 'LOADING' : 'NO STATE')}
        </div>
      </div>

      <div style={{ color: '#E2E8F0', fontSize: '0.72rem' }}>
        <strong>WHY:</strong> {stateMachine?.audit?.transition_reason || 'No transition snapshot yet'}
      </div>

      <div style={{ color: '#CBD5E1', fontSize: '0.7rem' }}>
        <strong>WAITING FOR:</strong>{' '}
        {stateMachine?.gates?.trigger?.pass
          ? 'Trigger confirmed'
          : stateMachine?.gates?.trigger?.definition || 'Trigger definition unavailable'}
      </div>

      <div style={{ color: '#A7F3D0', fontSize: '0.7rem' }}>
        <strong>PERMISSION:</strong>{' '}
        {stateMachine?.gates?.risk_governor?.permission || 'N/A'} ({Math.round((stateMachine?.gates?.risk_governor?.size_multiplier ?? 0) * 100)}x)
      </div>

      {stateMachine?.gates?.setup_quality?.invalidate_level !== null && stateMachine?.gates?.setup_quality?.invalidate_level !== undefined && (
        <div style={{ color: '#CBD5E1', fontSize: '0.7rem' }}>
          <strong>INVALIDATE:</strong> {stateMachine.gates.setup_quality.invalidate_level.toFixed(2)}
        </div>
      )}

      {!!stateMachine?.block_reasons?.length && (
        <div style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>
          <strong>BLOCKED:</strong> {stateMachine.block_reasons[0]}
        </div>
      )}
    </div>
  );
}
