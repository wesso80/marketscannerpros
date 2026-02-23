'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CatalystEvent, CatalystSubtype, EventStudyResult, Severity } from '@/lib/catalyst/types';

/* ────────────────────────────────────────────────────────────────
   useCatalystRisk — Governor hook that surfaces active catalyst
   risk for a given ticker. Returns the highest-severity recent
   catalyst event + its study (if computed), and a risk level
   that the decision engine can consume.

   Usage:
     const { riskLevel, activeCatalyst, study, loading } = useCatalystRisk('AAPL');
     // riskLevel: 'NONE' | 'LOW' | 'ELEVATED' | 'HIGH'
     // activeCatalyst: the most recent high-severity event (if any)
     // study: the EventStudyResult for that catalyst subtype
   ──────────────────────────────────────────────────────────────── */

export type CatalystRiskLevel = 'NONE' | 'LOW' | 'ELEVATED' | 'HIGH';

export interface CatalystRiskState {
  riskLevel: CatalystRiskLevel;
  activeCatalyst: CatalystEvent | null;
  study: EventStudyResult | null;
  loading: boolean;
  error: string | null;
}

const SEVERITY_RANK: Record<string, number> = {
  HIGH: 3,
  MED: 2,
  LOW: 1,
};

function computeRiskLevel(events: CatalystEvent[], study: EventStudyResult | null): CatalystRiskLevel {
  if (events.length === 0) return 'NONE';

  // Check recency: events within last 48 hours are "active"
  const now = Date.now();
  const recentEvents = events.filter(e => {
    const age = now - new Date(e.eventTimestampUtc).getTime();
    return age < 48 * 60 * 60 * 1000; // 48h
  });

  if (recentEvents.length === 0) return 'LOW'; // Has history but nothing recent

  // Find highest severity among recent events
  const maxSeverity = recentEvents.reduce((max, e) => {
    const rank = SEVERITY_RANK[e.severity || 'LOW'] || 0;
    return rank > max ? rank : max;
  }, 0);

  // If study shows high tail risk on day1, escalate
  if (study) {
    const tailRisk = study.horizons.day1?.tailRiskAvg ?? 0;
    const absMedian = Math.abs(study.horizons.day1?.median ?? 0);

    if (maxSeverity >= 3 || tailRisk < -5 || absMedian > 3) return 'HIGH';
    if (maxSeverity >= 2 || tailRisk < -3 || absMedian > 1.5) return 'ELEVATED';
  } else {
    if (maxSeverity >= 3) return 'HIGH';
    if (maxSeverity >= 2) return 'ELEVATED';
  }

  return 'LOW';
}

export function useCatalystRisk(ticker: string, lookbackDays = 7): CatalystRiskState {
  const [state, setState] = useState<CatalystRiskState>({
    riskLevel: 'NONE',
    activeCatalyst: null,
    study: null,
    loading: false,
    error: null,
  });

  const fetchRisk = useCallback(async () => {
    if (!ticker) {
      setState({ riskLevel: 'NONE', activeCatalyst: null, study: null, loading: false, error: null });
      return;
    }

    setState(s => ({ ...s, loading: true, error: null }));

    try {
      // Fetch recent events
      const eventsRes = await fetch(
        `/api/catalyst/events?ticker=${encodeURIComponent(ticker)}&days=${lookbackDays}`
      );
      if (!eventsRes.ok) throw new Error(`events ${eventsRes.status}`);
      const { events } = await eventsRes.json() as { events: CatalystEvent[] };

      if (events.length === 0) {
        setState({ riskLevel: 'NONE', activeCatalyst: null, study: null, loading: false, error: null });
        return;
      }

      // Pick the highest-severity most-recent event
      const sorted = [...events].sort((a, b) => {
        const sevDiff = (SEVERITY_RANK[b.severity || 'LOW'] || 0) - (SEVERITY_RANK[a.severity || 'LOW'] || 0);
        if (sevDiff !== 0) return sevDiff;
        return new Date(b.eventTimestampUtc).getTime() - new Date(a.eventTimestampUtc).getTime();
      });
      const topEvent = sorted[0];

      // Fetch study for that subtype
      let study: EventStudyResult | null = null;
      try {
        const studyRes = await fetch(
          `/api/catalyst/study?ticker=${encodeURIComponent(ticker)}&subtype=${topEvent.catalystSubtype}&cohort=auto`
        );
        if (studyRes.ok) {
          const body = await studyRes.json();
          study = body.study;
        }
      } catch {
        // Study fetch is non-blocking — risk level can still be computed from events alone
      }

      const riskLevel = computeRiskLevel(events, study);

      setState({
        riskLevel,
        activeCatalyst: topEvent,
        study,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setState(s => ({
        ...s,
        loading: false,
        error: e?.message || 'Unknown error',
      }));
    }
  }, [ticker, lookbackDays]);

  useEffect(() => {
    fetchRisk();
  }, [fetchRisk]);

  return state;
}

/* ────────────────────────────────────────────────────────────────
   Risk-Unit Tightening — Utility for decision engine integration.
   Given a base R-multiple target and the catalyst risk level,
   returns an adjusted (tightened) R-multiple.
   ──────────────────────────────────────────────────────────────── */

const RISK_ADJUSTMENT: Record<CatalystRiskLevel, number> = {
  NONE: 1.0,      // No adjustment
  LOW: 0.95,      // 5% tighter
  ELEVATED: 0.75, // 25% tighter
  HIGH: 0.5,      // 50% tighter — half position
};

export function adjustRMultiple(baseR: number, riskLevel: CatalystRiskLevel): number {
  return baseR * RISK_ADJUSTMENT[riskLevel];
}

/**
 * Get a human-readable risk summary for display in decision cards.
 */
export function catalystRiskSummary(state: CatalystRiskState): string | null {
  if (state.riskLevel === 'NONE') return null;
  if (!state.activeCatalyst) return null;

  const event = state.activeCatalyst;
  const age = Date.now() - new Date(event.eventTimestampUtc).getTime();
  const hoursAgo = Math.round(age / (60 * 60 * 1000));

  const parts = [
    `${event.catalystSubtype.replace(/_/g, ' ')}`,
    hoursAgo < 1 ? 'just now' : `${hoursAgo}h ago`,
  ];

  if (state.study) {
    const d1 = state.study.horizons.day1;
    parts.push(`median D1 ${d1.median >= 0 ? '+' : ''}${d1.median.toFixed(1)}%`);
    if (d1.tailRiskAvg < -3) {
      parts.push(`tail risk ${d1.tailRiskAvg.toFixed(1)}%`);
    }
  }

  return parts.join(' · ');
}
