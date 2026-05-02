'use client';

/* ---------------------------------------------------------------------------
   UNIFIED SCANNER HUB — V2 Ranked + V1 Pro Scanner on one page
   Toggle between auto-loading regime-aware ranking and manual pro scan.
   Click any symbol for inline analysis with Backtest / Alert / Watchlist.
   --------------------------------------------------------------------------- */

import { useMemo, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useScannerResults, useRegime, type ScanResult, type ScanTimeframe, SCAN_TIMEFRAMES } from '@/app/v2/_lib/api';
import { Card, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import { REGIME_WEIGHTS, LIFECYCLE_COLORS } from '@/app/v2/_lib/constants';
import type { RegimePriority, LifecycleState } from '@/app/v2/_lib/types';
import { useUserTier, FREE_DAILY_SCAN_LIMIT, canAccessUnlimitedScanning } from '@/lib/useUserTier';
import ScreenerTable, { type ScreenerRow } from '@/components/scanner/ScreenerTable';
import ScanTemplatesBar, { type ScanTemplate, SCAN_TEMPLATES } from '@/components/scanner/ScanTemplatesBar';
import { useRegisterPageData } from '@/lib/ai/pageContext';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { saveResearchCase } from '@/lib/clientResearchCases';
import DataFreshnessBadge from '@/components/market/DataFreshnessBadge';
import MarketStatusStrip from '@/components/market/MarketStatusStrip';
import ScoreTypeBadge from '@/components/ui/ScoreTypeBadge';

/* ─── Helpers ─── */
function dirColor(d?: string) {
  if (d === 'bullish') return '#10B981';
  if (d === 'bearish') return '#EF4444';
  return '#94A3B8';
}
function formatPrice(p: number | undefined | null) {
  if (p == null) return '—';
  return p < 1 ? `$${p.toFixed(4)}` : `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatLevel(value: number | undefined | null): string {
  if (!isUsableNumber(value)) return 'Unavailable';
  return value < 1 ? value.toFixed(4) : value.toFixed(2);
}

function getDataQualityLabel(input: { price?: number | null; atr?: number | null; rsi?: number | null; adx?: number | null; direction?: string | null }) {
  if (!isUsableNumber(input.price)) return 'MISSING';
  const missing = [input.atr, input.rsi, input.adx].filter((value) => !isUsableNumber(value)).length;
  if (!input.direction || input.direction === 'neutral') return 'DEGRADED';
  return missing === 0 ? 'GOOD' : missing <= 1 ? 'DEGRADED' : 'MISSING';
}

function getMissingInputs(input: { price?: number | null; atr?: number | null; rsi?: number | null; adx?: number | null; direction?: string | null }): string[] {
  return [
    !isUsableNumber(input.price) ? 'price' : null,
    !isUsableNumber(input.atr) ? 'ATR' : null,
    !isUsableNumber(input.rsi) ? 'RSI' : null,
    !isUsableNumber(input.adx) ? 'ADX' : null,
    !input.direction || input.direction === 'neutral' ? 'direction' : null,
  ].filter(Boolean) as string[];
}

function dataQualityDetail(label: string, missing: string[]): string {
  if (label === 'GOOD') return 'Price, ATR, RSI, ADX, and directional context are available.';
  if (missing.length === 0) return `${label} scanner inputs.`;
  return `Missing or weak: ${missing.join(', ')}.`;
}

function dataQualityColor(label: string): string {
  if (label === 'GOOD') return '#10B981';
  if (label === 'DEGRADED') return '#F59E0B';
  return '#EF4444';
}

function ScannerMetric({ label, value, tone = '#CBD5E1', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

type ProviderStatus = NonNullable<NonNullable<ReturnType<typeof useScannerResults>['data']>['metadata']['dataQuality']>['providerStatus'];

function summarizeRankedReason(r: ScanResult, lifecycle: LifecycleState, regimeCompatible: boolean, activeRegime: string): string {
  if (r.rankExplanation?.summary) {
    return r.rankExplanation.summary.replace(/;\s*rank is reduced when evidence is missing, stale, or liquidity is thin\.?\s*$/i, '').trim();
  }
  if (r.scoreV2?.regimeScore?.gated) return 'Gated by regime';
  if (!regimeCompatible) {
    const setup = r.direction === 'bullish' ? 'Bull trend setup' : r.direction === 'bearish' ? 'Bear trend setup' : 'Directional setup';
    const setupType = setupTypeForRegime(r);
    if (normalizeRegimeKey(activeRegime) === 'range') {
      if (setupType.includes('compression_release')) return 'Breakout candidate in range — wait for confirmation';
      if (setupType.includes('expansion_continuation')) return 'Trend continuation vs range — confirm acceptance';
      return `${setup} vs range — wait for break or fade`;
    }
    return `${setup} outside active regime`;
  }
  if (r.dveFlags?.includes('COMPRESSED')) return `${lifecycle === 'READY' ? 'Multi-factor' : 'Watch'} compression`;
  if (r.dveFlags?.includes('MOMENTUM_ACCEL')) return 'Momentum accel';
  if (r.dveFlags?.includes('CLIMAX')) return 'Volatility risk';
  if (r.confidence != null && r.confidence >= 70) return 'Strong confluence';
  if (r.direction === 'bullish') return 'Bullish alignment';
  if (r.direction === 'bearish') return 'Bearish alignment';
  return 'Mixed evidence';
}

function rankedTrustLabel(r: ScanResult): 'GOOD' | 'DEGRADED' | 'MISSING' {
  if (String(r.setup || '').startsWith('Local demo:')) return 'DEGRADED';
  if (!isUsableNumber(r.price)) return 'MISSING';
  if (r.scoreQuality?.freshnessStatus === 'missing') return 'MISSING';
  if ((r.scoreQuality?.missingEvidencePenalty ?? 0) > 0 || (r.scoreQuality?.staleDataPenalty ?? 0) > 0 || (r.scoreQuality?.liquidityPenalty ?? 0) > 0 || r.rankWarnings?.length) return 'DEGRADED';
  if (r.confidence == null || r.score == null) return 'DEGRADED';
  if (r.dveBbwp == null && !r.dveSignalType && !r.dveFlags?.length) return 'DEGRADED';
  return 'GOOD';
}

function rankedTrustDetail(r: ScanResult): string {
  if (String(r.setup || '').startsWith('Local demo:')) return 'Development-only sample row. Not live market data.';
  if (!isUsableNumber(r.price)) return 'Missing usable price.';
  const qualityWarnings = [
    r.scoreQuality?.freshnessStatus && r.scoreQuality.freshnessStatus !== 'fresh' ? `freshness ${r.scoreQuality.freshnessStatus}` : null,
    (r.scoreQuality?.missingEvidencePenalty ?? 0) > 0 ? `missing evidence penalty ${r.scoreQuality?.missingEvidencePenalty}` : null,
    (r.scoreQuality?.staleDataPenalty ?? 0) > 0 ? `stale data penalty ${r.scoreQuality?.staleDataPenalty}` : null,
    (r.scoreQuality?.liquidityPenalty ?? 0) > 0 ? `liquidity penalty ${r.scoreQuality?.liquidityPenalty}` : null,
    ...(r.rankWarnings ?? []),
  ].filter(Boolean) as string[];
  if (qualityWarnings.length) return qualityWarnings.join(' · ');
  const missing = [
    r.confidence == null ? 'confidence' : null,
    r.score == null ? 'raw score' : null,
    r.dveBbwp == null && !r.dveSignalType && !r.dveFlags?.length ? 'DVE context' : null,
  ].filter(Boolean) as string[];
  return missing.length ? `Missing or weak: ${missing.join(', ')}.` : 'Price, score, confidence, and volatility context are available.';
}

function summarizeDetailNextCheck(args: { hasScenarioLevels: boolean; trendAligned: boolean; momentumAligned: boolean; flowAligned: boolean; dataQuality: string; direction: string; regime?: string }) {
  if (args.dataQuality !== 'GOOD') return 'Refresh scanner inputs before relying on reference levels.';
  if (!args.hasScenarioLevels) return 'Wait for valid reference and invalidation levels before escalation.';
  if (args.regime === 'Range' && args.direction !== 'neutral' && args.trendAligned) return 'Wait for a confirmed range break with volume or ADX expansion before escalation.';
  if (!args.trendAligned) return 'Watch for structure to align with the observed direction.';
  if (!args.momentumAligned) return 'Watch for momentum confirmation before treating the case as aligned.';
  if (!args.flowAligned) return 'Check whether signal split improves from mixed to aligned.';
  if (args.direction === 'neutral') return 'Wait for directional structure to resolve.';
  return 'Monitor whether price respects the reference level and data quality holds.';
}

function biasLabel(direction?: string | null): string {
  if (direction === 'bullish' || direction === 'LONG') return 'Bullish bias';
  if (direction === 'bearish' || direction === 'SHORT') return 'Bearish bias';
  return 'Neutral bias';
}

function compactBiasLabel(direction?: string | null): string {
  if (direction === 'bullish' || direction === 'LONG') return 'Bullish';
  if (direction === 'bearish' || direction === 'SHORT') return 'Bearish';
  return 'Neutral';
}

function lifecycleLabel(lifecycle: LifecycleState): string {
  if (lifecycle === 'READY') return 'Multi-confirmed pattern';
  if (lifecycle === 'SETTING_UP') return 'Developing';
  if (lifecycle === 'INVALIDATED') return 'Needs review';
  return lifecycle.replace('_', ' ');
}

const TABS = ['All', 'Equities', 'Crypto', 'Bullish', 'Bearish', 'High Score', 'DVE Signals', 'Squeeze', 'Regime Match'] as const;
const LEGACY_MULTI_FACTOR_STATUS = ['TRADE', 'READY'].join('_');
const LEGACY_LOW_ALIGNMENT_STATUS = ['NO', 'TRADE'].join('_');
type SortKey = 'symbol' | 'score' | 'direction' | 'confidence' | 'rsi' | 'price' | 'dveBbwp' | 'mspScore';
type SortDir = 'asc' | 'desc';

const REGIME_SETUP_MAP: Record<string, string[]> = {
  trend: ['breakout', 'trend_continuation', 'pullback', 'expansion_continuation'],
  range: ['mean_reversion', 'range_fade', 'liquidity_sweep'],
  compression: ['volatility_expansion', 'squeeze', 'gamma_trap', 'compression_release'],
  transition: ['breakout', 'gamma_squeeze', 'volatility_expansion', 'compression_release'],
  expansion: ['breakout', 'trend_continuation', 'gamma_squeeze', 'expansion_continuation'],
  risk_off: ['mean_reversion', 'hedge', 'range_fade'],
  risk_on: ['breakout', 'trend_continuation', 'pullback', 'expansion_continuation'],
};

function normalizeRegimeKey(regime?: string | null): RegimePriority {
  const value = String(regime || '').toLowerCase();
  if (value.includes('risk_off') || value.includes('risk-off') || value.includes('defensive')) return 'risk_off';
  if (value.includes('risk_on') || value.includes('risk-on')) return 'risk_on';
  if (value.includes('compress') || value.includes('squeeze')) return 'compression';
  if (value.includes('transition') || value.includes('neutral')) return value.includes('range') ? 'range' : 'transition';
  if (value.includes('expand')) return 'expansion';
  if (value.includes('range')) return 'range';
  if (value.includes('trend')) return 'trend';
  return 'trend';
}

function setupTypeForRegime(r: ScanResult): string {
  const dveSignal = r.dveSignalType && r.dveSignalType !== 'none' ? r.dveSignalType : '';
  const setup = String(r.setup || '').replace(/^Local demo:\s*/i, '');
  return String(dveSignal || setup).toLowerCase().replace(/\s+/g, '_');
}

function isRegimeCompatibleForRegime(r: ScanResult, regime: string): boolean {
  const regimeKey = normalizeRegimeKey(regime);
  const setupType = setupTypeForRegime(r);
  const compatible = REGIME_SETUP_MAP[regimeKey] || [];
  if (!setupType || setupType === 'none') {
    if (regimeKey === 'risk_off') return r.direction === 'bearish';
    if (regimeKey === 'risk_on' || regimeKey === 'trend' || regimeKey === 'expansion') return r.direction === 'bullish';
    return true;
  }
  return compatible.some(c => setupType.includes(c));
}

/* ─── Phase 2: Regime-Weighted MSP Score ─── */
function computeMspScore(r: ScanResult, regime: string): number {
  const regimeKey = normalizeRegimeKey(regime);
  const w = REGIME_WEIGHTS[regimeKey] || REGIME_WEIGHTS.trend;
  // Normalize each component to 0-100 scale
  const structure = Math.min(100, Math.max(0, Math.abs(r.score ?? 0) * 10));
  const momentum = Math.min(100, Math.max(0, r.confidence ?? (Math.abs(r.score ?? 0) * 8)));
  const volatility = r.dveBbwp != null
    ? (r.dveBbwp < 20 ? 80 + (20 - r.dveBbwp) : r.dveBbwp > 80 ? 70 + (r.dveBbwp - 80) : 30 + r.dveBbwp * 0.3)
    : 40;
  const options = r.derivatives ? Math.min(100, 50 + Math.abs(r.derivatives.fundingRate ?? 0) * 500) : 30;
  const time = r.scoreV2?.acl?.confidence ?? 50;
  const raw = (structure * w.structure + momentum * w.momentum + volatility * w.volatility + options * w.options + time * w.time) / 100;
  // Apply regime gating penalty
  if (r.scoreV2?.regimeScore?.gated) return Math.round(Math.max(0, raw * 0.4));
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/* ─── Phase 6: Trade Lifecycle State ─── */
function deriveLifecycleState(r: ScanResult, regime: string): LifecycleState {
  const msp = computeMspScore(r, regime);
  const conf = r.confidence ?? 0;
  const gated = r.scoreV2?.regimeScore?.gated;
  if (gated) return 'INVALIDATED';
  if (msp >= 75 && conf >= 65) return 'READY';
  if (msp >= 55 && conf >= 45) return 'SETTING_UP';
  if (msp >= 35) return 'WATCHING';
  return 'DISCOVERED';
}
type ScannerMode = 'ranked' | 'pro';
type ScannerStage = ScannerMode | 'analysis';
type AssetClass = 'crypto' | 'equity' | 'forex';
type ScanDepth = 'light' | 'deep';

function ScannerFlowRail({
  activeStage,
  selectedSymbol,
  onSelectMode,
  onSelectAnalysis,
  canOpenAnalysis,
}: {
  activeStage: ScannerStage;
  selectedSymbol: string | null;
  onSelectMode: (mode: ScannerMode) => void;
  onSelectAnalysis: () => void;
  canOpenAnalysis: boolean;
}) {
  const stages: Array<{ id: ScannerStage; label: string; eyebrow: string; detail: string }> = [
    { id: 'ranked', label: 'Ranked', eyebrow: '1. Triage', detail: 'Auto-ranked market queue' },
    { id: 'pro', label: 'Pro', eyebrow: '2. Configure', detail: 'Manual scan controls' },
    { id: 'analysis', label: 'Analysis', eyebrow: '3. Inspect', detail: selectedSymbol ? `${selectedSymbol} case review` : 'Opens after symbol select' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2" aria-label="Scanner workflow views">
      {stages.map((stage) => {
        const isActive = activeStage === stage.id;
        const isAnalysis = stage.id === 'analysis';
        const disabled = isAnalysis && !canOpenAnalysis;
        const content = (
          <div className={`h-full rounded-md border px-3 py-1.5 text-left transition ${
            isActive
              ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
              : disabled
                ? 'border-white/10 bg-white/[0.025] text-slate-600'
                : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]'
          }`}>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{stage.eyebrow}</div>
            <div className={`mt-0.5 text-sm font-black ${isActive ? 'text-emerald-200' : disabled ? 'text-slate-600' : 'text-white'}`}>{stage.label}</div>
            <div className="mt-0.5 truncate text-[11px] leading-4 text-slate-500" title={stage.detail}>{stage.detail}</div>
          </div>
        );

        if (stage.id === 'ranked' || stage.id === 'pro') {
          const selectableStage = stage.id;
          return (
            <button key={stage.id} type="button" onClick={() => onSelectMode(selectableStage)} aria-pressed={isActive} className="block w-full">
              {content}
            </button>
          );
        }

        return (
          <button
            key={stage.id}
            type="button"
            onClick={onSelectAnalysis}
            disabled={disabled}
            aria-pressed={isActive}
            className="block w-full disabled:cursor-not-allowed"
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function ProScannerCards({ rows, onRowClick }: { rows: ScreenerRow[]; onRowClick: (row: ScreenerRow) => void }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-4 py-8 text-center text-sm text-slate-500">No card results match the current filters.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const biasColor = row.direction === 'LONG' ? 'text-emerald-300' : row.direction === 'SHORT' ? 'text-rose-300' : 'text-slate-300';
        const trustTone = row.dataQuality === 'GOOD' ? 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10' : row.dataQuality === 'MISSING' ? 'text-rose-300 border-rose-500/35 bg-rose-500/10' : 'text-amber-300 border-amber-500/35 bg-amber-500/10';
        const researchTone = row.permission === 'COMPLIANT' ? 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10' : row.permission === 'BLOCKED' ? 'text-rose-300 border-rose-500/35 bg-rose-500/10' : 'text-amber-300 border-amber-500/35 bg-amber-500/10';

        return (
          <button
            key={row.symbol}
            type="button"
            onClick={() => onRowClick(row)}
            className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/[0.05]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Rank {row.rank}</div>
                <div className="mt-1 text-lg font-black text-white">{row.symbol}</div>
              </div>
              <div className={`rounded-md border px-2 py-1 text-[11px] font-black uppercase ${researchTone}`}>
                {row.permission === 'COMPLIANT' ? 'Aligned' : row.permission === 'BLOCKED' ? 'Not aligned' : 'Mixed'}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Bias</div>
                <div className={`mt-1 text-xs font-black ${biasColor}`}>{compactBiasLabel(row.direction)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Alignment</div>
                <div className="mt-1 text-xs font-black text-white">{row.confidence}%</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">MTF</div>
                <div className="mt-1 text-xs font-black text-white">{row.tfAlignment ?? '—'}/4</div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{row.reason || 'Mixed evidence'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${trustTone}`}>{row.dataQuality || 'DEGRADED'}</span>
              <span className="text-xs font-bold text-emerald-300">Review Scenario</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RankedMobileCards({ rows, activeRegime, onRowClick }: { rows: ScanResult[]; activeRegime: string; onRowClick: (row: ScanResult) => void }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-4 py-8 text-center text-sm text-slate-500 md:hidden">No ranked scenarios match this filter.</div>;
  }

  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row, index) => {
        const lifecycle = deriveLifecycleState(row, activeRegime);
        const msp = computeMspScore(row, activeRegime);
        const trust = rankedTrustLabel(row);
        const trustDetail = rankedTrustDetail(row);
        const reason = summarizeRankedReason(row, lifecycle, isRegimeCompatibleForRegime(row, activeRegime), activeRegime);
        const mspColor = msp >= 70 ? '#10B981' : msp >= 50 ? '#F59E0B' : msp >= 30 ? '#94A3B8' : '#EF4444';

        return (
          <button
            key={`${row.symbol}-${index}`}
            type="button"
            onClick={() => onRowClick(row)}
            className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/[0.05]"
            aria-label={`Review scenario for ${row.symbol}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Rank {index + 1}</div>
                <div className="mt-1 text-xl font-black text-white">{row.symbol}</div>
                <div className="mt-0.5 text-xs text-slate-500">{row.scoreV2?.regime?.label || row.type || 'Market scenario'}</div>
              </div>
              <span className="rounded-md border px-2 py-1 text-[11px] font-black uppercase" style={{ color: dataQualityColor(trust), borderColor: dataQualityColor(trust) + '55', backgroundColor: dataQualityColor(trust) + '15' }} title={trustDetail}>
                {trust}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">MSP</div>
                <div className="mt-1 text-sm font-black" style={{ color: mspColor }}>{msp}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Bias</div>
                <div className="mt-1 text-xs font-black text-white">{compactBiasLabel(row.direction)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Alignment</div>
                <div className="mt-1 text-xs font-black text-white">{row.confidence != null ? `${row.confidence}%` : 'Mixed'}</div>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-400">{reason}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-md border px-2 py-0.5 text-[10px] font-black uppercase" style={{ color: LIFECYCLE_COLORS[lifecycle], borderColor: LIFECYCLE_COLORS[lifecycle] + '40', backgroundColor: LIFECYCLE_COLORS[lifecycle] + '15' }}>
                {lifecycleLabel(lifecycle)}
              </span>
              <span className="text-xs font-bold text-emerald-300">Why This Rank / Review</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RankedFallbackList({ rows, activeRegime, onRowClick }: { rows: ScanResult[]; activeRegime: string; onRowClick: (row: ScanResult) => void }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row, index) => {
        const lifecycle = deriveLifecycleState(row, activeRegime);
        const msp = computeMspScore(row, activeRegime);
        const trust = rankedTrustLabel(row);
        const trustDetail = rankedTrustDetail(row);
        const reason = summarizeRankedReason(row, lifecycle, isRegimeCompatibleForRegime(row, activeRegime), activeRegime);
        const mspColor = msp >= 70 ? '#10B981' : msp >= 50 ? '#F59E0B' : msp >= 30 ? '#94A3B8' : '#EF4444';
        return (
          <button
            key={`${(row as any)._assetClass || 'asset'}-${row.symbol || 'unknown'}-${index}`}
            type="button"
            onClick={() => onRowClick(row)}
            className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/[0.05]"
            aria-label={`Review scenario for ${row.symbol || 'symbol'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Rank {index + 1}</div>
                <div className="mt-1 text-xl font-black text-white">{row.symbol || 'Unknown'}</div>
                <div className="mt-0.5 text-xs text-slate-500">{row.scoreV2?.regime?.label || row.type || 'Market scenario'}</div>
              </div>
              <span className="rounded-md border px-2 py-1 text-[11px] font-black uppercase" style={{ color: dataQualityColor(trust), borderColor: dataQualityColor(trust) + '55', backgroundColor: dataQualityColor(trust) + '15' }} title={trustDetail}>
                {trust}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">MSP</div>
                <div className="mt-1 text-sm font-black" style={{ color: mspColor }}>{msp}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Bias</div>
                <div className="mt-1 text-xs font-black text-white">{compactBiasLabel(row.direction)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Alignment</div>
                <div className="mt-1 text-xs font-black text-white">{row.confidence != null ? `${row.confidence}%` : 'Mixed'}</div>
              </div>
            </div>
            {/* Algorithm truth labels */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ScoreTypeBadge
                type={row.scoreQuality?.staleDataPenalty ? 'stale' : row.scoreQuality?.missingEvidencePenalty ? 'partial' : 'heuristic'}
                compact
              />
              {row.scoreQuality?.missingEvidencePenalty != null && row.scoreQuality.missingEvidencePenalty > 0 && (
                <span className="inline-flex items-center rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                  −{row.scoreQuality.missingEvidencePenalty} missing evidence
                </span>
              )}
              {row.scoreQuality?.liquidityPenalty != null && row.scoreQuality.liquidityPenalty > 0 && (
                <span className="inline-flex items-center rounded border border-slate-600/40 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                  −{row.scoreQuality.liquidityPenalty} liquidity
                </span>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">{reason}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-md border px-2 py-0.5 text-[10px] font-black uppercase" style={{ color: LIFECYCLE_COLORS[lifecycle], borderColor: LIFECYCLE_COLORS[lifecycle] + '40', backgroundColor: LIFECYCLE_COLORS[lifecycle] + '15' }}>
                {lifecycleLabel(lifecycle)}
              </span>
              <span className="text-xs font-bold text-emerald-300">Why This Rank / Review</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Detail data from /api/scanner/run ─── */
interface SymbolDetail {
  symbol: string;
  score: number;
  direction?: string;
  price?: number;
  rsi?: number;
  adx?: number;
  atr?: number;
  ema200?: number;
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  macd_hist?: number;
  volume?: number;
  confidence?: number;
  setup?: string;
  signals?: { bullish: number; bearish: number; neutral: number };
  scoreQuality?: ScanResult['scoreQuality'];
  rankWarnings?: string[];
  rankExplanation?: ScanResult['rankExplanation'];
  providerStatus?: ProviderStatus | null;
  institutionalFilter?: {
    recommendation?: string;
    noTrade?: boolean;
    finalGrade?: string;
    finalScore?: number;
    filters?: { label: string; status: string }[];
  };
  capitalFlow?: any;
}

/* ─── Watchlist add helper ─── */
async function addToWatchlist(symbol: string, assetType: string, price?: number): Promise<string> {
  const wlRes = await fetch('/api/watchlists');
  const wlData = await wlRes.json();
  if (!wlRes.ok) throw new Error(wlData?.error || 'Failed to load watchlists');
  let target = wlData?.watchlists?.find((l: any) => l.is_default) || wlData?.watchlists?.[0];
  if (!target) {
    const createRes = await fetch('/api/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Watchlist', description: 'Auto-created from scanner', color: 'emerald', icon: 'star' }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData?.error || 'Failed to create watchlist');
    target = createData?.watchlist;
  }
  const addRes = await fetch('/api/watchlists/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlistId: target.id, symbol, assetType, addedPrice: price }),
  });
  const addData = await addRes.json();
  if (!addRes.ok) throw new Error(addData?.error || 'Failed to add to watchlist');
  return target.name;
}

/* ─── Inline Detail Panel ─── */
function SymbolDetailPanel({ detail, timeframeLabel, onClose, assetType, activeRegime, returnLabel }: {
  detail: SymbolDetail;
  timeframeLabel: string;
  onClose: () => void;
  assetType: string;
  activeRegime?: string;
  returnLabel?: string;
}) {
  const [flashMsg, setFlashMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [savingCase, setSavingCase] = useState(false);

  const direction = detail.direction || 'neutral';
  const confidence = detail.confidence ?? Math.min(99, Math.max(10, Math.round(detail.score)));
  const quality = confidence >= 70 ? 'HIGH' : confidence >= 50 ? 'MEDIUM' : 'LOW';
  const adx = detail.adx ?? 0;
  const atrPercent = detail.atr && detail.price ? (detail.atr / detail.price) * 100 : 0;
  const localRegime = adx >= 30 ? 'Trending' : adx < 20 ? 'Range' : 'Transitional';
  const regime = activeRegime === 'range' ? 'Range' : localRegime;

  const trendAligned = (detail.signals?.bullish ?? 0) > (detail.signals?.bearish ?? 0) && direction === 'bullish'
    || (detail.signals?.bearish ?? 0) > (detail.signals?.bullish ?? 0) && direction === 'bearish';
  const momentumAligned = detail.rsi != null && ((direction === 'bullish' && detail.rsi > 45) || (direction === 'bearish' && detail.rsi < 55));
  const flowAligned = direction === 'bullish'
    ? (detail.signals?.bullish ?? 0) >= (detail.signals?.neutral ?? 0)
    : direction === 'bearish'
      ? (detail.signals?.bearish ?? 0) >= (detail.signals?.neutral ?? 0)
      : false;
  const tfAlignment = [trendAligned, momentumAligned, flowAligned, direction !== 'neutral'].filter(Boolean).length;
  const dataQuality = getDataQualityLabel({ price: detail.price, atr: detail.atr, rsi: detail.rsi, adx: detail.adx, direction });
  const missingInputs = getMissingInputs({ price: detail.price, atr: detail.atr, rsi: detail.rsi, adx: detail.adx, direction });
  const scoreQualityWarnings = [
    detail.scoreQuality?.freshnessStatus && detail.scoreQuality.freshnessStatus !== 'fresh' ? `Freshness: ${detail.scoreQuality.freshnessStatus}` : null,
    (detail.scoreQuality?.missingEvidencePenalty ?? 0) > 0 ? `Missing evidence penalty: ${detail.scoreQuality?.missingEvidencePenalty}` : null,
    (detail.scoreQuality?.staleDataPenalty ?? 0) > 0 ? `Stale data penalty: ${detail.scoreQuality?.staleDataPenalty}` : null,
    (detail.scoreQuality?.liquidityPenalty ?? 0) > 0 ? `Liquidity penalty: ${detail.scoreQuality?.liquidityPenalty}` : null,
    ...(detail.rankWarnings ?? []),
  ].filter(Boolean) as string[];
  const dataQualityTitle = scoreQualityWarnings.length ? scoreQualityWarnings.join(' · ') : dataQualityDetail(dataQuality, missingInputs);
  const hasScenarioLevels = isUsableNumber(detail.price) && isUsableNumber(detail.atr) && direction !== 'neutral';

  const entry = hasScenarioLevels
    ? (direction === 'bullish' ? detail.price! + detail.atr! * 0.2 : detail.price! - detail.atr! * 0.2) : null;
  const stop = hasScenarioLevels
    ? (direction === 'bullish' ? detail.price! - detail.atr! * 0.8 : detail.price! + detail.atr! * 0.8) : null;
  const target1 = hasScenarioLevels
    ? (direction === 'bullish' ? detail.price! + detail.atr! * 1.7 : detail.price! - detail.atr! * 1.7) : null;
  const target2 = hasScenarioLevels
    ? (direction === 'bullish' ? detail.price! + detail.atr! * 2.7 : detail.price! - detail.atr! * 2.7) : null;
  const rr = hasScenarioLevels && entry != null && stop != null && target1 != null
    ? Math.max(0, Math.abs(target1 - entry) / Math.max(0.0001, Math.abs(entry - stop))) : null;
  const nextUsefulCheck = summarizeDetailNextCheck({ hasScenarioLevels, trendAligned, momentumAligned, flowAligned, dataQuality, direction, regime });

  const recommendation = detail.institutionalFilter?.recommendation;
  const alignedInputs = tfAlignment >= 3 && dataQuality === 'GOOD' && hasScenarioLevels && direction !== 'neutral';
  const rangeBreakNeedsConfirmation = regime === 'Range' && trendAligned;
  const highAlignment = (recommendation === LEGACY_MULTI_FACTOR_STATUS || alignedInputs) && quality !== 'LOW' && !rangeBreakNeedsConfirmation;
  const needsConfirmation = alignedInputs && rangeBreakNeedsConfirmation;
  const researchStatus = !hasScenarioLevels
    ? 'DATA WEAK — REVIEW'
    : highAlignment
      ? 'MULTI-FACTOR ALIGNMENT'
      : needsConfirmation
        ? 'RANGE BREAK CONFIRMATION NEEDED'
        : alignedInputs
          ? 'HIGH OBSERVATIONAL ALIGNMENT'
          : quality === 'MEDIUM' && direction !== 'neutral'
            ? 'MODERATE ALIGNMENT'
            : 'LOW ALIGNMENT — REVIEW';
  const statusColor = highAlignment ? '#10B981' : needsConfirmation || (quality === 'MEDIUM' && direction !== 'neutral') || alignedInputs ? '#F59E0B' : '#EF4444';
  const confBarColor = confidence >= 70 ? '#10B981' : confidence >= 55 ? '#F59E0B' : '#EF4444';

  const blockReasons = highAlignment
    ? ['Structure aligned', biasLabel(direction)]
    : [dataQuality !== 'GOOD' ? `Data quality: ${dataQuality.toLowerCase()}` : null, !hasScenarioLevels ? 'Reference levels unavailable' : null, quality === 'LOW' ? 'Quality below threshold' : null, !trendAligned ? 'Structure incomplete' : null, rangeBreakNeedsConfirmation ? 'Range regime needs breakout confirmation' : null, atrPercent >= 3 ? 'Volatility mismatch' : null].filter(Boolean) as string[];

  const agreementNote = highAlignment
    ? 'Multi-factor indicator agreement'
    : needsConfirmation
      ? 'Directional signals aligned; range confirmation needed'
      : alignedInputs
        ? 'High observational alignment'
        : 'Mixed indicator observations';
  const structureNote = highAlignment
    ? 'Indicators aligned'
    : needsConfirmation
      ? 'Await range break confirmation'
      : alignedInputs
        ? 'Aligned but not fully confirmed'
        : 'Review indicator alignment';

  const handleAddToWatchlist = async () => {
    try {
      const name = await addToWatchlist(detail.symbol, assetType, detail.price);
      setFlashMsg({ text: `${detail.symbol} added to ${name}`, type: 'success' });
    } catch (e: any) {
      setFlashMsg({ text: e?.message || 'Failed', type: 'error' });
    }
    setTimeout(() => setFlashMsg(null), 3000);
  };

  const handleSaveCase = async () => {
    try {
      setSavingCase(true);
      await saveResearchCase({
        sourceType: 'scanner-detail',
        title: `${detail.symbol} scanner research case`,
        researchCase: {
          symbol: detail.symbol,
          assetClass: assetType,
          sourceType: 'scanner-detail',
          generatedAt: new Date().toISOString(),
          dataQuality,
          title: `${detail.symbol} scanner research case`,
          thesis: `${detail.symbol} shows ${quality.toLowerCase()} scanner alignment on ${timeframeLabel}.`,
          setup: { direction, quality, confidence, regime, timeframe: timeframeLabel },
          truthLayer: {
            whatWeKnow: [
              `Scanner score is ${detail.score}.`,
              `Observed direction is ${direction}.`,
              `Confidence reading is ${confidence}%.`,
            ],
            whatWeDoNotKnow: [
              detail.price == null ? 'reference price' : null,
              detail.rsi == null ? 'RSI' : null,
              detail.adx == null ? 'ADX' : null,
            ].filter(Boolean),
            dataQuality,
            riskFlags: blockReasons,
            invalidation: isUsableNumber(stop) ? `Scenario invalidation reference: ${formatLevel(stop)}` : 'Scenario invalidation reference unavailable',
            nextUsefulCheck,
            disclaimer: 'Educational market research only. Not financial advice.',
          },
          scenarioPlan: {
            referenceLevel: entry,
            invalidationLevel: stop,
            reactionZones: [target1, target2].filter((value) => value != null),
            hypotheticalRr: rr,
          },
          technicals: {
            price: detail.price,
            rsi: detail.rsi,
            adx: detail.adx,
            atr: detail.atr,
            volume: detail.volume,
            signals: detail.signals,
          },
          disclaimer: 'Educational market research only. This is not financial advice and is not a recommendation to buy, sell, hold, or rebalance any financial product.',
        },
      });
      setFlashMsg({ text: 'Research case saved', type: 'success' });
    } catch (e: any) {
      setFlashMsg({ text: e?.message || 'Unable to save research case', type: 'error' });
    } finally {
      setSavingCase(false);
      setTimeout(() => setFlashMsg(null), 3000);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {flashMsg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${flashMsg.type === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-300 border' : 'border-rose-500/40 bg-rose-950/90 text-rose-300 border'}`}>
          {flashMsg.text}
          <button type="button" onClick={() => setFlashMsg(null)} className="ml-3 text-xs opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-emerald-300">Analysis view</div>
          <div className="text-[0.72rem] text-slate-500">Symbol case review from the active scanner workflow.</div>
        </div>
        <div className="flex items-center gap-2">
        <Link href={`/tools/workspace?tab=Backtest&symbol=${encodeURIComponent(detail.symbol)}`}
          className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-amber-200 no-underline hover:bg-amber-400/15 transition-colors">
          Open Historical Test
        </Link>
        <button type="button" onClick={onClose}
          className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">
          {returnLabel ?? 'Back to Scanner'}
        </button>
        </div>
      </div>

      {/* Header row */}
      <div className="grid gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:grid-cols-12 md:p-4">
        <div className="md:col-span-6">
          <div className="text-[1.05rem] font-black tracking-tight text-white md:text-[1.25rem]">{detail.symbol} — {timeframeLabel}</div>
          <div className="mt-1 text-xs leading-relaxed text-slate-300">
            {direction === 'bullish' ? 'Bullish' : direction === 'bearish' ? 'Bearish' : 'Neutral'} structure, {quality.toLowerCase()} setup quality. {nextUsefulCheck}
          </div>
          <div className={`mt-1 text-[0.82rem] font-extrabold uppercase ${direction === 'bullish' ? 'text-emerald-400' : direction === 'bearish' ? 'text-red-400' : 'text-amber-400'}`}>
            Bias: {direction === 'bullish' ? 'Bullish' : direction === 'bearish' ? 'Bearish' : 'Neutral'}
          </div>
          <div className="mt-1 text-[0.76rem] font-bold uppercase tracking-[0.06em] text-slate-400">
            Pattern: {direction === 'bullish' ? 'Trend Continuation Structure' : direction === 'bearish' ? 'Trend Reversal Structure' : 'Structure Developing'}
          </div>
          <div className="mt-2 text-[0.74rem] text-slate-400">
            Regime: <span className="font-bold text-white">{regime}</span> · Timeframe Alignment: <span className="font-bold text-white">{tfAlignment} / 4</span>
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Setup Quality</div>
          <div className="mt-1 text-[1.25rem] font-black text-white md:text-[1.45rem]">{confidence >= 75 ? 'A' : confidence >= 60 ? 'B' : confidence >= 45 ? 'C' : 'D'} Setup</div>
          <div className="text-[0.72rem] font-semibold text-slate-400">{confidence}% · {quality}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div style={{ width: `${confidence}%`, background: confBarColor, height: '100%' }} />
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="rounded-lg border p-3" style={{ borderColor: statusColor + '66', background: 'var(--msp-panel-2)' }}>
            <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Setup Alignment</div>
            <div className="mt-1 text-[0.88rem] font-black uppercase" style={{ color: statusColor }}>{researchStatus}</div>
            <div title={dataQualityTitle} className="mt-2 inline-flex rounded border px-2 py-0.5 text-[11px] font-bold uppercase" style={{ color: dataQualityColor(dataQuality), borderColor: dataQualityColor(dataQuality) + '55', backgroundColor: dataQualityColor(dataQuality) + '15' }}>
              Data {dataQuality}
            </div>
            {detail.providerStatus && (
              <DataFreshnessBadge status={detail.providerStatus} label={`${detail.providerStatus.provider}`} className="ml-2 mt-2" />
            )}
            <div className="mt-2 grid gap-1 text-[0.72rem] text-slate-400">
              {blockReasons.map(r => <div key={r}>• {r}</div>)}
            </div>
            {!highAlignment && (
              <div className="mt-2 text-[0.72rem] font-extrabold uppercase" style={{ color: statusColor }}>
                NOTE: QUALITY {quality} — REVIEW ALIGNMENT
              </div>
            )}
          </div>
          <div className="mt-2 text-[0.62rem] text-slate-600 leading-tight">Scores reflect indicator agreement, not profit probability. For educational analysis only. Not financial advice.</div>
        </div>
      </div>

      {/* Analysis grid */}
      <div className="grid gap-3 md:grid-cols-12">
        {/* Structure Analysis */}
        <div className="md:col-span-7 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:p-4">
          <div className="mb-3 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Structure Analysis</div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Trend Alignment</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Higher TF: <span className={`font-bold ${trendAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{trendAligned ? direction.toUpperCase() : 'NEUTRAL'}</span></div>
                <div>Mid TF: <span className={`font-bold ${momentumAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{momentumAligned ? direction.toUpperCase() : 'NEUTRAL'}</span></div>
                <div>Lower TF: <span className={`font-bold ${flowAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{flowAligned ? direction.toUpperCase() : 'MIXED'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Momentum State</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>RSI: <span className="font-bold text-white">{detail.rsi != null ? detail.rsi.toFixed(1) : 'N/A'}</span></div>
                <div>ADX: <span className={`font-bold ${adx >= 25 ? 'text-emerald-400' : adx >= 20 ? 'text-amber-400' : 'text-red-400'}`}>{detail.adx != null ? adx.toFixed(1) : 'N/A'}</span></div>
                <div>Flow: <span className={`font-bold ${flowAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{flowAligned ? 'Aligned' : 'Divergent'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Volatility &amp; Liquidity</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Volatility: <span className={`font-bold ${atrPercent >= 3 ? 'text-red-400' : atrPercent >= 1.5 ? 'text-amber-400' : 'text-emerald-400'}`}>{atrPercent >= 3 ? 'High' : atrPercent >= 1.5 ? 'Medium' : 'Controlled'}</span></div>
                <div>Range Compression: <span className={`font-bold ${atrPercent <= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>{atrPercent <= 1.5 ? 'Yes' : 'No'}</span></div>
                <div>Liquidity: <span className="font-bold text-white">{detail.volume ? 'Building' : 'Normal'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Structure Integrity</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Break Level: <span className="font-bold text-white">{formatLevel(entry)}</span></div>
                <div>Pullback Depth: <span className="font-bold text-white">{detail.atr != null && detail.price ? `${Math.min(99, Math.round((detail.atr / detail.price) * 100 * 18))}%` : 'N/A'}</span></div>
                <div>Pattern: <span className="font-bold text-white">{trendAligned ? 'Trend continuation' : 'Structure forming'}</span></div>
              </div>
            </div>
            {detail.rankExplanation && (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2.5">
                <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-emerald-300">Why This Rank</div>
                <div className="text-[0.74rem] leading-relaxed text-emerald-50">{detail.rankExplanation.summary}</div>
                <div className="mt-2 grid gap-1 text-[0.7rem] text-emerald-100/80">
                  {detail.rankExplanation.strengths.slice(0, 3).map((item) => <div key={item}>+ {item}</div>)}
                  {detail.rankExplanation.penalties.slice(0, 3).map((item) => <div key={item}>- {item}</div>)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Execution Plan */}
        <div className="md:col-span-5 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:p-4">
          <div className="mb-3 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Reference Levels</div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Level of Interest</div>
              <div>Reference: <span className="font-bold text-white">{formatLevel(entry)}</span></div>
              <div>Condition: <span className="font-bold text-white">{direction === 'bullish' ? 'Close above level' : direction === 'bearish' ? 'Close below level' : 'Awaiting directional structure'}</span></div>
              <div>Confirmation: <span className="font-bold text-white">{hasScenarioLevels ? 'Volume expansion' : 'Awaiting valid levels'}</span></div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Key Levels (Educational)</div>
              {!isUsableNumber(stop) && !isUsableNumber(target1) && !isUsableNumber(target2) && (rr == null || !hasScenarioLevels) ? (
                <div className="text-slate-500">All four levels unavailable — refresh scanner inputs.</div>
              ) : (
                <>
                  <div>Invalidation: <span className="font-bold text-red-400">{formatLevel(stop)}</span></div>
                  <div>Reaction Zone 1: <span className="font-bold text-emerald-400">{formatLevel(target1)}</span></div>
                  <div>Reaction Zone 2: <span className="font-bold text-emerald-400">{formatLevel(target2)}</span></div>
                  <div>Hypothetical R:R: <span className={`font-bold ${rr != null && rr >= 1.8 ? 'text-emerald-400' : 'text-amber-400'}`}>{rr != null && hasScenarioLevels ? rr.toFixed(1) : 'Unavailable'}</span></div>
                </>
              )}
            </div>
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-2.5 text-[0.74rem] text-blue-100">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-blue-300">Next Useful Check</div>
              <div>{nextUsefulCheck}</div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Analysis Notes</div>
              <div>Indicator Agreement: <span className={`font-bold ${highAlignment ? 'text-emerald-400' : 'text-amber-400'}`}>{agreementNote}</span></div>
              <div>Structure: <span className="font-bold text-white">{structureNote}</span></div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleSaveCase} disabled={savingCase}
                className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-blue-300 hover:bg-blue-500/20 disabled:cursor-wait disabled:opacity-70">
                {savingCase ? 'Saving...' : 'Save Case'}
              </button>
              <Link href={`/tools/workspace?tab=alerts&symbol=${encodeURIComponent(detail.symbol)}&price=${detail.price || ''}&direction=${direction}`}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-slate-400 no-underline hover:bg-slate-700/50 transition-colors">
                Set Alert
              </Link>
              <button type="button" onClick={handleAddToWatchlist}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-slate-400 hover:bg-slate-700/50 transition-colors">
                Add to Watchlist
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ScannerPage() {
  const { navigateTo, selectSymbol } = useV2();
  const { tier } = useUserTier();
  const regime = useRegime();

  /* ─── Scanner mode toggle ─── */
  const [mode, setMode] = useState<ScannerMode>('ranked');

  /* ─── V2 Ranked Scan state ─── */
  const [v2Timeframe, setV2Timeframe] = useState<ScanTimeframe>('daily');
  const equity = useScannerResults('equity', v2Timeframe);
  const crypto = useScannerResults('crypto', v2Timeframe);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All');
  const [sortKey, setSortKey] = useState<SortKey>('mspScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* ─── Pro Scan state ─── */
  const [proAsset, setProAsset] = useState<AssetClass>('crypto');
  const [proTimeframe, setProTimeframe] = useState<'15m' | '30m' | '1h' | '1d'>('1d');
  const [proDepth, setProDepth] = useState<ScanDepth>('light');
  const [proUniverseSize, setProUniverseSize] = useState(500);
  const [proMinConfidence, setProMinConfidence] = useState<number>(50);
  const [proMtfAlignment, setProMtfAlignment] = useState<number>(2);
  const [proVolState, setProVolState] = useState<string>('all');
  const [proSqueeze, setProSqueeze] = useState<'all' | 'squeeze'>('all');
  const [proIntent, setProIntent] = useState<'observe' | 'review'>('observe');
  const [proScanLoading, setProScanLoading] = useState(false);
  const [proScanResults, setProScanResults] = useState<any>(null);
  const [proScanError, setProScanError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(undefined);
  const [proDirection, setProDirection] = useState<'all' | 'long' | 'short'>('all');
  const [proQuality, setProQuality] = useState<'all' | 'high' | 'medium'>('all');
  const [proSort, setProSort] = useState<'rank' | 'confidence' | 'volatility' | 'trend'>('rank');
  const [proBulkViewMode, setProBulkViewMode] = useState<'table' | 'cards'>('table');

  /* ─── Shared detail state ─── */
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [symbolDetail, setSymbolDetail] = useState<SymbolDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const currentRegimeRaw = regime.data?.regime || 'trend';
  const currentRegime = normalizeRegimeKey(currentRegimeRaw);

  function isRegimeCompatible(r: ScanResult): boolean {
    return isRegimeCompatibleForRegime(r, currentRegimeRaw);
  }

  /* ─── V2 Ranked data ─── */
  const allResults: ScanResult[] = useMemo(() => {
    const eq = (equity.data?.results || []).map(r => ({ ...r, _assetClass: 'equity' as const }));
    const cr = (crypto.data?.results || []).map(r => ({ ...r, _assetClass: 'crypto' as const }));
    return [...eq, ...cr];
  }, [equity.data, crypto.data]);

  const rankedLocalDemo = Boolean(equity.data?.metadata?.localDemo || crypto.data?.metadata?.localDemo);
  const rankedProviderStatuses = useMemo(() => ([
    { label: 'Equity', status: equity.data?.metadata?.dataQuality?.providerStatus ?? null, quality: equity.data?.metadata?.dataQuality ?? null },
    { label: 'Crypto', status: crypto.data?.metadata?.dataQuality?.providerStatus ?? null, quality: crypto.data?.metadata?.dataQuality ?? null },
  ]), [equity.data, crypto.data]);

  const filtered = useMemo(() => {
    let items = allResults;
    switch (activeTab) {
      case 'Equities': items = items.filter(r => (r as any)._assetClass === 'equity'); break;
      case 'Crypto': items = items.filter(r => (r as any)._assetClass === 'crypto'); break;
      case 'Bullish': items = items.filter(r => r.direction === 'bullish'); break;
      case 'Bearish': items = items.filter(r => r.direction === 'bearish'); break;
      case 'High Score': items = items.filter(r => Math.abs(r.score) >= 5); break;
      case 'DVE Signals': items = items.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)); break;
      case 'Squeeze': items = items.filter(r => r.dveFlags?.includes('SQUEEZE_FIRE')); break;
      case 'Regime Match': items = items.filter(r => isRegimeCompatible(r)); break;
    }
    items.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'symbol': av = a.symbol; bv = b.symbol; break;
        case 'score': av = a.score ?? 0; bv = b.score ?? 0; break;
        case 'mspScore': av = computeMspScore(a, currentRegime); bv = computeMspScore(b, currentRegime); break;
        case 'direction': av = a.direction ?? ''; bv = b.direction ?? ''; break;
        case 'confidence': av = a.confidence ?? 0; bv = b.confidence ?? 0; break;
        case 'rsi': av = a.rsi ?? 0; bv = b.rsi ?? 0; break;
        case 'price': av = a.price ?? 0; bv = b.price ?? 0; break;
        case 'dveBbwp': av = a.dveBbwp ?? 0; bv = b.dveBbwp ?? 0; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return items;
  }, [allResults, activeTab, sortKey, sortDir]);

  const rankedRows = useMemo(
    () => filtered.filter((r): r is ScanResult => Boolean(r && typeof r === 'object' && typeof r.symbol === 'string' && r.symbol.trim().length > 0)),
    [filtered],
  );

  const tabCounts = useMemo(() => ({
    All: allResults.length,
    Equities: allResults.filter(r => (r as any)._assetClass === 'equity').length,
    Crypto: allResults.filter(r => (r as any)._assetClass === 'crypto').length,
    Bullish: allResults.filter(r => r.direction === 'bullish').length,
    Bearish: allResults.filter(r => r.direction === 'bearish').length,
    'High Score': allResults.filter(r => Math.abs(r.score) >= 5).length,
    'DVE Signals': allResults.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)).length,
    Squeeze: allResults.filter(r => r.dveFlags?.includes('SQUEEZE_FIRE')).length,
    'Regime Match': allResults.filter(r => isRegimeCompatible(r)).length,
  }), [allResults, currentRegime]);

  const v2Loading = rankedRows.length === 0 && (equity.loading || crypto.loading);
  const v2PartialLoading = rankedRows.length > 0 && (equity.loading || crypto.loading);

  /* ─── Track last successful scan timestamp (E) ─── */
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!v2Loading && (equity.data || crypto.data)) {
      setLastScanAt(new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v2Loading]);

  /* ─── Register scanner data for Arca AI context ─── */
  const aiData = useMemo(() => {
    const topPicks = rankedRows.slice(0, 20).map(r => ({
      symbol: r.symbol,
      score: r.score,
      mspScore: computeMspScore(r, currentRegime),
      direction: r.direction,
      confidence: r.confidence,
      rsi: r.rsi,
      price: r.price,
      dveBbwp: r.dveBbwp,
      dveSignalType: r.dveSignalType,
      lifecycle: deriveLifecycleState(r, currentRegime),
      setup: r.setup,
    }));
    const bullish = rankedRows.filter(r => r.direction === 'bullish').length;
    const bearish = rankedRows.filter(r => r.direction === 'bearish').length;
    return {
      mode,
      regime: currentRegime,
      timeframe: mode === 'ranked' ? v2Timeframe : proTimeframe,
      assetClass: mode === 'ranked' ? 'all' : proAsset,
      totalResults: rankedRows.length,
      bullishCount: bullish,
      bearishCount: bearish,
      topPicks,
      ...(proScanResults && {
        proScanTotalScanned: proScanResults.totalScanned,
        proScanAverageConfidence: proScanResults.averageConfidence,
        proScanBullish: proScanResults.bullish,
        proScanBearish: proScanResults.bearish,
      }),
      ...(symbolDetail && {
        selectedSymbol: symbolDetail.symbol,
        selectedScore: symbolDetail.score,
        selectedDirection: symbolDetail.direction,
        selectedPrice: symbolDetail.price,
        selectedRsi: symbolDetail.rsi,
        selectedAdx: symbolDetail.adx,
        selectedAtr: symbolDetail.atr,
        selectedCci: symbolDetail.cci,
        selectedMacdHist: symbolDetail.macd_hist,
        selectedConfidence: symbolDetail.confidence,
        selectedSetup: symbolDetail.setup,
        selectedInstitutionalFilter: symbolDetail.institutionalFilter,
      }),
    };
  }, [mode, currentRegime, v2Timeframe, proTimeframe, proAsset, rankedRows, proScanResults, symbolDetail]);

  const aiSymbols = useMemo(() =>
    selectedSymbol ? [selectedSymbol] : rankedRows.slice(0, 5).map(r => r.symbol),
    [selectedSymbol, rankedRows]
  );

  const aiSummary = useMemo(() => {
    if (symbolDetail) {
      return `${symbolDetail.symbol} — Score: ${symbolDetail.score}, Direction: ${symbolDetail.direction}, RSI: ${symbolDetail.rsi ?? 'N/A'}, ADX: ${symbolDetail.adx ?? 'N/A'}`;
    }
    const bullish = rankedRows.filter(r => r.direction === 'bullish').length;
    const bearish = rankedRows.filter(r => r.direction === 'bearish').length;
    return `Scanner: ${rankedRows.length} results, ${bullish} bullish / ${bearish} bearish, Regime: ${currentRegime}, Timeframe: ${mode === 'ranked' ? v2Timeframe : proTimeframe}`;
  }, [symbolDetail, rankedRows, currentRegime, mode, v2Timeframe, proTimeframe]);

  useRegisterPageData('scanner', aiData, aiSymbols, aiSummary);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  /* ─── Fetch single symbol detail ─── */
  const loadSymbolDetail = useCallback(async (symbol: string, tf: string, asset: string) => {
    setSelectedSymbol(symbol);
    setDetailLoading(true);
    setSymbolDetail(null);
    try {
      const res = await fetch('/api/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: asset, timeframe: tf, minScore: 0, symbols: [symbol] }),
      });
      const data = await res.json();
      if (data.success && data.results?.length > 0) {
        setSymbolDetail({ ...data.results[0], providerStatus: data.metadata?.dataQuality?.providerStatus ?? null });
      } else {
        setSymbolDetail({ symbol, score: 0, direction: 'neutral' });
      }
    } catch {
      setSymbolDetail({ symbol, score: 0, direction: 'neutral' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ─── V2 row click ─── */
  const handleV2RowClick = useCallback((r: ScanResult) => {
    const asset = (r as any)._assetClass === 'crypto' ? 'crypto' : 'equity';
    const tfMap: Record<string, string> = { daily: '1d', weekly: '1d', '1h': '1h', '15m': '15m' };
    loadSymbolDetail(r.symbol, tfMap[v2Timeframe] || '1d', asset);
  }, [v2Timeframe, loadSymbolDetail]);

  /* ─── Pro Scan: run bulk scan ─── */
  const runProScan = useCallback(async () => {
    setProScanLoading(true);
    setProScanError(null);
    setProScanResults(null);
    setSelectedSymbol(null);
    setSymbolDetail(null);
    try {
      const payload: any = { type: proAsset, timeframe: proTimeframe };
      if (proAsset === 'crypto') {
        payload.mode = proDepth;
        if (proDepth === 'light') payload.universeSize = proUniverseSize;
      } else {
        payload.mode = 'hybrid';
      }
      const res = await fetch('/api/scanner/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { setProScanError('Please log in to use the scanner'); return; }
        setProScanError(data?.error || `Server returned ${res.status}`);
        return;
      }
      setProScanResults(data);
    } catch (e: any) {
      setProScanError(e?.message || 'Network error');
    } finally {
      setProScanLoading(false);
    }
  }, [proAsset, proTimeframe, proDepth, proUniverseSize]);

  /* ─── Pro Scan: template apply ─── */
  const applyTemplate = useCallback((tmpl: ScanTemplate) => {
    setActiveTemplateId(tmpl.id);
    setProMinConfidence(tmpl.config.minConfidence);
    setProMtfAlignment(tmpl.config.mtfAlignment);
    setProVolState(tmpl.config.volatilityState);
    if (tmpl.config.direction) setProDirection(tmpl.config.direction as 'all' | 'long' | 'short');
    if (tmpl.config.quality) setProQuality(tmpl.config.quality as 'all' | 'high' | 'medium');
  }, []);

  /* ─── Pro scan filtered results → ScreenerRow[] ─── */
  const proScreenerRows: ScreenerRow[] = useMemo(() => {
    if (!proScanResults?.topPicks) return [];
    return proScanResults.topPicks
      .map((pick: any, idx: number) => {
        const ind = pick.indicators || {};
        const scoreV2 = pick.scoreV2;
        const conf = scoreV2?.final?.confidence ?? pick.confidence ?? Math.min(99, Math.max(10, Math.round(pick.score ?? 50)));
        const dir = (pick.direction === 'bullish' ? 'LONG' : pick.direction === 'bearish' ? 'SHORT' : 'NEUTRAL') as 'LONG' | 'SHORT' | 'NEUTRAL';
        const qual = scoreV2?.final?.qualityTier ?? (conf >= 70 ? 'high' : conf >= 50 ? 'medium' : 'low');
        const pickRsi = pick.rsi ?? ind.rsi;
        const adxVal = pick.adx ?? ind.adx ?? 0;
        const atr = pick.atr ?? ind.atr ?? 0;
        const priceVal = pick.price ?? ind.price ?? 0;
        const atrPct = priceVal > 0 ? (atr / priceVal) * 100 : (ind.atr_percent ?? 0);
        const trendOk = dir === 'LONG' ? (pick.signals?.bullish ?? 0) > (pick.signals?.bearish ?? 0) : dir === 'SHORT' ? (pick.signals?.bearish ?? 0) > (pick.signals?.bullish ?? 0) : false;
        const momOk = pickRsi != null && ((dir === 'LONG' && pickRsi > 45) || (dir === 'SHORT' && pickRsi < 55));
        const flowOk = dir === 'LONG' ? (pick.signals?.bullish ?? 0) >= (pick.signals?.neutral ?? 0) : dir === 'SHORT' ? (pick.signals?.bearish ?? 0) >= (pick.signals?.neutral ?? 0) : false;
        const tfA = [trendOk, momOk, flowOk, dir !== 'NEUTRAL'].filter(Boolean).length;
        const strat = pick.setup || (pick.macd_hist != null && pick.macd_hist > 0 ? 'MOM REV' : pickRsi != null && pickRsi < 35 ? 'MEAN REV' : atrPct < 1.5 ? 'BREAKOUT' : 'RANGE');
        const rec = pick.institutionalFilter?.recommendation;
        const dataQuality = getDataQualityLabel({ price: priceVal, atr, rsi: pickRsi, adx: adxVal, direction: pick.direction });
        const missingInputs = getMissingInputs({ price: priceVal, atr, rsi: pickRsi, adx: adxVal, direction: pick.direction });
        const dataQualityDetailText = dataQualityDetail(dataQuality, missingInputs);
        const blockReasons = scoreV2?.execution?.blockReasons || [];
        const strategyKey = String(strat).toLowerCase();
        const rangeConfirmationNeeded = currentRegime === 'range'
          && dir !== 'NEUTRAL'
          && !strategyKey.includes('range_fade')
          && !strategyKey.includes('mean_reversion');
        const reason = dataQuality !== 'GOOD' ? dataQualityDetailText.replace(/\.$/, '')
          : blockReasons.includes('risk_mode_block') ? 'Risk mode blocks escalation'
          : blockReasons.includes('tf_alignment_low') ? 'Alignment below threshold'
          : strategyKey.includes('range_break') ? 'Range break watch — needs expansion confirmation'
          : rangeConfirmationNeeded ? 'Directional setup inside range — confirm break/fade'
          : tfA >= 4 && qual !== 'low' ? 'Multi-timeframe agreement'
          : atrPct < 1.5 ? 'Compression setup'
          : ind.momentumAccel ? 'Momentum acceleration'
          : trendOk ? 'Trend alignment'
          : 'Mixed evidence';
        const enginePermission = scoreV2?.execution?.permission;
        const perm = enginePermission === 'blocked' || rec === LEGACY_LOW_ALIGNMENT_STATUS || qual === 'low' || dataQuality === 'MISSING'
            ? 'BLOCKED'
            : rangeConfirmationNeeded && dataQuality === 'GOOD'
              ? 'TIGHT'
              : enginePermission === 'allowed' && dataQuality === 'GOOD'
                ? 'COMPLIANT'
            : rec === LEGACY_MULTI_FACTOR_STATUS && qual !== 'low' && dataQuality === 'GOOD'
              ? 'COMPLIANT'
              : 'TIGHT';
        return {
          rank: idx + 1, symbol: pick.symbol, direction: dir, confidence: conf, quality: qual,
          strategy: strat, rsi: pickRsi, adx: adxVal, atrPct, tfAlignment: tfA,
          volume24h: pick.volume ?? ind.volume, price: priceVal, permission: perm,
          squeeze: ind.squeeze ?? false, squeezeStrength: ind.squeezeStrength ?? 0,
          momentumAccel: ind.momentumAccel ?? false, momentumAccelScore: ind.momentumAccelScore ?? 0,
          sectorRelStr: ind.sectorRelStr, reason, dataQuality, dataQualityDetail: dataQualityDetailText,
        } as ScreenerRow;
      })
      .filter((row: ScreenerRow) => {
        if (proDirection !== 'all' && ((proDirection === 'long' && row.direction !== 'LONG') || (proDirection === 'short' && row.direction !== 'SHORT'))) return false;
        if (proQuality !== 'all' && row.quality !== proQuality) return false;
        if (row.confidence < proMinConfidence) return false;
        if (row.tfAlignment != null && row.tfAlignment < proMtfAlignment) return false;
        if (proVolState !== 'all') {
          const atr = row.atrPct ?? 0;
          if (proVolState === 'low' && atr > 1.5) return false;
          if (proVolState === 'moderate' && (atr < 1.5 || atr > 3)) return false;
          if (proVolState === 'high' && atr < 3) return false;
        }
        if (proSqueeze === 'squeeze' && !row.squeeze) return false;
        return true;
      })
      .map((row: ScreenerRow, index: number) => ({ ...row, rank: index + 1 }));
  }, [proScanResults, proDirection, proQuality, proMinConfidence, proMtfAlignment, proVolState, proSqueeze, currentRegime]);

  /* ─── Pro scan row click ─── */
  const handleProRowClick = useCallback((row: ScreenerRow) => {
    const direction = row.direction === 'LONG' ? 'bullish' : row.direction === 'SHORT' ? 'bearish' : 'neutral';
    const atr = row.price && row.atrPct != null ? row.price * (row.atrPct / 100) : undefined;
    const signalCount = Math.max(1, row.tfAlignment ?? 0);
    setSelectedSymbol(row.symbol);
    setDetailLoading(false);
    setSymbolDetail({
      symbol: row.symbol,
      score: row.confidence,
      direction,
      price: row.price,
      rsi: row.rsi,
      adx: row.adx,
      atr,
      confidence: row.confidence,
      setup: row.strategy,
      signals: direction === 'bullish'
        ? { bullish: signalCount, bearish: 1, neutral: 1 }
        : direction === 'bearish'
          ? { bullish: 1, bearish: signalCount, neutral: 1 }
          : { bullish: 1, bearish: 1, neutral: signalCount },
    });
  }, []);

  /* ─── Detail section (shared between both modes) ─── */
  const detailTimeframeLabel = mode === 'ranked'
    ? (v2Timeframe === '15m' ? '15M' : v2Timeframe === '1h' ? '1H' : v2Timeframe === 'weekly' ? 'W' : 'D')
    : proTimeframe.toUpperCase();
  const detailAssetType = mode === 'ranked' ? 'crypto' : proAsset;
  const activeScannerStage: ScannerStage = selectedSymbol ? 'analysis' : mode;
  const selectScannerMode = useCallback((nextMode: ScannerMode) => {
    setMode(nextMode);
    setSelectedSymbol(null);
    setSymbolDetail(null);
  }, []);
  const canOpenAnalysis = Boolean(selectedSymbol) || (mode === 'ranked' ? rankedRows.length > 0 : proScreenerRows.length > 0);
  const openScannerAnalysis = useCallback(() => {
    if (selectedSymbol) return;
    if (mode === 'ranked') {
      const firstResult = rankedRows[0];
      if (firstResult) handleV2RowClick(firstResult);
      return;
    }
    const firstResult = proScreenerRows[0];
    if (firstResult) handleProRowClick(firstResult);
  }, [selectedSymbol, mode, rankedRows, proScreenerRows, handleV2RowClick, handleProRowClick]);

  function SortHeader({ k, label, w }: { k: SortKey; label: string; w: string }) {
    return (
      <th className={`${w} text-left py-2 px-2 whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="text-left text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
          aria-label={`Sort scanner table by ${label}`}
        >
          {label} {sortKey === k ? (sortDir === 'desc' ? '▼' : '▲') : ''}
        </button>
      </th>
    );
  }

  /* ─── Command header derived values ─── */
  const queueCount = mode === 'ranked' ? rankedRows.length : proScreenerRows.length;
  const universeCount = proScanResults?.scanned ?? null;
  const headerStage: ScannerStage = activeScannerStage;
  const modeLabel = headerStage === 'ranked' ? 'Ranked queue' : headerStage === 'pro' ? 'Pro scan' : 'Symbol analysis';
  const modeDetail = headerStage === 'ranked'
    ? 'Auto-ranked market queue'
    : headerStage === 'pro'
      ? 'Manual scan filters'
      : selectedSymbol ? `Reviewing ${selectedSymbol}` : 'Reviewing case';
  const queueValue = headerStage === 'analysis' && selectedSymbol
    ? selectedSymbol
    : queueCount > 0
      ? `${queueCount} ${headerStage === 'pro' ? 'candidates' : 'symbols'}`
      : 'Empty';
  const queueTone = queueCount > 0 || headerStage === 'analysis' ? '#10B981' : '#94A3B8';
  const queueDetail = headerStage === 'analysis'
    ? 'Active analysis case'
    : headerStage === 'pro'
      ? universeCount != null ? `Scanned ${universeCount} symbols` : 'Run Educational Scan to populate'
      : v2Loading ? 'Loading market data…' : queueCount > 0 ? 'Sorted by MSP score' : 'Awaiting scan results';
  const dataIssues = [
    rankedLocalDemo ? 'Local demo rows' : null,
    proScanResults?.dataQuality?.source === 'local_demo' ? 'Pro demo rows' : null,
    equity.error ? 'Equity feed' : null,
    crypto.error ? 'Crypto feed' : null,
    proScanError ? 'Pro scan error' : null,
  ].filter(Boolean) as string[];
  const dataLoadingCount = [equity.loading, crypto.loading, proScanLoading, detailLoading].filter(Boolean).length;
  const dataHealthValue = dataIssues.length ? `${dataIssues.length} issue${dataIssues.length === 1 ? '' : 's'}` : dataLoadingCount ? `${dataLoadingCount} loading` : 'Ready';
  const dataHealthTone = dataIssues.length ? '#F59E0B' : dataLoadingCount ? '#94A3B8' : '#10B981';
  const dataHealthDetail = dataIssues.length ? dataIssues.join(', ') : dataLoadingCount ? 'Feeds syncing' : 'No feed errors reported';
  const topRankedSymbol = rankedRows[0]?.symbol;
  const topProSymbol = proScreenerRows[0]?.symbol;
  const headerTopSymbol = selectedSymbol || (mode === 'ranked' ? topRankedSymbol : topProSymbol);
  const nextCheckValue = headerStage === 'analysis'
    ? 'Validate in Golden Egg'
    : headerStage === 'pro'
      ? proScanResults
        ? topProSymbol ? `Review ${topProSymbol}` : 'Tighten filters'
        : 'Run Educational Scan'
      : topRankedSymbol ? `Review ${topRankedSymbol}` : v2Loading ? 'Loading queue…' : 'Awaiting ranked data';
  const nextCheckDetail = headerStage === 'analysis'
    ? 'Open Golden Egg from this case'
    : headerStage === 'pro'
      ? proScanResults ? 'Click a row to inspect a candidate' : 'Configure filters then run scan'
      : topRankedSymbol ? 'Top-ranked candidate' : 'Cached scanner data syncing';
  const nextCheckTone = (headerStage === 'analysis' || headerTopSymbol) ? '#FBBF24' : '#94A3B8';
  const goldenEggHref = headerTopSymbol ? `/tools/golden-egg?symbol=${encodeURIComponent(headerTopSymbol)}` : '/tools/golden-egg';
  const showRegimeChip = Boolean(regime.data);
  const regimeColor = currentRegime === 'trend' || currentRegime === 'risk_on' || currentRegime === 'expansion'
    ? '#10B981'
    : currentRegime === 'risk_off'
      ? '#EF4444'
      : currentRegime === 'compression' || currentRegime === 'transition'
        ? '#F59E0B'
        : '#A5B4FC';
  const riskLevel = regime.data?.riskLevel || 'moderate';
  const riskColor = riskLevel === 'low' ? '#10B981' : riskLevel === 'moderate' ? '#F59E0B' : '#EF4444';
  const permission = regime.data?.permission || 'full';
  const permissionLabel = permission === 'full' ? 'Allowed' : permission === 'reduced' ? 'Reduced' : 'Blocked';
  const permissionColor = permission === 'full' ? '#10B981' : permission === 'reduced' ? '#F59E0B' : '#EF4444';
  const weightTooltip = Object.entries(REGIME_WEIGHTS[currentRegime] || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-3">
      <section
        className="rounded-lg border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
        aria-label="Scanner command header"
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
              <span className="text-emerald-300">Workflow step 1 · Market research queue</span>
              {showRegimeChip && (
                <span
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-300"
                  title={weightTooltip ? `Regime weights — ${weightTooltip}` : undefined}
                >
                  <span style={{ color: regimeColor }}>{String(regime.data?.regime || '').replace(/_/g, ' ')}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">Risk <span style={{ color: riskColor }}>{riskLevel}</span></span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">Regime <span style={{ color: permissionColor }}>{permissionLabel}</span></span>
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Find the highest-evidence research queue.</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Ranked auto-triages the market. Pro lets you configure conditions. Analysis sends one symbol into Golden Egg.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {headerStage === 'analysis' ? (
                <button type="button" onClick={() => { setSelectedSymbol(null); setSymbolDetail(null); }} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15">Back to {mode === 'ranked' ? 'Ranked' : 'Pro'}</button>
              ) : (
                <button type="button" onClick={() => selectScannerMode(mode === 'pro' ? 'pro' : 'ranked')} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15">{mode === 'pro' ? 'Configure Pro Scan' : 'Refresh Ranked Queue'}</button>
              )}
              <Link href={goldenEggHref} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 no-underline transition-colors hover:bg-amber-400/15">{headerTopSymbol ? `Validate ${headerTopSymbol}` : 'Open Golden Egg'}</Link>
              <Link href="/tools/terminal" className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15">Open Terminal</Link>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <ScannerMetric label="Mode" value={modeLabel} tone="#A5B4FC" detail={modeDetail} />
            <ScannerMetric label={headerStage === 'analysis' ? 'Symbol' : 'Queue'} value={queueValue} tone={queueTone} detail={queueDetail} />
            <ScannerMetric label="Data Health" value={dataHealthValue} tone={dataHealthTone} detail={dataHealthDetail} />
            <ScannerMetric label="Next Check" value={nextCheckValue} tone={nextCheckTone} detail={nextCheckDetail} />
          </div>
        </div>
      </section>

      <ComplianceDisclaimer compact />

      <ScannerFlowRail
        activeStage={activeScannerStage}
        selectedSymbol={selectedSymbol}
        onSelectMode={selectScannerMode}
        onSelectAnalysis={openScannerAnalysis}
        canOpenAnalysis={canOpenAnalysis}
      />

      {/* ═══════════════════════════════ V2 RANKED SCAN ═══════════════════════════════ */}
      {mode === 'ranked' && !selectedSymbol && (
        <>
          {/* Timeframe selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500 mr-1 uppercase">Timeframe</span>
            {SCAN_TIMEFRAMES.map(tf => (
              <button key={tf.value} type="button" aria-pressed={v2Timeframe === tf.value} onClick={() => setV2Timeframe(tf.value)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${v2Timeframe === tf.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-[var(--msp-border)]'}`}>
                {tf.label}
              </button>
            ))}
          </div>

          {/* Tabs — dropdown on mobile, pills on desktop */}
          <div className="md:hidden">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as typeof activeTab)}
              className="w-full rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {TABS.map(tab => {
                const count = tabCounts[tab];
                return <option key={tab} value={tab}>{tab} ({count})</option>;
              })}
            </select>
          </div>
          <div className="hidden md:flex items-center gap-1 overflow-x-auto pb-1">
            {TABS.map(tab => (
              <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}>
                {tab}
                <span className="ml-1 text-[11px] text-slate-600">
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            {[
              ['Symbols', String(filtered.length), '#CBD5E1'],
              ['Aligned Scenarios', String(filtered.filter(r => deriveLifecycleState(r, currentRegime) === 'READY').length), '#10B981'],
              ['Developing', String(filtered.filter(r => deriveLifecycleState(r, currentRegime) === 'SETTING_UP').length), '#A855F7'],
              ['Needs Review', String(filtered.filter(r => r.scoreV2?.regimeScore?.gated).length), '#EF4444'],
              ['Degraded Data', String(filtered.filter(r => rankedTrustLabel(r) !== 'GOOD').length), '#F59E0B'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
                <div className="mt-0.5 text-base font-black" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {rankedLocalDemo && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Local demo scanner rows:</strong> live market data keys/cache are unavailable in this local environment, so these rows are sample data for workflow testing only. Do not treat them as live scanner output.
            </div>
          )}

          <MarketStatusStrip
            items={rankedProviderStatuses.map(({ label, status, quality }) => ({
              label,
              status,
              source: quality?.source,
              coverageScore: quality?.coverageScore,
              computedAt: quality?.computedAt,
              warnings: quality?.warnings,
            }))}
          />

          {/* Results */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>{v2PartialLoading ? 'Showing available rows while the other market finishes loading.' : 'Click or press Enter on a row to open symbol analysis.'}</span>
              <span className="text-slate-600">Sorted by {sortKey} ({sortDir})</span>
            </div>
            {v2Loading ? (
              <div className="space-y-3 py-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />)}</div>
            ) : rankedRows.length === 0 ? (
              <div className="text-xs text-slate-500 py-12 text-center">No results match this filter.</div>
            ) : (
              <>
              <RankedMobileCards rows={rankedRows} activeRegime={currentRegime} onRowClick={handleV2RowClick} />
              <div className="hidden overflow-x-auto -mx-1 md:block">
                <table className="w-full text-xs" style={{ minWidth: 1040 }} aria-label="Ranked scanner results">
                  <thead>
                    <tr className="border-b border-[var(--msp-border)]">
                      <SortHeader k="symbol" label="Symbol" w="w-20" />
                      <SortHeader k="mspScore" label="MSP" w="w-14" />
                      <SortHeader k="price" label="Price" w="w-20" />
                      <SortHeader k="direction" label="Bias" w="w-16" />
                      <SortHeader k="confidence" label="Alignment" w="w-16" />
                      <th className="w-24 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Reason</th>
                      <th className="w-16 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Trust</th>
                      <th className="w-20 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">DVE</th>
                      <th className="w-16 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Regime</th>
                      <th className="w-16 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Lifecycle</th>
                      <th className="w-16 text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedRows.map((r) => {
                      const regimeLabel = r.scoreV2?.regime?.label || r.type || '';
                      const msp = computeMspScore(r, currentRegime);
                      const lifecycle = deriveLifecycleState(r, currentRegime);
                      const mspColor = msp >= 70 ? '#10B981' : msp >= 50 ? '#F59E0B' : msp >= 30 ? '#94A3B8' : '#EF4444';
                      const regimeCompatible = isRegimeCompatible(r);
                      const trust = rankedTrustLabel(r);
                      const reason = summarizeRankedReason(r, lifecycle, regimeCompatible, currentRegime);
                      const trustDetail = rankedTrustDetail(r);
                      return (
                        <tr
                          key={r.symbol}
                          role="button"
                          tabIndex={0}
                          className="border-b border-slate-800/40 hover:bg-slate-800/30 focus:bg-slate-800/40 focus:outline-none cursor-pointer transition-colors"
                          onClick={() => handleV2RowClick(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleV2RowClick(r);
                            }
                          }}
                          aria-label={`Review scenario for ${r.symbol}`}
                        >
                          <td className="py-2.5 px-2 whitespace-nowrap"><div className="font-bold text-white">{r.symbol}</div><div className="text-[11px] text-slate-600">{regimeLabel}</div></td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap"><span className="text-sm font-black" style={{ color: mspColor }}>{msp}</span></td>
                          <td className="py-2.5 px-2 text-slate-300 font-mono whitespace-nowrap">{formatPrice(r.price)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap"><Badge label={compactBiasLabel(r.direction)} color={dirColor(r.direction)} small /></td>
                          <td className="py-2.5 px-2 text-slate-400 text-[11px] whitespace-nowrap">{r.confidence != null ? `${r.confidence}%` : '—'}</td>
                          <td className="py-2.5 px-2 text-[11px] whitespace-nowrap max-w-[110px] truncate text-slate-300" title={[reason, ...(r.rankExplanation?.strengths ?? []), ...(r.rankExplanation?.penalties ?? []), ...(r.rankExplanation?.warnings ?? [])].filter(Boolean).join(' · ')}>{reason}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span title={trustDetail} className="rounded border px-1.5 py-0.5 text-[11px] font-bold" style={{ color: dataQualityColor(trust), borderColor: dataQualityColor(trust) + '55', backgroundColor: dataQualityColor(trust) + '15' }}>
                              {trust}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[11px] whitespace-nowrap max-w-[80px] truncate">
                            {(() => {
                              if (r.dveSignalType && r.dveSignalType !== 'none') return <span className="text-yellow-400 font-semibold">{r.dveSignalType.replace(/_/g, ' ')}</span>;
                              if (r.dveFlags && r.dveFlags.length > 0) {
                                const fc: Record<string, string> = { SQUEEZE_FIRE: 'text-yellow-400', COMPRESSED: 'text-cyan-400', EXPANDING: 'text-amber-400', CLIMAX: 'text-red-400', BREAKOUT: 'text-emerald-400', HIGH_BREAKOUT: 'text-emerald-300', VOL_TRAP: 'text-red-300', EXHAUSTION_RISK: 'text-orange-400', DIR_BULL: 'text-emerald-400', DIR_BEAR: 'text-red-400', EXTENDED_PHASE: 'text-slate-400', CONTINUATION: 'text-amber-300', MOMENTUM_ACCEL: 'text-emerald-300' };
                                const top = r.dveFlags[0];
                                return <span className={fc[top] || 'text-slate-400'}>{top.replace(/_/g, ' ')}{r.dveFlags.length > 1 ? ` +${r.dveFlags.length - 1}` : ''}</span>;
                              }
                              return <span className="text-slate-600">—</span>;
                            })()}
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            {regimeCompatible
                              ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Match</span>
                              : r.scoreV2?.regimeScore?.gated
                                ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">Gated</span>
                                : <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-500 border border-slate-500/20">Neutral</span>}
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className="text-[11px] px-1.5 py-0.5 rounded border" style={{ color: LIFECYCLE_COLORS[lifecycle], borderColor: LIFECYCLE_COLORS[lifecycle] + '40', backgroundColor: LIFECYCLE_COLORS[lifecycle] + '15' }}>
                              {lifecycleLabel(lifecycle)}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleV2RowClick(r); }} className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 rounded text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors">Review</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/40">
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span>{rankedRows.length} symbols</span>
                {lastScanAt && (
                  <span className="text-slate-600">
                    · Last scan: {lastScanAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!canAccessUnlimitedScanning(tier) && (
                  <a href="/pricing" className="text-[11px] text-amber-400 hover:underline">
                    Free: {FREE_DAILY_SCAN_LIMIT}/day — Upgrade
                  </a>
                )}
                <button type="button" onClick={() => { equity.refetch(); crypto.refetch(); }} className="text-[11px] text-emerald-400 hover:underline">Rescan</button>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ═══════════════════════════════ PRO SCANNER ═══════════════════════════════ */}
      {mode === 'pro' && !selectedSymbol && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Pro Scanner">
        <>
          {/* Scan Configuration Form */}
          <div className="rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-4">
            <div className="grid gap-4 md:grid-cols-12">
              {/* Universe */}
              <div className="md:col-span-5 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Universe</div>
                <div className="mb-3">
                  <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Asset Class</div>
                  <div className="flex gap-1.5">
                    {(['crypto', 'equity', 'forex'] as const).map(ac => (
                      <button key={ac} onClick={() => setProAsset(ac)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase ${proAsset === ac ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                        {ac}
                      </button>
                    ))}
                  </div>
                </div>
                {proAsset === 'crypto' && proDepth === 'light' && (
                  <div className="mb-3">
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Universe</label>
                    <select value={proUniverseSize} onChange={e => setProUniverseSize(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                      <option value={5000}>5000</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Sector Filter</label>
                  <select className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                    <option value="all">All</option>
                  </select>
                </div>
              </div>

              {/* Structure */}
              <div className="md:col-span-7 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Structure</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Timeframe</label>
                    <select value={proTimeframe} onChange={e => setProTimeframe(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value="1d">1d</option><option value="1h">1h</option><option value="30m">30m</option><option value="15m">15m</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">MTF Alignment</label>
                    <select value={proMtfAlignment} onChange={e => setProMtfAlignment(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={2}>2/4+</option><option value={3}>3/4+</option><option value={4}>4/4</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Min Confidence</label>
                    <select value={proMinConfidence} onChange={e => setProMinConfidence(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={50}>50</option><option value={60}>60</option><option value={70}>70</option><option value={80}>80</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Vol State</label>
                    <select value={proVolState} onChange={e => setProVolState(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value="all">All</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Squeeze</label>
                  <select value={proSqueeze} onChange={e => setProSqueeze(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                    <option value="all">All</option><option value="squeeze">In Squeeze</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mode + Intent */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Mode</div>
                <div className="flex gap-1.5">
                  {(['light', 'deep'] as const).map(d => (
                    <button key={d} onClick={() => setProDepth(d)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase ${proDepth === d ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                      {d === 'light' ? 'Fast' : 'Deep'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                {(['observe', 'review'] as const).map(i => (
                  <button key={i} onClick={() => setProIntent(i)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase ${proIntent === i ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Button */}
            <button
              type="button"
              onClick={runProScan}
              disabled={proScanLoading}
              className={`mt-4 w-full rounded-md border px-3 py-2 text-[12px] font-black uppercase tracking-[0.1em] transition-colors ${
                proScanLoading
                  ? 'cursor-not-allowed border-amber-400/20 bg-amber-400/5 text-amber-200/60'
                  : 'border-amber-400/35 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
              }`}
            >
              {proScanLoading ? 'Analyzing…' : 'Run Educational Scan'}
            </button>
          </div>

          {/* Strategy Templates */}
          <ScanTemplatesBar onSelect={applyTemplate} activeId={activeTemplateId} />

          {/* Filters bar */}
          {proScanResults && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase text-slate-500">Bias:</label>
                <select value={proDirection} onChange={e => setProDirection(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="long">Bullish</option><option value="short">Bearish</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase text-slate-500">Quality:</label>
                <select value={proQuality} onChange={e => setProQuality(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="high">High</option><option value="medium">Medium</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase text-slate-500">Sort:</label>
                <select value={proSort} onChange={e => setProSort(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="rank">Rank</option><option value="confidence">Confluence</option><option value="volatility">Volatility</option><option value="trend">Trend</option>
                </select>
              </div>
              <div className="ml-auto flex gap-1">
                <button onClick={() => setProBulkViewMode('table')} className={`rounded px-2 py-1 text-[11px] font-bold ${proBulkViewMode === 'table' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>Table</button>
                <button onClick={() => setProBulkViewMode('cards')} className={`rounded px-2 py-1 text-[11px] font-bold ${proBulkViewMode === 'cards' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>Cards</button>
              </div>
            </div>
          )}

          {/* Pro Scan Error */}
          {proScanError && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{proScanError}</div>
          )}

          {proScanResults?.dataQuality?.source === 'local_demo' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Local demo Pro Scanner rows:</strong> live bulk scanner data is unavailable in this local environment, so these rows are sample research outputs for workflow testing only. Do not treat them as live scanner output.
            </div>
          )}

          {/* Pro Scan Results */}
          {proScanResults && (
            <div>
              <div className="mb-2 grid gap-2 md:grid-cols-5">
                {[
                  ['Scanned', String(proScanResults.scanned ?? '—'), '#CBD5E1'],
                  ['Candidates', String(proScreenerRows.length), '#10B981'],
                  ['Aligned', String(proScreenerRows.filter(r => r.permission === 'COMPLIANT').length), '#10B981'],
                  ['Mixed Evidence', String(proScreenerRows.filter(r => r.permission === 'TIGHT').length), '#F59E0B'],
                  ['Data Weak', String(proScreenerRows.filter(r => r.dataQuality !== 'GOOD').length), '#EF4444'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
                    <div className="mt-0.5 text-base font-black" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="mb-2 flex items-center gap-3 text-[11px] text-slate-500">
                <span>Scanned: {proScanResults.scanned ?? '—'}</span>
                <span>Duration: {proScanResults.duration ?? '—'}</span>
                <span>Mode: {proScanResults.mode ?? proDepth}</span>
                {proScanResults.effectiveUniverseSize && <span>Universe: {proScanResults.effectiveUniverseSize}</span>}
              </div>
              {proBulkViewMode === 'cards'
                ? <ProScannerCards rows={proScreenerRows} onRowClick={handleProRowClick} />
                : <ScreenerTable rows={proScreenerRows} onRowClick={handleProRowClick} selectedSymbol={selectedSymbol ?? undefined} />}
              <div className="mt-2 text-[11px] text-slate-600">
                Market Bias Context · Regime: {currentRegime.toUpperCase()} · Most observations: {proScreenerRows.filter(r => r.direction === 'LONG').length > proScreenerRows.filter(r => r.direction === 'SHORT').length ? 'Bullish bias' : 'Bearish bias'}
              </div>
            </div>
          )}

          {proScanLoading && (
            <div className="space-y-3 py-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}</div>
          )}
        </>
        </UpgradeGate>
      )}

      {/* ═══════════════════════════════ INLINE DETAIL PANEL ═══════════════════════════════ */}
      {selectedSymbol && (
        <>
          {detailLoading ? (
            <Card>
              <div className="flex items-center gap-3 py-8 justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <span className="text-sm text-slate-400">Loading analysis for {selectedSymbol}...</span>
              </div>
            </Card>
          ) : symbolDetail ? (
            <SymbolDetailPanel
              detail={symbolDetail}
              timeframeLabel={detailTimeframeLabel}
              onClose={() => { setSelectedSymbol(null); setSymbolDetail(null); }}
              assetType={detailAssetType}
              activeRegime={currentRegime}
              returnLabel={mode === 'ranked' ? 'Back to Ranked' : 'Back to Pro Scanner'}
            />
          ) : null}
        </>
      )}

      {/* Errors */}
      {mode === 'ranked' && (equity.error || crypto.error) && (
        <div className="text-[11px] text-red-400/60 border border-red-900/30 rounded-lg p-3">
          {equity.error && <div>Equity scan: {equity.error}</div>}
          {crypto.error && <div>Crypto scan: {crypto.error}</div>}
        </div>
      )}
    </div>
  );
}
