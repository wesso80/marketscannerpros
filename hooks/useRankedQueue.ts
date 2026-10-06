'use client';

/**
 * useRankedQueue — Today's research queue.
 *
 * Reads GET /api/scanner/daily-picks once for every tier (free, signed-out, pro, pro_trader, admin).
 * A page load never POSTs /api/scanner/run. Explicit Scanner Run stays on useManualScannerResults.
 * Rows stay in the order daily-picks already ranked: equity list, then crypto list.
 */
import { useMemo } from 'react';
import { useDailyPicksBundle, useRegime, type ScanResult, type ScanTimeframe } from '@/app/v2/_lib/api';
import { deriveLifecycleState, type RankedQueueRow } from '@/lib/scanner/rankedQueue';

export interface RankedQueueResult {
  rows: RankedQueueRow[];
  equity: RankedQueueRow[];
  crypto: RankedQueueRow[];
  loading: boolean;
  error: string | null;
  qualityWarnings: string[];
  /** True when the daily-picks feed reports stale worker data. */
  stale: boolean;
  /** Minutes since the snapshot was computed, when known. */
  ageMinutes: number | null;
  localDemo: boolean;
  regime: string;
  refetch: () => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function finiteNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readCanonical(row: Record<string, unknown>): ScanResult['canonical'] {
  const canonical = row.canonical;
  if (!canonical || typeof canonical !== 'object') return undefined;
  const permission = (canonical as { permission?: unknown }).permission;
  if (permission !== 'PASS' && permission !== 'WATCH' && permission !== 'BLOCK') return undefined;
  return canonical as ScanResult['canonical'];
}

function pickDirection(row: Record<string, unknown>, canonical: ScanResult['canonical']): string {
  const direction = row.direction;
  if (direction === 'bullish' || direction === 'bearish' || direction === 'neutral') return direction;
  if (canonical?.direction === 'long') return 'bullish';
  if (canonical?.direction === 'short') return 'bearish';
  return 'neutral';
}

/** A stored trust label that is present and not GOOD. Missing trust is not treated as a weak row. */
function isWeakDailyPick(row: Record<string, unknown>): boolean {
  const trust = asRecord(row.trust);
  if (typeof trust.level === 'string' && trust.level !== 'GOOD') return true;
  if (typeof trust.freshness === 'string' && trust.freshness !== 'fresh') return true;
  return false;
}

function mapDailyPick(raw: unknown, assetClass: 'equity' | 'crypto', regime: string): RankedQueueRow | null {
  const row = asRecord(raw);
  const symbol = typeof row.symbol === 'string' ? row.symbol.trim() : '';
  if (!symbol) return null;
  const indicators = asRecord(row.indicators);
  const canonical = readCanonical(row);
  const score = finiteNum(row.score) ?? finiteNum(canonical?.score) ?? 0;
  const price = finiteNum(row.price);
  const rsi = finiteNum(row.rsi) ?? finiteNum(indicators.rsi);
  const adx = finiteNum(row.adx) ?? finiteNum(indicators.adx);
  const direction = pickDirection(row, canonical);
  return {
    symbol,
    assetClass,
    mspScore: score,
    direction,
    price,
    changePct: finiteNum(row.change_percent) ?? finiteNum(row.changePercent) ?? finiteNum(row.changePct),
    adx,
    rsi,
    lifecycle: deriveLifecycleState({
      symbol,
      score,
      direction,
      timeframe: 'daily',
      type: assetClass,
      price: price ?? undefined,
      rsi: rsi ?? undefined,
      adx: adx ?? undefined,
      canonical,
    } as ScanResult, regime),
    confidence: finiteNum(row.confidence),
    setup: typeof row.setup === 'string' ? row.setup : canonical?.setupType ?? null,
    permission: canonical?.permission,
    grade: canonical?.grade,
  };
}

function mapDailyPickList(rows: unknown[] | undefined, assetClass: 'equity' | 'crypto', regime: string): { rows: RankedQueueRow[]; weak: number } {
  let weak = 0;
  const mapped: RankedQueueRow[] = [];
  for (const raw of rows ?? []) {
    if (raw && typeof raw === 'object' && isWeakDailyPick(raw as Record<string, unknown>)) weak += 1;
    const row = mapDailyPick(raw, assetClass, regime);
    if (row) mapped.push(row);
  }
  return { rows: mapped, weak };
}

export function useRankedQueue(timeframe: ScanTimeframe = 'daily'): RankedQueueResult {
  // Daily picks are the stored daily snapshot. Today only requests 'daily'; any other
  // argument still reads that snapshot so a passive load cannot start a universe scan.
  void timeframe;
  const picks = useDailyPicksBundle();
  const regime = useRegime();
  const regimeRaw = regime.data?.regime || 'RANGE_NEUTRAL';

  const mapped = useMemo(() => {
    const equity = mapDailyPickList(picks.data?.equity, 'equity', regimeRaw);
    const crypto = mapDailyPickList(picks.data?.crypto, 'crypto', regimeRaw);
    return {
      equity: equity.rows,
      crypto: crypto.rows,
      // Preserve each list's daily-picks order. Do not re-rank with the live MSP sort.
      rows: [...equity.rows, ...crypto.rows],
      equityWeak: equity.weak,
      cryptoWeak: crypto.weak,
    };
  }, [picks.data, regimeRaw]);

  const quality = picks.data?.dataQuality;
  const qualityWarnings = ([['Equity', mapped.equityWeak], ['Crypto', mapped.cryptoWeak]] as const).flatMap(([name, weak]) => {
    if (picks.loading) return [`${name} scan pending`];
    if (picks.isAuthError) return [`${name} scan requires sign-in`];
    if (picks.error || picks.data?.success === false) return [`${name} scan unavailable`];
    if (!picks.data || !quality || quality.stale || quality.providerStatus?.degraded || weak) {
      return [`${name} scan data incomplete${weak ? ` (${weak} weak rows)` : ''}`];
    }
    return [];
  });

  const ageMinutes = useMemo(() => {
    const parsed = picks.data?.dataQuality?.computedAt ? Date.parse(picks.data.dataQuality.computedAt) : NaN;
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.round((Date.now() - parsed) / 60000));
  }, [picks.data]);

  return {
    rows: mapped.rows,
    equity: mapped.equity,
    crypto: mapped.crypto,
    loading: picks.loading && mapped.rows.length === 0,
    error: picks.error,
    qualityWarnings,
    stale: Boolean(quality?.stale),
    ageMinutes,
    localDemo: false,
    regime: regimeRaw,
    refetch: picks.refetch,
  };
}
