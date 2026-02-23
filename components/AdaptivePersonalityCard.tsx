'use client';

import { useEffect, useMemo, useState } from 'react';

type Direction = 'bullish' | 'bearish' | 'neutral';
type Urgency = 'immediate' | 'within_hour' | 'wait' | 'no_trade';
type Regime = 'trend' | 'range' | 'reversal' | 'unknown';

interface AdaptivePayload {
  success: boolean;
  status: 'ready' | 'warming_up';
  profile: {
    sampleSize: number;
    wins: number;
    styleBias: string;
    riskDNA: string;
    decisionTiming: string;
  } | null;
  match: {
    personalityMatch: number;
    adaptiveScore: number;
    noTradeBias: boolean;
    reasons: string[];
  };
  institutionalFilter?: {
    finalScore: number;
    finalGrade: string;
    recommendation: 'TRADE_READY' | 'CAUTION' | 'NO_TRADE';
    noTrade: boolean;
    filters: Array<{
      label: string;
      status: 'pass' | 'warn' | 'block';
      reason: string;
    }>;
  };
}

interface AdaptivePersonalityCardProps {
  skill: string;
  setupText?: string;
  direction?: Direction;
  timeframe?: string;
  riskPercent?: number;
  urgency?: Urgency;
  hasOptionsFlow?: boolean;
  regime?: Regime;
  baseScore?: number;
  compact?: boolean;
}

export default function AdaptivePersonalityCard(props: AdaptivePersonalityCardProps) {
  const [data, setData] = useState<AdaptivePayload | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set('skill', props.skill);
        if (props.setupText) params.set('setup', props.setupText);
        if (props.direction) params.set('direction', props.direction);
        if (props.timeframe) params.set('timeframe', props.timeframe);
        if (typeof props.riskPercent === 'number') params.set('riskPercent', String(props.riskPercent));
        if (props.urgency) params.set('urgency', props.urgency);
        if (typeof props.hasOptionsFlow === 'boolean') params.set('hasOptionsFlow', String(props.hasOptionsFlow));
        if (props.regime) params.set('regime', props.regime);
        params.set('baseScore', String(props.baseScore ?? 50));

        const response = await fetch(`/api/adaptive/profile?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as AdaptivePayload;
        if (!mounted) return;
        setData(payload);
      } catch {
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [props.baseScore, props.direction, props.hasOptionsFlow, props.regime, props.riskPercent, props.setupText, props.skill, props.timeframe, props.urgency]);

  const tone = useMemo(() => {
    const score = data?.match?.adaptiveScore ?? 50;
    if (score >= 70) return '#10B981';
    if (score >= 50) return '#F59E0B';
    return '#EF4444';
  }, [data?.match?.adaptiveScore]);

  if (!data) return null;

  return (
    <div className="msp-card" style={{
      padding: props.compact ? '0.55rem 0.7rem' : '0.8rem 0.95rem',
      marginBottom: props.compact ? '0.65rem' : '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--msp-text-faint)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>
          MSP AI Personality Match
        </div>
        <div style={{ color: data.match.noTradeBias ? '#EF4444' : tone, fontWeight: 800, fontSize: '0.75rem' }}>
          {data.match.noTradeBias ? 'NO-TRADE BIAS ACTIVE' : `${data.match.adaptiveScore}% ADAPTIVE CONFIDENCE`}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '0.35rem',
        marginTop: '0.4rem',
        color: '#CBD5E1',
        fontSize: '0.76rem',
      }}>
        <div><span style={{ color: '#94A3B8' }}>Setup Fit:</span> <strong>{data.match.personalityMatch}%</strong></div>
        <div><span style={{ color: '#94A3B8' }}>Style:</span> <strong>{data.profile?.styleBias || 'warming_up'}</strong></div>
        <div><span style={{ color: '#94A3B8' }}>Risk DNA:</span> <strong>{data.profile?.riskDNA || 'warming_up'}</strong></div>
        <div><span style={{ color: '#94A3B8' }}>Timing:</span> <strong>{data.profile?.decisionTiming?.replace('_', ' ') || 'warming_up'}</strong></div>
      </div>

      {data.institutionalFilter && (
        <div className="msp-panel" style={{ marginTop: '0.45rem', padding: '0.5rem 0.55rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.45rem',
            flexWrap: 'wrap',
            marginBottom: '0.3rem',
          }}>
            <span style={{ color: 'var(--msp-text-faint)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800 }}>
              Institutional Filter Engine
            </span>
            <span style={{
              color: data.institutionalFilter.noTrade ? '#EF4444' : '#10B981',
              fontSize: '0.75rem',
              fontWeight: 800,
            }}>
              {data.institutionalFilter.finalGrade} • {(data.institutionalFilter.finalScore ?? 0).toFixed(0)} • {(data.institutionalFilter.recommendation ?? 'UNKNOWN').replace('_', ' ')}
            </span>
          </div>

          <div style={{ display: 'grid', gap: '0.2rem' }}>
            {data.institutionalFilter.filters.slice(0, 4).map((filter, index) => (
              <div key={index} style={{ color: '#CBD5E1', fontSize: '0.73rem' }}>
                {filter.status === 'pass' ? '✔' : filter.status === 'warn' ? '⚠' : '✖'} {filter.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {!props.compact && (
        <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.2rem' }}>
          {(data.match.reasons || []).slice(0, 2).map((reason, index) => (
            <div key={index} style={{ color: '#E2E8F0', fontSize: '0.76rem' }}>✔ {reason}</div>
          ))}
          <div style={{ color: '#94A3B8', fontSize: '0.72rem' }}>
            {data.profile ? `Profile: ${data.profile.sampleSize} closed trades (${data.profile.wins} wins)` : 'Profile warming up: close at least 6 trades in Journal'}
          </div>
        </div>
      )}
    </div>
  );
}
