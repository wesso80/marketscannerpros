'use client';

/* ---------------------------------------------------------------------------
   SURFACE 3: GOLDEN EGG — Deep Analysis Page
   Real API data: /api/golden-egg + /api/dve + /api/quote
   --------------------------------------------------------------------------- */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useGoldenEgg, useDVE, useQuote, useRegime, type ScanTimeframe, SCAN_TIMEFRAMES } from '@/app/v2/_lib/api';
import { Card, Badge, ScoreBar, UpgradeGate } from '@/app/v2/_components/ui';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { REGIME_COLORS, VERDICT_COLORS, CROSS_MARKET, LIFECYCLE_COLORS, REGIME_WEIGHTS } from '@/app/v2/_lib/constants';
import type { RegimePriority, Verdict, LifecycleState } from '@/app/v2/_lib/types';
import { useCachedTopSymbols } from '@/hooks/useCachedTopSymbols';
import { useRegisterPageData } from '@/lib/ai/pageContext';
import { saveResearchCase } from '@/lib/clientResearchCases';
import EvidenceStack from '@/components/market/EvidenceStack';
import MarketStatusStrip from '@/components/market/MarketStatusStrip';
import RiskFlagPanel, { type RiskFlag } from '@/components/market/RiskFlagPanel';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';

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
const DeepAnalysis = dynamic(() => import('@/app/tools/deep-analysis/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Deep Analysis…</div> });
const IntradayCharts = dynamic(() => import('@/app/tools/intraday-charts/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Charts…</div> });
const CompanyOverview = dynamic(() => import('@/app/tools/company-overview/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Fundamentals…</div> });

const GE_TABS = ['Verdict', 'Chart', 'Deep Analysis', 'Fundamentals'] as const;
type GETab = typeof GE_TABS[number];

const GE_TAB_META: Record<GETab, { eyebrow: string; description: string }> = {
  Verdict: {
    eyebrow: '1. Verdict packet',
    description: 'Answer first: alignment, data trust, reference, invalidation, and next check.',
  },
  Chart: {
    eyebrow: '2. Price context',
    description: 'Inspect price action and intraday structure around the scenario levels.',
  },
  'Deep Analysis': {
    eyebrow: '3. Evidence detail',
    description: 'Review the deeper technical evidence behind the verdict.',
  },
  Fundamentals: {
    eyebrow: '4. Business context',
    description: 'Check company or asset fundamentals before relying on the setup.',
  },
};

function GoldenEggTabRail({ activeTab, onSelectTab }: { activeTab: GETab; onSelectTab: (tab: GETab) => void }) {
  return (
    <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2" aria-label="Golden Egg validation views">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-amber-300">Validation workbench</div>
          <div className="text-[0.72rem] text-slate-500">Verdict first, then inspect chart, evidence detail, and business context.</div>
        </div>
        <a href="/tools/liquidity-sweep" className="rounded-md border border-slate-700/70 bg-slate-900/60 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-400 no-underline transition hover:border-emerald-400/30 hover:text-emerald-300">
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
              className={`rounded-md border px-3 py-1.5 text-left transition ${
                isActive
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
                  : 'border-white/10 bg-white/[0.025] text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{meta.eyebrow}</div>
              <div className={`mt-0.5 text-sm font-black ${isActive ? 'text-emerald-200' : 'text-white'}`}>{tab}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GoldenEggSubviewMetric({ label, value, tone = '#CBD5E1', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

function GoldenEggSubviewFrame({
  tab,
  symbol,
  onSelectTab,
  children,
}: {
  tab: Exclude<GETab, 'Verdict'>;
  symbol: string;
  onSelectTab: (tab: GETab) => void;
  children: React.ReactNode;
}) {
  const meta = GE_TAB_META[tab];
  const adjacentTab: GETab = tab === 'Chart' ? 'Deep Analysis' : tab === 'Deep Analysis' ? 'Fundamentals' : 'Chart';

  return (
    <div className="space-y-3">
      <section
        className="rounded-lg border border-amber-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
        aria-label={`Golden Egg ${tab} command header`}
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
              <span className="text-amber-300">Golden Egg subview</span>
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">{meta.eyebrow}</span>
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">Symbol {symbol}</span>
            </div>
            <h2 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">{tab} check for {symbol}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">{meta.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onSelectTab('Verdict')} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-400/15">Review Verdict</button>
              <button type="button" onClick={() => onSelectTab(adjacentTab)} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15">Open {adjacentTab}</button>
              <a href={`/tools/terminal?symbol=${encodeURIComponent(symbol)}`} className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15">Open Terminal</a>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <GoldenEggSubviewMetric label="Symbol" value={symbol} tone="#FBBF24" detail="Single-symbol validation context" />
            <GoldenEggSubviewMetric label="View" value={tab} tone="#10B981" detail={meta.eyebrow} />
            <GoldenEggSubviewMetric label="Focus" value={tab === 'Chart' ? 'Price Action' : tab === 'Deep Analysis' ? 'Evidence Detail' : 'Business Context'} tone="#A5B4FC" detail="Completes the Verdict packet" />
            <GoldenEggSubviewMetric label="Next Check" value={adjacentTab} tone="#F59E0B" detail="Continue the validation sequence" />
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

const GOLDEN_EGG_WORKFLOW_CHECKS = [
  'Verdict first',
  'Data trust',
  'Reference level',
  'Invalidation',
  'Next check',
] as const;

function FlagshipMetric({ label, value, tone = '#94A3B8', title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div title={title} className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }}>{value}</div>
    </div>
  );
}

/* ─── Phase 5: Cross-Market Alignment ─── */
function deriveCrossMarketAlignment(signals?: Array<{ source: string; regime: string; weight: number; stale: boolean }>): { alignment: 'supportive' | 'neutral' | 'headwind'; factors: string[] } {
  if (!signals || signals.length === 0) return { alignment: 'neutral', factors: ['No cross-market data'] };
  const factors: string[] = [];
  let headwinds = 0;
  let tailwinds = 0;
  for (const s of signals) {
    if (s.stale) continue;
    const r = s.regime?.toLowerCase() || '';
    if (r === 'risk_off' || r === 'compression') { headwinds += s.weight; factors.push(`${s.source}: ${s.regime} (headwind)`); }
    else if (r === 'trend' || r === 'expansion' || r === 'risk_on') { tailwinds += s.weight; factors.push(`${s.source}: ${s.regime} (supportive)`); }
    else { factors.push(`${s.source}: ${s.regime} (neutral)`); }
  }
  if (headwinds > tailwinds + 0.2) return { alignment: 'headwind', factors };
  if (tailwinds > headwinds + 0.2) return { alignment: 'supportive', factors };
  return { alignment: 'neutral', factors };
}

const ALIGNMENT_COLOR: Record<string, string> = { supportive: '#10B981', neutral: '#F59E0B', headwind: '#EF4444' };

/* ─── Phase 6: Lifecycle State from GE data ─── */
function deriveGELifecycle(assessment?: string, confidence?: number, gated?: boolean): LifecycleState {
  if (gated) return 'INVALIDATED';
  const conf = confidence ?? 0;
  const perm = (assessment || '').toUpperCase();
  if (perm === 'YES' && conf >= 65) return 'READY';
  if (perm === 'ALIGNED' && conf >= 65) return 'READY';
  if (perm === 'YES' && conf >= 40) return 'SETTING_UP';
  if (perm === 'ALIGNED' && conf >= 40) return 'SETTING_UP';
  if (perm === 'WAIT' || perm === 'WATCH') return 'WATCHING';
  if (perm === 'NO') return 'INVALIDATED';
  if (perm === 'NOT_ALIGNED') return 'INVALIDATED';
  return 'DISCOVERED';
}
import { useUserTier } from '@/lib/useUserTier';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

function verdictColor(v: string) {
  if (v === 'ALIGNED') return '#10B981';
  if (v === 'NOT_ALIGNED') return '#EF4444';
  return '#F59E0B';
}

function dirColor(d?: string) {
  if (!d) return '#94A3B8';
  const l = d.toLowerCase();
  if (l === 'bullish' || l === 'long' || l === 'bull') return '#10B981';
  if (l === 'bearish' || l === 'short' || l === 'bear') return '#EF4444';
  return '#F59E0B';
}

function gradeColor(g: string) {
  if (g === 'A') return '#10B981';
  if (g === 'B') return '#3B82F6';
  if (g === 'C') return '#F59E0B';
  return '#EF4444';
}

/** Adaptive price formatter — keeps sub-dollar assets readable */
function fmtP(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toPrecision(4);
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatLevel(value: number | null | undefined): string {
  if (!isUsableNumber(value)) return 'Unavailable';
  return `$${fmtP(value)}`;
}

function getGEDataQuality(input: { price?: number | null; confluence?: number | null; assessment?: string | null; reference?: number | null; invalidation?: number | null }) {
  if (!isUsableNumber(input.price)) return 'MISSING';
  const missing = [input.confluence, input.reference, input.invalidation].filter((value) => !isUsableNumber(value)).length;
  if (!input.assessment) return 'DEGRADED';
  return missing === 0 ? 'GOOD' : missing <= 1 ? 'DEGRADED' : 'MISSING';
}

function geDataQualityColor(label: string): string {
  if (label === 'GOOD') return '#10B981';
  if (label === 'DEGRADED') return '#F59E0B';
  return '#EF4444';
}

function geMissingInputs(input: { price?: number | null; confluence?: number | null; assessment?: string | null; reference?: number | null; invalidation?: number | null }): string[] {
  return [
    !isUsableNumber(input.price) ? 'price' : null,
    !isUsableNumber(input.confluence) ? 'confluence' : null,
    !input.assessment ? 'assessment' : null,
    !isUsableNumber(input.reference) ? 'reference level' : null,
    !isUsableNumber(input.invalidation) ? 'invalidation level' : null,
  ].filter(Boolean) as string[];
}

function geDataQualityDetail(label: string, missing: string[]): string {
  if (label === 'GOOD') return 'Price, assessment, confluence, reference level, and invalidation level are available.';
  if (missing.length === 0) return `${label} Golden Egg inputs.`;
  return `Missing or weak: ${missing.join(', ')}.`;
}

function summarizeGENextCheck(args: { dataQuality: string; hasScenarioLevels: boolean; assessment?: string | null; primaryBlocker?: string | null; confluence: number; crossMarket: 'supportive' | 'neutral' | 'headwind' }) {
  if (args.dataQuality !== 'GOOD') return 'Refresh Golden Egg inputs before relying on reference levels.';
  if (!args.hasScenarioLevels) return 'Wait for valid reference and invalidation levels before escalation.';
  if (args.primaryBlocker) return `Review blocker: ${args.primaryBlocker}.`;
  if (args.crossMarket === 'headwind') return 'Check whether cross-market headwinds ease before treating the setup as clean.';
  if ((args.assessment || '').toUpperCase() !== 'ALIGNED') return 'Wait for assessment to move from watch/mixed into aligned.';
  if (args.confluence < 70) return 'Watch for confluence to improve above the high-conviction threshold.';
  return 'Monitor whether price respects the reference level and confluence holds.';
}

function assessmentDisplayLabel(assessment?: string | null): string {
  if (assessment === 'ALIGNED') return 'Scenario Aligned';
  if (assessment === 'NOT_ALIGNED') return 'Not Aligned';
  if (assessment === 'YES') return 'Scenario Watch';
  if (assessment === 'NO') return 'Not Aligned';
  return 'Watch';
}

function summarizeGEReason(args: { direction?: string | null; setupType?: string | null; confluence: number; crossMarket: 'supportive' | 'neutral' | 'headwind'; dataQuality: string; primaryDriver?: string | null; primaryBlocker?: string | null }) {
  if (args.dataQuality !== 'GOOD') return `Research context is limited by ${args.dataQuality.toLowerCase()} data inputs.`;
  if (args.primaryBlocker) return `${args.primaryDriver || 'Setup evidence'} is present, but ${args.primaryBlocker} is limiting conviction.`;
  const direction = args.direction ? `${args.direction.toLowerCase()} ` : '';
  const setup = args.setupType ? args.setupType.replace(/_/g, ' ') : 'setup';
  if (args.crossMarket === 'headwind') return `${direction}${setup} is present, but cross-market conditions are a headwind.`;
  if (args.confluence >= 70) return `${direction}${setup} has high confluence with no primary blocker flagged.`;
  return `${direction}${setup} is forming, but confluence is still below high-conviction threshold.`;
}

function summarizeGEResearchCaution(args: { dataQuality: string; hasScenarioLevels: boolean; assessment?: string | null; confluence: number; primaryBlocker?: string | null }) {
  if (args.dataQuality !== 'GOOD') return 'Research caution: core inputs are incomplete or weak.';
  if (!args.hasScenarioLevels) return 'Research caution: reference and invalidation levels are not both available.';
  if (args.primaryBlocker) return `Research caution: blocker still present — ${args.primaryBlocker}.`;
  if ((args.assessment || '').toUpperCase() !== 'ALIGNED') return 'Research caution: Golden Egg assessment is not scenario aligned.';
  if (args.confluence < 70) return 'Research caution: confluence remains below the high-conviction threshold.';
  return 'Research caution: verify whether price interaction confirms or rejects the scenario.';
}

function buildGEInvalidationConditions(args: { confluence: number; dataQuality: string; primaryBlocker?: string | null; crossMarket: 'supportive' | 'neutral' | 'headwind'; dveRegime?: string | null; timeVerdict?: string | null }) {
  return [
    'Reference or invalidation level becomes unavailable.',
    args.dataQuality !== 'GOOD' ? 'Data trust remains degraded or missing.' : null,
    args.confluence < 60 ? 'Confluence remains below 60%.' : 'Confluence drops below 60%.',
    args.primaryBlocker ? `Primary blocker persists: ${args.primaryBlocker}.` : null,
    args.crossMarket === 'headwind' ? 'Cross-market conditions remain a headwind.' : 'Cross-market conditions flip to headwind.',
    args.dveRegime === 'climax' ? 'DVE remains in climax risk.' : 'DVE flips into climax risk.',
    args.timeVerdict === 'disagree' ? 'Time confluence remains opposed.' : 'Time confluence flips to disagreement.',
  ].filter(Boolean) as string[];
}

function formatTimestamp(value: unknown): string {
  if (!value) return 'Unavailable';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Unavailable';
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
  const { selectedSymbol, selectSymbol, navigateTo } = useV2();
  const { tier } = useUserTier();
  const [symbolInput, setSymbolInput] = useState('');
  const [timeframe, setTimeframe] = useState<ScanTimeframe>('daily');
  const [activeTab, setActiveTab] = useState<GETab>('Verdict');
  const [assetType, setAssetType] = useState<'auto' | 'equity' | 'crypto'>('auto');
  const [savingCase, setSavingCase] = useState(false);
  const [saveCaseMsg, setSaveCaseMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Quick-pick symbols from worker cache (falls back to defaults if cache empty)
  const cached = useCachedTopSymbols(5);
  const FALLBACK_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META'];
  const quickSymbols = useMemo(() => {
    const syms = [...cached.crypto.map(c => c.symbol), ...cached.equity.map(c => c.symbol)];
    return syms.length > 0 ? syms.slice(0, 10) : FALLBACK_SYMBOLS;
  }, [cached.crypto, cached.equity]);

  const sym = selectedSymbol || 'AAPL';

  // Resolve asset type: 'auto' uses detectAssetClass, otherwise user override
  const resolvedType = assetType === 'auto' ? undefined : assetType;
  const isCryptoSymbol = CRYPTO_SET.has(sym.toUpperCase());
  const quoteType: 'stock' | 'crypto' = assetType === 'crypto' ? 'crypto' : assetType === 'equity' ? 'stock' : isCryptoSymbol ? 'crypto' : 'stock';

  // Ensure V2Context always reflects the resolved symbol so embedded tabs sync
  useEffect(() => {
    if (sym && !selectedSymbol) selectSymbol(sym);
  }, [sym, selectedSymbol, selectSymbol]);

  // Core data
  const goldenEgg = useGoldenEgg(sym, timeframe, resolvedType);
  const dve = useDVE(sym, timeframe, resolvedType);
  const quote = useQuote(sym, quoteType);
  const regime = useRegime();

  const ge = goldenEgg.data?.data;
  const geLocalDemo = Boolean((goldenEgg.data as any)?.localDemo);
  const geWarnings = ((goldenEgg.data as any)?.warnings || []) as string[];
  const geAssessment = ge?.layer1?.assessment;
  const geConfluenceScore = ge?.layer1?.confluenceScore ?? ge?.layer1?.confidence ?? 0;
  const geScenario = ge?.layer2?.scenario;
  const geSafeScenario = geScenario ?? null;
  const d = dve.data?.data;
  const loading = goldenEgg.loading;
  const isAuthBlocked = goldenEgg.isAuthError && !loading;
  const geReferencePrice = geSafeScenario?.referenceLevel?.price;
  const geInvalidationPrice = geSafeScenario?.invalidationLevel?.price;
  const geHasScenarioLevels = isUsableNumber(geReferencePrice) && isUsableNumber(geInvalidationPrice);
  const geDataQuality = getGEDataQuality({ price: quote.data?.price ?? ge?.meta?.price, confluence: geConfluenceScore, assessment: geAssessment, reference: geReferencePrice, invalidation: geInvalidationPrice });
  const geDataQualityTitle = geDataQualityDetail(geDataQuality, geMissingInputs({ price: quote.data?.price ?? ge?.meta?.price, confluence: geConfluenceScore, assessment: geAssessment, reference: geReferencePrice, invalidation: geInvalidationPrice }));
  const crossMarketAlignment = deriveCrossMarketAlignment(regime.data?.signals);
  const geNextUsefulCheck = summarizeGENextCheck({ dataQuality: geDataQuality, hasScenarioLevels: geHasScenarioLevels, assessment: geAssessment, primaryBlocker: ge?.layer1?.primaryBlocker, confluence: geConfluenceScore, crossMarket: crossMarketAlignment.alignment });
  const geAssessmentLabel = assessmentDisplayLabel(geAssessment);
  const geReason = summarizeGEReason({ direction: ge?.layer1?.direction, setupType: ge?.layer2?.setup?.setupType, confluence: geConfluenceScore, crossMarket: crossMarketAlignment.alignment, dataQuality: geDataQuality, primaryDriver: ge?.layer1?.primaryDriver, primaryBlocker: ge?.layer1?.primaryBlocker });
  const geDoNothing = summarizeGEResearchCaution({ dataQuality: geDataQuality, hasScenarioLevels: geHasScenarioLevels, assessment: geAssessment, confluence: geConfluenceScore, primaryBlocker: ge?.layer1?.primaryBlocker });
  const geInvalidationConditions = buildGEInvalidationConditions({ confluence: geConfluenceScore, dataQuality: geDataQuality, primaryBlocker: ge?.layer1?.primaryBlocker, crossMarket: crossMarketAlignment.alignment, dveRegime: d?.volatility?.regime, timeVerdict: ge?.layer3?.timeConfluence?.verdict });
  const geMarketStatusItems = [
    {
      label: 'Quote',
      computedAt: ge?.meta?.asOfTs,
      status: buildMarketDataProviderStatus({
        source: 'quote',
        provider: quoteType === 'crypto' ? 'crypto quote' : 'equity quote',
        localDemo: geLocalDemo,
        stale: !ge?.meta?.asOfTs,
        degraded: !isUsableNumber(quote.data?.price ?? ge?.meta?.price),
        warnings: [
          !isUsableNumber(quote.data?.price ?? ge?.meta?.price) ? 'Quote price unavailable.' : null,
          !ge?.meta?.asOfTs ? 'Quote timestamp unavailable.' : null,
          ...geWarnings,
        ].filter(Boolean) as string[],
      }),
    },
    {
      label: 'Regime',
      status: buildMarketDataProviderStatus({
        source: 'regime',
        provider: 'cross-market regime',
        degraded: !regime.data,
        warnings: regime.data ? [] : ['Regime context unavailable.'],
      }),
    },
    {
      label: 'DVE',
      status: buildMarketDataProviderStatus({
        source: 'dve',
        provider: 'volatility engine',
        degraded: !d,
        warnings: d ? [] : [dve.loading ? 'DVE is still loading.' : 'DVE unavailable.'],
      }),
    },
    {
      label: ge?.meta?.assetClass === 'crypto' ? 'Derivatives' : 'Options',
      status: buildMarketDataProviderStatus({
        source: ge?.meta?.assetClass === 'crypto' ? 'derivatives' : 'options',
        provider: ge?.meta?.assetClass === 'crypto' ? 'derivatives evidence' : 'options evidence',
        degraded: !ge?.layer3?.options?.enabled,
        warnings: ge?.layer3?.options?.enabled ? [] : ['Options or derivatives evidence unavailable.'],
      }),
    },
    {
      label: 'Time',
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
      label: 'Why This Appeared',
      value: geDataQuality === 'GOOD' ? 'Supported' : geDataQuality,
      status: geDataQuality === 'GOOD' ? 'supportive' as const : 'missing' as const,
      detail: geReason,
    },
    {
      label: 'Cross Market',
      value: crossMarketAlignment.alignment === 'headwind' ? 'Headwind' : crossMarketAlignment.alignment === 'supportive' ? 'Tailwind' : 'Neutral',
      status: crossMarketAlignment.alignment === 'supportive' ? 'supportive' as const : crossMarketAlignment.alignment === 'headwind' ? 'conflicting' as const : 'neutral' as const,
      detail: crossMarketAlignment.factors.slice(0, 3).join(' | ') || 'No cross-market data.',
    },
    {
      label: 'Scenario Levels',
      value: geHasScenarioLevels ? 'Available' : 'Incomplete',
      status: evidenceStatus(geHasScenarioLevels, 'Scenario reference or invalidation is missing.'),
      detail: geHasScenarioLevels ? `Reference ${formatLevel(geReferencePrice)} / invalidation ${formatLevel(geInvalidationPrice)}.` : 'Scenario reference and invalidation levels are not both available.',
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
      selectSymbol(symbolInput.trim().toUpperCase());
      setSymbolInput('');
    }
  }

  /* ─── Register Golden Egg data for Arca AI context ─── */
  const geAiData = useMemo(() => ({
    symbol: sym,
    timeframe,
    assessment: geAssessment,
    direction: ge?.layer1?.direction,
    confluenceScore: geConfluenceScore,
    price: quote.data?.price,
    bbwp: d?.bbwp,
    dveDirection: d?.direction,
    breakoutReadiness: d?.breakoutReadiness,
    doctrine: ge?.doctrine,
    setupThesis: ge?.layer2?.setup?.thesis,
    referenceZone: geSafeScenario?.referenceLevel,
    invalidation: geSafeScenario?.invalidationLevel,
    reactionZones: geSafeScenario?.reactionZones,
    hypotheticalRiskReward: geSafeScenario?.hypotheticalRr,
    optionsData: ge?.layer3?.options,
    timeConfluence: ge?.timeConfluence,
  }), [sym, timeframe, ge, geAssessment, geConfluenceScore, geSafeScenario, d, quote.data]);

  const geAiSummary = useMemo(() => {
    if (!ge) return `Golden Egg: Loading ${sym}...`;
    return `${sym} — Assessment: ${geAssessment}, Direction: ${ge.layer1.direction}, Confluence: ${geConfluenceScore}%`;
  }, [sym, ge, geAssessment, geConfluenceScore]);

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
          thesis: ge.layer2?.setup?.thesis || `${sym} Golden Egg educational research case.`,
          assessment: geAssessment,
          direction: ge.layer1?.direction,
          confluenceScore: geConfluenceScore,
          truthLayer: {
            whatWeKnow: [
              `Golden Egg assessment is ${geAssessment ?? 'unknown'}.`,
              `Confluence score is ${geConfluenceScore}%.`,
              ge.layer1?.primaryDriver ? `Primary driver: ${ge.layer1.primaryDriver}.` : null,
            ].filter(Boolean),
            whatWeDoNotKnow: geMissingInputs({ price: quote.data?.price ?? ge?.meta?.price, confluence: geConfluenceScore, assessment: geAssessment, reference: geReferencePrice, invalidation: geInvalidationPrice }),
            dataQuality: geDataQuality,
            riskFlags: [ge.layer1?.primaryBlocker].filter(Boolean),
            invalidation: isUsableNumber(geInvalidationPrice) ? `Scenario invalidation reference: ${fmtP(geInvalidationPrice)}` : 'Scenario invalidation reference unavailable',
            nextUsefulCheck: geNextUsefulCheck,
            disclaimer: 'Educational market research only. Not financial advice.',
          },
          scenarioPlan: geSafeScenario ? {
            referenceLevel: geSafeScenario.referenceLevel,
            invalidationLevel: geSafeScenario.invalidationLevel,
            reactionZones: geSafeScenario.reactionZones,
            hypotheticalRr: geSafeScenario.hypotheticalRr,
          } : null,
          evidenceStack: {
            quote: quote.data,
            dve: d,
            doctrine: ge.doctrine,
            options: ge.layer3?.options,
            timeConfluence: ge.timeConfluence,
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

  return (
    <div className="space-y-3">
      <section
        className="rounded-lg border border-amber-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
        aria-label="Golden Egg command header"
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
              <span className="text-amber-300">Golden Egg validation workbench</span>
              {regime.data?.regime ? (
                <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-amber-200">Regime {String(regime.data.regime).toUpperCase()}</span>
              ) : null}
              {ge ? (
                <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">Confluence {geConfluenceScore}%</span>
              ) : null}
              <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">Data {geDataQuality}</span>
            </div>
            <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Validate one symbol before testing history.</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Regime, data trust, volatility, flow, timing, and invalidation are compressed into one research packet.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {GOLDEN_EGG_WORKFLOW_CHECKS.map((check) => (
                <span key={check} className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-amber-100">
                  {check}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/tools/terminal?symbol=${encodeURIComponent(sym)}`} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 no-underline transition-colors hover:bg-amber-400/15">Open Terminal</a>
              <a href="/tools/scanner" className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 no-underline transition-colors hover:bg-emerald-400/15">Open Scanner</a>
              <a href="/tools/workspace?tab=backtest" className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15">Open Backtest</a>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <FlagshipMetric label="Symbol" value={sym} tone="#FBBF24" />
            <FlagshipMetric label="Assessment" value={ge ? geAssessmentLabel : loading ? 'Loading' : 'Awaiting data'} tone={verdictColor(geAssessment || 'WATCH')} />
            <FlagshipMetric label="Confluence" value={ge ? `${geConfluenceScore}%` : 'Pending'} tone={verdictColor(geAssessment || 'WATCH')} />
            <FlagshipMetric label="Data Trust" value={geDataQuality} tone={geDataQualityColor(geDataQuality)} title={geDataQualityTitle} />
          </div>
        </div>

        {!isAuthBlocked && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2.5">
            <div className="grid gap-2 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="text"
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => event.key === 'Enter' && handleSymbolSubmit()}
                  placeholder="Enter symbol..."
                  className="min-w-0 flex-1 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-amber-400 focus:outline-none"
                />
                <button type="button" onClick={handleSymbolSubmit} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-400/15">Review</button>
              </div>

              <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                {quickSymbols.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    aria-pressed={symbol === sym}
                    onClick={() => selectSymbol(symbol)}
                    className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                      symbol === sym ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <div className="flex overflow-hidden rounded-md border border-[var(--msp-border)]">
                  {(['auto', 'equity', 'crypto'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={assetType === type}
                      onClick={() => setAssetType(type)}
                      className={`px-2.5 py-1.5 text-[11px] font-bold uppercase transition-colors ${assetType === type ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500 hover:bg-slate-800/60'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {SCAN_TIMEFRAMES.map((timeframeOption) => (
                    <button
                      key={timeframeOption.value}
                      type="button"
                      aria-pressed={timeframe === timeframeOption.value}
                      onClick={() => setTimeframe(timeframeOption.value)}
                      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${timeframe === timeframeOption.value ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300' : 'border-[var(--msp-border)] text-slate-400 hover:bg-slate-800/60'}`}
                    >
                      {timeframeOption.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/35 px-3 py-1.5 text-xs leading-5 text-slate-400">
              <span className="font-bold text-slate-200">Next useful check:</span> {ge ? geNextUsefulCheck : 'Choose a symbol to build the verdict packet.'}
            </div>
          </div>
        )}
      </section>
      <ComplianceDisclaimer compact />

      {isAuthBlocked && (
        <Card>
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mb-2 text-sm font-semibold text-amber-300">Sign in required</div>
            <h2 className="text-xl font-bold text-white">Unlock Golden Egg confluence analysis</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              Golden Egg is a Pro Trader workflow for reviewing one symbol across regime, confluence, volatility, and educational scenario context.
            </p>
            <div className="mt-5 grid gap-2 text-left text-xs text-slate-300 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Regime and bias context</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Confluence and data-quality checks</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Scenario reference and invalidation levels</div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Volatility, flow, and timing context</div>
            </div>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <a href="/auth" className="inline-flex rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30">Sign In</a>
              <a href="/pricing" className="inline-flex rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white">See Pricing</a>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Tab Bar ─── */}
      {!isAuthBlocked && <GoldenEggTabRail activeTab={activeTab} onSelectTab={setActiveTab} />}

      {/* ─── Deep-dive Tabs (v1 components) ─── */}
      {!isAuthBlocked && activeTab === 'Chart' && (
        <GoldenEggSubviewFrame tab="Chart" symbol={sym} onSelectTab={setActiveTab}>
          <IntradayCharts symbol={sym} />
        </GoldenEggSubviewFrame>
      )}
      {!isAuthBlocked && activeTab === 'Deep Analysis' && (
        <GoldenEggSubviewFrame tab="Deep Analysis" symbol={sym} onSelectTab={setActiveTab}>
          <DeepAnalysis symbol={sym} />
        </GoldenEggSubviewFrame>
      )}
      {!isAuthBlocked && activeTab === 'Fundamentals' && (
        <GoldenEggSubviewFrame tab="Fundamentals" symbol={sym} onSelectTab={setActiveTab}>
          <CompanyOverview symbol={sym} />
        </GoldenEggSubviewFrame>
      )}
      {/* ─── Verdict Tab (main GE analysis) ─── */}
      {!isAuthBlocked && activeTab === 'Verdict' && <>
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
      {goldenEgg.error && !loading && (
        <Card>
          <div className="py-8 text-center">
            <div className="text-amber-300 text-sm mb-2">Market data unavailable for {sym}</div>
            <div className="text-[11px] text-slate-500 mb-4">{goldenEgg.error}</div>
            <button type="button" onClick={() => goldenEgg.refetch()} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30">Retry</button>
          </div>
        </Card>
      )}

      {/* Main content */}
      {ge && !loading && (
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Golden Egg Deep Analysis">
        <>
          {geLocalDemo && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Local demo Golden Egg payload:</strong> live data is unavailable in this local environment, so this verdict packet is sample data for workflow testing only. Do not treat it as live market output.
              {geWarnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-300/90">
                  {geWarnings.slice(0, 2).map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}
          {/* -- VERDICT HEADER (Section 0 — Answer First) ------------ */}
          <Card className="border-l-4" style={{ borderLeftColor: verdictColor(geAssessment || 'WATCH') }}>
            <div className="flex flex-col gap-4">
              {/* Top row: Symbol + Regime + Bias + Verdict */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-2xl font-bold text-white">{ge.meta.symbol}</h2>
                    {regime.data && <Badge label={`Regime: ${regime.data.regime}`} color={REGIME_COLORS[regime.data.regime?.toLowerCase() as RegimePriority] || '#64748B'} small />}
                    <span title="Directional research bias from the Golden Egg evidence stack"><Badge label={ge.layer1.direction} color={dirColor(ge.layer1.direction)} /></span>
                    <span title="Grade summarizes setup quality across the Golden Egg model"><Badge label={`Grade ${ge.layer1.grade}`} color={gradeColor(ge.layer1.grade)} small /></span>
                    {(() => { const lc = deriveGELifecycle(geAssessment, geConfluenceScore); return <span title="Lifecycle describes whether the setup is forming, ready, watching, or invalidated" className="text-[11px] px-1.5 py-0.5 rounded border font-semibold" style={{ color: LIFECYCLE_COLORS[lc], borderColor: LIFECYCLE_COLORS[lc] + '40', backgroundColor: LIFECYCLE_COLORS[lc] + '15' }}>{lc.replace('_', ' ')}</span>; })()}
                    <span title="Cross-market factors can support, oppose, or remain neutral to the setup" className="text-[11px] px-1.5 py-0.5 rounded border font-semibold" style={{ color: ALIGNMENT_COLOR[crossMarketAlignment.alignment], borderColor: ALIGNMENT_COLOR[crossMarketAlignment.alignment] + '40', backgroundColor: ALIGNMENT_COLOR[crossMarketAlignment.alignment] + '15' }}>{crossMarketAlignment.alignment === 'headwind' ? 'Headwind' : crossMarketAlignment.alignment === 'supportive' ? 'Tailwind' : 'Neutral'}</span>
                    <span title={geDataQualityTitle} className="text-[11px] px-1.5 py-0.5 rounded border font-semibold" style={{ color: geDataQualityColor(geDataQuality), borderColor: geDataQualityColor(geDataQuality) + '40', backgroundColor: geDataQualityColor(geDataQuality) + '15' }}>Data {geDataQuality}</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {formatLevel(ge.meta.price)}
                    {quote.data?.changePercent != null && (
                      <span className={`ml-2 text-sm ${quote.data.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {quote.data.changePercent >= 0 ? '+' : ''}{quote.data.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{ge.meta.assetClass} — {ge.meta.timeframe} — {new Date(ge.meta.asOfTs).toLocaleString()}</div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <div className="text-3xl font-bold uppercase tracking-wider" style={{ color: verdictColor(geAssessment || 'WATCH') }}>
                      {geAssessmentLabel}
                    </div>
                    <div className="text-[11px] text-slate-500 uppercase">Assessment</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold" style={{ color: verdictColor(geAssessment || 'WATCH') }}>{geConfluenceScore}%</div>
                    <div className="text-[11px] text-slate-500 uppercase">Confluence</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-800/50 pb-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Verdict Packet</div>
                  <div className="text-[11px] text-slate-500">{ge.meta.assetClass} · {ge.meta.timeframe}</div>
                </div>
                <div className="grid gap-2 md:grid-cols-6">
                  {[
                    ['Assessment', geAssessmentLabel, verdictColor(geAssessment || 'WATCH'), 'Scenario alignment for educational research only.'],
                    ['Data Trust', geDataQuality, geDataQualityColor(geDataQuality), geDataQualityTitle],
                    ['Reference', formatLevel(geReferencePrice), '#10B981', geSafeScenario?.referenceTrigger || 'Reference unavailable.'],
                    ['Invalidation', formatLevel(geInvalidationPrice), '#EF4444', geSafeScenario?.invalidationLevel?.logic || 'Invalidation unavailable.'],
                    ['Next Check', geNextUsefulCheck, '#93C5FD', geNextUsefulCheck],
                    ['Blocker', ge.layer1.primaryBlocker || 'None flagged', ge.layer1.primaryBlocker ? '#F59E0B' : '#10B981', ge.layer1.primaryBlocker || 'No primary blocker returned by the model.'],
                  ].map(([label, value, color, title]) => (
                    <div key={label} title={title} className="rounded-md border border-slate-700/50 bg-[#0A101C]/50 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
                      <div className="mt-1 truncate text-xs font-bold" style={{ color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <EvidenceStack title="Golden Egg Evidence Stack" items={geEvidenceItems} />

              <MarketStatusStrip items={geMarketStatusItems} className="md:grid-cols-5" />

              {/* Level of Interest / Invalidation / Key Levels row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/50">
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">Level of Interest</div>
                  <div className="text-sm text-emerald-400 font-semibold">{geSafeScenario?.referenceTrigger}</div>
                  {geSafeScenario?.referenceLevel.price && (
                    <div className="text-xs font-mono text-white mt-0.5">{formatLevel(geSafeScenario.referenceLevel.price)} ({geSafeScenario.referenceLevel.type})</div>
                  )}
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">Invalidation</div>
                  <div className="text-sm text-red-400 font-semibold">{formatLevel(geInvalidationPrice)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{geSafeScenario?.invalidationLevel.logic}</div>
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">Key Levels</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {geSafeScenario?.reactionZones.map((t: any, i: number) => (
                      <span key={i} className="text-sm font-mono text-emerald-400">
                        {formatLevel(t.price)}{i < geSafeScenario.reactionZones.length - 1 && <span className="text-slate-600 mx-1">›</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Hypothetical R:R {isUsableNumber(geSafeScenario?.hypotheticalRr?.expectedR) ? geSafeScenario.hypotheticalRr.expectedR.toFixed(1) : 'Unavailable'}</div>
                </div>
              </div>

              <RiskFlagPanel title="Research Case Invalidates If" flags={geRiskFlags} />
              <div className="sr-only">
                {geInvalidationConditions.slice(0, 6).map((condition) => (
                    <div key={condition} className="text-red-100/80">{condition}</div>
                  ))}
                </div>

              {/* Driver / Blocker + Research Note */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-[11px] text-slate-500">
                  Driver: <span className="text-white font-semibold">{ge.layer1.primaryDriver}</span>
                </div>
                {ge.layer1.primaryBlocker && (
                  <div className="text-[11px] text-slate-500">
                    Blocker: <span className="text-red-400 font-semibold">{ge.layer1.primaryBlocker}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSaveResearchCase}
                  disabled={savingCase}
                  className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-blue-300 hover:bg-blue-500/20 transition-colors disabled:cursor-wait disabled:opacity-70 ml-auto"
                >
                  {savingCase ? 'Saving...' : 'Save Case'}
                </button>
                <button onClick={() => navigateTo('terminal', sym)} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-slate-400 hover:bg-slate-700/50 transition-colors">
                  Open Terminal
                </button>
              </div>
              {saveCaseMsg && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${saveCaseMsg.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300' : 'border-red-500/30 bg-red-950/30 text-red-300'}`}>
                  {saveCaseMsg.text}
                </div>
              )}
            </div>

            {/* Score Breakdown */}
            {ge.layer1.scoreBreakdown && ge.layer1.scoreBreakdown.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800/50">
                <div className="text-[11px] text-slate-500 mb-2 uppercase">Score Breakdown</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {ge.layer1.scoreBreakdown.map((sb: any) => (
                    <div key={sb.key} className="bg-[var(--msp-panel-2)] rounded-lg p-2">
                      <div className="text-[11px] text-slate-500">{sb.key} (w:{sb.weight})</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{sb.value.toFixed(1)}</span>
                        <ScoreBar value={Math.min(sb.value * 10, 100)} color="#10B981" />
                      </div>
                      {sb.note && <div className="text-[11px] text-slate-600 mt-0.5">{sb.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* -- CROSS-MARKET INFLUENCE (Phase 5 — Dynamic + Static) ------- */}
          <Card>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-emerald-400">Cross-Market Influence</summary>
              <div className="mt-3">

            {/* Dynamic signals from regime API */}
            {regime.data?.signals && regime.data.signals.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] text-slate-500 uppercase mb-2">Live Market Setups</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {regime.data.signals.map((sig: any, i: number) => {
                    const r = sig.regime?.toLowerCase() || '';
                    const isHeadwind = r === 'risk_off' || r === 'compression';
                    const isTailwind = r === 'trend' || r === 'expansion' || r === 'risk_on';
                    const color = isHeadwind ? '#EF4444' : isTailwind ? '#10B981' : '#94A3B8';
                    return (
                      <div key={i} className="bg-[var(--msp-panel-2)] rounded-lg p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{sig.source}</span>
                          {sig.stale && <span className="text-[11px] text-yellow-500">stale</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[11px] font-semibold" style={{ color }}>{sig.regime}</span>
                          <span className="text-[11px] text-slate-600">w:{sig.weight}</span>
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color }}>{isHeadwind ? 'Headwind' : isTailwind ? 'Supportive' : 'Neutral'}</div>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const cm = deriveCrossMarketAlignment(regime.data.signals);
                  return (
                    <div className="mt-2 p-2 rounded-lg border" style={{ borderColor: ALIGNMENT_COLOR[cm.alignment] + '40', backgroundColor: ALIGNMENT_COLOR[cm.alignment] + '10' }}>
                      <span className="text-xs font-bold" style={{ color: ALIGNMENT_COLOR[cm.alignment] }}>
                        Overall: {cm.alignment.charAt(0).toUpperCase() + cm.alignment.slice(1)}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Static known relationships */}
            <div className="text-[11px] text-slate-500 uppercase mb-2">Known Relationships</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {CROSS_MARKET.map(cm => (
                <div key={cm.from} className="bg-[var(--msp-panel-2)] rounded-lg p-2.5 text-center">
                  <div className="text-[11px] text-slate-500">{cm.from}</div>
                  <div className="text-xs text-white font-semibold mt-0.5">{cm.condition}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{cm.effect}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/50 text-[11px] text-slate-500">
              Cross-market factors adjust confluence scores. Headwinds reduce alignment; tailwinds support it.
            </div>
              </div>
            </details>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* -- SETUP & THESIS ------------------------------------ */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Setup</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Setup Type</div>
                  <div className="text-sm text-white font-semibold capitalize">{ge.layer2.setup.setupType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Thesis</div>
                  <div className="text-xs text-slate-300">{ge.layer2.setup.thesis}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Timeframe Alignment</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{ge.layer2.setup.timeframeAlignment.score}/{ge.layer2.setup.timeframeAlignment.max}</span>
                    <ScoreBar value={(ge.layer2.setup.timeframeAlignment.score / ge.layer2.setup.timeframeAlignment.max) * 100} color="#10B981" />
                  </div>
                  {ge.layer2.setup.timeframeAlignment.details.map((d: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-500 mt-0.5">• {d}</div>
                  ))}
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Invalidation</div>
                  <div className="text-xs text-red-400">{ge.layer2.setup.invalidation}</div>
                </div>
              </div>
            </Card>

            {/* -- STRUCTURE ------------------------------------------ */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Structure</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 uppercase">Structure Verdict:</span>
                  <Badge label={ge.layer3.structure.verdict} color={ge.layer3.structure.verdict === 'agree' ? '#10B981' : ge.layer3.structure.verdict === 'disagree' ? '#EF4444' : '#F59E0B'} small />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {['htf', 'mtf', 'ltf'].map((tf) => (
                    <div key={tf} className="bg-[var(--msp-panel-2)] rounded p-2">
                      <div className="text-[11px] text-slate-500 uppercase">{tf}</div>
                      <div className="text-xs text-white">{(ge.layer3.structure.trend as any)[tf]}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase">Key Levels</div>
                  <div className="space-y-1 mt-1">
                    {ge.layer2.setup.keyLevels.map((lv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{lv.label} <span className="text-[11px] text-slate-600">({lv.kind})</span></span>
                        <span className="font-mono text-white">{formatLevel(lv.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Momentum indicators */}
                {ge.layer3.momentum?.indicators && (
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase">Momentum</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ge.layer3.momentum.indicators.map((ind: any, i: number) => (
                        <Badge key={i} label={`${ind.name}: ${ind.value}`} color={ind.state === 'bull' ? '#10B981' : ind.state === 'bear' ? '#EF4444' : '#94A3B8'} small />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* -- TIMING -------------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Timing</h3>
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
                const catColor: Record<string, string> = { intraday: '#94A3B8', daily: '#3B82F6', weekly: '#F59E0B', monthly: '#EF4444' };
                return (
                  <div className="space-y-3">
                    {/* Signal Strength + Direction + Banners */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={tc.verdict} color={tc.verdict === 'agree' ? '#10B981' : tc.verdict === 'disagree' ? '#EF4444' : '#F59E0B'} />
                      <Badge label={tc.signalStrength.replace('_', ' ')} color={
                        tc.signalStrength === 'strong' ? '#10B981' : tc.signalStrength === 'moderate' ? '#F59E0B' : '#94A3B8'
                      } small />
                      <Badge label={tc.direction} color={
                        tc.direction === 'bullish' ? '#10B981' : tc.direction === 'bearish' ? '#EF4444' : '#94A3B8'
                      } small />
                      {tc.banners.map((b: string, i: number) => (
                        <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold">{b}</span>
                      ))}
                    </div>

                    {/* Weighted Decompression Level — PROMINENT */}
                    {tc.decompressionTarget && tc.decompressionTarget.price > 0 && (
                      <div className="rounded-lg p-3 border" style={{
                        background: tc.decompressionTarget.direction === 'up' ? 'rgba(16,185,129,0.08)' : tc.decompressionTarget.direction === 'down' ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.08)',
                        borderColor: tc.decompressionTarget.direction === 'up' ? 'rgba(16,185,129,0.25)' : tc.decompressionTarget.direction === 'down' ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.15)',
                      }}>
                        <div className="text-[11px] text-slate-500 uppercase mb-1">Likely Decompression Level</div>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-lg font-bold font-mono" style={{
                            color: tc.decompressionTarget.direction === 'up' ? '#10B981' : tc.decompressionTarget.direction === 'down' ? '#EF4444' : '#E2E8F0',
                          }}>
                            {tc.decompressionTarget.direction === 'up' ? 'Up to ' : tc.decompressionTarget.direction === 'down' ? 'Down to ' : ''}{fmtPrice(tc.decompressionTarget.price)}
                          </span>
                          <span className="text-[11px] text-slate-400 min-w-0 break-words">
                            weighted from {tc.decompressionTarget.contributingTFs.length} TFs ({tc.decompressionTarget.contributingTFs.join(', ')})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Total weight: {tc.decompressionTarget.totalWeight.toFixed(1)} — Price is pulled {tc.decompressionTarget.direction === 'up' ? 'ABOVE' : tc.decompressionTarget.direction === 'down' ? 'BELOW' : 'near'} current level
                        </div>
                      </div>
                    )}

                    {/* Confluence + Score Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[11px] text-slate-500">Confluence</div>
                        <div className="text-sm font-bold text-white">{tc.confidence}%</div>
                        <ScoreBar value={tc.confidence} color="#10B981" />
                      </div>
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[11px] text-slate-500">Direction</div>
                        <div className="text-sm font-bold" style={{ color: tc.scoreBreakdown.directionScore > 15 ? '#10B981' : tc.scoreBreakdown.directionScore < -15 ? '#EF4444' : '#94A3B8' }}>
                          {tc.scoreBreakdown.directionScore > 0 ? '+' : ''}{tc.scoreBreakdown.directionScore}
                        </div>
                      </div>
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[11px] text-slate-500">Cluster Score</div>
                        <div className="text-sm font-bold text-white">{tc.scoreBreakdown.clusterScore}</div>
                        <ScoreBar value={tc.scoreBreakdown.clusterScore} color="#06B6D4" />
                      </div>
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[11px] text-slate-500">Decompression</div>
                        <div className="text-sm font-bold text-white">{tc.scoreBreakdown.decompressionScore}</div>
                        <ScoreBar value={tc.scoreBreakdown.decompressionScore} color="#8B5CF6" />
                      </div>
                    </div>

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
                                <div className="text-[11px] font-semibold uppercase mb-0.5" style={{ color: catColor[cat] }}>{catLabel[cat]}</div>
                                <div className="space-y-0.5">
                                  {rows.map((row: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded bg-[#0A101C]/40">
                                      <span className="text-slate-300 font-semibold w-10">{row.tf}</span>
                                      <span className="text-slate-500 w-16">{fmtTime(row.nextCloseAt)}</span>
                                      <span className={`w-12 font-mono ${row.minsToClose <= 5 ? 'text-yellow-400 font-bold' : row.minsToClose <= 60 ? 'text-orange-400' : 'text-slate-400'}`}>
                                        {fmtCountdown(row.minsToClose)}
                                      </span>
                                      <span className="text-slate-600 w-8">w:{row.weight}</span>
                                      {row.mid50Level ? (
                                        <>
                                          <span className="font-mono text-white w-24 text-right">{fmtPrice(row.mid50Level)}</span>
                                          <span className={`w-14 text-right ${row.pullDirection === 'up' ? 'text-emerald-400' : row.pullDirection === 'down' ? 'text-red-400' : 'text-slate-500'}`}>
                                            {row.pullDirection === 'up' ? 'Up' : row.pullDirection === 'down' ? 'Down' : 'Flat'} {row.distanceToMid50 != null ? `${row.distanceToMid50 > 0 ? '+' : ''}${row.distanceToMid50.toFixed(2)}%` : ''}
                                          </span>
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
                      <div className="text-[11px] text-slate-500 uppercase mb-1">Candle Close Confluence</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{tc.candleCloseConfluence.confluenceScore}/100</span>
                        <Badge label={tc.candleCloseConfluence.confluenceRating} color={
                          tc.candleCloseConfluence.confluenceRating === 'extreme' ? '#EF4444' :
                          tc.candleCloseConfluence.confluenceRating === 'high' ? '#F59E0B' :
                          tc.candleCloseConfluence.confluenceRating === 'moderate' ? '#3B82F6' : '#94A3B8'
                        } small />
                        {tc.candleCloseConfluence.closingNowCount > 0 && (
                          <span className="text-[11px] text-yellow-400">Now: {tc.candleCloseConfluence.closingNowCount} TFs closing</span>
                        )}
                      </div>
                      {tc.candleCloseConfluence.isMonthEnd && <div className="text-[11px] text-yellow-400 mt-0.5">Month-end confluence</div>}
                      {tc.candleCloseConfluence.isWeekEnd && <div className="text-[11px] text-blue-400 mt-0.5">Week-end confluence</div>}
                    </div>

                    {/* Scenario */}
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-2">
                      <div className="text-[11px] text-slate-500 uppercase mb-1">Scenario</div>
                      <div className="text-xs text-slate-300">{tc.prediction.reasoning}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-slate-500">Key Level: <span className="text-white font-mono">{fmtPrice(tc.prediction.targetLevel)}</span></span>
                        <span className="text-[11px] text-slate-500">Move in: <span className="text-white">{tc.prediction.expectedMoveTime}</span></span>
                      </div>
                    </div>

                    {/* Best Reference Window */}
                    {tc.candleCloseConfluence.bestEntryWindow.reason && (
                      <div className="text-[11px] text-emerald-400">
                        Best window: {tc.candleCloseConfluence.bestEntryWindow.reason}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="text-xs text-slate-500 py-4 text-center">Time confluence data not available</div>
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
                    <Badge label={d.volatility.regime} color={
                      d.volatility.regime === 'compression' ? '#06B6D4' : d.volatility.regime === 'expansion' ? '#F59E0B' : d.volatility.regime === 'climax' ? '#EF4444' : '#94A3B8'
                    } />
                    <span className="text-xs text-slate-400">Confluence: {d.volatility.regimeConfidence.toFixed(0)}%</span>
                  </div>

                  {/* BBWP Gauge + Direction */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--msp-panel-2)] rounded p-2">
                      <div className="text-[11px] text-slate-500 mb-1">BBWP</div>
                      <div className="flex flex-col items-center">
                        {(() => {
                          const bbwp = d.volatility.bbwp;
                          const zones = [
                            { max: 15, color: '#1E3A5F', text: '#60A5FA' },
                            { max: 70, color: '#475569', text: '#94A3B8' },
                            { max: 90, color: '#D97706', text: '#FBBF24' },
                            { max: 100, color: '#DC2626', text: '#F87171' },
                          ];
                          const zone = zones.find(z => bbwp <= z.max) ?? zones[3];
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
                                {(() => {
                                  const a = Math.PI * (1 - bbwp / 100);
                                  const nl = r - sw;
                                  return <line x1={cx} y1={cy} x2={cx - nl * Math.cos(a)} y2={cy - nl * Math.sin(a)} stroke={zone.text} strokeWidth={2} strokeLinecap="round" />;
                                })()}
                                <circle cx={cx} cy={cy} r={3} fill={zone.text} />
                              </svg>
                              <div className="text-sm font-bold -mt-1" style={{ color: zone.text }}>{bbwp.toFixed(1)}</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="bg-[var(--msp-panel-2)] rounded p-2">
                      <div className="text-[11px] text-slate-500">Direction</div>
                      <div className="text-sm font-bold" style={{ color: dirColor(d.direction.bias) }}>{d.direction.bias}</div>
                      <div className="text-[11px] text-slate-500">Score: {d.direction.score.toFixed(1)}</div>
                    </div>
                  </div>
                  {d.signal.active && d.signal.type !== 'none' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                      <div className="text-[11px] text-emerald-400 font-semibold">Active Setup: {d.signal.type.replace(/_/g, ' ')}</div>
                      <div className="text-[11px] text-slate-400">Strength: {d.signal.strength.toFixed(0)}%</div>
                    </div>
                  )}
                  {d.projection.expectedMovePct > 0 && (
                    <div className="text-xs text-slate-400">
                      Expected move: <span className="text-white font-semibold">{d.projection.expectedMovePct.toFixed(1)}%</span>
                      <span className="text-slate-600 ml-1">(hit rate: {d.projection.hitRate.toFixed(0)}%, n={d.projection.sampleSize})</span>
                    </div>
                  )}
                  {d.breakout.score > 40 && (
                    <div className="text-xs"><span className="text-yellow-400">Breakout Score: {d.breakout.score.toFixed(0)}</span> — {d.breakout.label}</div>
                  )}
                  {d.trap.detected && <div className="text-xs text-red-400">Trap detected (score: {d.trap.score.toFixed(0)})</div>}
                  <div className="text-[11px] text-slate-500">{d.summary}</div>
                </div>
              ) : ge.layer3.structure.volatility ? (
                <div className="space-y-2">
                  <Badge label={ge.layer3.structure.volatility.regime || 'unknown'} color="#94A3B8" />
                  {ge.layer3.structure.volatility.bbwp != null && <div className="text-xs text-slate-400">BBWP: {ge.layer3.structure.volatility.bbwp.toFixed(1)}</div>}
                  <div className="text-[11px] text-slate-600">DVE endpoint unavailable — showing Golden Egg volatility data</div>
                </div>
              ) : <div className="text-xs text-slate-500">No volatility data available</div>}
            </Card>

            {/* -- OPTIONS / DERIVATIVES --------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">
                {ge.meta.assetClass === 'crypto' ? 'Derivatives' : 'Options / Derivatives'}
              </h3>
              {ge.layer3.options?.enabled ? (
                <div className="space-y-2">
                  <Badge label={ge.layer3.options.verdict} color={ge.layer3.options.verdict === 'agree' ? '#10B981' : ge.layer3.options.verdict === 'disagree' ? '#EF4444' : '#F59E0B'} />
                  <div className="space-y-1">
                    {ge.layer3.options.highlights.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-400">{h.label}</span>
                        <span className="text-white">{h.value}</span>
                      </div>
                    ))}
                  </div>
                  {ge.layer3.options.notes?.map((n: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-500">• {n}</div>
                  ))}
                  {ge.meta.assetClass !== 'crypto' && (
                    <button
                      onClick={() => navigateTo('terminal', sym)}
                      className="mt-2 text-[11px] text-emerald-400 hover:underline"
                    >
                        Open Options Terminal
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-4 text-center">
                  {ge.meta.assetClass === 'crypto' ? 'Derivatives data not available' : `Options data not available for ${sym}`}
                </div>
              )}
            </Card>
          </div>

          {/* -- SCENARIO MAP --------------------------------- */}
          <Card>
            <h3 className="text-xs font-semibold text-emerald-400 mb-3">Scenario Map</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] text-slate-500 uppercase">Reference Level</div>
                <div className="text-sm text-white">{geSafeScenario?.referenceTrigger}</div>
                {geSafeScenario?.referenceLevel.price && (
                  <div className="text-xs font-mono text-emerald-400">{formatLevel(geSafeScenario.referenceLevel.price)} ({geSafeScenario.referenceLevel.type})</div>
                )}
              </div>
              <div>
                <div className="text-[11px] text-slate-500 uppercase">Risk Level</div>
                <div className="text-sm font-mono text-red-400">{formatLevel(geInvalidationPrice)}</div>
                <div className="text-[11px] text-slate-500">{geSafeScenario?.invalidationLevel.logic}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 uppercase">Key Levels</div>
                {geSafeScenario?.reactionZones.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 font-mono">{formatLevel(t.price)}</span>
                    {t.rMultiple && <span className="text-slate-500">{t.rMultiple.toFixed(1)}R</span>}
                    {t.note && <span className="text-slate-600">{t.note}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800/50">
              <div>
                <span className="text-[11px] text-slate-500">Hypothetical R:R</span>
                <span className="text-sm font-bold text-white ml-2">{isUsableNumber(geSafeScenario?.hypotheticalRr?.expectedR) ? `${geSafeScenario.hypotheticalRr.expectedR.toFixed(1)}R` : 'Unavailable'}</span>
              </div>
              <button onClick={() => navigateTo('terminal', sym)} className="px-4 py-2 bg-slate-700/50 text-slate-400 rounded-lg text-xs hover:bg-slate-700/70 transition-colors">
                Open in Terminal
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-600">Levels are calculated from technical indicators for educational and informational purposes only. This does not constitute financial advice, does not recommend any course of action, and does not consider your personal circumstances. Past performance does not guarantee future results.</div>
          </Card>

          {/* -- NARRATIVE -------------------------------------------- */}
          {ge.layer3.narrative?.enabled && (
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">Narrative</h3>
              <div className="text-sm text-slate-300 mb-3">{ge.layer3.narrative.summary}</div>
              <ul className="space-y-1">
                {ge.layer3.narrative.bullets.map((b: any, i: number) => (
                  <li key={i} className="text-xs text-slate-400">• {b}</li>
                ))}
              </ul>
              {ge.layer3.narrative.risks.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-800/50">
                  <div className="text-[11px] text-red-400 uppercase mb-1">Risks</div>
                  {ge.layer3.narrative.risks.map((r: any, i: number) => (
                    <div key={i} className="text-xs text-red-400/80">{r}</div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
        </UpgradeGate>
      )}
      </>}
    </div>
  );
}
