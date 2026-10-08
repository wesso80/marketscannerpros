'use client';
import SymbolResearchDestination from '@/components/research/SymbolResearchDestination';
import SymbolReportAccessNotice from '@/components/research/SymbolReportAccessNotice';
import PublicUsageSummary from '@/components/research/PublicUsageSummary';
import { publicDesignEnabled } from '@/lib/publicDesign';
import studio from '@/components/public-design/SymbolStudio.module.css';

/* ---------------------------------------------------------------------------
   SURFACE 3: SYMBOL — research page (evidence, chart, AI summary, fundamentals)
   Real API data: /api/golden-egg + /api/dve + /api/quote
   --------------------------------------------------------------------------- */

import { CLOSE_CALENDAR_LABEL, TIMING_TOOLTIP } from '@/lib/goldenEgg/labels';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseResearchTimeframe } from '@/lib/researchContext';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { humanizeEnum } from '@/lib/presentation/labels';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useGoldenEgg, useDVE, useQuote, useRegime, type ScanTimeframe, SCAN_TIMEFRAMES } from '@/app/v2/_lib/api';
import { Card, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { REGIME_COLORS, VERDICT_COLORS, CROSS_MARKET, LIFECYCLE_COLORS, REGIME_WEIGHTS } from '@/app/v2/_lib/constants';
import type { RegimePriority } from '@/app/v2/_lib/types';
import { useCachedTopSymbols } from '@/hooks/useCachedTopSymbols';
import { useRegisterPageData } from '@/lib/ai/pageContext';
import { saveResearchCase } from '@/lib/clientResearchCases';
import EvidenceStack from '@/components/market/EvidenceStack';
import MarketStatusStrip from '@/components/market/MarketStatusStrip';
import RiskFlagPanel, { type RiskFlag } from '@/components/market/RiskFlagPanel';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';
import { PageHero } from '@/components/ui';
import { describeLevelRelation } from '@/lib/goldenEgg/timing';
import { formatUsdShort } from '@/lib/goldenEgg/semantics';
import { priceChangeBasisLabel } from '@/lib/scoring/canonical/display';
import {optionsHref} from '@/lib/market/links';
import { lookupAssetType } from '@/lib/lookupAssetType';
import {SymbolSnapshotHeader} from '@/components/market/SymbolSnapshotHeader';
import LockedPreview from '@/components/free/LockedPreview';
import { FREE_COPY } from '@/components/free/copy';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import PriceEvidencePanel from '@/components/research/PriceEvidencePanel';
import TimingEvidencePanel from '@/components/research/TimingEvidencePanel';
import ResearchSnapshotCard from '@/components/research/ResearchSnapshotCard';
import SymbolNewsPanel from '@/components/research/SymbolNewsPanel';
import VolatilityEvidencePanel from '@/components/research/VolatilityEvidencePanel';
import EvidenceSummaryPanel from '@/components/research/EvidenceSummaryPanel';
import DescriptiveStates from '@/components/research/DescriptiveStates';
import { describeStates } from '@/lib/research/descriptiveStates';
import { bbwpBasisNote } from '@/lib/research/priceEvidence';
import { measuredBbwp } from '@/lib/research/volatilityDescriptions';
import { buildEvidenceSummary } from '@/lib/research/evidenceSummary';
import { buildVolatilityEvidence } from '@/lib/research/volatilityEvidence';
import { buildResearchSnapshot } from '@/lib/research/researchSnapshot';
import type { PublicDveReading } from '@/lib/research/publicDve';
import type { PublicSymbolPacket } from '@/lib/research/publicSymbolPacket';
import ChipRow from '@/components/visual/ChipRow';
import type {StampLineProps} from '@/components/visual/StampLine';
import SourceLine from '@/components/visual/SourceLine';
import {friendlyStatus} from '@/lib/free/friendlyStatus';
import {readerSourceLabel,symbolText,symbolDate} from '@/lib/presentation/symbolDisplay';
import EquityTop from '@/components/crypto/top/EquityTop';
import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';
import {SymbolOptionsContext} from '@/components/market/SymbolMarketContext';
import {usePublicMarketFeed} from '@/hooks/usePublicMarketFeed';
import {findSymbolPick,symbolQuoteStamp} from '@/lib/market/symbolSnapshot';
import type {PicksResponse} from '@/lib/market/overview';

/** Client-safe copy of known crypto symbols for asset type detection */
const CRYPTO_SET = new Set([
  'BTC','ETH','XRP','SOL','ADA','DOGE','TRX','AVAX','LINK','DOT',
  'MATIC','SHIB','LTC','BCH','NEAR','UNI','ATOM','XLM','ICP','HBAR',
  'FIL','VET','IMX','APT','GRT','INJ','OP','THETA','FTM','RUNE',
  'LDO','ALGO','XMR','AAVE','MKR','STX','EGLD','FLOW','AXS','SAND',
  'EOS','XTZ','NEO','KAVA','CFX','MINA','SNX','CRV','DYDX','BLUR',
  'AR','SUI','SEI','TIA','JUP','WIF','PEPE','BONK','FLOKI',
  'PYTH','STRK','WLD','FET','RNDR','AGIX','OCEAN','TAO','ROSE',
  'ZIL','IOTA','ZEC','DASH','BAT','ZRX','ENJ','MANA','GALA','APE',
  'GMT','ARB','MAGIC','GMX','COMP','YFI','SUSHI','1INCH','BNB',
]);

/* ─── Dynamic imports: v1 deep-dive components ─── */
const SymbolAiSummary = dynamic(() => import('@/components/research/SymbolAiSummary'), { ssr: false });
const SymbolComparisonChart = dynamic(() => import('@/components/research/SymbolComparisonChart'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Charts…</div> });
const CompanyOverview = dynamic(() => import('@/app/tools/company-overview/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Fundamentals…</div> });
const OwnershipFlowPanel = dynamic(() => import('@/components/golden-egg/OwnershipFlowPanel'), { ssr: false });

const GE_TABS = ['Evidence', 'Chart', 'AI summary', 'Fundamentals'] as const;
type GETab = typeof GE_TABS[number];

const GE_TAB_META: Record<GETab, { eyebrow: string; description: string }> = {
  Evidence: {
    eyebrow: '1. Measured evidence',
    description: 'Measured states with their definitions, data trust, recorded levels and the next check.',
  },
  Chart: {
    eyebrow: '2. Price context',
    description: 'Inspect price action and intraday structure around the recorded levels.',
  },
  'AI summary': {
    eyebrow: '3. AI summary',
    description: 'A plain-language summary written only from the evidence on this page, with that evidence alongside.',
  },
  Fundamentals: {
    eyebrow: '4. Business context',
    description: 'Company or asset fundamentals, with their reporting periods.',
  },
};

function GoldenEggTabRail({ activeTab, onSelectTab }: { activeTab: GETab; onSelectTab: (tab: GETab) => void }) {
  return (
    <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2" aria-label="Symbol validation views">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-amber-300">Research views</div>
          <div className="text-[0.72rem] text-slate-500">Measured evidence first, then the chart, evidence detail and business context.</div>
        </div>
        <a href="/tools/liquidity-sweep" className="rounded-md border border-slate-700/70 bg-slate-900/60 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400 no-underline transition hover:border-emerald-400/30 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50">
          Open Liquidity Sweep
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {GE_TABS.map((tab) => {
          const meta = GE_TAB_META[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(tab)}
              className={`rounded-md border px-3 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                isActive
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
                  : 'border-white/10 bg-white/[0.025] text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{symbolText(meta.eyebrow)}</div>
              <div className={`mt-0.5 text-sm font-black ${isActive ? 'text-emerald-200' : 'text-white'}`}>{symbolText(tab)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GoldenEggSubviewMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{symbolText(label)}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }}>{symbolText(value)}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={symbolText(detail)}>{symbolText(detail)}</div>
    </div>
  );
}

function GoldenEggSubviewFrame({
  tab,
  symbol,
  terminalHref,
  onSelectTab,
  children,
}: {
  tab: Exclude<GETab, 'Evidence'>;
  symbol: string;
  terminalHref: string;
  onSelectTab: (tab: GETab) => void;
  children: React.ReactNode;
}) {
  const meta = GE_TAB_META[tab];
  const adjacentTab: GETab = tab === 'Chart' ? 'AI summary' : tab === 'AI summary' ? 'Fundamentals' : 'Chart';

  return (
    <div className="space-y-3">
      <section
        className="rounded-lg border border-amber-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
        aria-label={`Symbol ${tab} command header`}
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
              <span className="text-amber-300">Symbol subview</span>
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">{symbolText(meta.eyebrow)}</span>
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">Symbol {symbolText(symbol)}</span>
            </div>
            <h2 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">{symbolText(tab)} check for {symbolText(symbol)}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">{symbolText(meta.description)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onSelectTab('Evidence')} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">Review evidence</button>
              <button type="button" onClick={() => onSelectTab(adjacentTab)} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">Open {adjacentTab}</button>
              <a href={terminalHref} className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">Open Terminal</a>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <GoldenEggSubviewMetric label="Symbol" value={symbol} tone="#FBBF24" detail="Single-symbol validation context" />
            <GoldenEggSubviewMetric label="View" value={tab} tone="#10B981" detail={meta.eyebrow} />
            <GoldenEggSubviewMetric label="Focus" value={tab === 'Chart' ? 'Price Action' : tab === 'AI summary' ? 'Written summary' : 'Business Context'} tone="#A5B4FC" detail="Part of the research views" />
            <GoldenEggSubviewMetric label="Next Check" value={adjacentTab} tone="#F59E0B" detail="Continue the validation sequence" />
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

const GOLDEN_EGG_WORKFLOW_CHECKS = [
  'Measured evidence first',
  'Data trust',
  'Recorded levels',
  'Next check',
] as const;

function FlagshipMetric({ label, value, tone = 'var(--msp-flat)', ariaLabel }: { label: string; value: string; tone?: string; ariaLabel?: string }) {
  return (
    <div aria-label={ariaLabel} className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{symbolText(label)}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }}>{symbolText(value)}</div>
    </div>
  );
}

/* ─── Phase 5: Cross-Market Alignment ─── */

import { useUserTier } from '@/lib/useUserTier';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}




/** Adaptive price formatter — keeps sub-dollar assets readable */
function fmtP(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return 'Not recorded';
  const abs = Math.abs(v);
  if (abs >= 1) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toPrecision(4);
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatLevel(value: number | null | undefined): string {
  if (!isUsableNumber(value)) return 'Not recorded';
  return `$${fmtP(value)}`;
}

function getGEDataQuality(input: { price?: number | null; levels: number }) {
  if (!isUsableNumber(input.price)) return 'MISSING';
  return input.levels > 0 ? 'GOOD' : 'DEGRADED';
}

function geDataQualityColor(label: string): string {
  if (label === 'GOOD') return 'var(--msp-bull)';
  if (label === 'DEGRADED') return 'var(--msp-warn)';
  return 'var(--msp-bear)';
}

function geMissingInputs(input: { price?: number | null; levels: number }): string[] {
  return [
    !isUsableNumber(input.price) ? 'price' : null,
    input.levels === 0 ? 'recorded levels' : null,
  ].filter(Boolean) as string[];
}

function geDataQualityDetail(label: string, missing: string[]): string {
  if (label === 'GOOD') return 'Price and recorded levels are available.';
  if (missing.length === 0) return `${label} Golden Egg inputs.`;
  return `Missing or weak: ${missing.join(', ')}.`;
}

function summarizeGENextCheck(args: { dataQuality: string; hasLevels: boolean }) {
  // Phase 4: no assessment, composite threshold or blocker score here; only what to look at next.
  if (args.dataQuality !== 'GOOD') return 'Refresh the inputs before relying on the recorded levels.';
  if (!args.hasLevels) return 'No levels were recorded on this bar.';
  return 'Check the measured states again after the next completed bar.';
}


function summarizeGEReason(args: { dataQuality: string; summary?: string | null }) {
  if (args.dataQuality !== 'GOOD') return `Research context is limited by ${args.dataQuality.toLowerCase()} inputs.`;
  return args.summary || 'Measured daily evidence is not available for this timeframe.';
}

function summarizeGEResearchCaution(args: { dataQuality: string; hasLevels: boolean }) {
  if (args.dataQuality !== 'GOOD') return 'Research caution: core inputs are incomplete or weak.';
  if (!args.hasLevels) return 'Research caution: no levels were recorded on this bar.';
  return 'Research caution: verify whether new bars confirm or change the measured states.';
}

function buildGEInvalidationConditions(args: { dataQuality: string; dveRegime?: string | null; timeVerdict?: string | null }) {
  return [
    'Recorded levels become unavailable.',
    args.dataQuality !== 'GOOD' ? 'Data trust remains degraded or missing.' : null,
    args.dveRegime === 'climax' ? 'Volatility engine remains in its climax regime.' : 'Volatility engine moves into its climax regime.',
    args.timeVerdict === 'disagree' ? 'Timing note only: midpoint pull remains opposed.' : 'Timing note only: midpoint pull may change.',
  ].filter(Boolean) as string[];
}

function formatTimestamp(value: unknown): string {
  if (!value) return 'Not recorded';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString();
}

function evidenceStatus(value: boolean | undefined, missingDetail?: string) {
  if (value) return 'supportive' as const;
  return missingDetail ? 'missing' as const : 'neutral' as const;
}

function riskSeverity(label: string): RiskFlag['severity'] {
  const lower = label.toLowerCase();
  if (lower.includes('unavailable') || lower.includes('missing') || lower.includes('climax')) return 'critical';
  if (lower.includes('degraded') || lower.includes('headwind') || lower.includes('blocker') || lower.includes('below')) return 'warning';
  return 'info';
}

export default function GoldenEggPage() {
  return <SymbolResearchDestination><GoldenEggReport /></SymbolResearchDestination>;
}

function GoldenEggReport() {
  const { selectedSymbol, selectSymbol } = useV2();
  const searchParams = useSearchParams();
  const requestedTimeframe = parseResearchTimeframe(searchParams.get('timeframe'));
  const requestedAsset = searchParams.get('type');
  const { tier } = useUserTier();
  const [symbolInput, setSymbolInput] = useState('');
  const [cryptoStamp,setCryptoStamp] = useState<StampLineProps|null>(null);
  const [timeframe, setTimeframe] = useState<ScanTimeframe>(requestedTimeframe ?? 'daily');
  const [activeTab, setActiveTab] = useState<GETab>('Evidence');
  const [assetType, setAssetType] = useState<'auto' | 'equity' | 'crypto'>(requestedAsset === 'crypto' || requestedAsset === 'equity' ? requestedAsset : 'auto');
  useEffect(() => {
    setTimeframe(requestedTimeframe ?? 'daily');
    setAssetType(requestedAsset === 'crypto' || requestedAsset === 'equity' ? requestedAsset : 'auto');
  }, [requestedTimeframe, requestedAsset]);
  const [savingCase, setSavingCase] = useState(false);
  const [saveCaseMsg, setSaveCaseMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Quick-pick symbols from worker cache (falls back to defaults if cache empty)
  const cached = useCachedTopSymbols(5);
  const FALLBACK_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META'];
  const quickSymbols = useMemo(() => {
    const syms = [...cached.crypto.map(c => c.symbol), ...cached.equity.map(c => c.symbol)];
    return syms.length > 0 ? syms.slice(0, 10) : FALLBACK_SYMBOLS;
  }, [cached.crypto, cached.equity]);

  const sym = searchParams.get('symbol') || 'AAPL';

  // Resolve asset type: 'auto' uses detectAssetClass, otherwise user override
  const resolvedType = assetType === 'auto' ? undefined : assetType;
  // Scanner hands over crypto as e.g. NEAR-USD; match on the base ticker too.
  const isCryptoSymbol = lookupAssetType(sym, CRYPTO_SET) === 'crypto';
  const quoteType: 'stock' | 'crypto' = assetType === 'crypto' ? 'crypto' : assetType === 'equity' ? 'stock' : isCryptoSymbol ? 'crypto' : 'stock';
  const canonicalTerminalHref = `/tools/terminal?symbol=${encodeURIComponent(sym)}&type=${quoteType === 'crypto' ? 'crypto' : 'equity'}&timeframe=${encodeURIComponent(timeframe)}`;

  // Ensure V2Context always reflects the resolved symbol so embedded tabs sync
  useEffect(() => {
    if (sym && !selectedSymbol) selectSymbol(sym);
  }, [sym, selectedSymbol, selectSymbol]);

  // Core data
  // One selected expiry for every section: the packet, the Volatility reading and the Options fold (W1).
  const requestedExpiry = searchParams.get('expiry');
  const goldenEgg = useGoldenEgg(sym, timeframe, resolvedType, requestedExpiry);
  // Admission must finish for this exact symbol/timeframe/expiry before auxiliary work starts.
  // Legacy paid and admin core responses still qualify; local demos never trigger provider work.
  const auxiliaryEnabled = Boolean(goldenEgg.data?.success && goldenEgg.data.data) && !goldenEgg.data?.localDemo
    && !goldenEgg.loading && !goldenEgg.error && !goldenEgg.isAuthError;
  const dve = useDVE(sym, timeframe, resolvedType, requestedExpiry, auxiliaryEnabled);
  const quote = useQuote(sym, quoteType, auxiliaryEnabled);
  const regime = useRegime(auxiliaryEnabled);
  const dailyPicks=usePublicMarketFeed<PicksResponse>('/api/scanner/daily-picks?limit=20');
  const snapshotAsset=quoteType==='crypto'?'crypto':'equity';

  // W3: the public Symbol contract (lib/research/publicSymbolPacket), typed so removed fields cannot be read.
  const ge: PublicSymbolPacket | undefined = goldenEgg.data?.data ?? undefined;
  const geLocalDemo = Boolean((goldenEgg.data as any)?.localDemo);
  const geWarnings = ((goldenEgg.data as any)?.warnings || []) as string[];
  // W3: the public Volatility contract (lib/research/publicDve), typed so removed engine fields cannot be read.
  const d: PublicDveReading | undefined = dve.data?.data ?? undefined;
  const loading = goldenEgg.loading;
  const isAuthBlocked = goldenEgg.isAuthError && !loading;
  // W3-R: the scenario plan (reference, invalidation and reaction zones) is built from the private direction and is not public.
  const geLevelCount = ge?.layer2.setup.keyLevels.length ?? 0;
  // Session date of the last completed bar (not its close time in the viewer's zone, which can read as the next day).
  const geBarSession = ge?.priceEvidence?.basis.lastCompletedBar ?? (ge?.canonical?.lastCompletedBarAt ? symbolDate(ge.canonical.lastCompletedBarAt) : null);
  const geHasLevels = geLevelCount > 0;
  const reportReady = Boolean(ge) && !loading && !goldenEgg.error && !isAuthBlocked;
  const geCanonical = ge?.canonical ?? undefined;
  // Canonical trust (shared evaluator: freshness, interval, history, split guard, liquidity, indicators) wins over the presence-only legacy check.
  const legacyDataQuality = getGEDataQuality({ price: quote.data?.price ?? ge?.meta?.price, levels: geLevelCount });
  const geDataQuality = geCanonical ? geCanonical.dataTrust.label : legacyDataQuality;
  const geDataQualityTitle = geCanonical
    ? (geCanonical.dataTrust.reasons.length ? `${geCanonical.dataTrust.label}: ${geCanonical.dataTrust.reasons.join('; ')}` : `GOOD — fresh completed bar (${geCanonical.lastCompletedBarAt ?? 'Not recorded'}), ${geCanonical.historyBars} ${geCanonical.barInterval ?? ''} bars, indicators complete, liquidity ${geCanonical.liquidity.advUsd != null ? formatUsdShort(geCanonical.liquidity.advUsd) : 'Not recorded'}.`)
    : geDataQualityDetail(geDataQuality, geMissingInputs({ price: quote.data?.price ?? ge?.meta?.price, levels: geLevelCount }));
  // Reference-market reads only; their relation to a direction verdict is not public (W3).
  const crossMarketFactors = geCanonical ? geCanonical.crossMarket.items.map((i) => `${i.symbol}: ${i.trend}`) : [];
  const geNextUsefulCheck = summarizeGENextCheck({ dataQuality: geDataQuality, hasLevels: geHasLevels });
  const geReason = summarizeGEReason({ dataQuality: geDataQuality, summary: ge?.priceEvidence?.summary.join(' ') });
  const geDoNothing = summarizeGEResearchCaution({ dataQuality: geDataQuality, hasLevels: geHasLevels });
  const geInvalidationConditions = buildGEInvalidationConditions({ dataQuality: geDataQuality, dveRegime: d?.volatility?.regime });
  const geMarketStatusItems = [
    {
      label: 'Quote',
      statusLabel: geCanonical?.priceTs ? 'OBSERVED' : 'Date not recorded',
      warnings: [`Price observation: ${geCanonical?.priceTs || 'unavailable'}. Packet calculation time is not quote time.`],
      status: buildMarketDataProviderStatus({
        source: 'quote',
        provider: quoteType === 'crypto' ? 'crypto quote' : 'equity quote',
        localDemo: geLocalDemo,
        stale: geCanonical?.dataTrust.freshness === 'stale',
        degraded: !isUsableNumber(quote.data?.price ?? ge?.meta?.price),
        warnings: [
          !isUsableNumber(quote.data?.price ?? ge?.meta?.price) ? 'Quote price unavailable.' : null,
          !geCanonical?.priceTs ? 'Quote timestamp unavailable.' : null,
          ...geWarnings,
        ].filter(Boolean) as string[],
      }),
    },
    {
      label: 'Regime',
      statusLabel: regime.data ? 'COMPUTED' : 'Not collected',
      status: buildMarketDataProviderStatus({
        source: 'regime',
        provider: 'cross-market regime',
        degraded: !regime.data,
        warnings: regime.data ? [] : ['Regime context unavailable.'],
      }),
    },
    {
      label: 'DVE',
      statusLabel: d ? 'COMPUTED' : 'Not collected',
      status: buildMarketDataProviderStatus({
        source: 'dve',
        provider: 'volatility engine',
        degraded: !d,
        warnings: d ? [] : [dve.loading ? 'DVE is still loading.' : 'DVE unavailable.'],
      }),
    },
    {
      label: ge?.meta?.assetClass === 'crypto' ? 'Derivatives' : 'Options',
      statusLabel: geCanonical?.options?.quality.level ?? (geCanonical?.derivatives ? 'PARTIAL' : 'Not collected'),
      status: buildMarketDataProviderStatus({
        source: ge?.meta?.assetClass === 'crypto' ? 'derivatives' : 'options',
        provider: ge?.meta?.assetClass === 'crypto' ? 'derivatives evidence' : 'options evidence',
        degraded: !ge?.layer3?.options?.enabled || geCanonical?.options?.quality.level !== 'GOOD',
        warnings: geCanonical?.options?.quality.reasons ?? (geCanonical?.derivatives ? ['Sampled open interest is available. Funding period, comparable OI change and directional crowding are unavailable.'] : ['Options or derivatives evidence unavailable.']),
      }),
    },
    {
      label: 'Time',
      statusLabel: ge?.layer3?.timeConfluence?.enabled ? 'COMPUTED' : 'Not collected',
      status: buildMarketDataProviderStatus({
        source: 'time-confluence',
        provider: 'time confluence',
        degraded: !ge?.layer3?.timeConfluence?.enabled,
        warnings: ge?.layer3?.timeConfluence?.enabled ? [] : ['Time confluence unavailable.'],
      }),
    },
  ];
  const geEvidenceItems = [
    {
      label: 'Measured evidence',
      value: geDataQuality === 'GOOD' ? 'Recorded' : geDataQuality,
      status: geDataQuality === 'GOOD' ? 'supportive' as const : 'missing' as const,
      detail: geReason,
    },
    {
      label: 'Reference markets',
      value: crossMarketFactors.length ? `${crossMarketFactors.length} recorded` : 'Not recorded',
      status: 'neutral' as const,
      detail: crossMarketFactors.slice(0, 3).join(' | ') || 'No cross-market data.',
    },
    {
      label: 'Recorded Levels',
      value: geHasLevels ? `${geLevelCount} recorded` : 'None recorded',
      status: evidenceStatus(geHasLevels, 'No levels were recorded on this bar.'),
      detail: geHasLevels ? (ge?.layer2.setup.keyLevels.slice(0, 3).map((lv) => `${lv.label} ${formatLevel(lv.price)}`).join(' | ') ?? '') : 'No levels were recorded on this bar.',
    },
    {
      label: 'Research Caution',
      value: geDoNothing.includes('verify') ? 'Monitor' : 'Active',
      status: geDoNothing.includes('verify') ? 'neutral' as const : 'conflicting' as const,
      detail: geDoNothing,
    },
  ];
  const geRiskFlags = geInvalidationConditions.slice(0, 6).map((condition) => ({
    label: condition,
    severity: riskSeverity(condition),
    detail: 'Invalidates or weakens this educational research case.',
  }));

  function handleSymbolSubmit() {
    if (symbolInput.trim()) {
      // A typed symbol is a new instrument: detect its type from the symbol (BTC-USD → crypto), not from the toggle,
      // which reflects the previous symbol's type param (RS-24). The toggle can still override it afterwards.
      const next = symbolInput.trim().toUpperCase();
      selectSymbol(next, { timeframe, assetType: assetType === 'crypto' ? 'crypto' : lookupAssetType(next, CRYPTO_SET) });
      setSymbolInput('');
    }
  }

  /* ─── Register Golden Egg data for Arca AI context ─── */
  // W3: the copilot receives the public evidence only (no verdict, score, playbook or hypothetical R:R).
  const geAiData = useMemo(() => ({
    copilotEvidenceToken: goldenEgg.data?.copilotEvidenceToken ?? null,
    assetType: ge?.meta.assetClass,
    expiry: geCanonical?.options?.expiry ?? null,
    symbol: sym,
    timeframe,
    price: quote.data?.price,
    researchSummary: ge?.priceEvidence?.summary ?? [],
    priceEvidence: ge?.priceEvidence ?? null,
    timingEvidence: ge?.timingEvidence ?? null,
    bbwp: measuredBbwp(d?.volatility),
    recordedLevels: ge?.layer2.setup.keyLevels ?? [],
    options: geCanonical?.options ?? null,
    dataTrust: geCanonical?.dataTrust ?? null,
  }), [sym, timeframe, ge, geCanonical, d, quote.data, goldenEgg.data?.copilotEvidenceToken]);

  const geAiSummary = useMemo(() => {
    if (goldenEgg.error) return `Golden Egg: ${sym} unavailable — ${goldenEgg.error}`;
    if (!ge) return `Golden Egg: Loading ${sym}...`;
    return `${sym} — ${ge.priceEvidence?.summary.join(' ') || 'Measured daily evidence not available.'}`;
  }, [sym, ge, goldenEgg.error]);

  useRegisterPageData('deep_analysis', geAiData, [sym], geAiSummary);

  async function handleSaveResearchCase() {
    if (!ge) return;
    try {
      setSavingCase(true);
      setSaveCaseMsg(null);
      await saveResearchCase({
        sourceType: 'golden-egg',
        title: `${sym} Golden Egg research case`,
        researchCase: {
          symbol: sym,
          assetClass: quoteType === 'crypto' ? 'crypto' : 'equity',
          sourceType: 'golden-egg',
          generatedAt: new Date().toISOString(),
          dataQuality: geDataQuality,
          title: `${sym} Golden Egg research case`,
          thesis: `${sym} educational research case.`,
          truthLayer: {
            whatWeKnow: [
              ...(researchSnapshot?.summary ?? []),
            ].filter(Boolean),
            whatWeDoNotKnow: geMissingInputs({ price: quote.data?.price ?? ge?.meta?.price, levels: geLevelCount }),
            dataQuality: geDataQuality,
            riskFlags: geInvalidationConditions.slice(0, 4),
            invalidation: 'No invalidation level is published on the Symbol page; recheck the measured states after the next completed bar.',
            nextUsefulCheck: geNextUsefulCheck,
            disclaimer: 'Educational market research only. Not financial advice.',
          },
          scenarioPlan: null,
          evidenceStack: {
            quote: quote.data,
            dve: d,
            priceEvidence: ge.priceEvidence ?? null,
            options: geCanonical?.options ?? null,
            timeConfluence: ge.layer3?.timeConfluence ?? null,
            regime: regime.data,
          },
          disclaimer: 'Educational market research only. This is not financial advice and is not a recommendation to buy, sell, hold, or rebalance any financial product.',
        },
      });
      setSaveCaseMsg({ text: 'Research case saved', type: 'success' });
    } catch (err) {
      setSaveCaseMsg({ text: err instanceof Error ? err.message : 'Unable to save research case', type: 'error' });
    } finally {
      setSavingCase(false);
      setTimeout(() => setSaveCaseMsg(null), 3000);
    }
  }

  // Phase 3: factual summary, observation dates and section status from the shared snapshot (no verdict).
  const researchSnapshot = geCanonical ? buildResearchSnapshot({
    canonical: geCanonical, priceEvidence: ge?.priceEvidence, timingEvidence: ge?.timingEvidence,
    volatilityRelease: dve.loading ? undefined : d?.signal ? { type: d.signal.type, state: d.signal.state } : null,
    optionsRequest: ge?.optionsRequest ?? null,
  }) : null;
  const volatilityEvidence = geCanonical && ge?.priceEvidence ? buildVolatilityEvidence({
    assetClass: geCanonical.assetClass, priceEvidence: ge.priceEvidence,
    options: geCanonical.options ? { expiry: geCanonical.options.expiry, snapshotTs: geCanonical.options.snapshotTs, daysToExpiry: geCanonical.options.daysToExpiry, avgIvPct: geCanonical.options.avgIvPct, expectedMovePct: geCanonical.options.expectedMovePct } : null,
    release: dve.loading ? undefined : d?.signal ? { type: d.signal.type, state: d.signal.state } : null,
    dveBbwp: measuredBbwp(d?.volatility),
  }) : null;
  const volatilityFold = volatilityEvidence && !loading ? <CollapsibleSection title="Volatility" summary={volatilityEvidence.summary[0] ?? 'ATR, realised and implied volatility'}><VolatilityEvidencePanel v={volatilityEvidence}/></CollapsibleSection> : null;
  const evidenceSummary = geCanonical && researchSnapshot ? buildEvidenceSummary({
    symbol: sym, assetClass: geCanonical.assetClass, snapshot: researchSnapshot, priceEvidence: ge?.priceEvidence, volatility: volatilityEvidence, timing: ge?.timingEvidence,
    options: geCanonical.options ? { expiry: geCanonical.options.expiry, snapshotTs: geCanonical.options.snapshotTs, putCallOi: geCanonical.options.putCallOi ?? null, avgIvPct: geCanonical.options.avgIvPct } : null,
    fundamentals: geCanonical.fundamentals ? { lastReportedQuarter: geCanonical.fundamentals.lastReportedQuarter, revenueGrowthYoy: geCanonical.fundamentals.revenueGrowthYoy, earningsGrowthYoy: geCanonical.fundamentals.earningsGrowthYoy } : null,
  }) : null;
  const evidenceFold = evidenceSummary && !loading ? <CollapsibleSection deferMount title="Evidence summary" summary={evidenceSummary.headline}><EvidenceSummaryPanel s={evidenceSummary}/></CollapsibleSection> : null;
  const q = encodeURIComponent(sym);
  const specialistLinks = [
    ...(quoteType === 'crypto' ? [] : [{ href: optionsHref(sym, requestedExpiry ?? undefined), label: 'Options' }]),
    { href: `/tools/volatility-engine?symbol=${q}`, label: 'Volatility' },
    { href: `/tools/terminal?tab=time-confluence&symbol=${q}`, label: 'Time confluence' },
  ];

  const designEnabled = publicDesignEnabled();
  const symbolControls = (
    !isAuthBlocked && <CollapsibleSection deferMount title="Change symbol" summary={`${sym} · ${timeframe}`}>
        <div className="flex flex-wrap gap-2"><input aria-label="Symbol" value={symbolInput} onChange={e=>setSymbolInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&handleSymbolSubmit()} className="min-h-10 min-w-0 rounded border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3"/><button onClick={handleSymbolSubmit} className="min-h-10 rounded border px-3">Review</button></div>
        <div className="mt-2 flex flex-wrap gap-2"><label className="text-xs">Asset <select aria-label="Asset type" value={assetType} onChange={e=>{const type=e.target.value as 'auto'|'equity'|'crypto';setAssetType(type);selectSymbol(sym,{assetType:type==='auto'?(isCryptoSymbol?'crypto':'equity'):type,timeframe});}} className="min-h-10 rounded border border-[var(--msp-border)] bg-[var(--msp-panel)] px-2"><option value="auto">Auto</option><option value="equity">Stock</option><option value="crypto">Crypto</option></select></label><label className="text-xs">Timeframe <select aria-label="Research timeframe" value={timeframe} onChange={e=>{const next=e.target.value as ScanTimeframe;setTimeframe(next);selectSymbol(sym,{timeframe:next,assetType:snapshotAsset});}} className="min-h-10 rounded border border-[var(--msp-border)] bg-[var(--msp-panel)] px-2">{SCAN_TIMEFRAMES.map(t=><option key={t.value} value={t.value}>{symbolText(t.label)}</option>)}</select></label></div>
      </CollapsibleSection>
  );

  return (
    <div className={designEnabled ? studio.page : "mx-auto max-w-6xl space-y-3"} data-symbol-studio={designEnabled || undefined}>
      {designEnabled && <header className={studio.intro}><div><p>SYMBOL RESEARCH</p><h2>One symbol. The evidence in context.</h2></div><Link href="/tools/command-center">Back to Overview ↗</Link></header>}
      {designEnabled && symbolControls}
      <PublicUsageSummary onVisitorReady={() => goldenEgg.refetch()} refreshKey={`${sym}:${loading}:${goldenEgg.error || ''}`} />
      <SymbolSnapshotHeader name={geCanonical?.fundamentals?.name} symbol={sym} asset={snapshotAsset} timeframe={timeframe} stamp={symbolQuoteStamp(sym,snapshotAsset,quote.data)} pick={findSymbolPick(dailyPicks.data,sym,snapshotAsset)} rankLoading={dailyPicks.loading} rankError={dailyPicks.error} quiet={isAuthBlocked} compact/>
      {designEnabled && reportReady && <><nav className={studio.navigation} aria-label="Symbol sections"><a href="#symbol-chart">Chart & comparisons</a><a href="#symbol-evidence">Measured evidence</a><a href="#symbol-research-views">More research views</a></nav><div id="symbol-chart" className={studio.chart}><SymbolComparisonChart key={`${sym}:${snapshotAsset}`} symbol={sym} type={snapshotAsset}/></div><div id="symbol-evidence" className={studio.evidenceHeading}><p>READ THE OBSERVATIONS</p><h2>Evidence, sources and limitations</h2><span>Open each section for its measurements and dates. Missing inputs remain unavailable.</span></div></>}
      {!isAuthBlocked && researchSnapshot && !loading && <ResearchSnapshotCard s={researchSnapshot} links={specialistLinks}/>}


      {isAuthBlocked && goldenEgg.isUpgradeRequired && (
        <LockedPreview tool="Symbol breakdown" description={symbolText(FREE_COPY.goldenEgg)} />
      )}
      {isAuthBlocked && !goldenEgg.isUpgradeRequired && (
        <Card>
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mb-2 text-sm font-semibold text-amber-300">Sign in required</div>
            <h2 className="text-xl font-bold text-white">Unlock Symbol indicator analysis</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              Symbol is a Pro workflow for reviewing one symbol across measured indicators, volatility, options and timing evidence.
            </p>
            <div className="mt-5 grid gap-2 text-left text-xs text-slate-300 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Regime and bias context</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Measured states and data-quality checks</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Recorded levels with their dates</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Volatility, flow, and timing context</div>
            </div>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <a href={`/auth?next=${encodeURIComponent(`/tools/golden-egg?symbol=${encodeURIComponent(sym)}`)}`} className="inline-flex rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">{symbolText(FREE_COPY.signIn)}</a>
              <a href="/pricing" className="inline-flex rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50">See Pricing</a>
            </div>
          </div>
        </Card>
      )}

      {reportReady && (quoteType==='crypto'?<><CryptoBreakdown compact showSource={false} onStamp={setCryptoStamp} symbol={sym} timeframe={timeframe} coinId={searchParams.get('id')??undefined}/>{ge?.priceEvidence&&!loading&&<CollapsibleSection title="Price and structure" summary={ge.priceEvidence.summary[0]??`Completed bar ${ge.priceEvidence.basis.lastCompletedBar??'n/a'}`}><PriceEvidencePanel e={ge.priceEvidence} section="price"/></CollapsibleSection>}{volatilityFold}{ge?.timingEvidence&&!loading&&<CollapsibleSection title="Timing and events" summary={ge.timingEvidence.summary[1]??ge.timingEvidence.summary[0]}><TimingEvidencePanel t={ge.timingEvidence}/></CollapsibleSection>}{ge&&!loading&&<CollapsibleSection deferMount title="News" summary="Symbol news grouped by event. Loads when opened."><SymbolNewsPanel symbol={sym} type="crypto"/></CollapsibleSection>}{evidenceFold}</>:<>
        {ge&&!loading&&<EquityTop data={ge} pick={findSymbolPick(dailyPicks.data,sym,'equity')}/>}
        {ge?.priceEvidence&&!loading&&<CollapsibleSection title="Price and structure" summary={ge.priceEvidence.summary[0]??`Completed bar ${ge.priceEvidence.basis.lastCompletedBar??'n/a'}`}><PriceEvidencePanel e={ge.priceEvidence} section="price"/></CollapsibleSection>}{volatilityFold}
        {goldenEgg.error&&!loading&&<p role="alert" className="text-sm text-amber-300">Symbol data feed failed. <button className="min-h-10 underline" onClick={()=>goldenEgg.refetch()}>Retry</button></p>}
        {ge&&<>
        <CollapsibleSection deferMount title="Options" summary={geCanonical?.options?`Expiry ${geCanonical.options.expiry}`:'Options data not collected'}><SymbolOptionsContext compact symbol={sym} expiry={requestedExpiry??undefined}/></CollapsibleSection>
        {ge?.timingEvidence&&!loading&&<CollapsibleSection title="Timing and events" summary={ge.timingEvidence.summary[1]??ge.timingEvidence.summary[0]}><TimingEvidencePanel t={ge.timingEvidence}/></CollapsibleSection>}
        <CollapsibleSection deferMount title="Fundamentals" summary={geCanonical?.fundamentals?.marketCap!=null?`Market cap ${formatUsdShort(geCanonical.fundamentals.marketCap)}${geCanonical.fundamentals.lastReportedQuarter?` · latest reported quarter ${geCanonical.fundamentals.lastReportedQuarter}`:''}`:'Company overview and ownership'}><CompanyOverview symbol={sym}/></CollapsibleSection>
        <CollapsibleSection deferMount title="News and ownership" summary="Symbol news grouped by event, and dated ownership filings. Loads when opened."><SymbolNewsPanel symbol={sym} type="equity"/><div className="mt-3"><OwnershipFlowPanel symbol={sym}/></div></CollapsibleSection>
        {evidenceFold}
        <CollapsibleSection deferMount title="Recorded levels" summary={`${ge.layer2.setup.keyLevels.length} recorded levels`}><ul data-recorded-levels>{ge.layer2.setup.keyLevels.map((lv)=><li key={`${lv.label}-${lv.price}`}>{symbolText(lv.label)} ({symbolText(lv.kind)}): {symbolText(formatLevel(lv.price))}</li>)}</ul></CollapsibleSection>
        <ChipRow items={[{id:'evidence',label:`${geDataQuality==='GOOD'?'Evidence and data checks':'Some data checks failed'} · ${geEvidenceItems.length} checks`,warning:geDataQuality!=='GOOD',detail:<EvidenceStack title="Evidence" items={geEvidenceItems.map(item=>({...item,value:symbolText(item.value),detail:item.detail?symbolText(item.detail):undefined}))}/>}]} />
        </>}
      </>)}
      {/* Loading state */}
      {loading && (
        <Card>
          <div className="space-y-4 py-8">
            <Skel h="h-8" w="w-48" />
            <Skel h="h-6" w="w-64" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              {[1,2,3,4].map(i => <Skel key={i} h="h-20" />)}
            </div>
          </div>
        </Card>
      )}

      {/* Error state */}
      {goldenEgg.reportAccessIssue && !loading && <SymbolReportAccessNotice issue={goldenEgg.reportAccessIssue} returnTo={`/tools/golden-egg?${searchParams.toString()}`} onRetry={goldenEgg.refetch} />}
      {goldenEgg.error && !goldenEgg.reportAccessIssue && !loading && (
        <Card>
          <div className="py-8 text-center">
            <div className="text-amber-300 text-sm mb-2">Market data feed failed for {symbolText(sym)}</div>
            <div className="text-[11px] text-slate-500 mb-4">{symbolText(goldenEgg.error)}</div>
            <button type="button" onClick={() => goldenEgg.refetch()} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">Retry</button>
          </div>
        </Card>
      )}

      {!designEnabled && symbolControls}
      <div id="symbol-research-views" />
      {reportReady && <CollapsibleSection deferMount title="Research views" summary={`${sym} research detail`}>
      <GoldenEggTabRail activeTab={activeTab} onSelectTab={setActiveTab} />
      {/* ─── Deep-dive Tabs (v1 components) ─── */}
      {!isAuthBlocked && activeTab === 'Chart' && (
        <GoldenEggSubviewFrame tab="Chart" symbol={sym} terminalHref={canonicalTerminalHref} onSelectTab={setActiveTab}>
          {designEnabled ? <a href="#symbol-chart" className={studio.chartLink}>Go to the comparison and indicator chart ↑</a> : <SymbolComparisonChart symbol={sym} type={snapshotAsset} />}
        </GoldenEggSubviewFrame>
      )}
      {!isAuthBlocked && activeTab === 'AI summary' && (
        <GoldenEggSubviewFrame tab="AI summary" symbol={sym} terminalHref={canonicalTerminalHref} onSelectTab={setActiveTab}>
          <SymbolAiSummary symbol={sym} type={quoteType === 'crypto' ? 'crypto' : 'equity'} timeframe={timeframe} expiry={requestedExpiry} />
        </GoldenEggSubviewFrame>
      )}
      {!isAuthBlocked && activeTab === 'Fundamentals' && (
        <GoldenEggSubviewFrame tab="Fundamentals" symbol={sym} terminalHref={canonicalTerminalHref} onSelectTab={setActiveTab}>
          {quoteType === 'crypto' ? (
            // Company fundamentals do not exist for crypto; reuse the derivatives/quote evidence Golden Egg already fetched.
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-1">Network & derivatives context — {symbolText(sym.replace(/[-/]?(USDT|USD)$/, ''))}</h3>
              <p className="text-[11px] text-slate-500 mb-3">Crypto assets have no company filings. Market structure below comes from CoinGecko coin data and the canonical daily series; derivatives are the same snapshot used in the verdict. No corporate-style fundamentals are inferred.</p>
              {geCanonical?.network ? (() => {
                const n = geCanonical.network;
                const usd = (v: number | null) => (v != null ? formatUsdShort(v) : 'Not recorded');
                const num = (v: number | null, d = 0) => (v != null ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : 'Not recorded');
                const tiles: Array<[string, string, string?]> = [
                  ['Market cap', usd(n.marketCap), n.marketCapRank != null ? `rank #${n.marketCapRank}` : undefined],
                  ['FDV', usd(n.fdv), n.fdvBasis === 'derived_max_supply' ? 'price × max supply' : n.fdvBasis === 'provider' ? 'provider' : 'unavailable — uncapped/unknown supply'],
                  ['Circulating supply', num(n.circulatingSupply), n.supplyIssuedPct != null ? `${(n.supplyIssuedPct * 100).toFixed(0)}% of max` : 'max supply not recorded'],
                  ['Max supply', n.maxSupply != null ? num(n.maxSupply) : 'uncapped supply', n.totalSupply != null ? `total ${num(n.totalSupply)}` : undefined],
                  ['Spot volume 24h', usd(n.spotVolume24h), n.volumeToMcap != null ? `${(n.volumeToMcap * 100).toFixed(1)}% of market cap` : undefined],
                  ['Distance from ATH', n.distanceFromAthPct != null ? `${n.distanceFromAthPct.toFixed(1)}%` : 'Not recorded', n.ath != null ? `ATH ${formatLevel(n.ath)}${n.athDate ? ` · ${String(n.athDate).slice(0, 10)}` : ''}` : undefined],
                  ['7d / 30d', `${n.change7dPct != null ? (n.change7dPct >= 0 ? '+' : '') + n.change7dPct.toFixed(1) + '%' : 'Not recorded'} / ${n.change30dPct != null ? (n.change30dPct >= 0 ? '+' : '') + n.change30dPct.toFixed(1) + '%' : 'Not recorded'}`, 'price change'],
                  ['Volatility regime', humanizeEnum(d?.volatility?.regime ?? ge?.layer3?.structure?.volatility?.regime), geCanonical.indicators.atrPct != null ? `ATR ${geCanonical.indicators.atrPct.toFixed(2)}% (${geCanonical.barInterval})` : undefined],
                ];
                return (
                  <div className="space-y-3">
                    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                      {tiles.map(([label, value, sub]) => (
                        <div key={label} className="rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5"><div className="text-slate-500 text-[10px] uppercase">{symbolText(label)}</div><div className="text-white font-mono">{symbolText(value)}</div>{sub && <div className="text-[10px] text-slate-500">{symbolText(sub)}</div>}</div>
                      ))}
                    </div>
                    <div className="rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5 text-xs">
                      <div className="text-slate-500 text-[10px] uppercase mb-1">Relative strength (20 daily bars)</div>
                      {n.relative.length === 0 ? <div className="text-slate-500">Benchmark data not collected{symbolText(sym.toUpperCase().startsWith('BTC') ? ' — BTC is the benchmark' : '')}.</div> : n.relative.map((r) => (
                        <div key={r.benchmark} className="flex justify-between"><span className="text-slate-400">vs {symbolText(r.benchmark)}</span><span className={r.label === 'outperforming' ? 'text-emerald-400' : r.label === 'underperforming' ? 'text-red-400' : 'text-slate-300'}>{symbolText(r.ratio.toFixed(3))} · {symbolText(r.label)} ({symbolText(r.symbolPct >= 0 ? '+' : '')}{r.symbolPct}% vs {symbolText(r.benchmarkPct >= 0 ? '+' : '')}{r.benchmarkPct}%)</span></div>
                      ))}
                    </div>
                    {n.categories.length > 0 && <div className="text-[11px] text-slate-500">Categories: {symbolText(n.categories.join(' · '))}</div>}
                    {n.notes.map((note, i) => <div key={i} className="text-[11px] text-amber-300/90">• {symbolText(note)}</div>)}
                  </div>
                );
              })() : (
                <div className="text-xs text-slate-500 py-2">Network context unavailable for this asset right now.</div>
              )}
              <div className="mt-3 text-[11px] font-semibold text-emerald-400">Derivatives (same snapshot as the rest of this page)</div>
              {ge?.layer3?.options?.enabled ? (
                <div className="space-y-2 mt-1">
                  <div className="grid gap-1 sm:grid-cols-2">
                    {ge.layer3.options.highlights.map((h, i) => (
                      <div key={i} className="flex justify-between text-xs rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5"><span className="text-slate-400">{symbolText(h.label)}</span><span className="text-white font-mono">{symbolText(h.value)}</span></div>
                    ))}
                  </div>
                  {ge.layer3.options.notes?.map((n, i) => <div key={i} className="text-[11px] text-slate-500">• {symbolText(n)}</div>)}
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-3">Derivatives evidence is not available for this asset right now.</div>
              )}
              <div className="mt-3 grid gap-1 sm:grid-cols-3 text-xs">
                <div className="rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5"><div className="text-slate-500 text-[10px] uppercase">Price</div><div className="text-white font-mono">{symbolText(isUsableNumber(ge?.meta?.price) ? formatLevel(ge!.meta.price) : 'Not recorded')}</div>{geCanonical && <div className="text-[10px] text-slate-500">as of {symbolText(String(geCanonical.priceTs).slice(11, 16))} UTC · last bar {symbolText(geCanonical.lastCompletedBarAt ? String(geCanonical.lastCompletedBarAt).slice(0, 10) : 'Not recorded')}</div>}</div>
                <div className="rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5"><div className="text-slate-500 text-[10px] uppercase">Market regime</div><div className="text-white">{symbolText(humanizeEnum(regime.data?.regime))}</div></div>
                <div className="rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5"><div className="text-slate-500 text-[10px] uppercase">Data trust</div><div className="text-white">{symbolText(geDataQuality==='GOOD'?'Checks passed':'Some checks failed')}</div></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/tools/explorer?tab=crypto-command&symbol=${encodeURIComponent(sym)}&type=crypto&timeframe=${encodeURIComponent(timeframe)}`} className="text-[11px] text-emerald-400 hover:underline">Open Crypto Command ›</Link>
                <Link href={`/tools/crypto-dashboard?symbol=${encodeURIComponent(sym)}&type=crypto&timeframe=${encodeURIComponent(timeframe)}`} className="text-[11px] text-emerald-400 hover:underline">Open Crypto Derivatives lens ›</Link>
              </div>
            </Card>
          ) : (
            <>
              <CompanyOverview symbol={sym} />
              <OwnershipFlowPanel symbol={sym} />
            </>
          )}
        </GoldenEggSubviewFrame>
      )}
      {/* ─── Evidence tab (main Symbol analysis) ─── */}
      {!isAuthBlocked && activeTab === 'Evidence' && <>
      {/* Main content */}
      {ge && !loading && (
        <UpgradeGate requiredTier="pro" currentTier={goldenEgg.data?.reportUnlocked ? 'pro' : tier} feature="Symbol Deep Analysis">
        <>
          {geLocalDemo && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Local demo Golden Egg payload:</strong> live data is unavailable in this local environment, so this verdict packet is sample data for workflow testing only. Do not treat it as live market output.
              {geWarnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-300/90">
                  {geWarnings.slice(0, 2).map((warning) => <li key={warning}>{symbolText(warning)}</li>)}
                </ul>
              )}
            </div>
          )}
          {/* -- VERDICT HEADER (Section 0 — Answer First) ------------ */}
          <Card>
            <div className="flex flex-col gap-4">
              {/* Top row: symbol, regime and data trust */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-2xl font-bold text-white">{symbolText(ge.meta.symbol)}</h2>
                    {regime.data && <Badge label={symbolText(`Regime: ${humanizeEnum(regime.data.regime)}`)} color={REGIME_COLORS[regime.data.regime?.toLowerCase() as RegimePriority] || 'var(--msp-text-muted)'} small />}
                    <span title={symbolText(geDataQualityTitle)} className="text-[11px] px-1.5 py-0.5 rounded border font-semibold" style={{ color: geDataQualityColor(geDataQuality), borderColor: geDataQualityColor(geDataQuality) + '40', backgroundColor: geDataQualityColor(geDataQuality) + '15' }}>Data {symbolText(geDataQuality==='GOOD'?'Checks passed':'Some checks failed')}</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {symbolText(formatLevel(ge.meta.price))}
                    {quote.data?.changePercent != null && (
                      <span className={`ml-2 text-sm ${quote.data.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {symbolText(quote.data.changePercent >= 0 ? '+' : '')}{quote.data.changePercent.toFixed(2)}% {priceChangeBasisLabel(ge.meta.assetClass, 'rolling_24h')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{symbolText(ge.meta.assetClass)} — {symbolText(ge.meta.timeframe)} — {symbolText(new Date(ge.meta.asOfTs).toLocaleString())}</div>
                </div>

              </div>

              <DescriptiveStates states={describeStates(ge.priceEvidence, dve.loading ? undefined : d?.signal ? { type: d.signal.type, state: d.signal.state } : null)} />

              <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-800/50 pb-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Research packet</div>
                  <div className="text-[11px] text-slate-500">{symbolText(ge.meta.assetClass)} · {symbolText(ge.meta.timeframe)}</div>
                </div>
                {/* grid-cols-1 / min-w-0: a truncated tile value must not size the column past the card on phones. */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
                  {[
                    ['Data Trust', geDataQuality, geDataQualityColor(geDataQuality), geDataQualityTitle],
                    ['Recorded levels', `${ge.layer2.setup.keyLevels.length}`, 'var(--msp-text)', 'Moving averages, Bollinger bands and options strikes recorded on the completed bar. No entry, stop or target is derived from them.'],
                    ['Completed bar', geBarSession ?? 'Not recorded', 'var(--msp-text)', 'Session date of the last completed bar the evidence uses.'],
                    ['Next Check', geNextUsefulCheck, 'var(--msp-info)', geNextUsefulCheck],
                  ].map(([label, value, color, title]) => (
                    <div key={label} title={symbolText(title)} className="min-w-0 rounded-md border border-slate-700/50 bg-[#0A101C]/50 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">{symbolText(label)}</div>
                      <div className="mt-1 truncate text-xs font-bold" style={{ color }}>{symbolText(value)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <EvidenceStack title="Symbol Evidence Stack" items={geEvidenceItems.map(item=>({...item,value:symbolText(item.value),detail:item.detail?symbolText(item.detail):undefined}))} />

              <MarketStatusStrip friendly items={geMarketStatusItems.map(item=>({...item,warnings:item.warnings?.map(symbolText)}))} className="md:grid-cols-5" />

              <RiskFlagPanel title="Research Case Invalidates If" flags={geRiskFlags.map(flag=>({...flag,label:symbolText(flag.label),detail:flag.detail?symbolText(flag.detail):flag.detail}))} />
              <div className="sr-only">
                {geInvalidationConditions.slice(0, 6).map((condition) => (
                    <div key={condition} className="text-red-100/80">{symbolText(condition)}</div>
                  ))}
                </div>

              {/* Driver / Blocker + Research Note */}
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveResearchCase}
                  disabled={savingCase}
                  className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-blue-300 hover:bg-blue-500/20 transition-colors disabled:cursor-wait disabled:opacity-70 ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  {symbolText(savingCase ? 'Saving...' : 'Save Case')}
                </button>
                <a href={canonicalTerminalHref} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-slate-400 hover:bg-slate-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 no-underline">
                  Open Terminal
                </a>
              </div>
              {saveCaseMsg && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${saveCaseMsg.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300' : 'border-red-500/30 bg-red-950/30 text-red-300'}`}>
                  {symbolText(saveCaseMsg.text)}
                </div>
              )}
            </div>

          </Card>

          {/* -- CROSS-MARKET INFLUENCE (Phase 5 — Dynamic + Static) ------- */}
          <Card>
            <details>
              <summary className="cursor-pointer rounded text-xs font-semibold text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50">Cross-Market Influence</summary>
              <div className="mt-3">

            {/* Canonical cross-market reads (SPY/QQQ/sector/rates/USD for equities; BTC/ETH/dominance/total cap for crypto) */}
            {geCanonical?.crossMarket && (
              <div className="mb-4">
                <div className="text-[11px] text-slate-500 uppercase mb-2">Reference markets (context only)</div>
                {geCanonical.crossMarket.items.length === 0 ? (
                  <div className="text-xs text-slate-500">{symbolText(geCanonical.crossMarket.summary)}</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {geCanonical.crossMarket.items.map((item, i) => {
                      const color = 'var(--msp-text)';
                      return (
                        <div key={i} className="bg-[var(--msp-panel-2)] rounded-lg p-2.5" title={symbolText(item.detail)}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{symbolText(item.symbol)}</span>
                            <span className="text-[11px] text-slate-500 truncate ml-2">{symbolText(item.label)}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[11px] font-semibold" style={{ color }}>{symbolText(item.trend)}</span>
                            {item.changePct != null && <span className="text-[11px] text-slate-500">{symbolText(item.changePct >= 0 ? '+' : '')}{symbolText(item.changePct.toFixed(2))}%</span>}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5 truncate">{symbolText(item.detail)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 text-[11px] text-slate-400">{symbolText(geCanonical.crossMarket.summary)}</div>
              </div>
            )}

            {regime.data?.operatorContext && (
              <div className="mb-4">
                <div className="text-[11px] text-slate-500 uppercase mb-2">Context only</div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Account context</span>
                    <span className="text-[11px] font-semibold text-slate-400">Context only</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Stored risk environment: {regime.data.operatorContext.riskEnvironment ?? 'not set'}
                    {regime.data.operatorContext.stale ? ' · stale' : ''}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">Not a market regime and not a setup signal.</div>
                </div>
              </div>
            )}

            {/* Dynamic signals from regime API. Account context is the card above, not one of these setups. */}
            {!geCanonical?.crossMarket && regime.data?.signals && regime.data.signals.some((sig) => sig.counted !== false) && (
              <div className="mb-4">
                <div className="text-[11px] text-slate-500 uppercase mb-2">Market regime reads</div>
                <div data-regime-reads className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {regime.data.signals.filter((sig) => sig.counted !== false).map((sig: any, i: number) => (
                    <div key={i} className="min-w-0 bg-[var(--msp-panel-2)] rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="min-w-0 break-words text-xs font-semibold text-white">{symbolText(sig.source)}</span>
                        {sig.stale && <span className="text-[11px] text-yellow-500">stale</span>}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-300">{symbolText(humanizeEnum(sig.regime))}</div>
                    </div>
                  ))}
                </div>
                {/* W3: each source's regime read only; no "supportive / headwind" relation, model weights or overall verdict. */}
                <p className="mt-2 text-[11px] text-slate-500">Each source's regime classification. How it relates to this symbol is not assessed here.</p>
              </div>
            )}

            {/* Static known relationships */}
            <div className="text-[11px] text-slate-500 uppercase mb-2">Known relationships (reference only — not evidence)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {CROSS_MARKET.map(cm => (
                <div key={cm.from} className="bg-[var(--msp-panel-2)] rounded-lg p-2.5 text-center">
                  <div className="text-[11px] text-slate-500">{symbolText(cm.from)}</div>
                  <div className="text-xs text-white font-semibold mt-0.5">{symbolText(cm.condition)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{symbolText(cm.effect)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/50 text-[11px] text-slate-500">
              Reference-market reads are context only; they are not counted as evidence for this symbol.
            </div>
              </div>
            </details>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* -- SETUP & THESIS ------------------------------------ */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Timeframes</h3>
              <div className="space-y-3">
                <div data-trend-relations>
                  <div className="text-[11px] text-slate-500 uppercase">Close vs moving averages</div>
                  <div className="text-xs text-white">{symbolText(`Close ${ge.layer3.structure.trend.closeVsSma50 === 'unknown' ? 'not compared with' : ge.layer3.structure.trend.closeVsSma50} SMA 50 · ${ge.layer3.structure.trend.closeVsSma20 === 'unknown' ? 'not compared with' : ge.layer3.structure.trend.closeVsSma20} SMA 20 · last bar ${ge.layer3.structure.trend.lastBar}`)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{symbolText(ge.layer3.structure.trend.basis)}</div>
                </div>
              </div>
            </Card>

            {/* -- STRUCTURE ------------------------------------------ */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Structure</h3>
              <p className="mb-2 text-xs text-slate-500">All levels below are bar-close references · {symbolText(geBarSession ?? 'date not recorded')}</p>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([['vs SMA 50', ge.layer3.structure.trend.closeVsSma50], ['vs SMA 20', ge.layer3.structure.trend.closeVsSma20], ['Last bar', ge.layer3.structure.trend.lastBar]] as const).map(([label, value]) => (
                    <div key={label} className="bg-[var(--msp-panel-2)] rounded p-2">
                      <div className="text-[11px] text-slate-500 uppercase">{symbolText(label)}</div>
                      <div className="text-xs text-white">{symbolText(value === 'unknown' ? 'not recorded' : value)}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Key Levels</div>
                  <div className="space-y-1 mt-1">
                    {ge.layer2.setup.keyLevels.map((lv, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{symbolText(lv.label)} <span className="text-[11px] text-slate-600">({symbolText(lv.kind)})</span></span>
                        <span className="font-mono text-white">{symbolText(formatLevel(lv.price))}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Momentum indicators */}
                {ge.layer3.momentum?.indicators && (
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase">Momentum</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ge.layer3.momentum.indicators.map((ind, i) => (
                        <Badge key={i} label={symbolText(`${ind.name}: ${ind.value}`)} color={ind.state === 'bull' ? 'var(--msp-bull)' : ind.state === 'bear' ? 'var(--msp-bear)' : ind.state === 'extended' ? 'var(--msp-warn)' : 'var(--msp-flat)'} small />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* -- TIMING -------------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3" title={symbolText(TIMING_TOOLTIP)}>Timeframe pull and close calendar (display only)</h3>
              {ge.layer3.timeConfluence?.enabled ? (() => {
                const tc = ge.layer3.timeConfluence;
                const fmtPrice = (v: number) => `$${fmtP(v)}`;
                const fmtTime = (iso: string) => {
                  const d = new Date(iso);
                  const h = d.getUTCHours().toString().padStart(2,'0');
                  const m = d.getUTCMinutes().toString().padStart(2,'0');
                  return `${h}:${m} UTC`;
                };
                const fmtCountdown = (mins: number) => {
                  if (mins < 1) return 'NOW';
                  if (mins < 60) return `${Math.round(mins)}m`;
                  const h = Math.floor(mins / 60);
                  const rm = Math.round(mins % 60);
                  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
                };
                // Group close schedule by category
                const groups: Record<string, typeof tc.closeSchedule> = { intraday: [], daily: [], weekly: [], monthly: [] };
                for (const row of tc.closeSchedule || []) groups[row.category]?.push(row);
                const catLabel: Record<string, string> = { intraday: 'Intraday', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
                const catColor: Record<string, string> = { intraday: 'var(--msp-flat)', daily: 'var(--msp-info)', weekly: 'var(--msp-warn)', monthly: 'var(--msp-bear)' };
                return (
                  <div className="space-y-3">
                    {/* Signal Strength + Direction + Banners */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {(tc as any).sessionState && <Badge label={symbolText((tc as any).sessionState === 'closed' ? 'session closed' : (tc as any).sessionState === 'always_open' ? '24/7 market' : 'session open')} color="var(--msp-flat)" small />}
                    </div>
                    <div className="text-[11px] text-slate-500">Each row is a timeframe's next bar close and its prior-candle midpoint (mid-50) relative to price. A calendar and measured distances only; no direction or target is derived from it here.</div>

                    {tc.decompression.unmeasuredTFs?.length ? <p className="text-xs text-slate-500">Not measured on this data: {symbolText(tc.decompression.unmeasuredTFs.join(', '))}. Excluded from counts and levels.</p> : null}
                    {/* Close Schedule Timeline — grouped by category */}
                    {tc.closeSchedule && tc.closeSchedule.length > 0 && (
                      <div>
                        <div className="text-[11px] text-slate-500 uppercase mb-1.5">Close Cluster Timeline — Next 24h</div>
                        <div className="overflow-x-auto">
                        <div className="space-y-2" style={{ minWidth: 'min(100%, 340px)' }}>
                          {(['monthly', 'weekly', 'daily', 'intraday'] as const).map(cat => {
                            const rows = groups[cat];
                            if (!rows || rows.length === 0) return null;
                            return (
                              <div key={cat}>
                                <div className="text-[11px] font-semibold uppercase mb-0.5" style={{ color: catColor[cat] }}>{symbolText(catLabel[cat])}</div>
                                <div className="space-y-0.5">
                                  {rows.map((row, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded bg-[#0A101C]/40">
                                      <span className="text-slate-300 font-semibold w-10">{symbolText(row.tf)}</span>
                                      <span className="text-slate-500 w-16">{symbolText(fmtTime(row.nextCloseAt))}</span>
                                      <span className={`w-12 font-mono ${row.minsToClose <= 5 ? 'text-yellow-400 font-bold' : row.minsToClose <= 60 ? 'text-orange-400' : 'text-slate-400'}`}>
                                        {symbolText(fmtCountdown(row.minsToClose))}
                                      </span>
                                      {row.mid50Level ? (
                                        <>
                                          <span className="font-mono text-white w-24 text-right">{symbolText(fmtPrice(row.mid50Level))}</span>
                                          {(() => {
                                            // Direction word and sign must agree: describe where the mid-50 LEVEL sits relative to price.
                                            const rel = describeLevelRelation(ge.meta.price, row.mid50Level);
                                            const pull = row.pullDirection === 'up' ? 'pull up' : row.pullDirection === 'down' ? 'pull down' : 'no pull';
                                            return (
                                              <span className={`w-40 text-right ${rel.side === 'above' ? 'text-emerald-400' : rel.side === 'below' ? 'text-red-400' : 'text-slate-500'}`} title={symbolText(`Mid-50 level ${rel.label}; decompression ${pull}`)}>
                                                {symbolText(rel.side === 'above' ? '▲' : rel.side === 'below' ? '▼' : '–')} {symbolText(rel.label)} · {symbolText(pull)}
                                              </span>
                                            );
                                          })()}
                                        </>
                                      ) : (
                                        <span className="text-slate-600 text-[11px]">— no mid-50</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        </div>
                      </div>
                    )}

                    {/* Candle Close Confluence */}
                    <div>
                      <div className="text-[11px] text-slate-500 uppercase mb-1" title={symbolText(TIMING_TOOLTIP)}>{symbolText(CLOSE_CALENDAR_LABEL)}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-300">{symbolText(tc.closes.closingNowCount > 0 ? `${tc.closes.closingNowCount} timeframes closing now` : 'No timeframe closing now')}</span>
                      </div>
                      {tc.closes.isMonthEnd && <div className="text-[11px] text-yellow-400 mt-0.5">Month-end calendar</div>}
                      {tc.closes.isWeekEnd && <div className="text-[11px] text-blue-400 mt-0.5">Week-end calendar</div>}
                    </div>

                  </div>
                );
              })() : (
                <div className="text-xs text-slate-500 py-4 text-center">Timeframe pull and close calendar not recorded</div>
              )}
            </Card>

            {/* -- VOLATILITY (DVE) ---------------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Volatility</h3>
              {dve.loading ? (
                <div className="space-y-3"><Skel /><Skel /><Skel /></div>
              ) : d ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge label={symbolText(d.volatility.regime ?? 'BBWP not available')} color={
                      d.volatility.regime === 'compression' ? '#06B6D4' : d.volatility.regime === 'expansion' ? 'var(--msp-warn)' : d.volatility.regime === 'climax' ? 'var(--msp-bear)' : 'var(--msp-flat)'
                    } />
                  </div>

                  {/* BBWP Gauge + Direction */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--msp-panel-2)] rounded p-2">
                      <div className="text-[11px] text-slate-500 mb-1">BBWP</div>
                      <div className="flex flex-col items-center">
                        {(() => {
                          const bbwp = d.volatility.bbwp;
                          const zones = [
                            { max: 15, color: 'var(--msp-panel)', text: 'var(--msp-info)' },
                            { max: 70, color: 'var(--msp-text-muted)', text: 'var(--msp-flat)' },
                            { max: 90, color: 'var(--msp-warn)', text: 'var(--msp-warn)' },
                            { max: 100, color: 'var(--msp-bear)', text: 'var(--msp-bear)' },
                          ];
                          // W3 DVE v2: an unavailable BBWP is null; no needle is drawn for it.
                          const zone = bbwp == null ? { max: 0, color: 'var(--msp-panel)', text: 'var(--msp-text-muted)' } : zones.find(z => bbwp <= z.max) ?? zones[3];
                          const r = 50, sw = 7, cx = 60, cy = 58;
                          return (
                            <>
                              <svg viewBox="0 0 120 68" style={{ width: '100%', maxWidth: 140 }}>
                                <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={sw} strokeLinecap="round" />
                                {zones.map((z, i) => {
                                  const s = i === 0 ? 0 : zones[i - 1].max;
                                  const x1 = cx - r * Math.cos(Math.PI - (s / 100) * Math.PI);
                                  const y1 = cy - r * Math.sin(Math.PI - (s / 100) * Math.PI);
                                  const x2 = cx - r * Math.cos(Math.PI - (z.max / 100) * Math.PI);
                                  const y2 = cy - r * Math.sin(Math.PI - (z.max / 100) * Math.PI);
                                  return <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${z.max - s > 50 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={z.color} strokeWidth={sw} opacity={0.5} />;
                                })}
                                {bbwp != null && (() => {
                                  const a = Math.PI * (1 - bbwp / 100);
                                  const nl = r - sw;
                                  return <line x1={cx} y1={cy} x2={cx - nl * Math.cos(a)} y2={cy - nl * Math.sin(a)} stroke={zone.text} strokeWidth={2} strokeLinecap="round" />;
                                })()}
                                <circle cx={cx} cy={cy} r={3} fill={zone.text} />
                              </svg>
                              <div className="text-sm font-bold -mt-1" style={{ color: zone.text }}>{symbolText(bbwp == null ? 'Not available' : bbwp.toFixed(1))}</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded p-2 text-[11px] text-slate-400">
                      <div className="text-slate-500">BBWP basis</div>
                      {symbolText(d.volatility.bbwp == null ? 'BBWP not available: too few closes.' : bbwpBasisNote(d.volatility.bbwp, ge.priceEvidence) ?? 'BBWP from the Volatility engine (BB 13, one-year percentile).')}
                    </div>
                  </div>
                  {d.signal.active && d.signal.type !== 'none' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                      <div className="text-[11px] text-emerald-400 font-semibold">Signal recorded: {symbolText(d.signal.type.replace(/_/g, ' '))}</div>
                      <div className="text-[11px] text-slate-400">{symbolText(d.signal.triggerReason.join(' · '))}</div>
                    </div>
                  )}
                  {d.pinnedCompression.conditions.compressed && d.pinnedCompression.conditions.nearLargeOiStrike && <div className="text-xs text-slate-300">BBWP below 20 with price near a large open-interest strike.</div>}
                  <div className="text-[11px] text-slate-500">{symbolText(d.summary)}</div>
                </div>
              ) : ge.layer3.structure.volatility ? (
                <div className="space-y-2">
                  <Badge label={symbolText(ge.layer3.structure.volatility.regime || 'unknown')} color="#94A3B8" />
                  {ge.layer3.structure.volatility.bbwp != null && <div className="text-xs text-slate-400">BBWP: {symbolText(ge.layer3.structure.volatility.bbwp.toFixed(1))}</div>}
                  <div className="text-[11px] text-slate-600">DVE feed failed — showing the recorded Symbol volatility data</div>
                </div>
              ) : <div className="text-xs text-slate-500">No volatility data available</div>}
            </Card>

            {/* -- OPTIONS / DERIVATIVES --------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">
                {symbolText(ge.meta.assetClass === 'crypto' ? 'Derivatives' : 'Options / Derivatives')}
              </h3>
              {ge.layer3.options?.enabled ? (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {ge.layer3.options.highlights.map((h, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-400">{symbolText(h.label)}</span>
                        <span className="text-white">{symbolText(h.value)}</span>
                      </div>
                    ))}
                  </div>
                  {ge.layer3.options.notes?.map((n, i) => (
                    <div key={i} className="text-[11px] text-slate-500">• {symbolText(n)}</div>
                  ))}
                  {ge.meta.assetClass !== 'crypto' && (
                    <a
                      href={canonicalTerminalHref}
                      className="mt-2 inline-block text-[11px] text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60 rounded"
                    >
                      Open Options
                    </a>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-4 text-center">
                  {symbolText(ge.meta.assetClass === 'crypto' ? 'Derivatives data not available' : `Options data not available for ${sym}`)}
                </div>
              )}
            </Card>
          </div>

          {/* -- RECORDED LEVELS (W3-R: the direction-derived reference / risk / reaction-zone plan is not public) -- */}
          <Card>
            <h3 className="text-xs font-semibold text-emerald-400 mb-3">Recorded levels</h3>
              <p className="mb-2 text-xs text-slate-500">Bar-close references · {symbolText(geBarSession ?? 'date not recorded')}. No entry, stop or target is derived from them.</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {ge.layer2.setup.keyLevels.length === 0 ? <div className="text-xs text-slate-500">No levels recorded on this bar.</div> : ge.layer2.setup.keyLevels.map((lv) => (
                <div key={`${lv.label}-${lv.price}`} className="flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 break-words text-slate-400">{symbolText(lv.label)} <span className="text-[11px] text-slate-600">({symbolText(lv.kind)})</span></span>
                  <span className="font-mono text-white">{symbolText(formatLevel(lv.price))}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800/50">
              <a href={canonicalTerminalHref} className="px-4 py-2 bg-slate-700/50 text-slate-400 rounded-lg text-xs hover:bg-slate-700/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 no-underline">
                Open in Terminal
              </a>
            </div>
            <div className="mt-2 text-[11px] text-slate-600">Levels are calculated from technical indicators for educational and informational purposes only. This does not constitute financial advice, does not recommend any course of action, and does not consider your personal circumstances. Past performance does not guarantee future results.</div>
          </Card>

          {/* Phase 4: the engine narrative (permission wording and a /100 composite) is not shown; the research snapshot
              at the top of the page gives the factual summary. */}
        </>
        </UpgradeGate>
      )}
      </>}
      </CollapsibleSection>}
      {!isAuthBlocked&&geCanonical?.historyBars!=null&&geCanonical.historyBars>0&&<CollapsibleSection deferMount title="Backtest" summary={`${geCanonical.historyBars} recorded ${geCanonical.barInterval??timeframe} bars`}><a className="inline-flex min-h-10 items-center underline" href={`/tools/workspace?tab=backtest&symbol=${encodeURIComponent(sym)}&type=${snapshotAsset}&timeframe=${timeframe}`}>Open Backtest with {symbolText(sym)}</a></CollapsibleSection>}
      {(quoteType==='crypto'?Boolean(cryptoStamp?.source&&cryptoStamp?.asOf):Boolean((geCanonical?.source??quote.data?.source)&&(geCanonical?.priceTs??quote.data?.observedAt)))&&<SourceLine {...(quoteType==='crypto'?{...cryptoStamp,source:readerSourceLabel(cryptoStamp?.source)}:{source:readerSourceLabel(geCanonical?.source??quote.data?.source),asOf:geCanonical?.priceTs??quote.data?.observedAt,basis:geCanonical?.barInterval??'Last session close'})}/>}
      <ComplianceDisclaimer compact />
    </div>
  );
}
