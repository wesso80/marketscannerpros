'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CandidateIntent, EvaluateResult, PermissionMatrixSnapshot } from '@/lib/risk-governor-hard';

type RiskPermissionContextValue = {
  snapshot: PermissionMatrixSnapshot | null;
  loading: boolean;
  guardEnabled: boolean;
  isLocked: boolean;
  refresh: () => Promise<void>;
  setGuardEnabled: (enabled: boolean) => Promise<void>;
  evaluate: (intent: CandidateIntent) => Promise<EvaluateResult | null>;
};

const RiskPermissionContext = createContext<RiskPermissionContextValue | null>(null);

export function RiskPermissionProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PermissionMatrixSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardEnabled, setGuardEnabledState] = useState(true);

  const loadPreference = useCallback(async () => {
    try {
      const res = await fetch('/api/risk/governor/preferences', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setGuardEnabledState(data?.enabled !== false);
    } catch {
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/risk/governor/permission-snapshot', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as PermissionMatrixSnapshot;
      setSnapshot(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreference();
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh, loadPreference]);

  const setGuardEnabled = useCallback(async (enabled: boolean) => {
    try {
      const res = await fetch('/api/risk/governor/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) return;
      setGuardEnabledState(enabled);
      await refresh();
    } catch {
    }
  }, [refresh]);

  const evaluate = useCallback(async (intent: CandidateIntent): Promise<EvaluateResult | null> => {
    try {
      const res = await fetch('/api/risk/governor/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade_intent: intent }),
      });
      if (!res.ok) return null;
      return (await res.json()) as EvaluateResult;
    } catch {
      return null;
    }
  }, []);

  const isLocked = useMemo(() => {
    if (!snapshot) return false;
    if (!guardEnabled) return false;
    return (
      snapshot.risk_mode === 'LOCKED' ||
      snapshot.data_health.status === 'DOWN' ||
      snapshot.session.remaining_daily_R <= 0
    );
  }, [snapshot, guardEnabled]);

  const value = useMemo<RiskPermissionContextValue>(
    () => ({ snapshot, loading, guardEnabled, isLocked, refresh, setGuardEnabled, evaluate }),
    [snapshot, loading, guardEnabled, isLocked, refresh, setGuardEnabled, evaluate]
  );

  return <RiskPermissionContext.Provider value={value}>{children}</RiskPermissionContext.Provider>;
}

export function useRiskPermission() {
  const context = useContext(RiskPermissionContext);
  if (!context) {
    throw new Error('useRiskPermission must be used within RiskPermissionProvider');
  }
  return context;
}
