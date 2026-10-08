'use client';

import { scannerAssetType } from '@/lib/market/assets';
import { useSearchParams, useRouter } from 'next/navigation';
import { useManualScannerResults } from '@/components/scanner/useManualScannerResults';
import { researchLabel, researchReason } from '@/components/terminal/researchPresentation';
import { formatMarketTime } from '@/lib/market/priceStamp';
import { trustBadgeState } from '@/components/market/TrustBadge';
import { symbolHref } from '@/lib/market/links';
import { compareScannerScores } from '@/lib/scanner/scoreContract';

/* ---------------------------------------------------------------------------
   UNIFIED SCANNER HUB — V2 Ranked + V1 Pro Scanner on one page
   Toggle between auto-loading regime-aware ranking and manual pro scan.
   Click any symbol for inline analysis with Backtest / Alert / Watchlist.
   --------------------------------------------------------------------------- */

import { useMemo, useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { formatExclusionBreakdown, proCandidateMetrics, type ProScanFilters } from '@/lib/scanner/proSelection';
import { RANKED_VERDICT_CLASS, rankedVerdictBadge } from '@/lib/scanner/rankedVerdict';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import { HIGH_MSP_SCORE, rowHasWeakData } from '@/lib/scanner/researchValidity';
import { legacyExecutionReason } from '@/lib/scanner/legacyReason';
import Link from 'next/link';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useRegime, type ScanResult, type ScanTimeframe, SCAN_TIMEFRAMES } from '@/app/v2/_lib/api';
import { Card, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import { REGIME_WEIGHTS, LIFECYCLE_COLORS } from '@/app/v2/_lib/constants';
import { computeMspScore, deriveLifecycleState, isRegimeCompatibleForRegime, normalizeRegimeKey, setupTypeForRegime } from '@/lib/scanner/rankedQueue';
import { humanizeEnum } from '@/lib/presentation/labels';
import { buildAnalysisNarrative, classifySetupFamily } from '@/lib/scanner/analysisNarrative';
import { DATA_TRUST_LABEL } from '@/lib/scanner/dataTrust';
import { reconcileFeedStatusWithRows } from '@/lib/scanner/feedStatusFromRows';
import type { RegimePriority, LifecycleState } from '@/app/v2/_lib/types';
import { useUserTier, FREE_DAILY_SCAN_LIMIT, canAccessUnlimitedScanning } from '@/lib/useUserTier';
import ScreenerTable, { type ScreenerRow } from '@/components/scanner/ScreenerTable';
import { formatScannerPrice, proDisplaySymbol } from '@/lib/scanner/proDisplay';
import ScannerInsightStrip from '@/components/analysis/ScannerInsightStrip';
import CompositeBreakdown from '@/components/analysis/CompositeBreakdown';
import CanonicalVerdict from '@/components/analysis/CanonicalVerdict';
import { compareCanonicalRows } from '@/lib/scoring/canonical/scannerAdapter';
import { isNoSetupRow, noSetupRankedReason, rankedBiasTitle, rankedClaimedDirection, rankedScoreLabel } from '@/lib/scanner/rankedDisplay';
import { type ScanTemplate } from '@/components/scanner/ScanTemplatesBar';
import { useRegisterPageData } from '@/lib/ai/pageContext';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { saveResearchCase } from '@/lib/clientResearchCases';
import DataFreshnessBadge from '@/components/market/DataFreshnessBadge';
import FreeLoading from '@/components/free/Loading';
import FreeScannerModes from '@/components/scanner/FreeScannerModes';
import PresetCards from '@/components/scanner/PresetCards';
import MarketStatusStrip from '@/components/market/MarketStatusStrip';
import ChipRow from '@/components/visual/ChipRow';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import StatTile from '@/components/visual/StatTile';
import TabBar from '@/components/visual/TabBar';
import ScoreTypeBadge from '@/components/ui/ScoreTypeBadge';

/* ─── Helpers ─── */
function scannerCopy(value:string) { return researchReason(value).replace(/\bbullish\b/gi,'upside').replace(/\bbearish\b/gi,'downside').replace(/\bLONG\b/g,'Upside').replace(/\bSHORT\b/g,'Downside').replace(/\bDEGRADED\b/gi,'Limited data').replace(/\bUnavailable\b/gi,'Not collected').replace(/\bMISSING\b/g,'Not collected').replace(/wait for (confirmation|break or fade)/gi,'confirmation not recorded'); }

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

type ProviderStatus = NonNullable<NonNullable<ReturnType<typeof useManualScannerResults>['data']>['metadata']['dataQuality']>['providerStatus'];

function summarizeRankedReason(r: ScanResult, lifecycle: LifecycleState, regimeCompatible: boolean, activeRegime: string): string {
  // A canonical "No setup" row has no setup to support: show the engine's closest-candidate reason, not factor praise.
  const noSetup = noSetupRankedReason(r);
  if (noSetup) return noSetup;
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
  if (r.confidence != null && r.confidence >= 70) return 'High indicator agreement';
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
    r.confidence == null ? 'indicator agreement' : null,
    r.score == null ? 'raw score' : null,
    r.dveBbwp == null && !r.dveSignalType && !r.dveFlags?.length ? 'DVE context' : null,
  ].filter(Boolean) as string[];
  return missing.length ? `Missing or weak: ${missing.join(', ')}.` : 'Price, indicator agreement, and volatility context are available.';
}

/**
 * Panel status for one asset class, reconciled with the row Trust labels (lib/scanner/feedStatusFromRows): the panel,
 * the "Degraded Data" card and the rows must agree, and a DEGRADED/STALE panel always says why.
 */
function downgradeProviderStatusForRows(
  status: ProviderStatus | null | undefined,
  rows: ScanResult[] | undefined,
): ProviderStatus | null {
  return reconcileFeedStatusWithRows(status ?? null, rows, rankedTrustLabel, (r) => r.dataBasis?.lastCompletedBarAt);
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

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <div className="mt-3 h-1.5 rounded-full bg-[var(--msp-border)]" data-testid="score-bar" />;
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--msp-border)]" data-testid="score-bar">
      <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, score))}%`, background: 'var(--msp-green)' }} />
    </div>
  );
}

function lifecycleLabel(lifecycle: LifecycleState): string {
  if (lifecycle === 'READY') return 'Multi-confirmed pattern';
  if (lifecycle === 'SETTING_UP') return 'Pattern still forming';
  if (lifecycle === 'INVALIDATED') return 'Needs review';
  const plain = lifecycle.replaceAll('_', ' ');
  if (/unknown/i.test(plain)) return 'Research stage';
  return plain;
}

const TABS = ['All', 'Bullish', 'Bearish', 'High Score ≥70', 'DVE Signals', 'Squeeze', 'Regime Match'] as const;
const LEGACY_MULTI_FACTOR_STATUS = ['TRADE', 'READY'].join('_');
const LEGACY_LOW_ALIGNMENT_STATUS = ['NO', 'TRADE'].join('_');
type SortKey = 'symbol' | 'score' | 'direction' | 'confidence' | 'rsi' | 'price' | 'dveBbwp' | 'mspScore';
type SortDir = 'asc' | 'desc';

// Ranking helpers live in lib/scanner/rankedQueue so Scanner and Command Center share ONE research queue.

type ScannerMode = 'ranked' | 'pro';
type ScannerStage = ScannerMode | 'analysis';
type AssetClass = 'crypto' | 'equity' | 'forex';
/** Below the md breakpoint (matches the .msp-scanner-mobile rules in globals.css). */
const PHONE_MEDIA_QUERY = '(max-width: 767px)';
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
          <div className={`h-full min-w-0 rounded-md border px-2 py-1.5 text-left transition sm:px-3 ${
            isActive
              ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
              : disabled
                ? 'border-white/10 bg-white/[0.025] text-slate-600'
                : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]'
          }`}>
            <div className="truncate break-normal text-[10px] font-black uppercase tracking-[0.06em] text-slate-500 sm:tracking-[0.14em]" title={stage.eyebrow}>{stage.eyebrow}</div>
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

function ScannerRowStamp({row}:{row:ScanResult}) { return <span>{row.price == null ? 'Not collected' : formatScannerPrice(row.price)}</span>; }

function ProScannerCards({ rows, onRowClick }: { rows: ScreenerRow[]; onRowClick: (row: ScreenerRow) => void }) {
 return <div className="space-y-2" data-scanner-results>{rows.map(row=><button key={row.symbol} onClick={()=>onRowClick(row)} className="min-h-10 w-full rounded-lg border border-slate-700 p-3 text-left">
 <span className="flex justify-between gap-3"><strong>{row.displaySymbol ?? row.symbol}</strong><span>{row.price != null ? formatScannerPrice(row.price) : 'Not collected'}</span></span>
 <span className="mt-1 block text-xs text-slate-400">RSI {row.rsi != null ? row.rsi.toFixed(1) : 'not collected'} · ADX {row.adx != null ? row.adx.toFixed(1) : 'not collected'}</span>
 </button>)}</div>;
}

function RankedMobileCards({ rows, activeRegime, onRowClick }: { rows: ScanResult[]; activeRegime: string; onRowClick: (row: ScanResult) => void }) {
 return <div className="space-y-2 md:hidden" data-scanner-results>{rows.map(row=><button key={row.symbol} onClick={()=>onRowClick(row)} className="min-h-10 w-full rounded-lg border border-slate-700 p-3 text-left" aria-label={`Review scenario for ${row.symbol}`}>
 <span className="flex justify-between gap-3"><strong>{row.symbol}</strong><span data-testid="ranked-card-price"><ScannerRowStamp row={row}/></span></span>
 <span className="mt-1 block text-xs text-slate-400">RSI {row.rsi != null ? row.rsi.toFixed(1) : 'not collected'} · ADX {row.adx != null ? row.adx.toFixed(1) : 'not collected'}</span>
 </button>)}</div>;
}

function RankedFallbackList({ rows, activeRegime, onRowClick }: { rows: ScanResult[]; activeRegime: string; onRowClick: (row: ScanResult) => void }) {
  return (
    <div className="msp-scanner-mobile-cards grid-cols-1 gap-3">
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
                {/* SC-14: same price as the desktop Ranked table's Price column. */}
                <div className="sr-only"><div data-testid="ranked-card-price"><ScannerRowStamp row={row} /></div></div>
                <div className="mt-0.5 text-xs text-slate-500">{row.scoreV2?.regime?.label || row.type || 'Market scenario'}</div>
              </div>
              <span className="rounded-md border px-2 py-1 text-[11px] font-black uppercase" style={{ color: dataQualityColor(trust), borderColor: dataQualityColor(trust) + '55', backgroundColor: dataQualityColor(trust) + '15' }} title={trustDetail}>
                {trust}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{rankedScoreLabel(row)}</div>
                <div className="mt-1 text-sm font-black" style={{ color: mspColor }}>{isNoSetupRow(row) ? '—' : msp}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Bias</div>
                <div className="mt-1 text-xs font-black text-white" title={rankedBiasTitle(row)}>{isNoSetupRow(row) ? 'No setup' : compactBiasLabel(row.direction)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/45 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Factor coverage</div>
                <div className="mt-1 text-xs font-black text-white">{row.compositeV2?.coverage != null ? `${Math.round(row.compositeV2.coverage * 100)}%` : 'Not supplied'}</div>
              </div>
            </div>
            <ScoreBar score={isNoSetupRow(row) ? null : msp} />
            <p className="mt-2 text-xs text-[var(--msp-text-muted)]">90-day line not supplied with this row</p>
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
              <span className="inline-flex min-h-10 items-center text-xs font-bold text-emerald-300">Why This Rank / Review</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RankedDesktopFallbackTable({rows,activeRegime,onRowClick}:{rows:ScanResult[];activeRegime:string;onRowClick:(row:ScanResult)=>void}) {
 return <table className="hidden w-full table-fixed text-sm md:table" aria-label="Ranked scanner results"><thead><tr className="text-left text-xs text-slate-400"><th className="w-24 py-2">Symbol</th><th className="w-24">Price</th><th className="w-20">Score</th><th>Evidence</th><th className="w-20">Review</th></tr></thead><tbody>{rows.map(row=><tr key={row.symbol} className="border-t border-slate-800"><td className="py-2 font-semibold">{row.symbol}</td><td><ScannerRowStamp row={row}/></td><td>{!isNoSetupRow(row)&&Math.round(computeMspScore(row,activeRegime))}</td><td className="break-words py-2 pr-3 text-xs text-slate-400">{scannerCopy(summarizeRankedReason(row,deriveLifecycleState(row,activeRegime),isRegimeCompatibleForRegime(row,activeRegime),activeRegime))}</td><td><button className="min-h-10 text-emerald-300" onClick={()=>onRowClick(row)}>Review</button></td></tr>)}</tbody></table>;
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PublicScannerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/tools/golden-egg?view=find'); }, [router]);
  return <p className="p-4"><Link className="underline" href="/tools/golden-egg?view=find">Continue to Find symbols</Link></p>;
}

export default function ScannerPage() { const { isAdmin, isLoading } = useUserTier(); if (isLoading) return <FreeLoading />; if (!isAdmin) return <PublicScannerRedirect />; return <Suspense fallback={<div>Loading Scanner…</div>}><ScannerContent /></Suspense>; }

function ScannerContent() {
  const searchParams=useSearchParams();
  const router=useRouter();
  const marketAsset=scannerAssetType(searchParams.get('type'));
  const selectMarket=(asset:'crypto'|'equity')=>{ const params=new URLSearchParams(searchParams.toString()); params.set('type',asset); router.replace(`/tools/scanner?${params}`,{scroll:false}); };
  const { navigateTo, selectSymbol } = useV2();
  const { tier } = useUserTier();
  const regime = useRegime();

  /* ─── Scanner mode toggle ─── */
  const [showAllRows, setShowAllRows] = useState(false);
  const [mode, setMode] = useState<ScannerMode>('ranked');

  /* ─── V2 Ranked Scan state ─── */
  const [v2Timeframe, setV2Timeframe] = useState<ScanTimeframe>('daily');
  const equity = useManualScannerResults('equity', v2Timeframe);
  const crypto = useManualScannerResults('crypto', v2Timeframe);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All');
  const [sortKey, setSortKey] = useState<SortKey>('mspScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* ─── Pro Scan state ─── */
  const [proAsset, setProAsset] = useState<AssetClass>(()=>scannerAssetType(searchParams.get('type')));
  useEffect(()=>setProAsset(scannerAssetType(searchParams.get('type'))),[searchParams]);
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
  // Results from a scan whose filters/sort have since changed are hidden (they no longer match the controls); say so and
  // offer the re-run instead of leaving an empty area (SC-11).
  const proResultsOutdated = Boolean(proResponse) && !proScanResults;
  const proAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    proAbortRef.current?.abort();
    setProScanLoading(false);
    setProScanError(null);
    return () => proAbortRef.current?.abort();
  }, [proRequestKey]);
  const [proScanError, setProScanError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(undefined);



  const [proBulkViewMode, setProBulkViewMode] = useState<'table' | 'cards'>('table');
  // SC-7: the Pro table is ~1,450px wide, so phones start on cards (same rows); the Table toggle still works.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.(PHONE_MEDIA_QUERY).matches) setProBulkViewMode('cards');
  }, []);

  /* ─── Shared detail state ─── */

  const currentRegimeRaw = regime.data?.regime || 'RANGE_NEUTRAL'; // unavailable regime → neutral weights (what /api/regime used to return with no signals)
  const currentRegime = normalizeRegimeKey(currentRegimeRaw);

  function isRegimeCompatible(r: ScanResult): boolean {
    return isRegimeCompatibleForRegime(r, currentRegimeRaw);
  }

  /* ─── V2 Ranked data ─── */
  const allResults: ScanResult[] = useMemo(() => {
    const eq = (equity.data?.results || []).map(r => ({ ...r, _assetClass: 'equity' as const }));
    const cr = (crypto.data?.results || []).map(r => ({ ...r, _assetClass: 'crypto' as const }));
    return marketAsset==='crypto'?cr:eq;
  }, [equity.data, crypto.data,marketAsset]);

  // Completion time of the scan whose rows are shown, so a finished scan's source line carries a time.
  const rankedScan = marketAsset==='crypto'?crypto.data:equity.data;
  const rankedScanAsOf = rankedScan?.metadata?.dataQuality?.computedAt ?? rankedScan?.metadata?.timestamp ?? null;
  const rankedLocalDemo = Boolean(equity.data?.metadata?.localDemo || crypto.data?.metadata?.localDemo);
  const rankedProviderStatuses = useMemo(() => ([
    { label: 'Equity', status: downgradeProviderStatusForRows(equity.data?.metadata?.dataQuality?.providerStatus ?? null, equity.data?.results), quality: equity.data?.metadata?.dataQuality ?? null },
    { label: 'Crypto', status: downgradeProviderStatusForRows(crypto.data?.metadata?.dataQuality?.providerStatus ?? null, crypto.data?.results), quality: crypto.data?.metadata?.dataQuality ?? null },
  ]), [equity.data, crypto.data]);

  const filtered = useMemo(() => {
    let items = [...allResults];
    switch (activeTab) {
      case 'Bullish': items = items.filter(r => rankedClaimedDirection(r) === 'bullish'); break;
      case 'Bearish': items = items.filter(r => rankedClaimedDirection(r) === 'bearish'); break;
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
    Bullish: allResults.filter(r => rankedClaimedDirection(r) === 'bullish').length,
    Bearish: allResults.filter(r => rankedClaimedDirection(r) === 'bearish').length,
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
    };
  }, [mode, currentRegime, v2Timeframe, proTimeframe, proAsset, rankedRows, proScanResults]);

  const aiSymbols = useMemo(() =>
    rankedRows.slice(0, 5).map(r => r.symbol),
    [rankedRows]
  );

  const aiSummary = useMemo(() => {
    const bullish = rankedRows.filter(r => r.direction === 'bullish').length;
    const bearish = rankedRows.filter(r => r.direction === 'bearish').length;
    return `Scanner: ${rankedRows.length} results, ${bullish} bullish / ${bearish} bearish, Regime: ${currentRegime}, Timeframe: ${mode === 'ranked' ? v2Timeframe : proTimeframe}`;
  }, [rankedRows, currentRegime, mode, v2Timeframe, proTimeframe]);

  useRegisterPageData('scanner', aiData, aiSymbols, aiSummary);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  /* ─── V2 row click ─── */
  const handleV2RowClick = useCallback((r: ScanResult) => {
    const asset=(r as any)._assetClass==='crypto'?'crypto':'equity';
    router.push(symbolHref(r.symbol,asset,v2Timeframe));
  },[router,v2Timeframe]);

  /* ─── Pro Scan: run bulk scan ─── */
  const runProScan = useCallback(async () => {
    proAbortRef.current?.abort();
    const controller = new AbortController();
    proAbortRef.current = controller;
    setProScanLoading(true);
    setProScanError(null);
    setProScanResults(null);
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
          : legacyExecutionReason(blockReasons, scoreV2?.context?.riskOffThresholds) ?? (strategyKey.includes('range_break') ? 'Range break watch — needs expansion confirmation'
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
          rank: idx + 1, symbol: pick.symbol, displaySymbol: proDisplaySymbol(pick.symbol, proScanResults?.type ?? proAsset), direction: dir, confidence: conf, matchConfidence: matchConf, quality: qual,
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
  const handleProRowClick = useCallback((row:ScreenerRow)=>{
    router.push(symbolHref(row.symbol,proAsset,proTimeframe));
  },[router,proAsset,proTimeframe]);


  const selectScannerMode = useCallback((nextMode: ScannerMode) => {
    setMode(nextMode);
  }, []);

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
  const headerStage: ScannerMode = mode;
  const modeLabel = headerStage === 'ranked' ? 'Ranked queue' : 'Pro scan';
  const modeDetail = headerStage === 'ranked'
    ? 'System-ranked research opportunities'
    : 'Filters applied before the result limit';
  const queueValue = queueCount > 0
      ? `${queueCount} ${headerStage === 'pro' ? 'candidates' : 'symbols'}`
      : 'Empty';
  const queueTone = queueCount > 0 ? 'var(--msp-bull)' : 'var(--msp-flat)';
  const queueDetail = headerStage === 'pro'
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
  const dataLoadingCount = (mode === 'ranked' ? [equity.loading, crypto.loading] : [proScanLoading]).filter(Boolean).length;
  const dataHealthValue = dataIssues.length ? `${dataIssues.length} issue${dataIssues.length === 1 ? '' : 's'}` : dataLoadingCount ? `${dataLoadingCount} loading` : mode === 'pro' && !proScanResults ? 'Not scanned' : 'Ready';
  const dataHealthTone = dataIssues.length ? 'var(--msp-warn)' : dataLoadingCount ? 'var(--msp-flat)' : 'var(--msp-bull)';
  const dataHealthDetail = dataIssues.length ? dataIssues.join(', ') : dataLoadingCount ? 'Feeds syncing' : 'No feed errors reported';
  const topRankedSymbol = rankedRows[0]?.symbol;
  const topProSymbol = proScreenerRows[0]?.symbol;
  const headerTopSymbol = mode === 'ranked' ? topRankedSymbol : topProSymbol;
  const nextCheckValue = headerStage === 'pro'
      ? proScanResults
        ? topProSymbol ? `Review ${topProSymbol}` : 'Review filter exclusions'
        : 'Run Educational Scan'
      : topRankedSymbol ? `Review ${topRankedSymbol}` : v2Loading ? 'Loading queue…' : 'Awaiting ranked data';
  const nextCheckDetail = headerStage === 'pro'
      ? proScanResults ? 'Click a row to inspect a candidate' : 'Configure filters then run scan'
      : topRankedSymbol ? 'Top-ranked candidate' : 'Cached scanner data syncing';
  const nextCheckTone = headerTopSymbol ? 'var(--msp-warn)' : 'var(--msp-flat)';
  const topRankedAsset = rankedRows[0] ? (((rankedRows[0] as any)._assetClass === 'crypto' ? 'crypto' : 'equity') as 'crypto' | 'equity') : null;
  const handoffAsset = mode === 'ranked' ? topRankedAsset : proAsset === 'crypto' ? 'crypto' : 'equity';
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
    <div className="space-y-3 [&_button]:min-h-10 [&_select]:min-h-10" data-scanner-page>
      <header className="rounded-lg border border-slate-700 p-3">
        <h1 className="text-xl font-semibold">Scanner</h1>
        <p className="mt-1 text-sm font-semibold" data-scanner-verdict>{queueCount ? `${queueCount} research candidates` : 'Run a scan to collect research candidates.'}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs"><Link href={goldenEggHref}>Open Symbol</Link><Link href={terminalHref}>Open Terminal</Link></div>
      </header>
      <ComplianceDisclaimer compact />
      <TabBar label="Scanner mode" activeId={mode === 'pro' ? 'pro' : 'quick'} onChange={id=>{selectScannerMode(id==='pro'?'pro':'ranked');setShowAllRows(false);}} items={[{id:'quick',label:'Quick scan'},{id:'pro',label:'Pro scanner'}]} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">Market<select aria-label="Market" value={marketAsset} onChange={e=>{selectMarket(e.target.value as 'equity'|'crypto');setShowAllRows(false);}} className="ml-2 rounded border border-slate-700 bg-slate-900 px-2"><option value="equity">Stocks</option><option value="crypto">Crypto</option></select></label>
        <button type="button" data-testid="run-educational-scan" onClick={()=>{setShowAllRows(false);if(mode==='pro')void runProScan();else void (marketAsset==='crypto'?crypto:equity).refetch();}} disabled={proScanLoading||v2Loading} className="ml-auto rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{proScanLoading||v2Loading?'Analyzing…':'Run Educational Scan'}</button>
      </div>
      <div className="grid grid-cols-3 gap-2" data-scanner-tiles>
        <StatTile label="Matches" value={String(queueCount)} />
        <StatTile label="Aligned" value={String(mode==='ranked'?filtered.filter(r=>deriveLifecycleState(r,currentRegime)==='READY').length:proScreenerRows.filter(r=>r.permission==='COMPLIANT').length)} />
        <StatTile label="Mixed evidence" value={String(mode==='ranked'?filtered.filter(r=>deriveLifecycleState(r,currentRegime)==='SETTING_UP').length:proScreenerRows.filter(r=>r.permission==='TIGHT').length)} warning />
      </div>
      <CollapsibleSection title="Scan presets" summary="Select conditions, then run manually."><PresetCards activeId={activeTemplateId} onSelect={template=>{selectScannerMode('pro');if(activeTemplateId===template.id)clearTemplate();else applyTemplate(template);}} /></CollapsibleSection>
      <CollapsibleSection title="Data details" summary={dataHealthDetail}><p className="text-xs text-slate-400">{dataHealthValue}</p>{dataIssues.map(issue=><p key={issue} className="text-xs text-slate-400">{scannerCopy(issue)}</p>)}</CollapsibleSection>

      {/* ═══════════════════════════════ V2 RANKED SCAN ═══════════════════════════════ */}
      {mode === 'ranked' && (
        <>
          <CollapsibleSection title="Queue filters" summary="Timeframe, evidence and sort.">
          <div className="flex flex-wrap gap-3 text-xs">
          <label>Timeframe<select value={v2Timeframe} onChange={e=>setV2Timeframe(e.target.value as ScanTimeframe)} className="ml-2 rounded bg-slate-900 p-2">{SCAN_TIMEFRAMES.map(tf=><option key={tf.value} value={tf.value}>{tf.label}</option>)}</select></label>
          <label>Evidence<select value={activeTab} onChange={e=>setActiveTab(e.target.value as typeof activeTab)} className="ml-2 rounded bg-slate-900 p-2">{TABS.map(tab=><option key={tab} value={tab}>{scannerCopy(tab)} ({tabCounts[tab]})</option>)}</select></label>
          <label>Sort<select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)} className="ml-2 rounded bg-slate-900 p-2"><option value="mspScore">Score (unvalidated)</option><option value="symbol">Symbol</option><option value="price">Price</option></select></label>
          <button onClick={()=>setSortDir(sortDir==='asc'?'desc':'asc')}>{sortDir==='asc'?'Ascending':'Descending'}</button>
          </div></CollapsibleSection>
          <p data-scanner-ordering-note className="text-xs text-slate-400">Ordering uses the scanner&apos;s indicator and setup scores. They describe how strongly current conditions line up; they are not probabilities or forecasts, and historical validation on unseen data is not established. Educational research only.</p>
          {rankedLocalDemo && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Local demo scanner rows:</strong> live market data keys/cache are unavailable in this local environment, so these rows are sample data for workflow testing only. Do not treat them as live scanner output.
            </div>
          )}



          <Card>
            {v2Loading ? <p>Collecting scan results…</p> : rankedRows.length===0 && allResults.length>0 ? (
              // A completed scan whose evidence filter matches nothing keeps its result: no example card.
              <div data-scanner-no-matches className="rounded-lg border border-[var(--msp-border)] p-4 text-sm">
                <p className="font-semibold">No matches for this filter</p>
                <p className="mt-1 text-[var(--msp-text-muted)]">0 of {allResults.length} scanned candidates match {scannerCopy(activeTab)}. Choose another evidence filter to see them.</p>
              </div>
            ) : rankedRows.length===0 ? (
              <div data-scanner-example className="rounded-lg border border-[var(--msp-border)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--msp-warn)]">Example</p>
                <p className="mt-2 text-sm">No live queue is loaded. This sample shows the card shape only. Run a scan when you want live rows.</p>
                <ScoreBar score={72} />
                <p className="mt-2 text-xs text-[var(--msp-text-muted)]">90-day line not supplied with this example</p>
                <span className="mt-3 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase">Pattern still forming</span>
              </div>
            ) : <>
              <RankedMobileCards rows={showAllRows?rankedRows:rankedRows.slice(0,5)} activeRegime={currentRegime} onRowClick={handleV2RowClick}/>
              <RankedDesktopFallbackTable rows={showAllRows?rankedRows:rankedRows.slice(0,5)} activeRegime={currentRegime} onRowClick={handleV2RowClick}/>
              {rankedRows.length>5&&<button onClick={()=>setShowAllRows(!showAllRows)} className="mt-2 text-sm text-emerald-300">{showAllRows?'Show top 5':`Show all ${rankedRows.length}`}</button>}
            </>}
          </Card>
        </>
      )}

      {/* ═══════════════════════════════ PRO SCANNER ═══════════════════════════════ */}
      {mode === 'pro' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Pro Scanner">
        <>
          <CollapsibleSection title="Advanced filters" summary="Universe, structure, bias and sort. Closed until you open them.">
          {/* Scan Configuration Form */}
          <div className="rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-4">
            <div className="grid gap-4 md:grid-cols-12">
              {/* Universe */}
              <div className="md:col-span-5 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Universe</div>
                <div className="mb-3">
                  <div className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Asset Class</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span>{proAsset==='crypto'?'Crypto':'Stocks'} · selected above</span>
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
          </div>

          {/* Filters apply to the next manual scan, before the result limit. */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
              <div className="flex items-center gap-2">
                <label htmlFor="pro-filter-bias" className="text-[11px] uppercase text-slate-500">Bias:</label>
                <select id="pro-filter-bias" value={proDirection} onChange={e => setProDirection(e.target.value as any)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                  <option value="all">All</option><option value="long">Upside evidence</option><option value="short">Downside evidence</option>
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
                  <option value="rank">Rank</option><option value="confidence">Data coverage</option><option value="volatility">Volatility</option><option value="trend">Trend</option>
                </select>
              </div>

            </div>
          </CollapsibleSection>
          <p className="text-xs text-slate-400">Run Educational Scan after changing filters or sort. Filters apply to all evaluated candidates before the 50-result limit. Deep scan loads full candle history for every symbol; candidates missing a required input are counted as not supplied.</p>

          {/* Pro Scan Error */}
          {proScanError && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{proScanError}</div>
          )}

          {proScanResults?.dataQuality?.source === 'local_demo' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Local demo Pro Scanner rows:</strong> live bulk scanner data is unavailable in this local environment, so these rows are sample research outputs for workflow testing only. Do not treat them as live scanner output.
            </div>
          )}

          {proResultsOutdated && !proScanLoading && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <span>Filters or sort changed since the last scan, so its results are hidden. Run the scan again to see matches for the new settings.</span>

            </div>
          )}

          {/* Pro Scan Results */}
          {proScanResults && (
            <div>
              {(proScanResults.selection?.excluded>0||proScanResults.universe?.excluded?.length>0)&&<span className="mb-2 inline-block rounded-full border border-slate-700 px-3 py-1 text-xs">Excluded: {proScanResults.selection?.excluded ?? proScanResults.universe.excluded.length}</span>}
              <ProScannerCards rows={showAllRows?proScreenerRows:proScreenerRows.slice(0,5)} onRowClick={handleProRowClick}/>
              {proScreenerRows.length>5&&<button onClick={()=>setShowAllRows(!showAllRows)} className="mt-2 text-sm text-emerald-300">{showAllRows?'Show top 5':`Show all ${proScreenerRows.length}`}</button>}

            </div>
          )}

          {proScanLoading && (
            <div className="space-y-3 py-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-slate-700/30 rounded animate-pulse" />)}</div>
          )}
        </>
        </UpgradeGate>
      )}

      {/* Errors */}
      {mode === 'ranked' && (equity.error || crypto.error) && (
        <div className="text-[11px] text-red-400/60 border border-red-900/30 rounded-lg p-3">
          {equity.error && <div>Equity scan: {equity.error}</div>}
          {crypto.error && <div>Crypto scan: {crypto.error}</div>}
        </div>
      )}
      <SourceLine source={rankedLocalDemo || proScanResults?.dataQuality?.source === 'local_demo' ? 'Example' : 'Scanner queue'} asOf={mode === 'ranked' ? rankedScanAsOf : proScanResults?.dataQuality?.computedAt ?? null} basis="Last completed bar" />
    </div>
  );
}
