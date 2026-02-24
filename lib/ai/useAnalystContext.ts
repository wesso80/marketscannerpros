// =====================================================
// MSP ANALYST CONTEXT INTELLIGENCE HOOK
// Aggregates all platform state into a unified context
// for the MSP Analyst contextual intelligence layer.
// Auto-detects changes and triggers re-evaluation.
// =====================================================

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegime, regimeLabel } from '@/lib/useRegime';
import { useUserTier } from '@/lib/useUserTier';
import { useAIPageContext } from '@/lib/ai/pageContext';

// ─── Types ───────────────────────────────────────────

export type AnalystAuthorization = 'AUTHORIZED' | 'CONDITIONAL' | 'BLOCKED';
export type DataQuality = 'complete' | 'partial' | 'stale' | 'unavailable';
export type SessionPhase =
  | 'PRE_MARKET' | 'OPENING_RANGE' | 'MORNING_SESSION' | 'MIDDAY'
  | 'POWER_HOUR' | 'CLOSE_AUCTION' | 'AFTER_HOURS'
  | 'CRYPTO_ASIAN' | 'CRYPTO_EUROPEAN' | 'CRYPTO_US' | 'CRYPTO_OVERNIGHT'
  | 'UNKNOWN';

export interface RiskObservation { severity: 'high' | 'medium' | 'low'; text: string }
export interface OpportunityObservation { confidence: 'high' | 'medium'; text: string }

/** Full analyst context snapshot — everything the analyst needs */
export interface AnalystContextSnapshot {
  // Identity
  ticker: string | null;
  assetClass: 'crypto' | 'stock' | 'fx' | null;
  timeframe: string | null;
  currentPrice: number | null;

  // Regime
  regime: string | null;
  regimeLabel: string;
  riskLevel: string | null;
  permission: string | null;
  sizing: string | null;
  volatilityState: string | null;

  // Authorization
  authorization: AnalystAuthorization;
  authorizationReason: string | null;
  tier: string;
  isLoggedIn: boolean;

  // Session & Performance
  sessionPhase: SessionPhase;
  sessionPhaseLabel: string;
  ruThrottle: number; // 0–1

  // ACL
  aclScore: number | null;
  aclConfidence: number | null;

  // Event Risk
  eventRisk: string | null;

  // Data Quality
  dataQuality: DataQuality;
  missingDataFields: string[];

  // Page-specific
  pageSkill: string | null;
  pageData: Record<string, unknown>;
  pageSymbols: string[];
  pageSummary: string | null;

  // Timestamps
  contextTimestamp: string;
  regimeUpdatedAt: string | null;

  // Fingerprint — changes when context changes
  fingerprint: string;
}

export type AnalystTab = 'explain' | 'plan' | 'act' | 'learn';

export interface AnalystTabContent {
  tab: AnalystTab;
  loading: boolean;
  error: string | null;
  content: string | null;
  generatedAt: string | null;
  contextFingerprint: string | null;
}

export interface UseAnalystContextReturn {
  context: AnalystContextSnapshot;
  tabs: Record<AnalystTab, AnalystTabContent>;
  activeTab: AnalystTab;
  setActiveTab: (tab: AnalystTab) => void;
  isRefreshing: boolean;
  lastRefresh: string | null;
  refreshNow: () => void;
  isBlocked: boolean;
  blockedReason: string | null;
  isStale: boolean;
}

// ─── Session phase detection (client-side) ──────────

function detectSessionPhase(assetClass: string | null): { phase: SessionPhase; label: string } {
  const now = new Date();
  let etHour: number;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
      minute: 'numeric',
    }).formatToParts(now);
    etHour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
      + Number(parts.find(p => p.type === 'minute')?.value ?? 0) / 60;
  } catch {
    const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    etHour = (utcHour - 5 + 24) % 24; // fallback EST
  }

  if (assetClass === 'crypto') {
    // Crypto session phases based on ET
    if (etHour >= 20 || etHour < 4) return { phase: 'CRYPTO_ASIAN', label: 'Asian Session' };
    if (etHour >= 4 && etHour < 9.5) return { phase: 'CRYPTO_EUROPEAN', label: 'European Session' };
    if (etHour >= 9.5 && etHour < 16) return { phase: 'CRYPTO_US', label: 'US Session' };
    return { phase: 'CRYPTO_OVERNIGHT', label: 'Crypto Overnight' };
  }

  // Equities session phases
  if (etHour >= 4 && etHour < 9.5) return { phase: 'PRE_MARKET', label: 'Pre-Market' };
  if (etHour >= 9.5 && etHour < 10) return { phase: 'OPENING_RANGE', label: 'Opening Range' };
  if (etHour >= 10 && etHour < 12) return { phase: 'MORNING_SESSION', label: 'Morning Session' };
  if (etHour >= 12 && etHour < 14) return { phase: 'MIDDAY', label: 'Midday Lull' };
  if (etHour >= 14 && etHour < 15.5) return { phase: 'POWER_HOUR', label: 'Power Hour' };
  if (etHour >= 15.5 && etHour < 16) return { phase: 'CLOSE_AUCTION', label: 'Close Auction' };
  if (etHour >= 16 && etHour < 20) return { phase: 'AFTER_HOURS', label: 'After Hours' };
  return { phase: 'UNKNOWN', label: 'Market Closed' };
}

// ─── Data quality assessment ────────────────────────

function assessDataQuality(ctx: {
  ticker: string | null;
  regime: string | null;
  currentPrice: number | null;
  pageData: Record<string, unknown>;
}): { quality: DataQuality; missing: string[] } {
  const missing: string[] = [];
  if (!ctx.ticker) missing.push('ticker');
  if (!ctx.regime) missing.push('regime');
  if (ctx.currentPrice == null) missing.push('price');

  const pd = ctx.pageData;
  if (!pd.direction && !pd.bias) missing.push('direction');
  if (!pd.signalStrength && !pd.score) missing.push('signal strength');

  if (missing.length === 0) return { quality: 'complete', missing };
  if (missing.length <= 2) return { quality: 'partial', missing };
  if (ctx.ticker) return { quality: 'stale', missing };
  return { quality: 'unavailable', missing };
}

// ─── Fingerprint for change detection ───────────────

function computeFingerprint(parts: (string | number | null | undefined)[]): string {
  return parts.map(p => String(p ?? '')).join('|');
}

// ─── Authorization assessment ───────────────────────

function assessAuthorization(opts: {
  tier: string;
  isLoggedIn: boolean;
  permission: string | null;
  riskLevel: string | null;
}): { auth: AnalystAuthorization; reason: string | null } {
  if (!opts.isLoggedIn) return { auth: 'BLOCKED', reason: 'Not authenticated — sign in to access analyst.' };
  if (opts.tier === 'free' || opts.tier === 'anonymous') return { auth: 'BLOCKED', reason: 'MSP Analyst requires Pro or higher tier.' };
  if (opts.permission === 'NO') return { auth: 'BLOCKED', reason: `Trading blocked by risk governor (risk level: ${opts.riskLevel}).` };
  if (opts.permission === 'CONDITIONAL') return { auth: 'CONDITIONAL', reason: 'Conditional authorization — reduced sizing recommended.' };
  return { auth: 'AUTHORIZED', reason: null };
}

// ─── Main Hook ──────────────────────────────────────

const TAB_LIST: AnalystTab[] = ['explain', 'plan', 'act', 'learn'];
const REFRESH_DEBOUNCE_MS = 1500;

function emptyTabContent(tab: AnalystTab): AnalystTabContent {
  return { tab, loading: false, error: null, content: null, generatedAt: null, contextFingerprint: null };
}

export function useAnalystContext(): UseAnalystContextReturn {
  // ── Read global state ──
  const { data: regimeData, loading: regimeLoading } = useRegime();
  const { tier, isLoading: tierLoading, isLoggedIn } = useUserTier();
  const { pageData: aiPageData } = useAIPageContext();

  // ── Local state ──
  const [activeTab, setActiveTab] = useState<AnalystTab>('explain');
  const [tabs, setTabs] = useState<Record<AnalystTab, AnalystTabContent>>(() => {
    const t = {} as Record<AnalystTab, AnalystTabContent>;
    TAB_LIST.forEach(tab => { t[tab] = emptyTabContent(tab); });
    return t;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  // ── Supplementary data from API ──
  const [aclData, setAclData] = useState<{ score: number; confidence: number; throttle: number } | null>(null);
  const [eventRisk, setEventRisk] = useState<string | null>(null);

  // ── Build context snapshot ──
  const ticker = aiPageData?.symbols?.[0] ?? null;
  const assetClass = ticker
    ? (/(USD|USDT|BTC|ETH)$/i.test(ticker) ? 'crypto' as const : 'stock' as const)
    : null;
  const timeframe = (aiPageData?.data?.timeframe as string) ?? null;
  const currentPrice = (aiPageData?.data?.currentPrice as number) ?? (aiPageData?.data?.price as number) ?? null;
  const { phase: sessionPhase, label: sessionPhaseLabel } = detectSessionPhase(assetClass);
  const { quality: dataQuality, missing: missingDataFields } = assessDataQuality({
    ticker, regime: regimeData?.regime ?? null, currentPrice, pageData: aiPageData?.data ?? {},
  });
  const { auth: authorization, reason: authorizationReason } = assessAuthorization({
    tier, isLoggedIn, permission: regimeData?.permission ?? null, riskLevel: regimeData?.riskLevel ?? null,
  });

  const context: AnalystContextSnapshot = useMemo(() => {
    const fp = computeFingerprint([
      ticker, regimeData?.regime, regimeData?.riskLevel, regimeData?.permission,
      currentPrice, sessionPhase, tier, authorization, aclData?.score,
    ]);
    return {
      ticker,
      assetClass,
      timeframe,
      currentPrice,
      regime: regimeData?.regime ?? null,
      regimeLabel: regimeData ? regimeLabel(regimeData.regime) : 'Unknown',
      riskLevel: regimeData?.riskLevel ?? null,
      permission: regimeData?.permission ?? null,
      sizing: regimeData?.sizing ?? null,
      volatilityState: regimeData?.riskLevel === 'extreme' ? 'extreme'
        : regimeData?.riskLevel === 'elevated' ? 'elevated'
        : regimeData?.riskLevel === 'low' ? 'low' : 'normal',
      authorization,
      authorizationReason,
      tier,
      isLoggedIn,
      sessionPhase,
      sessionPhaseLabel,
      ruThrottle: aclData?.throttle ?? 1,
      aclScore: aclData?.score ?? null,
      aclConfidence: aclData?.confidence ?? null,
      eventRisk,
      dataQuality,
      missingDataFields,
      pageSkill: aiPageData?.skill ?? null,
      pageData: aiPageData?.data ?? {},
      pageSymbols: aiPageData?.symbols ?? [],
      pageSummary: aiPageData?.summary ?? null,
      contextTimestamp: new Date().toISOString(),
      regimeUpdatedAt: regimeData?.updatedAt ?? null,
      fingerprint: fp,
    };
  }, [
    ticker, assetClass, timeframe, currentPrice,
    regimeData, sessionPhase, sessionPhaseLabel, tier, isLoggedIn,
    authorization, authorizationReason,
    aclData, eventRisk, dataQuality, missingDataFields,
    aiPageData,
  ]);

  // ── Fingerprint-based change detection ──
  const prevFingerprint = useRef<string>('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTabContent = useCallback(async (fingerprint: string) => {
    if (authorization === 'BLOCKED') return;
    if (dataQuality === 'unavailable') return;
    if (tierLoading || regimeLoading) return;

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRefreshing(true);
    // Mark all tabs loading
    setTabs(prev => {
      const next = { ...prev };
      TAB_LIST.forEach(t => { next[t] = { ...next[t], loading: true, error: null }; });
      return next;
    });

    try {
      const res = await fetch('/api/ai/analyst-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const now = new Date().toISOString();

      setTabs({
        explain: { tab: 'explain', loading: false, error: null, content: data.explain ?? null, generatedAt: now, contextFingerprint: fingerprint },
        plan: { tab: 'plan', loading: false, error: null, content: data.plan ?? null, generatedAt: now, contextFingerprint: fingerprint },
        act: { tab: 'act', loading: false, error: null, content: data.act ?? null, generatedAt: now, contextFingerprint: fingerprint },
        learn: { tab: 'learn', loading: false, error: null, content: data.learn ?? null, generatedAt: now, contextFingerprint: fingerprint },
      });

      if (data.acl) {
        setAclData({ score: data.acl.score, confidence: data.acl.confidence, throttle: data.acl.throttle });
      }
      if (data.eventRisk) setEventRisk(data.eventRisk);
      setLastRefresh(now);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setTabs(prev => {
        const next = { ...prev };
        TAB_LIST.forEach(t => { next[t] = { ...next[t], loading: false, error: err.message }; });
        return next;
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [authorization, dataQuality, tierLoading, regimeLoading, context]);

  // ── Auto-refresh on fingerprint change ──
  useEffect(() => {
    const fp = context.fingerprint;
    if (fp === prevFingerprint.current) return;
    if (!fp || fp === '||||||||') return; // all nulls
    prevFingerprint.current = fp;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchTabContent(fp);
    }, REFRESH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [context.fingerprint, fetchTabContent]);

  // ── Manual refresh ──
  const refreshNow = useCallback(() => {
    prevFingerprint.current = ''; // force re-fetch
    fetchTabContent(context.fingerprint);
  }, [fetchTabContent, context.fingerprint]);

  // ── Blocked / Stale checks ──
  const isBlocked = authorization === 'BLOCKED';
  const blockedReason = isBlocked ? authorizationReason : null;
  const isStale = dataQuality === 'stale' || dataQuality === 'unavailable';

  return {
    context,
    tabs,
    activeTab,
    setActiveTab,
    isRefreshing,
    lastRefresh,
    refreshNow,
    isBlocked,
    blockedReason,
    isStale,
  };
}
