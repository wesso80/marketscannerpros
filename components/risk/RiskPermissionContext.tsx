'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CandidateIntent, EvaluateResult, PermissionMatrixSnapshot } from '@/lib/risk-governor-hard';

type RiskPermissionContextValue = {
  snapshot: PermissionMatrixSnapshot | null;
  loading: boolean;
  guardEnabled: boolean;
  isLocked: boolean;
  /** Guard disable has been requested but cooldown is still active */
  guardPendingDisable: boolean;
  /** Milliseconds remaining in cooldown before guard actually disables */
  guardCooldownRemainingMs: number;
  /** Daily R budget is halved because guard is disabled */
  guardRBudgetHalved: boolean;
  refresh: () => Promise<void>;
  setGuardEnabled: (enabled: boolean) => Promise<void>;
  cancelGuardDisable: () => Promise<void>;
  evaluate: (intent: CandidateIntent) => Promise<EvaluateResult | null>;
};

const RiskPermissionContext = createContext<RiskPermissionContextValue | null>(null);

export function RiskPermissionProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PermissionMatrixSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardEnabled, setGuardEnabledState] = useState(true);
  const [guardPendingDisable, setGuardPendingDisable] = useState(false);
  const [guardCooldownRemainingMs, setGuardCooldownRemainingMs] = useState(0);
  const [guardRBudgetHalved, setGuardRBudgetHalved] = useState(false);

  const loadPreference = useCallback(async () => {
    try {
      const res = await fetch('/api/risk/governor/preferences', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setGuardEnabledState(data?.enabled !== false);
      setGuardPendingDisable(data?.pendingDisable === true);
      setGuardCooldownRemainingMs(data?.cooldownRemainingMs ?? 0);
      setGuardRBudgetHalved(data?.rBudgetHalved === true);
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
      const data = await res.json();
      setGuardEnabledState(data?.enabled !== false);
      setGuardPendingDisable(data?.pendingDisable === true);
      setGuardCooldownRemainingMs(data?.cooldownRemainingMs ?? 0);
      setGuardRBudgetHalved(data?.rBudgetHalved === true);
      await refresh();
    } catch {
    }
  }, [refresh]);

  const cancelGuardDisable = useCallback(async () => {
    try {
      const res = await fetch('/api/risk/governor/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, cancelPending: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setGuardEnabledState(true);
      setGuardPendingDisable(false);
      setGuardCooldownRemainingMs(0);
      setGuardRBudgetHalved(false);
      await refresh();
    } catch {
    }
  }, [refresh]);

  // Tick down the cooldown timer client-side
  useEffect(() => {
    if (!guardPendingDisable || guardCooldownRemainingMs <= 0) return;
    const interval = window.setInterval(() => {
      setGuardCooldownRemainingMs(prev => {
        if (prev <= 1000) {
          // Cooldown expired — reload preference to get actual disabled state
          void loadPreference();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [guardPendingDisable, guardCooldownRemainingMs, loadPreference]);

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
    () => ({ snapshot, loading, guardEnabled, isLocked, guardPendingDisable, guardCooldownRemainingMs, guardRBudgetHalved, refresh, setGuardEnabled, cancelGuardDisable, evaluate }),
    [snapshot, loading, guardEnabled, isLocked, guardPendingDisable, guardCooldownRemainingMs, guardRBudgetHalved, refresh, setGuardEnabled, cancelGuardDisable, evaluate]
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
