'use client';

/* ---------------------------------------------------------------------------
   SURFACE 1: DASHBOARD — Command Center
   Real API data from v1 endpoints.
   --------------------------------------------------------------------------- */

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useRegime, useScannerResults, useMarketMovers, useNews, useEconomicCalendar, type ScanResult, type Mover, type NewsArticle, type EconomicEvent } from '@/app/v2/_lib/api';
import { REGIME_COLORS, CROSS_MARKET } from '@/app/v2/_lib/constants';
import { Card, SectionHeader, ScoreBar, Badge, ImpactDot, AuthPrompt, UpgradeGate } from '@/app/v2/_components/ui';
import { useUserTier } from '@/lib/useUserTier';

/* ─── Dynamic imports: v1 deep-dive components ─── */
const CryptoDashboard = dynamic(() => import('@/app/tools/crypto-dashboard/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto Derivatives…</div> });
const MacroDashboard = dynamic(() => import('@/app/tools/macro/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Macro Dashboard…</div> });

const DASH_TABS = ['Command Center', 'Crypto Derivatives', 'Macro'] as const;
type DashTab = typeof DASH_TABS[number];

/* -- helpers -------------------------------------------------------------- */
function directionColor(d?: string) {
  if (d === 'bullish') return '#10B981';
  if (d === 'bearish') return '#EF4444';
  return '#F59E0B';
}
function pctColor(v: number) {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-slate-400';
}
function parseChangePct(raw: string) {
  return parseFloat((raw || '0').replace('%', ''));
}

/* -- Loading skeleton ----------------------------------------------------- */
function Skeleton({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}
function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <Skeleton h="h-4" w="w-32" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} h="h-6" />
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { navigateTo, selectSymbol } = useV2();
  const [dashTab, setDashTab] = useState<DashTab>('Command Center');
  const { tier } = useUserTier();
  const isPro = tier === 'pro' || tier === 'pro_trader';

  /* -- Real API calls --------------------------------------------------- */
  const regime = useRegime();
  const equityScan = useScannerResults('equity');
  const cryptoScan = useScannerResults('crypto');
  const movers = useMarketMovers();
  const news = useNews();
  const calendar = useEconomicCalendar();

  /* -- Derived data ----------------------------------------------------- */
  const allResults = useMemo(() => {
    const eq = equityScan.data?.results || [];
    const cr = cryptoScan.data?.results || [];
    return [...eq, ...cr].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [equityScan.data, cryptoScan.data]);

  const topSetups = allResults.slice(0, 6);
  const highImpactEvents = useMemo(
    () => (calendar.data?.events || []).filter((e: EconomicEvent) => e.impact === 'high').slice(0, 5),
    [calendar.data]
  );
  const allGainers = movers.data?.topGainers || [];
  const allLosers = movers.data?.topLosers || [];
  const eqGainers = allGainers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 5);
  const eqLosers = allLosers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 5);
  const crGainers = allGainers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 5);
  const crLosers = allLosers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 5);
  const articles = (news.data?.articles || []).slice(0, 6);

  const scanLoading = equityScan.loading || cryptoScan.loading;

  // Show sign-in prompt if all data hooks report auth errors
  const allAuthError = equityScan.isAuthError && movers.isAuthError && news.isAuthError;
  if (allAuthError) {
    return <Card><AuthPrompt /></Card>;
  }

  return (
    <div className="space-y-6">
      {/* -- Regime Banner ---------------------------------------------- */}
      {regime.data && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--msp-panel-2)] border border-[var(--msp-border)] flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Market Regime</span>
          <Badge
            label={regime.data.regime.replace(/_/g, ' ')}
            color={
              regime.data.regime.includes('UP') ? '#10B981'
              : regime.data.regime.includes('DOWN') || regime.data.regime.includes('STRESS') ? '#EF4444'
              : regime.data.regime.includes('EXPANSION') ? '#F59E0B'
              : '#6366F1'
            }
          />
          <Badge label={`Risk: ${regime.data.riskLevel}`} color={regime.data.riskLevel === 'low' ? '#10B981' : regime.data.riskLevel === 'moderate' ? '#F59E0B' : '#EF4444'} small />
          <Badge label={`Sizing: ${regime.data.sizing}`} color="#94A3B8" small />
        </div>
      )}

      <SectionHeader title="Command Center" subtitle="What matters today — live data" />

      {/* ─── Tab Bar ─── */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-800/50 pb-1">
        {DASH_TABS.map(t => (
          <button
            key={t}
            onClick={() => setDashTab(t)}
            className={`px-3 py-1.5 text-[11px] rounded-t-md whitespace-nowrap transition-colors ${
              dashTab === t
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 border-b-0'
                : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Crypto Derivatives Tab ─── */}
      {dashTab === 'Crypto Derivatives' && <UpgradeGate requiredTier="pro" currentTier={tier} feature="Crypto Derivatives"><CryptoDashboard /></UpgradeGate>}

      {/* ─── Macro Tab ─── */}
      {dashTab === 'Macro' && (!isPro ? (
        <div>
          <div className="text-xs text-center text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2 mb-3">
            🔒 <span className="text-emerald-400 font-semibold">Upgrade to Pro</span> to interact with the Macro Dashboard
          </div>
          <div className="pointer-events-none select-none"><MacroDashboard /></div>
        </div>
      ) : <MacroDashboard />)}

      {/* ─── Command Center Tab (default) ─── */}
      {dashTab === 'Command Center' && <>
      {!isPro && (
        <div className="text-xs text-center text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2">
          🔒 <span className="text-emerald-400 font-semibold">Upgrade to Pro</span> to interact with the Command Center
        </div>
      )}
      <div className={!isPro ? 'pointer-events-none select-none' : undefined}>

      {/* -- Best Setups (from Scanner) --------------------------------- */}
      {scanLoading ? <CardSkeleton rows={5} /> : (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Best Setups Now</h3>
            <button onClick={() => navigateTo('scanner')} className="text-[10px] text-emerald-400 hover:underline">View Scanner ?</button>
          </div>
          {topSetups.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">No scan results available — scanner may not have run yet today.</div>
          ) : (
            <div className="space-y-1">
              {topSetups.map((s: ScanResult) => (
                <div
                  key={s.symbol}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--msp-panel-2)] hover:bg-slate-800/50 cursor-pointer transition-colors"
                  onClick={() => { selectSymbol(s.symbol); navigateTo('golden-egg', s.symbol); }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm font-bold text-white shrink-0">{s.symbol}</div>
                    <Badge label={s.direction || 'neutral'} color={directionColor(s.direction)} small />
                    {s.setup && <span className="text-[10px] text-slate-400 truncate hidden md:inline">{s.setup}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.price != null && (
                      <span className="text-xs text-slate-300 font-mono">${s.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                    <div className="text-right w-10">
                      <div className="text-sm font-bold" style={{ color: directionColor(s.direction) }}>
                        {s.score}
                      </div>
                    </div>
                    <div className="w-14 hidden md:block">
                      <ScoreBar value={Math.min(Math.abs(s.score) * 10, 100)} color={directionColor(s.direction)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* -- Equity Movers -------------------------------------------- */}
        {movers.loading ? <CardSkeleton rows={5} /> : (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Equity Movers</h3>
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-emerald-500 tracking-wider mb-1">Gainers</div>
              {eqGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No equity data</div>
              ) : eqGainers.map((m: Mover) => (
                <div key={`eg-${m.ticker}`} className="grid grid-cols-[5rem_1fr_6rem] items-center text-xs py-0.5 cursor-pointer hover:bg-slate-800/40 px-1 rounded" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                  <span className="font-semibold text-white">{m.ticker}</span>
                  <span className="text-slate-300 text-right font-mono tabular-nums">${parseFloat(m.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-emerald-400 font-mono text-right tabular-nums">+{m.change_percentage}</span>
                </div>
              ))}
              <div className="text-[10px] uppercase text-red-500 tracking-wider mb-1 mt-2">Losers</div>
              {eqLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No equity data</div>
              ) : eqLosers.map((m: Mover) => (
                <div key={`el-${m.ticker}`} className="grid grid-cols-[5rem_1fr_6rem] items-center text-xs py-0.5 cursor-pointer hover:bg-slate-800/40 px-1 rounded" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                  <span className="font-semibold text-white">{m.ticker}</span>
                  <span className="text-slate-300 text-right font-mono tabular-nums">${parseFloat(m.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-red-400 font-mono text-right tabular-nums">{m.change_percentage}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* -- Crypto Movers -------------------------------------------- */}
        {movers.loading ? <CardSkeleton rows={5} /> : (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Crypto Movers</h3>
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-emerald-500 tracking-wider mb-1">Gainers</div>
              {crGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No crypto data</div>
              ) : crGainers.map((m: Mover) => (
                <div key={`cg-${m.ticker}`} className="grid grid-cols-[5rem_1fr_6rem] items-center text-xs py-0.5 cursor-pointer hover:bg-slate-800/40 px-1 rounded" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                  <span className="font-semibold text-white">{m.ticker}</span>
                  <span className="text-slate-300 text-right">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span className="text-emerald-400 font-mono text-right">+{m.change_percentage}</span>
                </div>
              ))}
              <div className="text-[10px] uppercase text-red-500 tracking-wider mb-1 mt-2">Losers</div>
              {crLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No crypto data</div>
              ) : crLosers.map((m: Mover) => (
                <div key={`cl-${m.ticker}`} className="grid grid-cols-[5rem_1fr_6rem] items-center text-xs py-0.5 cursor-pointer hover:bg-slate-800/40 px-1 rounded" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                  <span className="font-semibold text-white">{m.ticker}</span>
                  <span className="text-slate-300 text-right">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span className="text-red-400 font-mono text-right">{m.change_percentage}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* -- Economic Calendar ---------------------------------------- */}
        {calendar.loading ? <CardSkeleton rows={4} /> : (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Upcoming Events</h3>
            {highImpactEvents.length === 0 ? (
              <div className="text-xs text-slate-500 py-4 text-center">No high-impact events this period</div>
            ) : (
              <div className="space-y-2">
                {highImpactEvents.map((e: EconomicEvent, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 min-w-0">
                      <ImpactDot impact={e.impact as 'high' | 'medium' | 'low'} />
                      <span className="text-white truncate">{e.event}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-slate-500">
                      <span>{e.date}</span>
                      <span>{e.time || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => navigateTo('research')} className="text-[10px] text-emerald-400 hover:underline mt-2 block">Full Calendar ?</button>
          </Card>
        )}

        {/* -- Cross-Market --------------------------------------------- */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence</h3>
          <div className="space-y-2">
            {CROSS_MARKET.slice(0, 5).map(cm => (
              <div key={cm.from} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{cm.from} {cm.condition}</span>
                <span className="text-slate-500 text-right">{cm.effect}</span>
              </div>
            ))}
            <button onClick={() => navigateTo('explorer')} className="text-[10px] text-emerald-400 hover:underline mt-1 block">Market Explorer ?</button>
          </div>
        </Card>
      </div>

      {/* -- Latest News ------------------------------------------------ */}
      {news.loading ? <CardSkeleton rows={4} /> : (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Latest Headlines</h3>
            <button onClick={() => navigateTo('research')} className="text-[10px] text-emerald-400 hover:underline">All News ?</button>
          </div>
          {articles.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">No recent news</div>
          ) : (
            <div className="space-y-2">
              {articles.map((n: NewsArticle, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs py-1">
                  <ImpactDot impact={n.sentiment.score > 0.2 ? 'high' : n.sentiment.score > 0 ? 'medium' : 'low'} />
                  <div className="flex-1 min-w-0">
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-emerald-400 transition-colors line-clamp-1">
                      {n.title}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-600">{n.source}</span>
                      {n.tickerSentiments?.slice(0, 3).map(ts => (
                        <span key={ts.ticker} className="text-emerald-400 cursor-pointer hover:underline" onClick={() => { selectSymbol(ts.ticker); navigateTo('golden-egg', ts.ticker); }}>{ts.ticker}</span>
                      ))}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 ${n.sentiment.score > 0 ? 'text-emerald-400' : n.sentiment.score < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {n.sentiment.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* -- Error / debug (collapsed) -------------------------------- */}
      {(() => {
        const errs = [
          equityScan.error && `Scanner (equity): ${equityScan.error}`,
          cryptoScan.error && `Scanner (crypto): ${cryptoScan.error}`,
          movers.error && `Movers: ${movers.error}`,
          news.error && `News: ${news.error}`,
          calendar.error && `Calendar: ${calendar.error}`,
        ].filter(Boolean) as string[];
        if (!errs.length) return null;
        return (
          <details className="text-[10px] text-red-400/40 border border-red-900/20 rounded-lg p-2">
            <summary className="cursor-pointer hover:text-red-400/60">{errs.length} API issue{errs.length > 1 ? 's' : ''} — click to expand</summary>
            <div className="mt-1 space-y-0.5 pl-3">{errs.map((e, i) => <div key={i}>{e}</div>)}</div>
          </details>
        );
      })()}
      </div>
      </>}
    </div>
  );
}
