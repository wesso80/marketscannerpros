'use client';

import { compareScannerScores } from '@/lib/scanner/scoreContract';

/* ---------------------------------------------------------------------------
   UNIFIED SCANNER HUB — V2 Ranked + V1 Pro Scanner on one page
   Toggle between auto-loading regime-aware ranking and manual pro scan.
   Click any symbol for inline analysis with Backtest / Alert / Watchlist.
   --------------------------------------------------------------------------- */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { formatExclusionBreakdown, proCandidateMetrics, type ProScanFilters } from '@/lib/scanner/proSelection';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import { HIGH_MSP_SCORE, rowHasWeakData } from '@/lib/scanner/researchValidity';
import { legacyExecutionReason } from '@/lib/scanner/legacyReason';
import Link from 'next/link';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useScannerResults, useRegime, type ScanResult, type ScanTimeframe, SCAN_TIMEFRAMES } from '@/app/v2/_lib/api';
import { Card, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import { REGIME_WEIGHTS, LIFECYCLE_COLORS } from '@/app/v2/_lib/constants';
import { computeMspScore, deriveLifecycleState, isRegimeCompatibleForRegime, normalizeRegimeKey, setupTypeForRegime } from '@/lib/scanner/rankedQueue';
import { humanizeEnum } from '@/lib/presentation/labels';
import { buildAnalysisNarrative, classifySetupFamily } from '@/lib/scanner/analysisNarrative';
import { DATA_TRUST_LABEL } from '@/lib/scanner/dataTrust';
import type { RegimePriority, LifecycleState } from '@/app/v2/_lib/types';
import { useUserTier, FREE_DAILY_SCAN_LIMIT, canAccessUnlimitedScanning } from '@/lib/useUserTier';
import ScreenerTable, { type ScreenerRow } from '@/components/scanner/ScreenerTable';
import ScannerInsightStrip from '@/components/analysis/ScannerInsightStrip';
import CompositeBreakdown from '@/components/analysis/CompositeBreakdown';
import CanonicalVerdict from '@/components/analysis/CanonicalVerdict';
import { compareCanonicalRows } from '@/lib/scoring/canonical/scannerAdapter';
import ScanTemplatesBar, { type ScanTemplate, SCAN_TEMPLATES } from '@/components/scanner/ScanTemplatesBar';
import { useRegisterPageData } from '@/lib/ai/pageContext';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { saveResearchCase } from '@/lib/clientResearchCases';
import DataFreshnessBadge from '@/components/market/DataFreshnessBadge';
import MarketStatusStrip from '@/components/market/MarketStatusStrip';
import ScoreTypeBadge from '@/components/ui/ScoreTypeBadge';

/* ─── Helpers ─── */
function dirColor(d?: string) {
  if (d === 'bullish') return 'var(--msp-bull)';
  if (d === 'bearish') return 'var(--msp-bear)';
  return 'var(--msp-flat)';
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
  if (label === 'GOOD') return 'var(--msp-bull)';
  if (label === 'DEGRADED') return 'var(--msp-warn)';
  return 'var(--msp-bear)';
}

function ScannerMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
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
  // Prefer the real independent-factor evidence (Scanner rework) over the
  // rank-vs-leader summary, which reads as self-referential ("N points behind
  // the leader"). whyRanked names actual factors (trend, relative strength,
  // participation, volatility) and the setup stage.
  if (r.insight?.whyRanked && r.insight.whyRanked.length > 0) {
    const stageRaw = r.insight.setupStage;
    const stage = stageRaw.charAt(0) + stageRaw.slice(1).toLowerCase();
    return `${stage}: ${r.insight.whyRanked.slice(0, 3).join(' · ')}`;
  }
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

type RankedTrust = 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT DATA';
/** Shared verdict (lib/scanner/dataTrust via the API) first; the legacy heuristic only when a row predates it. */
function rankedTrustLabel(r: ScanResult): RankedTrust {
  if (String(r.setup || '').startsWith('Local demo:')) return 'DEGRADED';
  if (r.dataTrust) return DATA_TRUST_LABEL[r.dataTrust.level] as RankedTrust;
  if (!isUsableNumber(r.price)) return 'INSUFFICIENT DATA';
  if (r.scoreQuality?.freshnessStatus === 'missing') return 'INSUFFICIENT DATA';
  if (r.scoreQuality?.freshnessStatus === 'stale') return 'STALE';
  if ((r.scoreQuality?.missingEvidencePenalty ?? 0) > 0 || (r.scoreQuality?.liquidityPenalty ?? 0) > 0 || r.rankWarnings?.length) return 'DEGRADED';
  if (r.confidence == null || r.score == null) return 'DEGRADED';
  if (barIntervalMismatch(r)) return 'DEGRADED';
  return 'GOOD';
}

/** Crypto 'daily' rows are computed on 4h CoinGecko bars; flag it so RSI/ATR are not read as daily-bar values. */
function barIntervalMismatch(r: ScanResult): string | null {
  if (r.dataTrust) return r.dataTrust.intervalMismatch ? `indicators computed on ${r.barInterval} bars (not ${String(r.timeframe).toLowerCase()})` : null;
  const iv = r.barInterval;
  if (!iv) return null;
  const tf = String(r.timeframe || '').toLowerCase();
  const same = iv === tf || (iv === '1d' && (tf === 'daily' || tf === '1d')) || (iv === '1w' && tf === 'weekly');
  return same ? null : `indicators computed on ${iv} bars (not ${tf})`;
}

function rankedTrustDetail(r: ScanResult): string {
  if (String(r.setup || '').startsWith('Local demo:')) return 'Development-only sample row. Not live market data.';
  if (r.dataTrust) {
    const basis = r.dataBasis ? ` · ${r.dataBasis.barInterval} bars, last completed ${String(r.dataBasis.lastCompletedBarAt ?? 'n/a').slice(0, 16).replace('T', ' ')}` : '';
    return (r.dataTrust.reasons.length ? r.dataTrust.reasons.join(' · ') : 'Fresh completed bar; price, ATR, RSI, ADX and EMA200 available.') + basis;
  }
  if (!isUsableNumber(r.price)) return 'Missing usable price.';
  const qualityWarnings = [
    r.scoreQuality?.freshnessStatus && r.scoreQuality.freshnessStatus !== 'fresh' ? `freshness ${r.scoreQuality.freshnessStatus}` : null,
    (r.scoreQuality?.missingEvidencePenalty ?? 0) > 0 ? `missing evidence penalty ${r.scoreQuality?.missingEvidencePenalty}` : null,
    (r.scoreQuality?.staleDataPenalty ?? 0) > 0 ? `stale data penalty ${r.scoreQuality?.staleDataPenalty}` : null,
    (r.scoreQuality?.liquidityPenalty ?? 0) > 0 ? `liquidity penalty ${r.scoreQuality?.liquidityPenalty}` : null,
    barIntervalMismatch(r),
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

/**
 * Consistency rule (live-review H6): the panel-level "LIVE / Coverage" badge must
 * reflect the WEAKEST row, not assert LIVE over degraded/stale rows. If any row in
 * the asset class is DEGRADED/MISSING, downgrade the provider-status badge and
 * explain why. Pure — returns a new object, never mutates.
 */
function downgradeProviderStatusForRows(
  status: ProviderStatus | null | undefined,
  rows: ScanResult[] | undefined,
): ProviderStatus | null {
  if (!status) return status ?? null;
  if (!rows || rows.length === 0) return status;
  const total = rows.length;
  // Only genuinely stale / insufficient rows make the feed panel STALE. DEGRADED rows (e.g. EMA200 missing on a
  // 50-bar weekly series) are disclosed per row and counted here, not presented as a stale feed.
  const staleRows = rows.filter((r) => { const t = rankedTrustLabel(r); return t === 'STALE' || t === 'INSUFFICIENT DATA'; }).length;
  const degradedRows = rows.filter((r) => rankedTrustLabel(r) === 'DEGRADED').length;
  const bars = rows.map((r) => r.dataBasis?.lastCompletedBarAt).filter((x): x is string => Boolean(x)).sort();
  const newestBar = bars[bars.length - 1];
  const barNote = newestBar ? `last completed bar ${/^\d{4}-\d{2}-\d{2}$/.test(newestBar) ? newestBar : newestBar.slice(0, 16).replace('T', ' ') + ' UTC'}` : null;
  if (staleRows === 0 && degradedRows === 0) return barNote ? { ...status, warnings: [barNote, ...(status.warnings ?? [])] } : status;
  return {
    ...status,
    live: staleRows === 0 ? status.live : false,
    stale: staleRows > 0,
    degraded: true,
    alertLevel: status.alertLevel === 'critical' ? 'critical' : staleRows > 0 ? 'warning' : status.alertLevel,
    warnings: [
      ...(staleRows > 0 ? [`${staleRows} of ${total} rows stale or insufficient — panel reflects the weakest row.`] : []),
      ...(degradedRows > 0 ? [`${degradedRows} of ${total} rows degraded (see row Trust for the reason).`] : []),
      ...(barNote ? [barNote] : []),
      ...(status.warnings ?? []),
    ],
  };
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

const TABS = ['All', 'Equities', 'Crypto', 'Bullish', 'Bearish', 'High Score ≥70', 'DVE Signals', 'Squeeze', 'Regime Match'] as const;
const LEGACY_MULTI_FACTOR_STATUS = ['TRADE', 'READY'].join('_');
const LEGACY_LOW_ALIGNMENT_STATUS = ['NO', 'TRADE'].join('_');
type SortKey = 'symbol' | 'score' | 'direction' | 'confidence' | 'rsi' | 'price' | 'dveBbwp' | 'mspScore';
type SortDir = 'asc' | 'desc';

// Ranking helpers live in lib/scanner/rankedQueue so Scanner and Command Center share ONE research queue.

type ScannerMode = 'ranked' | 'pro';
type ScannerStage = ScannerMode | 'analysis';
type AssetClass = 'crypto' | 'equity' | 'forex';
/** Requested Pro Scanner universe; the server caps it per plan. */
const PRO_SCAN_UNIVERSE_SIZE = 500;

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
            <button key={stage.id} type="button" onClick={() => onSelectMode(selectableStage)} aria-pressed={isActive} className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50">
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
            aria-disabled={disabled}
            aria-pressed={isActive}
            className="block w-full rounded-md disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
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
            className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Rank {row.rank}</div>
                <div className="mt-1 text-lg font-black text-white">{row.symbol}</div>
              </div>
              <div className={`rounded-md border px-2 py-1 text-[11px] font-black uppercase ${researchTone}`}>
                {row.scorePermission ?? (row.permission === 'COMPLIANT' ? 'Aligned' : row.permission === 'BLOCKED' ? 'Not aligned' : 'Mixed')}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Bias</div>
                <div className={`mt-1 text-xs font-black ${biasColor}`}>{compactBiasLabel(row.direction)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">MSP score</div>
                <div title={row.scoreExplanation} className="mt-1 text-xs font-black text-white">{row.confidence}/100</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Factors</div>
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
    return <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-4 py-8 text-center text-sm text-slate-500 msp-scanner-mobile">No ranked scenarios match this filter.</div>;
  }

  return (
    <div className="msp-scanner-mobile-cards gap-3">
      {rows.map((row, index) => {
        const lifecycle = deriveLifecycleState(row, activeRegime);
        const msp = computeMspScore(row, activeRegime);
        const trust = rankedTrustLabel(row);
        const trustDetail = rankedTrustDetail(row);
        const reason = summarizeRankedReason(row, lifecycle, isRegimeCompatibleForRegime(row, activeRegime), activeRegime);
        const mspColor = msp >= 70 ? 'var(--msp-bull)' : msp >= 50 ? 'var(--msp-warn)' : msp >= 30 ? 'var(--msp-flat)' : 'var(--msp-bear)';

        return (
          <button
            key={`${row.symbol}-${index}`}
            type="button"
            onClick={() => onRowClick(row)}
            className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
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
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Factor coverage</div>
                <div className="mt-1 text-xs font-black text-white">{row.compositeV2?.coverage != null ? `${Math.round(row.compositeV2.coverage * 100)}%` : 'Unavailable'}</div>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-400">{reason}</p>
            {row.canonical ? <CanonicalVerdict c={row.canonical} compact legacyScore={row.compositeV2?.composite ?? null} /> : row.compositeV2 ? <CompositeBreakdown v2={row.compositeV2} compact /> : null}
            {row.insight ? <ScannerInsightStrip insight={row.insight} compact /> : null}
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
    <div className="msp-scanner-mobile-cards gap-3">
      {rows.map((row, index) => {
        const lifecycle = deriveLifecycleState(row, activeRegime);
        const msp = computeMspScore(row, activeRegime);
        const trust = rankedTrustLabel(row);
        const trustDetail = rankedTrustDetail(row);
        const reason = summarizeRankedReason(row, lifecycle, isRegimeCompatibleForRegime(row, activeRegime), activeRegime);
        const mspColor = msp >= 70 ? 'var(--msp-bull)' : msp >= 50 ? 'var(--msp-warn)' : msp >= 30 ? 'var(--msp-flat)' : 'var(--msp-bear)';
        return (
          <button
            key={`${(row as any)._assetClass || 'asset'}-${row.symbol || 'unknown'}-${index}`}
            type="button"
            onClick={() => onRowClick(row)}
            className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4 text-left transition hover:border-emerald-400/35 hover:bg-emerald-400/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
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
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Factor coverage</div>
                <div className="mt-1 text-xs font-black text-white">{row.compositeV2?.coverage != null ? `${Math.round(row.compositeV2.coverage * 100)}%` : 'Unavailable'}</div>
              </div>
            </div>
            {/* Algorithm truth labels */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ScoreTypeBadge
                type={row.scoreQuality?.staleDataPenalty ? 'stale' : row.scoreQuality?.missingEvidencePenalty ? 'partial' : 'heuristic'}
                compact
              />
              {!row.compositeV2?.version && row.scoreQuality?.missingEvidencePenalty != null && row.scoreQuality.missingEvidencePenalty > 0 && (
                <span className="inline-flex items-center rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                  −{row.scoreQuality.missingEvidencePenalty} missing evidence
                </span>
              )}
              {!row.compositeV2?.version && row.scoreQuality?.liquidityPenalty != null && row.scoreQuality.liquidityPenalty > 0 && (
                <span className="inline-flex items-center rounded border border-slate-600/40 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                  −{row.scoreQuality.liquidityPenalty} liquidity
                </span>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">{reason}</p>
            {row.canonical ? <CanonicalVerdict c={row.canonical} compact legacyScore={row.compositeV2?.composite ?? null} /> : row.compositeV2 ? <CompositeBreakdown v2={row.compositeV2} compact /> : null}
            {row.insight ? <ScannerInsightStrip insight={row.insight} compact /> : null}
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

function RankedDesktopFallbackTable({ rows, activeRegime, onRowClick }: { rows: ScanResult[]; activeRegime: string; onRowClick: (row: ScanResult) => void }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs" style={{ minWidth: 840 }} aria-label="Ranked scanner fallback rows">
        <thead>
          <tr className="border-b border-[var(--msp-border)]">
            <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase tracking-wider text-slate-500">Symbol</th>
            <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase tracking-wider text-slate-500">MSP</th>
            <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase tracking-wider text-slate-500">Bias</th>
            <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase tracking-wider text-slate-500">Alignment</th>
            <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase tracking-wider text-slate-500">Lifecycle</th>
            <th scope="col" className="text-right py-2 px-2 text-[11px] uppercase tracking-wider text-slate-500">Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const lifecycle = deriveLifecycleState(row, activeRegime);
            const msp = computeMspScore(row, activeRegime);
            const mspColor = msp >= 70 ? 'var(--msp-bull)' : msp >= 50 ? 'var(--msp-warn)' : msp >= 30 ? 'var(--msp-flat)' : 'var(--msp-bear)';
            return (
              <tr key={`fallback-${row.symbol}`} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                <td className="py-2.5 px-2 font-bold text-white whitespace-nowrap">{row.symbol}</td>
                <td className="py-2.5 px-2 font-black whitespace-nowrap" style={{ color: mspColor }}>{msp}</td>
                <td className="py-2.5 px-2 whitespace-nowrap"><Badge label={compactBiasLabel(row.direction)} color={dirColor(row.direction)} small /></td>
                <td className="py-2.5 px-2 text-slate-300 whitespace-nowrap">{row.confidence != null ? `${row.confidence}%` : '—'}</td>
                <td className="py-2.5 px-2 whitespace-nowrap">
                  <span className="text-[11px] px-1.5 py-0.5 rounded border" style={{ color: LIFECYCLE_COLORS[lifecycle], borderColor: LIFECYCLE_COLORS[lifecycle] + '40', backgroundColor: LIFECYCLE_COLORS[lifecycle] + '15' }}>
                    {lifecycleLabel(lifecycle)}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => onRowClick(row)} className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 rounded text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">Review</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  dataBasis?: ScanResult['dataBasis'];
  liquidity?: ScanResult['liquidity'];
  dataTrust?: ScanResult['dataTrust'];
  enhancements?: ScanResult['enhancements'];
  insight?: ScanResult['insight'];
  dveFlags?: string[];
  dveBbwp?: number;
  /** Position in the Ranked queue the user opened this from (not the 1-of-1 rank of a single-symbol re-scan). */
  queueRank?: { rank: number; total: number; label: string } | null;
  lifecycle?: string;
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
  const flowAvailable = detail.liquidity?.volumeRatio != null;
  const flowAligned = flowAvailable && (direction === 'bullish'
    ? (detail.signals?.bullish ?? 0) >= (detail.signals?.neutral ?? 0)
    : direction === 'bearish'
      ? (detail.signals?.bearish ?? 0) >= (detail.signals?.neutral ?? 0)
      : false);
  const tfAlignment = [trendAligned, momentumAligned, flowAligned, direction !== 'neutral'].filter(Boolean).length;
  // ONE trust vocabulary: prefer the shared server verdict; fall back to the local input check only when absent.
  const localQuality = getDataQualityLabel({ price: detail.price, atr: detail.atr, rsi: detail.rsi, adx: detail.adx, direction });
  const dataQuality = detail.dataTrust ? (detail.dataTrust.level === 'INSUFFICIENT_DATA' ? 'MISSING' : detail.dataTrust.level === 'GOOD' ? 'GOOD' : 'DEGRADED') : localQuality;
  const dataTrustLabel = detail.dataTrust ? DATA_TRUST_LABEL[detail.dataTrust.level] : dataQuality;
  const missingInputs = getMissingInputs({ price: detail.price, atr: detail.atr, rsi: detail.rsi, adx: detail.adx, direction });
  const narrative = buildAnalysisNarrative({
    symbol: detail.symbol, direction, setup: detail.setup, price: detail.price, rsi: detail.rsi, adx: detail.adx, atr: detail.atr,
    ema200: detail.ema200 ?? null, macdHist: detail.macd_hist, dveFlags: detail.dveFlags, dveBbwp: detail.dveBbwp, liquidity: detail.liquidity,
    enhancements: detail.enhancements, insight: detail.insight, dataTrust: detail.dataTrust, dataBasis: detail.dataBasis, lifecycle: detail.lifecycle, scoreQuality: detail.scoreQuality,
  });
  const scoreQualityWarnings = [
    detail.scoreQuality?.freshnessStatus && detail.scoreQuality.freshnessStatus !== 'fresh' ? `Freshness: ${detail.scoreQuality.freshnessStatus}` : null,
    (detail.scoreQuality?.missingEvidencePenalty ?? 0) > 0 ? `Missing evidence penalty: ${detail.scoreQuality?.missingEvidencePenalty}` : null,
    (detail.scoreQuality?.staleDataPenalty ?? 0) > 0 ? `Stale data penalty: ${detail.scoreQuality?.staleDataPenalty}` : null,
    (detail.scoreQuality?.liquidityPenalty ?? 0) > 0 ? `Liquidity penalty: ${detail.scoreQuality?.liquidityPenalty}` : null,
    ...(detail.rankWarnings ?? []),
  ].filter(Boolean) as string[];
  const dataQualityTitle = detail.dataTrust?.reasons?.length ? detail.dataTrust.reasons.join(' · ') : scoreQualityWarnings.length ? scoreQualityWarnings.join(' · ') : dataQualityDetail(dataQuality, missingInputs);
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
  const nextUsefulCheck = narrative.confirmation.confirms;

  const recommendation = detail.institutionalFilter?.recommendation;
  const alignedInputs = tfAlignment >= 3 && dataQuality === 'GOOD' && hasScenarioLevels && direction !== 'neutral';
  const setupFamily = classifySetupFamily(detail.setup);
  // "Range break confirmation" only applies to setups that are actually range/breakout structures in a range regime.
  const rangeBreakNeedsConfirmation = regime === 'Range' && trendAligned && (setupFamily === 'range' || setupFamily === 'breakout');
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
  const statusColor = highAlignment ? 'var(--msp-bull)' : needsConfirmation || (quality === 'MEDIUM' && direction !== 'neutral') || alignedInputs ? 'var(--msp-warn)' : 'var(--msp-bear)';
  const confBarColor = confidence >= 70 ? 'var(--msp-bull)' : confidence >= 55 ? 'var(--msp-warn)' : 'var(--msp-bear)';

  const blockReasons = highAlignment
    ? ['Structure aligned', biasLabel(direction)]
    : [dataQuality !== 'GOOD' ? `Data trust: ${dataTrustLabel.toLowerCase()}` : null, !hasScenarioLevels ? 'Reference levels unavailable' : null, quality === 'LOW' ? 'Quality below threshold' : null, !trendAligned ? 'Structure incomplete' : null, rangeBreakNeedsConfirmation ? 'Range regime needs breakout confirmation' : null].filter(Boolean) as string[];

  const agreementNote = highAlignment
    ? 'Multi-factor indicator agreement'
    : needsConfirmation
      ? 'Directional signals aligned; range confirmation needed'
      : alignedInputs
        ? 'High observational alignment'
        : 'Mixed indicator observations';
  const structureNote = `${narrative.confirmation.setupFamily} · stage ${narrative.stageLabel} · extension ${narrative.extensionLabel}`;
  const basis = detail.dataBasis;
  const barIntervalLabel = basis?.barInterval ?? (timeframeLabel === 'D' ? '1d' : timeframeLabel === 'W' ? '1w' : timeframeLabel.toLowerCase());
  const fmtBarTime = (v: string | null | undefined) => {
    if (!v) return 'n/a';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  };

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
    <section aria-label={`Analysis: ${detail.symbol}`} className="space-y-4 mt-4">
      {flashMsg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${flashMsg.type === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-300 border' : 'border-rose-500/40 bg-rose-950/90 text-rose-300 border'}`}>
          {flashMsg.text}
          <button type="button" aria-label="Dismiss" onClick={() => setFlashMsg(null)} className="ml-3 text-xs opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current rounded">&times;</button>
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
          className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-amber-200 no-underline hover:bg-amber-400/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">
          Open Historical Test
        </Link>
        <button type="button" onClick={onClose}
          className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)] hover:bg-slate-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60">
          {returnLabel ?? 'Back to Scanner'}
        </button>
        </div>
      </div>

      {/* Header row */}
      <div className="grid gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:grid-cols-12 md:p-4">
        <div className="md:col-span-6">
          <div className="text-[1.05rem] font-black tracking-tight text-white md:text-[1.25rem]">{detail.symbol} — {timeframeLabel}</div>
          {detail.queueRank && (
            <div className="mt-1 inline-flex rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-emerald-300">
              Ranked #{detail.queueRank.rank} of {detail.queueRank.total} · {detail.queueRank.label}
            </div>
          )}
          <div className="mt-1 text-xs leading-relaxed text-slate-300">
            {direction === 'bullish' ? 'Bullish' : direction === 'bearish' ? 'Bearish' : 'Neutral'} bias, {quality.toLowerCase()} setup quality · {narrative.confirmation.setupFamily}.
          </div>
          <div className={`mt-1 text-[0.82rem] font-extrabold uppercase ${direction === 'bullish' ? 'text-emerald-400' : direction === 'bearish' ? 'text-red-400' : 'text-amber-400'}`}>
            Bias: {direction === 'bullish' ? 'Bullish' : direction === 'bearish' ? 'Bearish' : 'Neutral'}
          </div>
          <div className="mt-1 text-[0.76rem] font-bold uppercase tracking-[0.06em] text-slate-400">
            Setup: {detail.setup ?? 'Unclassified'} · Stage: {narrative.stageLabel} · Extension: {narrative.extensionLabel}
          </div>
          <div className="mt-2 text-[0.74rem] text-slate-400">
            Regime: <span className="font-bold text-white">{regime}</span> · Evidence Alignment: <span className="font-bold text-white" title="Share of the four evidence checks (trend, momentum, flow, direction) that agree with the bias — not a probability.">{tfAlignment} / 4</span>
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Setup Quality</div>
          <div className="mt-1 text-[1.25rem] font-black text-white md:text-[1.45rem]">{confidence >= 75 ? 'A' : confidence >= 60 ? 'B' : confidence >= 45 ? 'C' : 'D'} Setup</div>
          <div className="text-[0.72rem] font-semibold text-slate-400" title="Evidence-weighted confidence: directional strength × factor coverage (missing factors count as neutral) × freshness × liquidity. Not a probability of profit.">{confidence} / 100 · {quality}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={confidence} aria-valuemin={0} aria-valuemax={100} aria-label={`Setup confidence: ${confidence}%`}>
            <div style={{ width: `${confidence}%`, background: confBarColor, height: '100%' }} />
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="rounded-lg border p-3" style={{ borderColor: statusColor + '66', background: 'var(--msp-panel-2)' }}>
            <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Setup Alignment</div>
            <div className="mt-1 text-[0.88rem] font-black uppercase" style={{ color: statusColor }}>{researchStatus}</div>
            <div title={dataQualityTitle} aria-label={`Data trust: ${dataTrustLabel}${detail.dataTrust?.reasons?.length ? '. ' + detail.dataTrust.reasons.join('. ') : ''}`} className="mt-2 inline-flex rounded border px-2 py-0.5 text-[11px] font-bold uppercase" style={{ color: dataQualityColor(dataQuality), borderColor: dataQualityColor(dataQuality) + '55', backgroundColor: dataQualityColor(dataQuality) + '15' }}>
              Data {dataTrustLabel}
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
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Evidence Alignment</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Trend vs bias: <span className={`font-bold ${trendAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{trendAligned ? 'AGREES' : 'MIXED'}</span></div>
                <div>Momentum vs bias: <span className={`font-bold ${momentumAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{momentumAligned ? 'AGREES' : 'MIXED'}</span></div>
                <div>Flow vs bias: <span className={`font-bold ${flowAligned ? 'text-emerald-400' : 'text-amber-400'}`}>{!flowAvailable ? 'UNAVAILABLE' : flowAligned ? 'AGREES' : 'MIXED'}</span></div>
                {detail.enhancements?.emaStack?.direction && <div>EMA stack: <span className="font-bold text-white">{String(detail.enhancements.emaStack.direction).toUpperCase()}</span></div>}
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Momentum State</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>RSI: <span className="font-bold text-white">{detail.rsi != null ? detail.rsi.toFixed(1) : 'N/A'}</span></div>
                <div>ADX: <span className={`font-bold ${adx >= 25 ? 'text-emerald-400' : adx >= 20 ? 'text-amber-400' : 'text-red-400'}`}>{detail.adx != null ? adx.toFixed(1) : 'N/A'}</span></div>
                <div>MACD hist: <span className="font-bold text-white">{detail.macd_hist != null && Number.isFinite(detail.macd_hist) ? `${detail.macd_hist > 0 ? '+' : ''}${formatLevel(Math.abs(detail.macd_hist)) === 'Unavailable' ? detail.macd_hist.toFixed(3) : detail.macd_hist.toFixed(3)}` : 'N/A'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Volatility, Volume &amp; Liquidity</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>ATR: <span className="font-bold text-white">{formatLevel(detail.atr)} ({atrPercent.toFixed(2)}% of price{basis?.atrPercentDailyEquivalent != null && basis.barInterval && basis.barInterval !== '1d' ? ` · ≈${basis.atrPercentDailyEquivalent}% daily-equivalent` : ''})</span></div>
                <div>Volume vs 20-bar avg: <span className="font-bold text-white">{detail.liquidity?.volumeRatio != null ? `${detail.liquidity.volumeRatio.toFixed(2)}×` : 'N/A'}</span></div>
                <div>Avg dollar volume: <span className="font-bold text-white">{detail.liquidity?.adv20 != null ? (detail.liquidity.adv20 >= 1e9 ? `$${(detail.liquidity.adv20 / 1e9).toFixed(1)}B` : `$${(detail.liquidity.adv20 / 1e6).toFixed(0)}M`) : 'N/A'}</span></div>
                <div>Relative strength: <span className="font-bold text-white">{detail.enhancements?.relativeStrength?.rs != null ? `${detail.enhancements.relativeStrength.rs.toFixed(3)} vs ${detail.enhancements.relativeStrength.benchmark ?? 'benchmark'}${detail.enhancements.relativeStrength.window ? ` (${detail.enhancements.relativeStrength.window})` : ''}` : 'N/A'}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Data Basis</div>
              <div className="grid gap-1 text-[0.74rem] text-slate-400">
                <div>Timeframe: <span className="font-bold text-white">{timeframeLabel}</span> · Bar interval: <span className={`font-bold ${detail.dataTrust?.intervalMismatch ? 'text-amber-400' : 'text-white'}`}>{barIntervalLabel}</span></div>
                <div>Last completed bar: <span className="font-bold text-white">{fmtBarTime(basis?.lastCompletedBarAt)}</span>{basis?.currentBarPartial ? <span className="text-slate-500"> · open bar excluded from indicators</span> : null}</div>
                <div>History: <span className="font-bold text-white">{basis?.historyBars != null ? `${basis.historyBars} bars` : 'n/a'}</span> · Computed: <span className="font-bold text-white">{fmtBarTime(basis?.computedAt)}</span></div>
                <div>Data trust: <span className="font-bold" style={{ color: dataQualityColor(dataQuality) }}>{dataTrustLabel}</span>{detail.dataTrust?.reasons?.length ? <span className="text-slate-500"> — {detail.dataTrust.reasons.join('; ')}</span> : null}</div>
                {basis?.source && <div className="text-slate-500">Source: {basis.source}{basis.volumeBasis ? ` · volume: ${basis.volumeBasis.replace(/_/g, ' ')}` : ''}</div>}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2.5">
              <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-emerald-300">Why This Rank</div>
              <div className="text-[0.74rem] leading-relaxed text-emerald-50">
                {detail.queueRank ? `${detail.symbol} is #${detail.queueRank.rank} of ${detail.queueRank.total} in the ${detail.queueRank.label} queue.` : `${detail.symbol} — single-symbol analysis (rank context is only defined inside a queue).`}
              </div>
              <div className="mt-2 grid gap-1 text-[0.7rem]">
                <div className="text-[0.64rem] font-extrabold uppercase tracking-[0.06em] text-emerald-300/80">Supports</div>
                {narrative.supports.length ? narrative.supports.slice(0, 6).map((item) => <div key={item} className="text-emerald-100/90">+ {item}</div>) : <div className="text-emerald-100/60">No supporting evidence recorded.</div>}
                <div className="mt-1 text-[0.64rem] font-extrabold uppercase tracking-[0.06em] text-amber-300/80">Holding it back</div>
                {narrative.blockers.length ? narrative.blockers.slice(0, 6).map((item) => <div key={item} className="text-amber-100/90">− {item}</div>) : <div className="text-amber-100/60">Nothing flagged against this row.</div>}
                {detail.rankExplanation && (detail.rankExplanation.penalties.length > 0 || detail.rankExplanation.strengths.length > 0) && (
                  <>
                    <div className="mt-1 text-[0.64rem] font-extrabold uppercase tracking-[0.06em] text-slate-400">Scorer adjustments (server)</div>
                    {detail.rankExplanation.strengths.slice(0, 3).map((item) => <div key={`s-${item}`} className="text-slate-300/90">+ {item}</div>)}
                    {detail.rankExplanation.penalties.slice(0, 4).map((item) => <div key={`p-${item}`} className="text-slate-300/90">− {item}</div>)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Execution Plan */}
        <div className="md:col-span-5 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3 md:p-4">
          <div className="mb-1 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">Preliminary Research Levels</div>
          <div className="mb-3 text-[0.68rem] leading-4 text-slate-500">Fast ATR-based estimate from scan-time price ({formatLevel(detail.price)}) on {barIntervalLabel} bars (ATR {formatLevel(detail.atr)}). Golden Egg recomputes <em>validated scenario levels</em> from a live quote and price structure — expect them to differ.</div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Level of Interest (preliminary)</div>
              <div>Reference: <span className="font-bold text-white">{formatLevel(entry)}</span></div>
              <div>Condition: <span className="font-bold text-white">{direction === 'bullish' ? 'Close above level' : direction === 'bearish' ? 'Close below level' : 'Awaiting directional structure'}</span></div>
              <div>Confirms: <span className="font-bold text-white">{hasScenarioLevels ? narrative.confirmation.confirms : 'Awaiting valid levels'}</span></div>
              <div>Invalidates: <span className="font-bold text-red-300">{hasScenarioLevels ? narrative.confirmation.invalidates : 'n/a'}</span></div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Key Levels (preliminary · educational)</div>
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
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-blue-300">Next Useful Check · {narrative.confirmation.setupFamily}</div>
              <div>{nextUsefulCheck}</div>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-slate-400">
              <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-slate-500">Analysis Notes</div>
              <div>Indicator Agreement: <span className={`font-bold ${highAlignment ? 'text-emerald-400' : 'text-amber-400'}`}>{agreementNote}</span></div>
              <div>Structure: <span className="font-bold text-white">{structureNote}</span></div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleSaveCase} disabled={savingCase} aria-disabled={savingCase}
                className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-blue-300 hover:bg-blue-500/20 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60">
                {savingCase ? 'Saving...' : 'Save Case'}
              </button>
              <Link href={`/tools/workspace?tab=alerts&symbol=${encodeURIComponent(detail.symbol)}&price=${detail.price || ''}&direction=${direction}`}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-slate-400 no-underline hover:bg-slate-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50">
                Set Alert
              </Link>
              <button type="button" onClick={handleAddToWatchlist}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-slate-400 hover:bg-slate-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50">
                Add to Watchlist
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
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
  // Fast (light) crypto scan retired — Pro Scanner always runs Deep (the server enforces this too).
  const proUniverseSize = PRO_SCAN_UNIVERSE_SIZE;
  const [proMinConfidence, setProMinConfidence] = useState<number>(0);
  const [proMtfAlignment, setProMtfAlignment] = useState<number>(2);
  const [proVolState, setProVolState] = useState<ProScanFilters['volatility']>('all');
  const [proSqueeze, setProSqueeze] = useState<'all' | 'squeeze'>('all');
  const [proIntent, setProIntent] = useState<'observe' | 'review'>('observe');
  const [proScanLoading, setProScanLoading] = useState(false);
  const [proDirection, setProDirection] = useState<'all' | 'long' | 'short'>('all');
  const [proQuality, setProQuality] = useState<'all' | 'high' | 'medium'>('all');
  const [proSort, setProSort] = useState<'rank' | 'confidence' | 'volatility' | 'trend'>('rank');
  const [proPresetConditions, setProPresetConditions] = useState<{ id?: string; requireRelativeStrength?: boolean; rsiBand?: [number, number]; minAdx?: number; maxAdx?: number }>({});
  const proFilters = useMemo<ProScanFilters>(() => ({
    direction: proDirection, quality: proQuality, minConfidence: proMinConfidence,
    minAlignment: proMtfAlignment, volatility: proVolState, squeeze: proSqueeze === 'squeeze',
    requireRelativeStrength: proPresetConditions.requireRelativeStrength ?? false,
    minAdx: proPresetConditions.minAdx, maxAdx: proPresetConditions.maxAdx, rsiBand: proPresetConditions.rsiBand,
    preset: proPresetConditions.id === 'momentum' || proPresetConditions.id === 'mean_reversion' ? proPresetConditions.id : undefined,
  }), [proDirection, proQuality, proMinConfidence, proMtfAlignment, proVolState, proSqueeze, proPresetConditions]);
  const proRequestKey = JSON.stringify([proAsset, proTimeframe, proUniverseSize, proFilters, proSort]);
  const [proResponse, setProScanResults] = useState<any>(null);
  const proScanResults = proResponse?.requestKey === proRequestKey ? proResponse : null;
  const proAbortRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef(0);
  useEffect(() => {
    proAbortRef.current?.abort();
    setProScanLoading(false);
    setProScanError(null);
    return () => proAbortRef.current?.abort();
  }, [proRequestKey]);
  const [proScanError, setProScanError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(undefined);



  const [proBulkViewMode, setProBulkViewMode] = useState<'table' | 'cards'>('table');

  /* ─── Shared detail state ─── */
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedAssetClass, setSelectedAssetClass] = useState<'equity' | 'crypto' | 'forex' | null>(null);
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
    { label: 'Equity', status: downgradeProviderStatusForRows(equity.data?.metadata?.dataQuality?.providerStatus ?? null, equity.data?.results), quality: equity.data?.metadata?.dataQuality ?? null },
    { label: 'Crypto', status: downgradeProviderStatusForRows(crypto.data?.metadata?.dataQuality?.providerStatus ?? null, crypto.data?.results), quality: crypto.data?.metadata?.dataQuality ?? null },
  ]), [equity.data, crypto.data]);

  const filtered = useMemo(() => {
    let items = [...allResults];
    switch (activeTab) {
      case 'Equities': items = items.filter(r => (r as any)._assetClass === 'equity'); break;
      case 'Crypto': items = items.filter(r => (r as any)._assetClass === 'crypto'); break;
      case 'Bullish': items = items.filter(r => r.direction === 'bullish'); break;
      case 'Bearish': items = items.filter(r => r.direction === 'bearish'); break;
      case 'High Score ≥70': items = items.filter(r => computeMspScore(r, currentRegime) >= HIGH_MSP_SCORE); break;
      case 'DVE Signals': items = items.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)); break;
      case 'Squeeze': items = items.filter(r => r.dveFlags?.includes('SQUEEZE_FIRE')); break;
      case 'Regime Match': items = items.filter(r => isRegimeCompatible(r)); break;
    }
    items.sort((a, b) => {
      if (sortKey === 'mspScore' && sortDir === 'desc' && a.canonical && b.canonical) { const c = compareCanonicalRows(a, b); if (c) return c; }
      if (sortKey === 'mspScore' && sortDir === 'desc' && a.compositeV2?.version && b.compositeV2?.version) return compareScannerScores(a, b);
      let av: any, bv: any;
      switch (sortKey) {
        case 'symbol': av = a.symbol; bv = b.symbol; break;
        case 'score': av = a.score ?? 0; bv = b.score ?? 0; break;
        case 'mspScore': av = computeMspScore(a, currentRegime); bv = computeMspScore(b, currentRegime); break;
        case 'direction': av = a.direction ?? ''; bv = b.direction ?? ''; break;
        case 'confidence': av = a.compositeV2?.coverage ?? -1; bv = b.compositeV2?.coverage ?? -1; break;
        case 'rsi': av = a.rsi ?? 0; bv = b.rsi ?? 0; break;
        case 'price': av = a.price ?? 0; bv = b.price ?? 0; break;
        case 'dveBbwp': av = a.dveBbwp ?? 0; bv = b.dveBbwp ?? 0; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return (sortDir === 'asc' ? av - bv : bv - av) || a.symbol.localeCompare(b.symbol) || String((a as any)._assetClass).localeCompare(String((b as any)._assetClass));
    });
    return items;
  }, [allResults, activeTab, sortKey, sortDir, currentRegime]);

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
    'High Score ≥70': allResults.filter(r => computeMspScore(r, currentRegime) >= HIGH_MSP_SCORE).length,
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
  const loadSymbolDetail = useCallback(async (symbol: string, tf: string, asset: string, context?: { queueRank?: SymbolDetail['queueRank']; lifecycle?: string }) => {
    const requestId = ++detailRequestRef.current;
    setSelectedSymbol(symbol);
    setSelectedAssetClass(asset === 'crypto' ? 'crypto' : asset === 'forex' ? 'forex' : 'equity');
    setDetailLoading(true);
    setSymbolDetail(null);
    try {
      const { response: res, body: data } = await boundedJsonFetch<any>('/api/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: asset, timeframe: tf, minScore: 0, symbols: [symbol] }),
      });
      if (requestId !== detailRequestRef.current) return;
      if (res.ok && data.success && data.results?.length > 0) {
        setSymbolDetail({ ...data.results[0], providerStatus: data.metadata?.dataQuality?.providerStatus ?? null, queueRank: context?.queueRank ?? null, lifecycle: context?.lifecycle });
      } else {
        setProScanError(data?.error || `Analysis unavailable for ${symbol}. Retry manually.`);
      }
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      setProScanError(error instanceof Error ? error.message : 'Analysis unavailable. Retry manually.');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  /* ─── V2 row click ─── */
  const handleV2RowClick = useCallback((r: ScanResult) => {
    const asset = (r as any)._assetClass === 'crypto' ? 'crypto' : 'equity';
    // Re-scan on the SAME timeframe the queue is showing (weekly stays weekly).
    const tfMap: Record<string, string> = { daily: 'daily', weekly: 'weekly', '1h': '1h', '15m': '15m' };
    const idx = rankedRows.findIndex((row) => row.symbol === r.symbol);
    const tfLabel = v2Timeframe === 'daily' ? 'Daily' : v2Timeframe === 'weekly' ? 'Weekly' : v2Timeframe.toUpperCase();
    loadSymbolDetail(r.symbol, tfMap[v2Timeframe] || 'daily', asset, {
      queueRank: idx >= 0 ? { rank: idx + 1, total: rankedRows.length, label: `${activeTab} · ${tfLabel}` } : null,
      lifecycle: deriveLifecycleState(r, currentRegime),
    });
  }, [v2Timeframe, loadSymbolDetail, rankedRows, activeTab, currentRegime]);

  /* ─── Pro Scan: run bulk scan ─── */
  const runProScan = useCallback(async () => {
    proAbortRef.current?.abort();
    const controller = new AbortController();
    proAbortRef.current = controller;
    setProScanLoading(true);
    setProScanError(null);
    setProScanResults(null);
    setSelectedSymbol(null);
    setSelectedAssetClass(null);
    setSymbolDetail(null);
    try {
      const payload: any = { type: proAsset, timeframe: proTimeframe, universeSize: proUniverseSize, filters: proFilters, sort: proSort };
      payload.mode = proAsset === 'crypto' ? 'deep' : 'hybrid';
      const { response: res, body: data } = await boundedJsonFetch<any>('/api/scanner/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }, 60_000);
      if (controller.signal.aborted) return;
      if (!res.ok) {
        if (res.status === 401) { setProScanError('Please log in to use the scanner'); return; }
        setProScanError(data?.error || `Server returned ${res.status}`);
        return;
      }
      setProScanResults({ ...data, requestKey: proRequestKey, requestedType: proAsset, requestedTimeframe: proTimeframe, requestedDepth: payload.mode });
    } catch (e: any) {
      if (!controller.signal.aborted) setProScanError(e?.message || 'Network error');
    } finally {
      if (!controller.signal.aborted) setProScanLoading(false);
    }
  }, [proAsset, proTimeframe, proUniverseSize, proRequestKey, proFilters, proSort]);

  /* ─── Pro Scan: template apply ─── */
  const applyTemplate = useCallback((tmpl: ScanTemplate) => {
    presetFilterSnapshot.current = null;
    setActiveTemplateId(tmpl.id);
    setProMinConfidence(tmpl.config.minConfidence);
    setProMtfAlignment(tmpl.config.mtfAlignment);
    setProVolState(tmpl.config.volatilityState as ProScanFilters['volatility']);
    setProDirection((tmpl.config.direction as 'all' | 'long' | 'short') ?? 'all');
    setProQuality((tmpl.config.quality as 'all' | 'high' | 'medium') ?? 'all');
    setProSqueeze(tmpl.config.squeeze ? 'squeeze' : 'all');
    setProPresetConditions({ requireRelativeStrength: tmpl.config.requireRelativeStrength, rsiBand: tmpl.config.rsiBand, minAdx: tmpl.config.minAdx, maxAdx: tmpl.config.maxAdx, id: tmpl.id });
  }, []);

  const clearTemplate = useCallback(() => { setActiveTemplateId(undefined); setProPresetConditions({}); }, []);
  // Preset-only conditions (RS / ADX / RSI zone) are invisible in the filter controls, so any manual filter edit
  // drops the preset rather than silently keeping hidden conditions active.
  const presetFilterSnapshot = useRef<string | null>(null);
  const filterSnapshot = JSON.stringify([proMinConfidence, proMtfAlignment, proVolState, proDirection, proQuality, proSqueeze]);
  useEffect(() => {
    if (!activeTemplateId) { presetFilterSnapshot.current = null; return; }
    if (presetFilterSnapshot.current == null) { presetFilterSnapshot.current = filterSnapshot; return; }
    if (presetFilterSnapshot.current !== filterSnapshot) { setActiveTemplateId(undefined); setProPresetConditions({}); }
  }, [activeTemplateId, filterSnapshot]);

  /* ─── Pro scan filtered results → ScreenerRow[] (+ per-filter drop accounting so an empty table is never silent) ─── */
  const { rows: proScreenerRows, drops: proFilterDrops } = useMemo((): { rows: ScreenerRow[]; drops: Record<string, number> } => {
    if (!proScanResults?.topPicks) return { rows: [], drops: {} };
    const drops: Record<string, number> = { ...proScanResults.selection?.exclusions };
    const rows = proScanResults.topPicks
      .filter((pick: any) => {
        const score = pick.confidence ?? pick.scoreV2?.final?.confidence ?? pick.score;
        if (typeof score === 'number' && Number.isFinite(score)) return true;
        drops['Score unavailable'] = (drops['Score unavailable'] ?? 0) + 1;
        return false;
      })
      .map((pick: any, idx: number) => {
        const ind = pick.indicators || {};
        const scoreV2 = pick.scoreV2;
        // Headline = trust-capped condition match from the API (Part J). Legacy fallbacks only for older payloads.
        const metrics = proCandidateMetrics(pick);
        const conf = metrics.confidence!;
        const matchConf = pick.matchConfidence ?? conf;
        const dir = metrics.direction as 'LONG' | 'SHORT' | 'NEUTRAL';
        const qual = metrics.quality;
        const pickRsi = metrics.rsi ?? undefined;
        const adxVal = metrics.adx ?? undefined;
        const atr = pick.atr ?? ind.atr;
        const priceVal = metrics.price ?? undefined;
        const atrPct = metrics.atrPct ?? undefined;
        const trendOk = dir === 'LONG' ? (pick.signals?.bullish ?? 0) > (pick.signals?.bearish ?? 0) : dir === 'SHORT' ? (pick.signals?.bearish ?? 0) > (pick.signals?.bullish ?? 0) : false;
        const momOk = pickRsi != null && ((dir === 'LONG' && pickRsi > 45) || (dir === 'SHORT' && pickRsi < 55));
        const flowOk = dir === 'LONG' ? (pick.signals?.bullish ?? 0) >= (pick.signals?.neutral ?? 0) : dir === 'SHORT' ? (pick.signals?.bearish ?? 0) >= (pick.signals?.neutral ?? 0) : false;
        const tfA = metrics.alignmentAvailable ? metrics.alignment : undefined;
        const strat = pick.setup || (pick.macd_hist != null && pick.macd_hist > 0 ? 'MOM REV' : pickRsi != null && pickRsi < 35 ? 'MEAN REV' : atrPct != null && atrPct < 1.5 ? 'BREAKOUT' : 'RANGE');
        const rec = pick.institutionalFilter?.recommendation;
        const localQuality = getDataQualityLabel({ price: priceVal, atr, rsi: pickRsi, adx: adxVal, direction: pick.direction });
        const dataQuality = pick.dataTrust ? (pick.dataTrust.level === 'INSUFFICIENT_DATA' ? 'MISSING' : pick.dataTrust.level === 'GOOD' ? 'GOOD' : 'DEGRADED') : localQuality;
        const missingInputs = getMissingInputs({ price: priceVal, atr, rsi: pickRsi, adx: adxVal, direction: pick.direction });
        const dataQualityDetailText = pick.dataTrust?.reasons?.length ? pick.dataTrust.reasons.join(' · ') : dataQualityDetail(dataQuality, missingInputs);
        const blockReasons = scoreV2?.execution?.blockReasons || [];
        const strategyKey = String(strat).toLowerCase();
        const rangeConfirmationNeeded = currentRegime === 'range'
          && dir !== 'NEUTRAL'
          && !strategyKey.includes('range_fade')
          && !strategyKey.includes('mean_reversion');
        const reason = pick.compositeV2?.blockers?.length ? pick.compositeV2.blockers.join(' ') : dataQuality !== 'GOOD' ? dataQualityDetailText.replace(/\.$/, '')
          : legacyExecutionReason(blockReasons) ?? (strategyKey.includes('range_break') ? 'Range break watch — needs expansion confirmation'
          : rangeConfirmationNeeded ? 'Directional setup inside range — confirm break/fade'
          : tfA != null && tfA >= 4 && qual !== 'low' ? 'Four-factor agreement'
          : atrPct != null && atrPct < 1.5 ? 'Compression setup'
          : ind.momentumAccel ? 'Momentum acceleration'
          : trendOk ? 'Trend alignment'
          : 'Mixed evidence');
        const enginePermission = scoreV2?.execution?.permission;
        // A canonical "No setup" row is not blocked: it keeps its factor-bias side and reads NO SETUP (mixed), not NOT ALIGNED.
        const noSetup = pick.canonicalStatus === 'NO_SETUP';
        const primaryPermission = pick.canonical?.permission ?? pick.compositeV2?.permission;
        const perm = noSetup ? 'TIGHT' : primaryPermission ? ({PASS: 'COMPLIANT', WATCH: 'TIGHT', BLOCK: 'BLOCKED'} as const)[primaryPermission as 'PASS' | 'WATCH' | 'BLOCK'] : enginePermission === 'blocked' || rec === LEGACY_LOW_ALIGNMENT_STATUS || qual === 'low' || dataQuality === 'MISSING'
            ? 'BLOCKED'
            : rangeConfirmationNeeded && dataQuality === 'GOOD'
              ? 'TIGHT'
              : enginePermission === 'allowed' && dataQuality === 'GOOD'
                ? 'COMPLIANT'
            : rec === LEGACY_MULTI_FACTOR_STATUS && qual !== 'low' && dataQuality === 'GOOD'
              ? 'COMPLIANT'
              : 'TIGHT';
        return {
          rank: idx + 1, symbol: pick.symbol, direction: dir, confidence: conf, matchConfidence: matchConf, quality: qual,
          scorePermission: noSetup ? 'NO SETUP' : primaryPermission, factorCoverage: pick.canonical?.coverage ?? pick.compositeV2?.coverage, canonical: pick.canonical,
          scoreExplanation: pick.compositeV2?.version ? `${pick.compositeV2.version}: coverage-adjusted magnitude ${(pick.compositeV2.coverageAdjustedMagnitude ?? pick.compositeV2.conservativeMagnitude).toFixed(2)} × ${pick.compositeV2.appliedMultiplier.toFixed(4)} freshness/liquidity, rounded, × ${pick.compositeV2.gateMultiplier} gate, capped at ${pick.compositeV2.trustCap} = ${conf}/100. Factor coverage ${Math.round(pick.compositeV2.coverage * 100)}%. Research score, not a probability.` : undefined,
          strategy: strat, rsi: pickRsi, adx: adxVal, atrPct, tfAlignment: tfA,
          volume24h: pick.volume ?? ind.volume, volumeUnit: (proScanResults?.type ?? proAsset) === 'crypto' ? 'usd' : 'shares', price: priceVal, permission: perm,
          squeeze: ind.squeeze ?? false, squeezeStrength: ind.squeezeStrength ?? 0,
          momentumAccel: ind.momentumAccel ?? false, momentumAccelScore: ind.momentumAccelScore ?? 0,
          sectorRelStr: ind.sectorRelStr, reason, dataQuality, dataQualityDetail: dataQualityDetailText,
          dataTrustLevel: pick.dataTrust ? DATA_TRUST_LABEL[pick.dataTrust.level as keyof typeof DATA_TRUST_LABEL] : undefined,
          barInterval: pick.dataBasis?.barInterval, lastCompletedBarAt: pick.dataBasis?.lastCompletedBarAt ?? null,
        } as ScreenerRow;
      })
      .map((row: ScreenerRow, index: number) => ({ ...row, rank: index + 1 }));
    return { rows, drops };
  }, [proScanResults, currentRegime, proAsset]);

  /* ─── Pro scan row click ─── */
  const handleProRowClick = useCallback((row: ScreenerRow) => {
    // Real analysis (same /api/scanner/run evidence + shared trust) instead of a synthetic detail built from the row.
    const tf = proTimeframe === '1d' ? 'daily' : proTimeframe;
    const idx = proScreenerRows.findIndex((r) => r.symbol === row.symbol);
    loadSymbolDetail(row.symbol, tf, proAsset, {
      queueRank: idx >= 0 ? { rank: idx + 1, total: proScreenerRows.length, label: `Pro · ${proAsset} · ${proTimeframe}` } : null,
    });
  }, [proTimeframe, proAsset, proScreenerRows, loadSymbolDetail]);


  /* ─── Detail section (shared between both modes) ─── */
  const detailTimeframeLabel = mode === 'ranked'
    ? (v2Timeframe === '15m' ? '15M' : v2Timeframe === '1h' ? '1H' : v2Timeframe === 'weekly' ? 'W' : 'D')
    : proTimeframe.toUpperCase();
  const detailAssetType = selectedAssetClass ?? (mode === 'ranked' ? 'equity' : proAsset);
  const activeScannerStage: ScannerStage = selectedSymbol ? 'analysis' : mode;
  const selectScannerMode = useCallback((nextMode: ScannerMode) => {
    setMode(nextMode);
    setSelectedSymbol(null);
    setSelectedAssetClass(null);
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

  function SortHeader({ k, label, w, title }: { k: SortKey; label: string; w: string; title?: string }) {
    return (
      <th scope="col" className={`${w} text-left py-2 px-2 whitespace-nowrap`} title={title}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="text-left text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/50 rounded"
          aria-label={`Sort scanner table by ${label}${title ? `. ${title}` : ''}`}
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
    ? 'System-ranked research opportunities'
    : headerStage === 'pro'
      ? 'Filters applied before the result limit'
      : selectedSymbol ? `Reviewing ${selectedSymbol}` : 'Reviewing case';
  const queueValue = headerStage === 'analysis' && selectedSymbol
    ? selectedSymbol
    : queueCount > 0
      ? `${queueCount} ${headerStage === 'pro' ? 'candidates' : 'symbols'}`
      : 'Empty';
  const queueTone = queueCount > 0 || headerStage === 'analysis' ? 'var(--msp-bull)' : 'var(--msp-flat)';
  const queueDetail = headerStage === 'analysis'
    ? 'Active analysis case'
    : headerStage === 'pro'
      ? universeCount != null ? `Scanned ${universeCount} symbols` : 'Run Educational Scan to populate'
      : v2Loading ? 'Loading market data…' : queueCount > 0 ? 'Sorted by MSP score' : 'Awaiting scan results';
  const weakProRows = (proScanResults?.topPicks ?? []).filter(rowHasWeakData).length;
  const dataIssues = (mode === 'ranked' ? [
    rankedLocalDemo ? 'Local demo rows' : null,
    equity.error ? 'Equity feed' : null,
    crypto.error ? 'Crypto feed' : null,
    ...rankedProviderStatuses.filter((p) => !p.status || p.status.degraded || p.status.stale).map((p) => `${p.label} data incomplete`),
  ] : [
    proScanResults?.dataQuality?.source === 'local_demo' ? 'Pro demo rows' : null,
    proScanError ? 'Pro scan error' : null,
    weakProRows ? `${weakProRows} returned rows have weak data` : null,
    proScanResults?.universe?.valid < proScanResults?.universe?.input ? 'Partial universe coverage' : null,
  ]).filter(Boolean) as string[];
  const dataLoadingCount = (mode === 'ranked' ? [equity.loading, crypto.loading, detailLoading] : [proScanLoading, detailLoading]).filter(Boolean).length;
  const dataHealthValue = dataIssues.length ? `${dataIssues.length} issue${dataIssues.length === 1 ? '' : 's'}` : dataLoadingCount ? `${dataLoadingCount} loading` : mode === 'pro' && !proScanResults ? 'Not scanned' : 'Ready';
  const dataHealthTone = dataIssues.length ? 'var(--msp-warn)' : dataLoadingCount ? 'var(--msp-flat)' : 'var(--msp-bull)';
  const dataHealthDetail = dataIssues.length ? dataIssues.join(', ') : dataLoadingCount ? 'Feeds syncing' : 'No feed errors reported';
  const topRankedSymbol = rankedRows[0]?.symbol;
  const topProSymbol = proScreenerRows[0]?.symbol;
  const headerTopSymbol = selectedSymbol || (mode === 'ranked' ? topRankedSymbol : topProSymbol);
  const nextCheckValue = headerStage === 'analysis'
    ? 'Validate in Golden Egg'
    : headerStage === 'pro'
      ? proScanResults
        ? topProSymbol ? `Review ${topProSymbol}` : 'Review filter exclusions'
        : 'Run Educational Scan'
      : topRankedSymbol ? `Review ${topRankedSymbol}` : v2Loading ? 'Loading queue…' : 'Awaiting ranked data';
  const nextCheckDetail = headerStage === 'analysis'
    ? 'Open Golden Egg from this case'
    : headerStage === 'pro'
      ? proScanResults ? 'Click a row to inspect a candidate' : 'Configure filters then run scan'
      : topRankedSymbol ? 'Top-ranked candidate' : 'Cached scanner data syncing';
  const nextCheckTone = (headerStage === 'analysis' || headerTopSymbol) ? 'var(--msp-warn)' : 'var(--msp-flat)';
  const topRankedAsset = rankedRows[0] ? (((rankedRows[0] as any)._assetClass === 'crypto' ? 'crypto' : 'equity') as 'crypto' | 'equity') : null;
  const handoffAsset = selectedAssetClass ?? (mode === 'ranked' ? topRankedAsset : proAsset === 'crypto' ? 'crypto' : 'equity');
  const handoffTimeframe = mode === 'ranked'
    ? v2Timeframe
    : proTimeframe === '1d' ? 'daily' : proTimeframe === '30m' ? '30m' : proTimeframe;
  const handoffQuery = headerTopSymbol && handoffAsset
    ? `symbol=${encodeURIComponent(headerTopSymbol)}&type=${handoffAsset}&timeframe=${encodeURIComponent(handoffTimeframe)}`
    : '';
  const goldenEggHref = handoffQuery ? `/tools/golden-egg?${handoffQuery}` : '/tools/golden-egg';
  const terminalHref = handoffQuery ? `/tools/terminal?${handoffQuery}` : '/tools/terminal';
  const showRegimeChip = Boolean(regime.data);
  const regimeColor = currentRegime === 'trend' || currentRegime === 'risk_on' || currentRegime === 'expansion'
    ? 'var(--msp-bull)'
    : currentRegime === 'risk_off'
      ? 'var(--msp-bear)'
      : currentRegime === 'compression' || currentRegime === 'transition'
        ? 'var(--msp-warn)'
        : '#A5B4FC';
  const riskLevel = regime.data?.riskLevel || 'moderate';
  const riskColor = riskLevel === 'low' ? 'var(--msp-bull)' : riskLevel === 'moderate' ? 'var(--msp-warn)' : 'var(--msp-bear)';
  // /api/regime returns YES | CONDITIONAL | NO from workspace context. It is informational only (not an execution
  // gate — rows carry their own PASS/WATCH/BLOCK), and when it is missing we say so instead of defaulting to YES.
  const permission = regime.data?.permission ?? null;
  const permissionLabel = permission == null ? 'Unknown' : permission === 'YES' || permission === 'full' ? 'Normal' : permission === 'CONDITIONAL' || permission === 'reduced' ? 'Elevated' : 'High';
  const permissionColor = permission == null ? '#94A3B8' : permission === 'YES' || permission === 'full' ? 'var(--msp-bull)' : permission === 'CONDITIONAL' || permission === 'reduced' ? 'var(--msp-warn)' : 'var(--msp-bear)';
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
                  title={weightTooltip ? `Workspace confluence weights (separate from the MSP scanner score) — ${weightTooltip}` : undefined}
                >
                  <span style={{ color: regimeColor }}>{humanizeEnum(regime.data?.regime)}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">Risk <span style={{ color: riskColor }}>{riskLevel}</span></span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400" title="Regime risk context from your workspace (informational only — not a gate). Each row's own permission is PASS / WATCH / BLOCK.">Regime risk <span style={{ color: permissionColor }}>{permissionLabel}</span></span>
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">{headerStage === 'pro' ? 'Build your own scan.' : headerStage === 'analysis' ? 'Inspect one candidate.' : 'What deserves your attention right now.'}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              {headerStage === 'pro'
                ? 'Pro: choose the exact technical and market conditions you want and scan the universe for matches.'
                : headerStage === 'analysis'
                  ? 'Analysis: the evidence behind one row — then validate it in Golden Egg.'
                  : 'Ranked: system-ranked research opportunities based on MarketScannerPros evidence and risk filters. Switch to Pro to define your own conditions.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {headerStage === 'analysis' ? (
                <button type="button" onClick={() => { setSelectedSymbol(null); setSelectedAssetClass(null); setSymbolDetail(null); }} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">Back to {mode === 'ranked' ? 'Ranked' : 'Pro'}</button>
              ) : (
                <button type="button" onClick={() => selectScannerMode(mode === 'pro' ? 'pro' : 'ranked')} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">{mode === 'pro' ? 'Configure Pro Scan' : 'Refresh Ranked Queue'}</button>
              )}
              <Link href={goldenEggHref} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 no-underline transition-colors hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">{headerTopSymbol ? `Validate ${headerTopSymbol}` : 'Open Golden Egg'}</Link>
              <Link href={terminalHref} className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">Open Terminal</Link>
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
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${v2Timeframe === tf.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-[var(--msp-border)]'}`}>
                {tf.label}
              </button>
            ))}
          </div>

          {/* Tabs — dropdown on mobile, pills on desktop */}
          <div className="msp-scanner-mobile">
            <label htmlFor="scanner-tab-select" className="sr-only">Scanner tab</label>
            <select
              id="scanner-tab-select"
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
          <div className="msp-scanner-desktop-tabs items-center gap-1 overflow-x-auto pb-1">
            {TABS.map(tab => (
              <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${activeTab === tab ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}>
                {tab}
                <span className="ml-1 text-[11px] text-slate-600">
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            {[
              ['Symbols', String(filtered.length), 'var(--msp-text)'],
              ['Aligned Scenarios', String(filtered.filter(r => deriveLifecycleState(r, currentRegime) === 'READY').length), 'var(--msp-bull)'],
              ['Developing', String(filtered.filter(r => deriveLifecycleState(r, currentRegime) === 'SETTING_UP').length), '#A855F7'],
              ['Needs Review', String(filtered.filter(r => r.scoreV2?.regimeScore?.gated).length), 'var(--msp-bear)'],
              ['Degraded Data', String(filtered.filter(r => rankedTrustLabel(r) !== 'GOOD').length), 'var(--msp-warn)'],
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
            ) : v2PartialLoading ? (
              <>
                <RankedMobileCards rows={rankedRows} activeRegime={currentRegime} onRowClick={handleV2RowClick} />
                <div className="msp-scanner-desktop"><RankedDesktopFallbackTable rows={rankedRows} activeRegime={currentRegime} onRowClick={handleV2RowClick} /></div>
              </>
            ) : (
              <>
              <RankedMobileCards rows={rankedRows} activeRegime={currentRegime} onRowClick={handleV2RowClick} />
              <div className="msp-scanner-desktop overflow-x-auto -mx-1">
                <table className="w-full text-xs" style={{ minWidth: 1040 }} aria-label="Ranked scanner results">
                  <thead>
                    <tr className="border-b border-[var(--msp-border)]">
                      <SortHeader k="symbol" label="Symbol" w="w-20" />
                      <SortHeader k="mspScore" label="MSP" w="w-14" title="MSP research score (0–100): system ranking of research quality under the current regime. Not a probability." />
                      <SortHeader k="price" label="Price" w="w-20" />
                      <SortHeader k="direction" label="Bias" w="w-16" />
                      <SortHeader k="confidence" label="Coverage" w="w-16" title="Available factor weight as a percentage of this asset’s applicable factor profile. Data coverage is separate from the MSP score." />
                      <th scope="col" className="w-24 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap" title="Setup stage (where the structure is) and the factors supporting the bias">Setup · Reason</th>
                      <th scope="col" className="w-16 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap" title="Data trust: freshness of the last completed bar, interval integrity, indicator coverage, history depth">Trust</th>
                      <th scope="col" className="w-20 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap" title="Extension / volatility state (DVE): where price is in the move — independent of setup and lifecycle">Extension</th>
                      <th scope="col" className="w-16 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap" title="Whether the setup type is compatible with the current market regime">Regime fit</th>
                      <th scope="col" className="w-16 text-left text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap" title="Research lifecycle: how far this candidate has progressed through validation (discovered → watching → setting up → ready). Describes the research process, not price maturity.">Research stage</th>
                      <th scope="col" className="w-16 text-[11px] uppercase tracking-wider text-slate-500 py-2 px-2 whitespace-nowrap">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedRows.map((r) => {
                      const regimeLabel = r.scoreV2?.regime?.label || r.type || '';
                      const msp = computeMspScore(r, currentRegime);
                      const lifecycle = deriveLifecycleState(r, currentRegime);
                      const mspColor = msp >= 70 ? 'var(--msp-bull)' : msp >= 50 ? 'var(--msp-warn)' : msp >= 30 ? 'var(--msp-flat)' : 'var(--msp-bear)';
                      const regimeCompatible = isRegimeCompatible(r);
                      const trust = rankedTrustLabel(r);
                      const reason = summarizeRankedReason(r, lifecycle, regimeCompatible, currentRegime);
                      const trustDetail = rankedTrustDetail(r);
                      return (
                        <tr
                          key={r.symbol}
                          tabIndex={0}
                          className="border-b border-slate-800/40 hover:bg-slate-800/30 focus:bg-slate-800/40 focus:outline-none cursor-pointer transition-colors"
                          onClick={() => handleV2RowClick(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleV2RowClick(r);
                            }
                          }}
                        >
                          <td className="py-2.5 px-2 whitespace-nowrap"><div className="font-bold text-white">{r.symbol}</div><div className="text-[11px] text-slate-600" title="Setup / regime label from the scoring engine">{r.setup ?? regimeLabel}</div></td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="text-sm font-black" style={{ color: mspColor }}>{msp}</span>
                            {r.canonical ? <div className="text-[10px] font-bold text-slate-400" title="Canonical grade (A/B/C, F = blocked)">Grade {r.canonical.grade}</div> : null}
                            {r.canonical || r.compositeV2 ? <details className="text-left" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                              <summary className="cursor-pointer text-[10px] text-emerald-300">Why</summary>
                              <div className="min-w-80 max-w-md whitespace-normal">
                                {r.canonical ? <CanonicalVerdict c={r.canonical} legacyScore={r.compositeV2?.composite ?? null} /> : null}
                                {r.compositeV2 ? <details><summary className="cursor-pointer text-[10px] text-slate-500">Legacy composite (secondary)</summary><CompositeBreakdown v2={r.compositeV2} expanded /></details> : null}
                              </div>
                            </details> : null}
                          </td>
                          <td className="py-2.5 px-2 text-slate-300 font-mono whitespace-nowrap">{formatPrice(r.price)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap"><Badge label={compactBiasLabel(r.direction)} color={dirColor(r.direction)} small /></td>
                          <td className="py-2.5 px-2 text-slate-400 text-[11px] whitespace-nowrap">{r.canonical ? `${Math.round(r.canonical.coverage * 100)}% · ${r.canonical.mode}` : r.compositeV2?.coverage != null ? `${Math.round(r.compositeV2.coverage * 100)}% · ${r.compositeV2.evidenceQuality}` : 'Unavailable'}</td>
                          <td className="py-2.5 px-2 text-[11px] whitespace-nowrap max-w-[110px] truncate text-slate-300" title={[reason, ...(r.rankExplanation?.strengths ?? []), ...(r.rankExplanation?.penalties ?? []), ...(r.rankExplanation?.warnings ?? [])].filter(Boolean).join(' · ')}>{reason}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span title={trustDetail} className="rounded border px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap" style={{ color: dataQualityColor(trust === 'INSUFFICIENT DATA' ? 'MISSING' : trust === 'STALE' ? 'DEGRADED' : trust), borderColor: dataQualityColor(trust === 'INSUFFICIENT DATA' ? 'MISSING' : trust === 'STALE' ? 'DEGRADED' : trust) + '55', backgroundColor: dataQualityColor(trust === 'INSUFFICIENT DATA' ? 'MISSING' : trust === 'STALE' ? 'DEGRADED' : trust) + '15' }}>
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
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleV2RowClick(r); }} className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 rounded text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">Review</button>
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
                {(() => {
                  const bars = rankedRows.map((r) => r.dataBasis?.lastCompletedBarAt).filter((x): x is string => Boolean(x)).sort();
                  const newest = bars[bars.length - 1];
                  const iv = [...new Set(rankedRows.map((r) => r.barInterval).filter(Boolean))].join('/');
                  return newest ? <span className="text-slate-600" title="Market time of the most recent completed bar in this queue — distinct from when the scan was computed">· Last completed bar: {/^\d{4}-\d{2}-\d{2}$/.test(newest) ? newest : `${newest.slice(0, 16).replace('T', ' ')} UTC`}{iv ? ` (${iv} bars)` : ''}</span> : null;
                })()}
                {lastScanAt && (
                  <span className="text-slate-600">
                    · Computed: {lastScanAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!canAccessUnlimitedScanning(tier) && (
                  <a href="/pricing" className="text-[11px] text-amber-400 hover:underline">
                    Free: {FREE_DAILY_SCAN_LIMIT}/day — Upgrade
                  </a>
                )}
                <button type="button" onClick={() => { equity.refetch(); crypto.refetch(); }} className="text-[11px] text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60 rounded px-1">Rescan</button>
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
                      <button key={ac} type="button" aria-pressed={proAsset === ac} onClick={() => setProAsset(ac)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 ${proAsset === ac ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
                        {ac}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="pro-sector-filter" className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Sector Filter</label>
                  <select id="pro-sector-filter" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                    <option value="all">All</option>
                  </select>
                </div>
              </div>

              {/* Structure */}
              <div className="md:col-span-7 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Structure</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pro-timeframe" className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Timeframe</label>
                    <select id="pro-timeframe" value={proTimeframe} onChange={e => setProTimeframe(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value="1d">1d</option><option value="1h">1h</option><option value="30m">30m</option><option value="15m">15m</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pro-mtf-alignment" className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Factor agreement</label>
                    <select id="pro-mtf-alignment" value={proMtfAlignment} onChange={e => setProMtfAlignment(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={2}>2/4+</option><option value={3}>3/4+</option><option value={4}>4/4</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pro-min-confidence" className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Min Evidence Score</label>
                    <select id="pro-min-confidence" value={proMinConfidence} onChange={e => setProMinConfidence(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value={0}>Any</option><option value={30}>30</option><option value={40}>40</option><option value={50}>50</option><option value={60}>60</option><option value={70}>70</option><option value={80}>80</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pro-vol-state" className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Vol State</label>
                    <select id="pro-vol-state" value={proVolState} onChange={e => setProVolState(e.target.value as ProScanFilters['volatility'])}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200">
                      <option value="all">All</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor="pro-squeeze" className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Squeeze</label>
                  <select id="pro-squeeze" value={proSqueeze} onChange={e => setProSqueeze(e.target.value as any)}
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
                  <span data-testid="pro-scan-mode" className="rounded-md border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-bold uppercase text-white" title="Deep scan is the only Pro Scanner mode">
                    Deep
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5">
                {(['observe', 'review'] as const).map(i => (
                  <button key={i} type="button" aria-pressed={proIntent === i} onClick={() => setProIntent(i)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 ${proIntent === i ? 'border-slate-500 bg-slate-800 text-white' : 'border-[var(--msp-border)] text-slate-500 hover:text-slate-300'}`}>
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
              aria-disabled={proScanLoading}
              className={`mt-4 w-full rounded-md border px-3 py-2 text-[12px] font-black uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${
                proScanLoading
                  ? 'cursor-not-allowed border-amber-400/20 bg-amber-400/5 text-amber-200/60'
                  : 'border-amber-400/35 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
              }`}
            >
              {proScanLoading ? 'Analyzing…' : 'Run Educational Scan'}
            </button>
          </div>

          {/* Strategy Templates */}
          <ScanTemplatesBar onSelect={applyTemplate} onClear={clearTemplate} activeId={activeTemplateId} />

          {/* Filters apply to the next manual scan, before the result limit. */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
              <div className="flex items-center gap-2">
                <label htmlFor="pro-filter-bias" className="text-[11px] uppercase text-slate-500">Bias:</label>
                <select id="pro-filter-bias" value={proDirection} onChange={e => setProDirection(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="long">Bullish</option><option value="short">Bearish</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="pro-filter-quality" className="text-[11px] uppercase text-slate-500">Quality:</label>
                <select id="pro-filter-quality" value={proQuality} onChange={e => setProQuality(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="high">High</option><option value="medium">Medium</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="pro-filter-sort" className="text-[11px] uppercase text-slate-500">Sort:</label>
                <select id="pro-filter-sort" value={proSort} onChange={e => setProSort(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="rank">Rank</option><option value="confidence">Confluence</option><option value="volatility">Volatility</option><option value="trend">Trend</option>
                </select>
              </div>
              <div className="ml-auto flex gap-1">
                <button type="button" onClick={() => setProBulkViewMode('table')} className={`rounded px-2 py-1 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/50 ${proBulkViewMode === 'table' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>Table</button>
                <button type="button" onClick={() => setProBulkViewMode('cards')} className={`rounded px-2 py-1 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/50 ${proBulkViewMode === 'cards' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}>Cards</button>
              </div>
            </div>
          <p className="text-xs text-slate-400">Run Educational Scan after changing filters or sort. Filters apply to all evaluated candidates before the 50-result limit. Deep scan loads full candle history for every symbol; candidates missing a required input are counted as unavailable.</p>

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
                  ['Scanned', String(proScanResults.scanned ?? '—'), 'var(--msp-text)'],
                  ['Candidates', String(proScreenerRows.length), 'var(--msp-bull)'],
                  ['Aligned', String(proScreenerRows.filter(r => r.permission === 'COMPLIANT').length), 'var(--msp-bull)'],
                  ['Mixed Evidence', String(proScreenerRows.filter(r => r.permission === 'TIGHT').length), 'var(--msp-warn)'],
                  ['Data Weak', String(proScreenerRows.filter(r => r.dataQuality !== 'GOOD').length), 'var(--msp-bear)'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
                    <div className="mt-0.5 text-base font-black" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span>Scanned: {proScanResults.scanned ?? '—'}</span>
                <span>Evaluated: {proScanResults.selection?.evaluated ?? '—'} · Matched: {proScanResults.selection?.matched ?? '—'} · Returned: {proScreenerRows.length}</span>
                {proScanResults.selection?.beyondLimit > 0 && <span>{proScanResults.selection.beyondLimit} additional matches beyond the {proScanResults.selection.limit}-result limit</span>}
                {proScanResults.selection?.unavailable > 0 && <span>{proScanResults.selection.unavailable} candidates lack usable data (stale, too little history or missing inputs)</span>}
                <span>Duration: {proScanResults.duration ?? '—'}</span>
                <span>Requested: {proScanResults.requestedType} · {proScanResults.requestedTimeframe} · {proScanResults.requestedDepth}</span>
                <span>Executed: {proScanResults.mode ?? 'Unavailable'}</span>
                {proScanResults.universe?.input != null && <span title={proScanResults.universe.note ?? ''}>Universe: {proScanResults.universe.input} in → {proScanResults.universe.valid} valid{proScanResults.universe.providerMisses ? ` · ${proScanResults.universe.providerMisses} provider misses` : ''}{proScanResults.universe.excludedCounts ? ` · excluded ${Object.entries(proScanResults.universe.excludedCounts as Record<string, number>).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ')}` : ''}</span>}
                {proScanResults.universe?.excluded?.length ? <span title={(proScanResults.universe.excluded as Array<{ symbol: string; reason: string }>).map((x) => `${x.symbol}: ${x.reason}`).join('\n')}>Excluded: {(proScanResults.universe.excluded as Array<{ symbol: string; reason: string }>).slice(0, 6).map((x) => `${x.symbol} (${x.reason.replace(/_/g, ' ')})`).join(', ')}{proScanResults.universe.excluded.length > 6 ? ` +${proScanResults.universe.excluded.length - 6}` : ''}</span> : null}
              </div>
              {Object.keys(proFilterDrops).length > 0 && (
                <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  {proScanResults.selection?.excluded ?? 0} excluded before ranking limit · first exclusion reason per candidate: {formatExclusionBreakdown(proFilterDrops).join('; ')}. Adjust filters and run again; unavailable inputs need a deeper scan or provider recovery.
                </div>
              )}
              {proBulkViewMode === 'cards'
                ? <ProScannerCards rows={proScreenerRows} onRowClick={handleProRowClick} />
                : <ScreenerTable rows={proScreenerRows} emptyMessage="No evaluated candidates satisfy the selected filters. Review exclusions, universe coverage, and data availability." onRowClick={handleProRowClick} selectedSymbol={selectedSymbol ?? undefined} />}
              <div className="mt-2 text-[11px] text-slate-600">
                Bias within these {proScreenerRows.length} Pro matches (from {proScanResults.scanned ?? '—'} {proAsset} symbols scanned) · Regime: {currentRegime.toUpperCase()} · {proScreenerRows.filter(r => r.direction === 'LONG').length} long / {proScreenerRows.filter(r => r.direction === 'SHORT').length} short / {proScreenerRows.filter(r => r.direction === 'NEUTRAL').length} neutral. This describes your filtered universe, not the whole market.
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
              onClose={() => { setSelectedSymbol(null); setSelectedAssetClass(null); setSymbolDetail(null); }}
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
