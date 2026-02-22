'use client';

import React, { useEffect, useState } from 'react';

type SessionPhase =
  | 'PRE_MARKET' | 'OPENING_RANGE' | 'MORNING_MOMENTUM'
  | 'LATE_MORNING' | 'MIDDAY' | 'POWER_HOUR' | 'CLOSE_AUCTION'
  | 'AFTER_HOURS'
  | 'ASIAN' | 'EUROPEAN' | 'US' | 'OVERNIGHT';

interface SessionPhaseInfo {
  phase: SessionPhase;
  label: string;
  color: string;
  breakoutMultiplier: number;
  meanRevMultiplier: number;
  favorable: string[];
  unfavorable: string[];
}

const EQUITY_PHASES: Record<string, SessionPhaseInfo> = {
  PRE_MARKET: { phase: 'PRE_MARKET', label: 'Pre-Market', color: 'slate', breakoutMultiplier: 0.6, meanRevMultiplier: 0.5, favorable: [], unfavorable: ['Breakout', 'Trend'] },
  OPENING_RANGE: { phase: 'OPENING_RANGE', label: 'Opening Range', color: 'amber', breakoutMultiplier: 1.15, meanRevMultiplier: 0.5, favorable: ['Breakout'], unfavorable: ['Mean Reversion'] },
  MORNING_MOMENTUM: { phase: 'MORNING_MOMENTUM', label: 'Morning Momentum', color: 'emerald', breakoutMultiplier: 1.1, meanRevMultiplier: 0.7, favorable: ['Breakout', 'Trend Pullback'], unfavorable: [] },
  LATE_MORNING: { phase: 'LATE_MORNING', label: 'Late Morning', color: 'sky', breakoutMultiplier: 0.95, meanRevMultiplier: 0.85, favorable: ['Trend Pullback'], unfavorable: [] },
  MIDDAY: { phase: 'MIDDAY', label: 'Midday Chop', color: 'amber', breakoutMultiplier: 0.7, meanRevMultiplier: 1.1, favorable: ['Mean Reversion', 'Range Fade'], unfavorable: ['Breakout'] },
  POWER_HOUR: { phase: 'POWER_HOUR', label: 'Power Hour', color: 'emerald', breakoutMultiplier: 1.05, meanRevMultiplier: 0.8, favorable: ['Breakout', 'Momentum'], unfavorable: [] },
  CLOSE_AUCTION: { phase: 'CLOSE_AUCTION', label: 'Close Auction', color: 'red', breakoutMultiplier: 0.6, meanRevMultiplier: 0.5, favorable: [], unfavorable: ['All new entries'] },
  AFTER_HOURS: { phase: 'AFTER_HOURS', label: 'After Hours', color: 'slate', breakoutMultiplier: 0.5, meanRevMultiplier: 0.5, favorable: [], unfavorable: ['All strategies'] },
};

const CRYPTO_PHASES: Record<string, SessionPhaseInfo> = {
  ASIAN: { phase: 'ASIAN', label: 'Asian Session', color: 'purple', breakoutMultiplier: 0.85, meanRevMultiplier: 1.0, favorable: ['Range Fade'], unfavorable: [] },
  EUROPEAN: { phase: 'EUROPEAN', label: 'European Session', color: 'sky', breakoutMultiplier: 1.05, meanRevMultiplier: 0.85, favorable: ['Breakout', 'Trend'], unfavorable: [] },
  US: { phase: 'US', label: 'US Session', color: 'emerald', breakoutMultiplier: 1.15, meanRevMultiplier: 0.7, favorable: ['Breakout', 'Momentum'], unfavorable: ['Mean Reversion'] },
  OVERNIGHT: { phase: 'OVERNIGHT', label: 'Overnight', color: 'slate', breakoutMultiplier: 0.7, meanRevMultiplier: 1.0, favorable: ['Range Fade'], unfavorable: ['Breakout'] },
};

function detectCurrentPhase(assetClass: 'equity' | 'crypto'): SessionPhaseInfo {
  const now = new Date();
  const etHour = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const etMinute = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }));
  const etTime = etHour * 60 + etMinute;

  if (assetClass === 'equity') {
    if (etTime < 570) return EQUITY_PHASES.PRE_MARKET;      // Before 9:30
    if (etTime < 600) return EQUITY_PHASES.OPENING_RANGE;    // 9:30–10:00
    if (etTime < 690) return EQUITY_PHASES.MORNING_MOMENTUM; // 10:00–11:30
    if (etTime < 720) return EQUITY_PHASES.LATE_MORNING;     // 11:30–12:00
    if (etTime < 840) return EQUITY_PHASES.MIDDAY;           // 12:00–14:00
    if (etTime < 950) return EQUITY_PHASES.POWER_HOUR;       // 14:00–15:50
    if (etTime < 960) return EQUITY_PHASES.CLOSE_AUCTION;    // 15:50–16:00
    return EQUITY_PHASES.AFTER_HOURS;                         // After 16:00
  }

  // Crypto — 24/7 based on UTC
  const utcHour = now.getUTCHours();
  if (utcHour >= 0 && utcHour < 8) return CRYPTO_PHASES.ASIAN;
  if (utcHour >= 8 && utcHour < 14) return CRYPTO_PHASES.EUROPEAN;
  if (utcHour >= 14 && utcHour < 21) return CRYPTO_PHASES.US;
  return CRYPTO_PHASES.OVERNIGHT;
}

export default function SessionPhaseStrip({ assetClass = 'equity' }: { assetClass?: 'equity' | 'crypto' }) {
  const [phase, setPhase] = useState<SessionPhaseInfo>(() => detectCurrentPhase(assetClass));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhase(detectCurrentPhase(assetClass));
    }, 30_000); // Update every 30 seconds
    return () => window.clearInterval(interval);
  }, [assetClass]);

  useEffect(() => {
    setPhase(detectCurrentPhase(assetClass));
  }, [assetClass]);

  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    red: 'border-red-500/30 bg-red-500/10 text-red-400',
    slate: 'border-slate-600/30 bg-slate-600/10 text-slate-400',
    sky: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${colorMap[phase.color] ?? colorMap.slate}`}>
      <span className="font-extrabold uppercase tracking-wider">{phase.label}</span>
      <span className="text-[10px] opacity-70">|</span>
      <span className="text-[10px]">
        Breakout ×{phase.breakoutMultiplier.toFixed(2)} • MeanRev ×{phase.meanRevMultiplier.toFixed(2)}
      </span>
      {phase.favorable.length > 0 && (
        <>
          <span className="text-[10px] opacity-70">|</span>
          <span className="text-[10px]">
            ✅ {phase.favorable.join(', ')}
          </span>
        </>
      )}
      {phase.unfavorable.length > 0 && (
        <>
          <span className="text-[10px] opacity-70">|</span>
          <span className="text-[10px]">
            ⛔ {phase.unfavorable.join(', ')}
          </span>
        </>
      )}
    </div>
  );
}
