'use client';
/**
 * Unified Global Sessions Engine
 * ─────────────────────────────
 * Single source of truth for client-side trading-session detection.
 *
 * Covers US equity phases (Pre-Market → After Hours) and crypto 24/7 phases
 * (Asian → European → US → Overnight).  Uses Intl.DateTimeFormat for correct
 * DST-aware Eastern Time handling.
 *
 * Usage:
 *   import { useSessionPhase }           from '@/lib/useSessionPhase';   // React hook
 *   import { detectSession }             from '@/lib/useSessionPhase';   // one-shot
 *   import { EQUITY_PHASES, CRYPTO_PHASES } from '@/lib/useSessionPhase'; // tables
 */

import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export type EquityPhase =
  | 'PRE_MARKET' | 'OPENING_RANGE' | 'MORNING_MOMENTUM'
  | 'LATE_MORNING' | 'MIDDAY' | 'POWER_HOUR' | 'CLOSE_AUCTION'
  | 'AFTER_HOURS';

export type CryptoPhase = 'ASIAN' | 'EUROPEAN' | 'US' | 'OVERNIGHT';

export type MarketStatus = 'open' | 'pre_market' | 'after_hours' | 'closed';

export interface PhaseInfo {
  id: string;
  label: string;
  color: string;            // Tailwind colour name: emerald | amber | red | slate | sky | purple
  breakoutMult: number;
  meanRevMult: number;
  favorable: string[];
  unfavorable: string[];
}

export interface SessionSnapshot {
  equity: PhaseInfo;
  crypto: PhaseInfo;
  marketStatus: MarketStatus;
  etTimeStr: string;        // e.g. "2:35 PM"
  utcTimeStr: string;       // e.g. "19:35"
  isWeekend: boolean;
}

/* ═══════════════════════════════════════════════════════
   Phase Tables
   ═══════════════════════════════════════════════════════ */

export const EQUITY_PHASES: Record<EquityPhase, PhaseInfo> = {
  PRE_MARKET:       { id: 'PRE_MARKET',       label: 'Pre-Market',       color: 'slate',   breakoutMult: 0.60, meanRevMult: 0.50, favorable: [],                                unfavorable: ['Breakout', 'Trend'] },
  OPENING_RANGE:    { id: 'OPENING_RANGE',    label: 'Opening Range',    color: 'amber',   breakoutMult: 1.15, meanRevMult: 0.50, favorable: ['Breakout'],                      unfavorable: ['Mean Reversion'] },
  MORNING_MOMENTUM: { id: 'MORNING_MOMENTUM', label: 'Morning Momentum', color: 'emerald', breakoutMult: 1.10, meanRevMult: 0.70, favorable: ['Breakout', 'Trend Pullback'],    unfavorable: [] },
  LATE_MORNING:     { id: 'LATE_MORNING',     label: 'Late Morning',     color: 'sky',     breakoutMult: 0.95, meanRevMult: 0.85, favorable: ['Trend Pullback'],                 unfavorable: [] },
  MIDDAY:           { id: 'MIDDAY',           label: 'Midday Chop',      color: 'amber',   breakoutMult: 0.70, meanRevMult: 1.10, favorable: ['Mean Reversion', 'Range Fade'],   unfavorable: ['Breakout'] },
  POWER_HOUR:       { id: 'POWER_HOUR',       label: 'Power Hour',       color: 'emerald', breakoutMult: 1.05, meanRevMult: 0.80, favorable: ['Breakout', 'Momentum'],           unfavorable: [] },
  CLOSE_AUCTION:    { id: 'CLOSE_AUCTION',    label: 'Close Auction',    color: 'red',     breakoutMult: 0.60, meanRevMult: 0.50, favorable: [],                                unfavorable: ['All new entries'] },
  AFTER_HOURS:      { id: 'AFTER_HOURS',      label: 'After Hours',      color: 'slate',   breakoutMult: 0.50, meanRevMult: 0.50, favorable: [],                                unfavorable: ['All strategies'] },
};

export const CRYPTO_PHASES: Record<CryptoPhase, PhaseInfo> = {
  ASIAN:     { id: 'ASIAN',     label: 'Asian Session',    color: 'purple',  breakoutMult: 0.85, meanRevMult: 1.00, favorable: ['Range Fade'],              unfavorable: [] },
  EUROPEAN:  { id: 'EUROPEAN',  label: 'European Session', color: 'sky',     breakoutMult: 1.05, meanRevMult: 0.85, favorable: ['Breakout', 'Trend'],       unfavorable: [] },
  US:        { id: 'US',        label: 'US Session',       color: 'emerald', breakoutMult: 1.15, meanRevMult: 0.70, favorable: ['Breakout', 'Momentum'],    unfavorable: ['Mean Reversion'] },
  OVERNIGHT: { id: 'OVERNIGHT', label: 'Overnight',        color: 'slate',   breakoutMult: 0.70, meanRevMult: 1.00, favorable: ['Range Fade'],              unfavorable: ['Breakout'] },
};

/* ═══════════════════════════════════════════════════════
   Internal Helpers
   ═══════════════════════════════════════════════════════ */

const ET_FMT = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false })
  : null;

const ET_DISPLAY_FMT = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
  : null;

interface ETComponents { hour: number; minute: number; dayOfWeek: number }

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getETComponents(now: Date): ETComponents {
  if (ET_FMT) {
    const parts = ET_FMT.formatToParts(now);
    let hour = 0, minute = 0, weekday = '';
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
      if (p.type === 'weekday') weekday = p.value;
    }
    if (hour === 24) hour = 0; // midnight edge-case in some engines
    return { hour, minute, dayOfWeek: DAY_MAP[weekday] ?? now.getDay() };
  }
  // Fallback: UTC-5 (ignores DST)
  const utcH = now.getUTCHours();
  return { hour: (utcH - 5 + 24) % 24, minute: now.getUTCMinutes(), dayOfWeek: now.getDay() };
}

function formatET(now: Date): string {
  if (ET_DISPLAY_FMT) return ET_DISPLAY_FMT.format(now);
  const { hour, minute } = getETComponents(now);
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function formatUTC(now: Date): string {
  return `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════════════════
   Detection Functions
   ═══════════════════════════════════════════════════════ */

export function detectEquityPhase(now?: Date): PhaseInfo {
  const d = now ?? new Date();
  const { hour, minute } = getETComponents(d);
  const t = hour * 60 + minute;

  if (t < 570)  return EQUITY_PHASES.PRE_MARKET;       // before 9:30
  if (t < 600)  return EQUITY_PHASES.OPENING_RANGE;     // 9:30 – 10:00
  if (t < 690)  return EQUITY_PHASES.MORNING_MOMENTUM;  // 10:00 – 11:30
  if (t < 720)  return EQUITY_PHASES.LATE_MORNING;      // 11:30 – 12:00
  if (t < 840)  return EQUITY_PHASES.MIDDAY;            // 12:00 – 14:00
  if (t < 950)  return EQUITY_PHASES.POWER_HOUR;        // 14:00 – 15:50
  if (t < 960)  return EQUITY_PHASES.CLOSE_AUCTION;     // 15:50 – 16:00
  return EQUITY_PHASES.AFTER_HOURS;                      // after 16:00
}

export function detectCryptoPhase(now?: Date): PhaseInfo {
  const utcH = (now ?? new Date()).getUTCHours();
  if (utcH < 8)  return CRYPTO_PHASES.ASIAN;
  if (utcH < 14) return CRYPTO_PHASES.EUROPEAN;
  if (utcH < 21) return CRYPTO_PHASES.US;
  return CRYPTO_PHASES.OVERNIGHT;
}

export function getMarketStatus(now?: Date): MarketStatus {
  const d = now ?? new Date();
  const { hour, minute, dayOfWeek } = getETComponents(d);
  const t = hour * 60 + minute;

  if (dayOfWeek === 0 || dayOfWeek === 6) return 'closed';
  if (t >= 570 && t < 960) return 'open';         // 9:30 – 16:00
  if (t < 570) return 'pre_market';
  return 'after_hours';
}

/**
 * One-shot full session snapshot (no React dependency).
 */
export function detectSession(now?: Date): SessionSnapshot {
  const d = now ?? new Date();
  const { dayOfWeek } = getETComponents(d);
  return {
    equity: detectEquityPhase(d),
    crypto: detectCryptoPhase(d),
    marketStatus: getMarketStatus(d),
    etTimeStr: formatET(d),
    utcTimeStr: formatUTC(d),
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
  };
}

/* ═══════════════════════════════════════════════════════
   React Hook
   ═══════════════════════════════════════════════════════ */

/**
 * Live-updating session state for React components.
 * Default update interval: 15 s (tight enough for a clock display).
 */
export function useSessionPhase(intervalMs = 15_000): SessionSnapshot {
  const [state, setState] = useState<SessionSnapshot>(() => detectSession());

  useEffect(() => {
    // Re-sync immediately on mount (handles SSR → client hydration drift)
    setState(detectSession());

    const id = window.setInterval(() => setState(detectSession()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return state;
}
