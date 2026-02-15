'use client';

import { useEffect, useMemo, useState } from 'react';

type PageSkill = string;

interface AdaptiveProfile {
  sampleSize: number;
  wins: number;
  styleBias: 'momentum' | 'mean_reversion' | 'breakout' | 'options_flow' | 'macro_swing';
  riskDNA: 'aggressive' | 'balanced' | 'defensive';
  decisionTiming: 'early' | 'confirmation' | 'late_momentum';
}

interface AdaptiveMatch {
  personalityMatch: number;
  adaptiveScore: number;
  noTradeBias: boolean;
  reasons: string[];
}

interface AdaptiveResponse {
  success: boolean;
  status: 'ready' | 'warming_up';
  profile: AdaptiveProfile | null;
  match: AdaptiveMatch;
}

function labelStyle(styleBias?: AdaptiveProfile['styleBias']) {
  if (!styleBias) return 'Warming up';
  if (styleBias === 'mean_reversion') return 'Mean Reversion';
  if (styleBias === 'options_flow') return 'Options Flow';
  if (styleBias === 'macro_swing') return 'Macro Swing';
  if (styleBias === 'breakout') return 'Breakout';
  return 'Momentum';
}

export default function AdaptiveTraderPersonalityBar({ skill }: { skill: PageSkill }) {
  const [data, setData] = useState<AdaptiveResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/adaptive/profile?skill=${encodeURIComponent(skill)}&baseScore=50`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as AdaptiveResponse;
        if (!mounted) return;
        setData(payload);
      } catch {
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [skill]);

  const toneColor = useMemo(() => {
    const score = data?.match?.adaptiveScore ?? 50;
    if (score >= 70) return '#10B981';
    if (score >= 50) return '#F59E0B';
    return '#EF4444';
  }, [data?.match?.adaptiveScore]);

  if (!data) return null;

  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto 0.8rem auto',
      background: 'linear-gradient(135deg, rgba(2,132,199,0.14), rgba(16,185,129,0.1))',
      border: '1px solid rgba(56,189,248,0.35)',
      borderRadius: '12px',
      padding: '0.55rem 0.75rem',
      display: 'grid',
      gap: '0.4rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: '#67E8F9', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>
          MSP Adaptive Trader Personality Layer
        </div>
        <div style={{ color: data.match.noTradeBias ? '#EF4444' : toneColor, fontSize: '0.74rem', fontWeight: 800 }}>
          {data.match.noTradeBias ? 'NO-TRADE MODE BIAS ACTIVE' : `${data.match.adaptiveScore}% ADAPTIVE CONFIDENCE`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.74rem', color: '#CBD5E1' }}>
        <span><strong style={{ color: '#94A3B8' }}>Style:</strong> {labelStyle(data.profile?.styleBias)}</span>
        <span><strong style={{ color: '#94A3B8' }}>Risk DNA:</strong> {data.profile?.riskDNA || 'warming_up'}</span>
        <span><strong style={{ color: '#94A3B8' }}>Timing:</strong> {data.profile?.decisionTiming?.replace('_', ' ') || 'warming_up'}</span>
        <span><strong style={{ color: '#94A3B8' }}>Fit:</strong> {data.match.personalityMatch}%</span>
        <span><strong style={{ color: '#94A3B8' }}>Sample:</strong> {data.profile ? `${data.profile.sampleSize} closed / ${data.profile.wins} wins` : 'Need 6+ closed trades'}</span>
      </div>
    </div>
  );
}
