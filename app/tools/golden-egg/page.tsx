'use client';

/* ---------------------------------------------------------------------------
   SURFACE 3: GOLDEN EGG — Deep Analysis Page
   Real API data: /api/golden-egg + /api/dve + /api/quote
   --------------------------------------------------------------------------- */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useGoldenEgg, useDVE, useQuote, useRegime, type ScanTimeframe, SCAN_TIMEFRAMES } from '@/app/v2/_lib/api';
import { Card, SectionHeader, Badge, ScoreBar, UpgradeGate } from '@/app/v2/_components/ui';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { REGIME_COLORS, VERDICT_COLORS, CROSS_MARKET, LIFECYCLE_COLORS, REGIME_WEIGHTS } from '@/app/v2/_lib/constants';
import type { RegimePriority, Verdict, LifecycleState } from '@/app/v2/_lib/types';
import { useCachedTopSymbols } from '@/hooks/useCachedTopSymbols';
import { useRegisterPageData } from '@/lib/ai/pageContext';

/* ─── Dynamic imports: v1 deep-dive components ─── */
const DeepAnalysis = dynamic(() => import('@/app/tools/deep-analysis/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Deep Analysis…</div> });
const IntradayCharts = dynamic(() => import('@/app/tools/intraday-charts/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Charts…</div> });
const CompanyOverview = dynamic(() => import('@/app/tools/company-overview/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Fundamentals…</div> });
const LiquiditySweep = dynamic(() => import('@/app/tools/liquidity-sweep/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Liquidity Sweep…</div> });

const GE_TABS = ['Verdict', 'Chart', 'Deep Analysis', 'Fundamentals', 'Liquidity'] as const;
type GETab = typeof GE_TABS[number];

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
function deriveGELifecycle(permission?: string, confidence?: number, gated?: boolean): LifecycleState {
  if (gated) return 'INVALIDATED';
  const conf = confidence ?? 0;
  const perm = (permission || '').toUpperCase();
  if (perm === 'YES' && conf >= 65) return 'READY';
  if (perm === 'YES' && conf >= 40) return 'SETTING_UP';
  if (perm === 'WAIT' || perm === 'WATCH') return 'WATCHING';
  if (perm === 'NO') return 'INVALIDATED';
  return 'DISCOVERED';
}
import { useUserTier } from '@/lib/useUserTier';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

function verdictColor(v: string) {
  if (v === 'TRADE' || v === 'YES') return '#10B981';
  if (v === 'NO_TRADE' || v === 'NO') return '#EF4444';
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

export default function GoldenEggPage() {
  const { selectedSymbol, selectSymbol, navigateTo } = useV2();
  const { tier } = useUserTier();
  const [symbolInput, setSymbolInput] = useState('');
  const [timeframe, setTimeframe] = useState<ScanTimeframe>('daily');
  const [activeTab, setActiveTab] = useState<GETab>('Verdict');

  // Quick-pick symbols from worker cache (falls back to defaults if cache empty)
  const cached = useCachedTopSymbols(5);
  const FALLBACK_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META'];
  const quickSymbols = useMemo(() => {
    const syms = [...cached.crypto.map(c => c.symbol), ...cached.equity.map(c => c.symbol)];
    return syms.length > 0 ? syms.slice(0, 10) : FALLBACK_SYMBOLS;
  }, [cached.crypto, cached.equity]);

  const sym = selectedSymbol || 'AAPL';

  // Ensure V2Context always reflects the resolved symbol so embedded tabs sync
  useEffect(() => {
    if (sym && !selectedSymbol) selectSymbol(sym);
  }, [sym, selectedSymbol, selectSymbol]);

  // Core data
  const goldenEgg = useGoldenEgg(sym, timeframe);
  const dve = useDVE(sym, timeframe);
  const quote = useQuote(sym);
  const regime = useRegime();

  const ge = goldenEgg.data?.data;
  const d = dve.data?.data;
  const loading = goldenEgg.loading;

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
    permission: ge?.permission,
    direction: ge?.direction,
    verdict: ge?.verdict,
    confidence: ge?.confidence,
    confluenceScore: ge?.confluenceScore,
    regime: ge?.regime,
    price: quote.data?.price,
    rsi: ge?.indicators?.rsi,
    adx: ge?.indicators?.adx,
    atr: ge?.indicators?.atr,
    macdHist: ge?.indicators?.macd_hist,
    bbwp: d?.bbwp,
    dveDirection: d?.direction,
    breakoutReadiness: d?.breakoutReadiness,
    trapRisk: ge?.volTrapRisk,
    doctrine: ge?.doctrine,
    setupThesis: ge?.setupThesis,
    entryZone: ge?.execution?.entryZone,
    stopLoss: ge?.execution?.stopLoss,
    targets: ge?.execution?.targets,
    riskReward: ge?.execution?.riskReward,
    optionsData: ge?.options,
    mpeData: ge?.mpe,
    timeConfluence: ge?.timeConfluence,
  }), [sym, timeframe, ge, d, quote.data]);

  const geAiSummary = useMemo(() => {
    if (!ge) return `Golden Egg: Loading ${sym}...`;
    return `${sym} — Status: ${ge.permission}, Direction: ${ge.direction}, Confluence: ${ge.confidence}%, Regime: ${ge.regime}, Doctrine: ${ge.doctrine || 'N/A'}`;
  }, [sym, ge]);

  useRegisterPageData('scanner', geAiData, [sym], geAiSummary);

  return (
    <div className="space-y-6">
      <SectionHeader title="Golden Egg" subtitle="Deep analysis page — full symbol intelligence" />

      {/* Symbol picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleSymbolSubmit()}
            placeholder="Enter symbol..."
            className="px-3 py-1.5 bg-[var(--msp-panel-2)] border border-[var(--msp-border)] rounded-lg text-sm text-white placeholder-slate-600 w-32 focus:border-emerald-500 focus:outline-none"
          />
          <button onClick={handleSymbolSubmit} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors">Go</button>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {quickSymbols.map((s: string) => (
            <button
              key={s}
              onClick={() => selectSymbol(s)}
              className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-colors ${
                s === sym ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Timeframe selector */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500 mr-1 uppercase">Timeframe</span>
        {SCAN_TIMEFRAMES.map(tf => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value)}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${timeframe === tf.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-[var(--msp-border)]'}`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* ─── Tab Bar ─── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800/50 pb-1">
        {GE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-[11px] rounded-t-md whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 border-b-0'
                : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ─── Deep-dive Tabs (v1 components) ─── */}
      {activeTab === 'Chart' && (
        <Card><IntradayCharts symbol={sym} /></Card>
      )}
      {activeTab === 'Deep Analysis' && (
        <Card><DeepAnalysis symbol={sym} /></Card>
      )}
      {activeTab === 'Fundamentals' && (
        <Card><CompanyOverview symbol={sym} /></Card>
      )}
      {activeTab === 'Liquidity' && (
        <Card><LiquiditySweep /></Card>
      )}

      {/* ─── Verdict Tab (main GE analysis) ─── */}
      {activeTab === 'Verdict' && <>
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

      {/* Auth error state */}
      {goldenEgg.isAuthError && !loading && (
        <Card>
          <div className="py-8 text-center">
            <div className="text-amber-400 text-sm mb-2">Sign in required</div>
            <div className="text-[10px] text-slate-500 mb-4">Please sign in to access Golden Egg analysis</div>
            <a href="/auth/login" className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 inline-block">Sign In</a>
          </div>
        </Card>
      )}

      {/* Error state */}
      {goldenEgg.error && !loading && (
        <Card>
          <div className="py-8 text-center">
            <div className="text-red-400 text-sm mb-2">Failed to load Golden Egg for {sym}</div>
            <div className="text-[10px] text-slate-500 mb-4">{goldenEgg.error}</div>
            <button onClick={() => goldenEgg.refetch()} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30">Retry</button>
          </div>
        </Card>
      )}

      {/* Main content */}
      {ge && !loading && (
        <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Golden Egg Deep Analysis">
        <>
          <ComplianceDisclaimer />
          {/* -- VERDICT HEADER (Section 0 — Answer First) ------------ */}
          <Card className="border-l-4" style={{ borderLeftColor: VERDICT_COLORS[(ge.layer1.permission === 'YES' ? 'TRADE' : ge.layer1.permission === 'NO' ? 'NO_TRADE' : 'WATCH') as Verdict] || '#F59E0B' }}>
            <div className="flex flex-col gap-4">
              {/* Top row: Symbol + Regime + Bias + Verdict */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-2xl font-bold text-white">{ge.meta.symbol}</h2>
                    {regime.data && <Badge label={`Regime: ${regime.data.regime}`} color={REGIME_COLORS[regime.data.regime?.toLowerCase() as RegimePriority] || '#64748B'} small />}
                    <Badge label={ge.layer1.direction} color={dirColor(ge.layer1.direction)} />
                    <Badge label={`Grade ${ge.layer1.grade}`} color={gradeColor(ge.layer1.grade)} small />
                    {(() => { const lc = deriveGELifecycle(ge.layer1.permission, ge.layer1.confidence); return <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold" style={{ color: LIFECYCLE_COLORS[lc], borderColor: LIFECYCLE_COLORS[lc] + '40', backgroundColor: LIFECYCLE_COLORS[lc] + '15' }}>{lc.replace('_', ' ')}</span>; })()}
                    {(() => { const cm = deriveCrossMarketAlignment(regime.data?.signals); return <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold" style={{ color: ALIGNMENT_COLOR[cm.alignment], borderColor: ALIGNMENT_COLOR[cm.alignment] + '40', backgroundColor: ALIGNMENT_COLOR[cm.alignment] + '15' }}>{cm.alignment === 'headwind' ? '⚠ Headwind' : cm.alignment === 'supportive' ? '✓ Tailwind' : '— Neutral'}</span>; })()}
                  </div>
                  <div className="text-lg font-bold text-white">
                    ${ge.meta.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <div className="text-3xl font-bold uppercase tracking-wider" style={{ color: verdictColor(ge.layer1.permission) }}>
                      {ge.layer1.permission === 'YES' ? 'ALIGNED' : ge.layer1.permission === 'NO' ? 'NOT ALIGNED' : 'WATCH'}
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase">Assessment</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold" style={{ color: verdictColor(ge.layer1.permission) }}>{ge.layer1.confidence}%</div>
                    <div className="text-[10px] text-slate-500 uppercase">Confluence</div>
                  </div>
                </div>
              </div>

              {/* Level of Interest / Invalidation / Key Levels row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/50">
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Level of Interest</div>
                  <div className="text-sm text-emerald-400 font-semibold">{ge.layer2.execution.entryTrigger}</div>
                  {ge.layer2.execution.entry.price && (
                    <div className="text-xs font-mono text-white mt-0.5">${ge.layer2.execution.entry.price.toFixed(2)} ({ge.layer2.execution.entry.type})</div>
                  )}
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Invalidation</div>
                  <div className="text-sm text-red-400 font-semibold">${ge.layer2.execution.stop.price.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{ge.layer2.execution.stop.logic}</div>
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Key Levels</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ge.layer2.execution.targets.map((t: any, i: number) => (
                      <span key={i} className="text-sm font-mono text-emerald-400">
                        ${t.price.toFixed(2)}{i < ge.layer2.execution.targets.length - 1 && <span className="text-slate-600 mx-1">›</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">R:R {ge.layer2.execution.rr.expectedR.toFixed(1)}</div>
                </div>
              </div>

              {/* Driver / Blocker + Create Trade Plan */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-[10px] text-slate-500">
                  Driver: <span className="text-white font-semibold">{ge.layer1.primaryDriver}</span>
                </div>
                {ge.layer1.primaryBlocker && (
                  <div className="text-[10px] text-slate-500">
                    Blocker: <span className="text-red-400 font-semibold">{ge.layer1.primaryBlocker}</span>
                  </div>
                )}
                <a
                  href={`/tools/journal?prefill=true&symbol=${encodeURIComponent(sym)}&side=${ge.layer1.direction === 'bullish' ? 'LONG' : ge.layer1.direction === 'bearish' ? 'SHORT' : 'LONG'}&entryPrice=${ge.layer2.execution.entry.price?.toFixed(2) || ''}&strategy=Golden+Egg&setup=${encodeURIComponent(`${sym} ${ge.layer1.direction} — Grade ${ge.layer1.grade}, ${ge.layer1.confidence}% confluence`)}&notes=${encodeURIComponent(`Golden Egg analysis notes\nLevel of Interest: $${ge.layer2.execution.entry.price?.toFixed(2) || 'N/A'} (${ge.layer2.execution.entry.type})\nInvalidation: $${ge.layer2.execution.stop.price.toFixed(2)} — ${ge.layer2.execution.stop.logic}\nKey Levels: ${ge.layer2.execution.targets.map((t: any) => '$' + t.price.toFixed(2)).join(' › ')}\nR:R ${ge.layer2.execution.rr.expectedR.toFixed(1)} | Setup: ${ge.layer2.setup.setupType.replace(/_/g, ' ')}\nThesis: ${ge.layer2.setup.thesis}`)}`}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-emerald-400 no-underline hover:bg-emerald-500/20 transition-colors ml-auto"
                >
                  Log to Journal
                </a>
              </div>
            </div>

            {/* Score Breakdown */}
            {ge.layer1.scoreBreakdown && ge.layer1.scoreBreakdown.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800/50">
                <div className="text-[10px] text-slate-500 mb-2 uppercase">Score Breakdown</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {ge.layer1.scoreBreakdown.map((sb: any) => (
                    <div key={sb.key} className="bg-[var(--msp-panel-2)] rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">{sb.key} (w:{sb.weight})</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{sb.value.toFixed(1)}</span>
                        <ScoreBar value={Math.min(sb.value * 10, 100)} color="#10B981" />
                      </div>
                      {sb.note && <div className="text-[10px] text-slate-600 mt-0.5">{sb.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* -- CROSS-MARKET INFLUENCE (Phase 5 — Dynamic + Static) ------- */}
          <Card>
            <h3 className="text-xs font-semibold text-emerald-400 mb-3">Cross-Market Influence</h3>

            {/* Dynamic signals from regime API */}
            {regime.data?.signals && regime.data.signals.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] text-slate-500 uppercase mb-2">Live Market Setups</div>
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
                          {sig.stale && <span className="text-[9px] text-yellow-500">stale</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] font-semibold" style={{ color }}>{sig.regime}</span>
                          <span className="text-[9px] text-slate-600">w:{sig.weight}</span>
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color }}>{isHeadwind ? 'Headwind' : isTailwind ? 'Supportive' : 'Neutral'}</div>
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
            <div className="text-[10px] text-slate-500 uppercase mb-2">Known Relationships</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {CROSS_MARKET.map(cm => (
                <div key={cm.from} className="bg-[var(--msp-panel-2)] rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500">{cm.from}</div>
                  <div className="text-xs text-white font-semibold mt-0.5">{cm.condition}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{cm.effect}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/50 text-[10px] text-slate-500">
              Cross-market factors adjust confluence scores. Headwinds reduce alignment; tailwinds support it.
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* -- A: SETUP & THESIS ------------------------------------ */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">A — Setup & Market Context</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Setup Type</div>
                  <div className="text-sm text-white font-semibold capitalize">{ge.layer2.setup.setupType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Thesis</div>
                  <div className="text-xs text-slate-300">{ge.layer2.setup.thesis}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Timeframe Alignment</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{ge.layer2.setup.timeframeAlignment.score}/{ge.layer2.setup.timeframeAlignment.max}</span>
                    <ScoreBar value={(ge.layer2.setup.timeframeAlignment.score / ge.layer2.setup.timeframeAlignment.max) * 100} color="#10B981" />
                  </div>
                  {ge.layer2.setup.timeframeAlignment.details.map((d: any, i: number) => (
                    <div key={i} className="text-[10px] text-slate-500 mt-0.5">• {d}</div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Invalidation</div>
                  <div className="text-xs text-red-400">{ge.layer2.setup.invalidation}</div>
                </div>
              </div>
            </Card>

            {/* -- B: STRUCTURE ------------------------------------------ */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">B — Structure Analysis</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 uppercase">Structure Verdict:</span>
                  <Badge label={ge.layer3.structure.verdict} color={ge.layer3.structure.verdict === 'agree' ? '#10B981' : ge.layer3.structure.verdict === 'disagree' ? '#EF4444' : '#F59E0B'} small />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {['htf', 'mtf', 'ltf'].map((tf) => (
                    <div key={tf} className="bg-[var(--msp-panel-2)] rounded p-2">
                      <div className="text-[10px] text-slate-500 uppercase">{tf}</div>
                      <div className="text-xs text-white">{(ge.layer3.structure.trend as any)[tf]}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Key Levels</div>
                  <div className="space-y-1 mt-1">
                    {ge.layer2.setup.keyLevels.map((lv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{lv.label} <span className="text-[10px] text-slate-600">({lv.kind})</span></span>
                        <span className="font-mono text-white">${lv.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Momentum indicators */}
                {ge.layer3.momentum?.indicators && (
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Momentum</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ge.layer3.momentum.indicators.map((ind: any, i: number) => (
                        <Badge key={i} label={`${ind.name}: ${ind.value}`} color={ind.state === 'bull' ? '#10B981' : ind.state === 'bear' ? '#EF4444' : '#94A3B8'} small />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* -- C: TIME CONFLUENCE -------------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">C — Timing (Time Confluence)</h3>
              {ge.layer3.timeConfluence?.enabled ? (() => {
                const tc = ge.layer3.timeConfluence;
                const fmtPrice = (v: number) => v >= 1 ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${v.toPrecision(4)}`;
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
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold">{b}</span>
                      ))}
                    </div>

                    {/* Weighted Decompression Level — PROMINENT */}
                    {tc.decompressionTarget && tc.decompressionTarget.price > 0 && (
                      <div className="rounded-lg p-3 border" style={{
                        background: tc.decompressionTarget.direction === 'up' ? 'rgba(16,185,129,0.08)' : tc.decompressionTarget.direction === 'down' ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.08)',
                        borderColor: tc.decompressionTarget.direction === 'up' ? 'rgba(16,185,129,0.25)' : tc.decompressionTarget.direction === 'down' ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.15)',
                      }}>
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Likely Decompression Level</div>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-lg font-bold font-mono" style={{
                            color: tc.decompressionTarget.direction === 'up' ? '#10B981' : tc.decompressionTarget.direction === 'down' ? '#EF4444' : '#E2E8F0',
                          }}>
                            {tc.decompressionTarget.direction === 'up' ? '? ' : tc.decompressionTarget.direction === 'down' ? '? ' : ''}{fmtPrice(tc.decompressionTarget.price)}
                          </span>
                          <span className="text-[10px] text-slate-400 min-w-0 break-words">
                            weighted from {tc.decompressionTarget.contributingTFs.length} TFs ({tc.decompressionTarget.contributingTFs.join(', ')})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Total weight: {tc.decompressionTarget.totalWeight.toFixed(1)} — Price is pulled {tc.decompressionTarget.direction === 'up' ? 'ABOVE' : tc.decompressionTarget.direction === 'down' ? 'BELOW' : 'near'} current level
                        </div>
                      </div>
                    )}

                    {/* Confluence + Score Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[10px] text-slate-500">Confluence</div>
                        <div className="text-sm font-bold text-white">{tc.confidence}%</div>
                        <ScoreBar value={tc.confidence} color="#10B981" />
                      </div>
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[10px] text-slate-500">Direction</div>
                        <div className="text-sm font-bold" style={{ color: tc.scoreBreakdown.directionScore > 15 ? '#10B981' : tc.scoreBreakdown.directionScore < -15 ? '#EF4444' : '#94A3B8' }}>
                          {tc.scoreBreakdown.directionScore > 0 ? '+' : ''}{tc.scoreBreakdown.directionScore}
                        </div>
                      </div>
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[10px] text-slate-500">Cluster Score</div>
                        <div className="text-sm font-bold text-white">{tc.scoreBreakdown.clusterScore}</div>
                        <ScoreBar value={tc.scoreBreakdown.clusterScore} color="#06B6D4" />
                      </div>
                      <div className="bg-[var(--msp-panel-2)] rounded p-2">
                        <div className="text-[10px] text-slate-500">Decompression</div>
                        <div className="text-sm font-bold text-white">{tc.scoreBreakdown.decompressionScore}</div>
                        <ScoreBar value={tc.scoreBreakdown.decompressionScore} color="#8B5CF6" />
                      </div>
                    </div>

                    {/* Close Schedule Timeline — grouped by category */}
                    {tc.closeSchedule && tc.closeSchedule.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase mb-1.5">Close Cluster Timeline — Next 24h</div>
                        <div className="overflow-x-auto">
                        <div className="space-y-2" style={{ minWidth: 340 }}>
                          {(['monthly', 'weekly', 'daily', 'intraday'] as const).map(cat => {
                            const rows = groups[cat];
                            if (!rows || rows.length === 0) return null;
                            return (
                              <div key={cat}>
                                <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ color: catColor[cat] }}>{catLabel[cat]}</div>
                                <div className="space-y-0.5">
                                  {rows.map((row: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] py-0.5 px-1.5 rounded bg-[#0A101C]/40">
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
                                            {row.pullDirection === 'up' ? '?' : row.pullDirection === 'down' ? '?' : '—'} {row.distanceToMid50 != null ? `${row.distanceToMid50 > 0 ? '+' : ''}${row.distanceToMid50.toFixed(2)}%` : ''}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-slate-600 text-[10px]">— no mid-50</span>
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
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Candle Close Confluence</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{tc.candleCloseConfluence.confluenceScore}/100</span>
                        <Badge label={tc.candleCloseConfluence.confluenceRating} color={
                          tc.candleCloseConfluence.confluenceRating === 'extreme' ? '#EF4444' :
                          tc.candleCloseConfluence.confluenceRating === 'high' ? '#F59E0B' :
                          tc.candleCloseConfluence.confluenceRating === 'moderate' ? '#3B82F6' : '#94A3B8'
                        } small />
                        {tc.candleCloseConfluence.closingNowCount > 0 && (
                          <span className="text-[10px] text-yellow-400">{'\u25CF'} {tc.candleCloseConfluence.closingNowCount} TFs closing NOW</span>
                        )}
                      </div>
                      {tc.candleCloseConfluence.isMonthEnd && <div className="text-[10px] text-yellow-400 mt-0.5">{'\uD83D\uDCC5'} Month-end confluence</div>}
                      {tc.candleCloseConfluence.isWeekEnd && <div className="text-[10px] text-blue-400 mt-0.5">{'\uD83D\uDCC5'} Week-end confluence</div>}
                    </div>

                    {/* Scenario */}
                    <div className="bg-[var(--msp-panel-2)] rounded-lg p-2">
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Scenario</div>
                      <div className="text-xs text-slate-300">{tc.prediction.reasoning}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-500">Key Level: <span className="text-white font-mono">{fmtPrice(tc.prediction.targetLevel)}</span></span>
                        <span className="text-[10px] text-slate-500">Move in: <span className="text-white">{tc.prediction.expectedMoveTime}</span></span>
                      </div>
                    </div>

                    {/* Best Reference Window */}
                    {tc.candleCloseConfluence.bestEntryWindow.reason && (
                      <div className="text-[10px] text-emerald-400">
                        {'\u23F1'} Best window: {tc.candleCloseConfluence.bestEntryWindow.reason}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="text-xs text-slate-500 py-4 text-center">Time confluence data not available</div>
              )}
            </Card>

            {/* -- D: VOLATILITY (DVE) ---------------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">D — Volatility (DVE)</h3>
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
                      <div className="text-[10px] text-slate-500 mb-1">BBWP</div>
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
                      <div className="text-[10px] text-slate-500">Direction</div>
                      <div className="text-sm font-bold" style={{ color: dirColor(d.direction.bias) }}>{d.direction.bias}</div>
                      <div className="text-[10px] text-slate-500">Score: {d.direction.score.toFixed(1)}</div>
                    </div>
                  </div>
                  {d.signal.active && d.signal.type !== 'none' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                      <div className="text-[10px] text-emerald-400 font-semibold">Active Setup: {d.signal.type.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-slate-400">Strength: {d.signal.strength.toFixed(0)}%</div>
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
                  {d.trap.detected && <div className="text-xs text-red-400">? Trap Detected (score: {d.trap.score.toFixed(0)})</div>}
                  <div className="text-[10px] text-slate-500">{d.summary}</div>
                </div>
              ) : ge.layer3.structure.volatility ? (
                <div className="space-y-2">
                  <Badge label={ge.layer3.structure.volatility.regime || 'unknown'} color="#94A3B8" />
                  {ge.layer3.structure.volatility.bbwp != null && <div className="text-xs text-slate-400">BBWP: {ge.layer3.structure.volatility.bbwp.toFixed(1)}</div>}
                  <div className="text-[10px] text-slate-600">DVE endpoint unavailable — showing Golden Egg volatility data</div>
                </div>
              ) : <div className="text-xs text-slate-500">No volatility data available</div>}
            </Card>

            {/* -- E: OPTIONS / DERIVATIVES --------------------------- */}
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">
                {ge.meta.assetClass === 'crypto' ? 'E — Derivatives' : 'E — Options / Derivatives'}
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
                    <div key={i} className="text-[10px] text-slate-500">• {n}</div>
                  ))}
                  {ge.meta.assetClass !== 'crypto' && (
                    <button
                      onClick={() => navigateTo('terminal', sym)}
                      className="mt-2 text-[10px] text-emerald-400 hover:underline"
                    >
                      Open Options Terminal ?
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

          {/* -- F: MARKET STRUCTURE MAP --------------------------------- */}
          <Card>
            <h3 className="text-xs font-semibold text-emerald-400 mb-3">F — Market Structure Map</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Reference Level</div>
                <div className="text-sm text-white">{ge.layer2.execution.entryTrigger}</div>
                {ge.layer2.execution.entry.price && (
                  <div className="text-xs font-mono text-emerald-400">${ge.layer2.execution.entry.price.toFixed(2)} ({ge.layer2.execution.entry.type})</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Risk Level</div>
                <div className="text-sm font-mono text-red-400">${ge.layer2.execution.stop.price.toFixed(2)}</div>
                <div className="text-[10px] text-slate-500">{ge.layer2.execution.stop.logic}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Key Levels</div>
                {ge.layer2.execution.targets.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 font-mono">${t.price.toFixed(2)}</span>
                    {t.rMultiple && <span className="text-slate-500">{t.rMultiple.toFixed(1)}R</span>}
                    {t.note && <span className="text-slate-600">{t.note}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800/50">
              <div>
                <span className="text-[10px] text-slate-500">Calculated R:R</span>
                <span className="text-sm font-bold text-white ml-2">{ge.layer2.execution.rr.expectedR.toFixed(1)}R</span>
              </div>
              <a
                href={`/tools/journal?prefill=true&symbol=${encodeURIComponent(sym)}&side=${ge.layer1.direction === 'bullish' ? 'LONG' : ge.layer1.direction === 'bearish' ? 'SHORT' : 'LONG'}&entryPrice=${ge.layer2.execution.entry.price?.toFixed(2) || ''}&strategy=Golden+Egg&setup=${encodeURIComponent(`${sym} ${ge.layer1.direction} — Grade ${ge.layer1.grade}, ${ge.layer1.confidence}% confluence`)}&notes=${encodeURIComponent(`Golden Egg analysis notes\nLevel of Interest: $${ge.layer2.execution.entry.price?.toFixed(2) || 'N/A'} (${ge.layer2.execution.entry.type})\nInvalidation: $${ge.layer2.execution.stop.price.toFixed(2)} — ${ge.layer2.execution.stop.logic}\nKey Levels: ${ge.layer2.execution.targets.map((t: any) => '$' + t.price.toFixed(2)).join(' › ')}\nR:R ${ge.layer2.execution.rr.expectedR.toFixed(1)}`)}`}
                className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors no-underline"
              >
                Log to Journal
              </a>
              <button onClick={() => navigateTo('terminal', sym)} className="px-4 py-2 bg-slate-700/50 text-slate-400 rounded-lg text-xs hover:bg-slate-700/70 transition-colors">
                Open in Terminal
              </button>
            </div>
            <div className="mt-2 text-[10px] text-slate-600">Levels are calculated from technical indicators for educational and informational purposes only. This does not constitute financial advice, does not recommend any course of action, and does not consider your personal circumstances. Past performance does not guarantee future results.</div>
          </Card>

          {/* -- G: NARRATIVE -------------------------------------------- */}
          {ge.layer3.narrative?.enabled && (
            <Card>
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">G — AI Narrative</h3>
              <div className="text-sm text-slate-300 mb-3">{ge.layer3.narrative.summary}</div>
              <ul className="space-y-1">
                {ge.layer3.narrative.bullets.map((b: any, i: number) => (
                  <li key={i} className="text-xs text-slate-400">• {b}</li>
                ))}
              </ul>
              {ge.layer3.narrative.risks.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-800/50">
                  <div className="text-[10px] text-red-400 uppercase mb-1">Risks</div>
                  {ge.layer3.narrative.risks.map((r: any, i: number) => (
                    <div key={i} className="text-xs text-red-400/80">? {r}</div>
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
