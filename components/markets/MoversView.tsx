'use client';

import { useState } from 'react';
import Link from 'next/link';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { marketText } from '@/lib/marketsPresentation';
import { symbolHref } from '@/lib/market/links';
import { moverResearchLink } from '@/lib/options/journey';
import { equityMoversBasisLabel } from '@/lib/alphaVantageEntitlement';
import type { EvaluatedMover, MoversData } from '@/app/tools/market-movers/page';

type Environment = {
  deploymentMode: 'YES' | 'CONDITIONAL' | 'NO';
  adaptiveConfidence: number;
  marketMode: string; breadthState: string; liquidityState: string; volatilityState: string;
  medianVol: number; highBetaPolicy: string; breakoutPolicy: string; meanReversionPolicy: string;
};
export interface MoversViewProps {
  data: MoversData | null; loading: boolean; error: string | null;
  rows: EvaluatedMover[]; environment: Environment; permissionedCount: number;
  activeTab: 'gainers' | 'losers' | 'active'; assetFilter: 'all' | 'equity' | 'crypto';
  setupMode: 'breakout' | 'reversal' | 'momentum';
  onTab: (value: MoversViewProps['activeTab']) => void;
  onAsset: (value: MoversViewProps['assetFilter']) => void;
  onSetup: (value: MoversViewProps['setupMode']) => void;
}
const control = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm';
const pct = (n: number) => Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : 'Not collected';
const number = (n: number | undefined | null, digits = 1) => n != null && Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'Not collected';
const stateLabel = (state: EvaluatedMover['deployment']) => state === 'eligible' ? 'Aligned' : state === 'conditional' ? 'Mixed evidence' : 'Excluded';

function MoversChart({ title, rows, medianVol }: { title: string; rows: MoversData['topGainers']; medianVol: number }) {
  const base = medianVol > 0 ? medianVol : 1;
  const measured = rows.filter(row => Number.isFinite(row.changePercent) && Number.isFinite(row.volume / base) && (row.volume / base).toFixed(2) !== '0.00').slice(0, 8);
  const max = Math.max(1, ...measured.map(row => Math.abs(row.changePercent)));
  return <section><h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {!measured.length ? <p className="text-sm text-slate-400">No observations in this list.</p> : <ul className="space-y-2">{measured.map(row => <li key={row.ticker} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs"><span className="break-words">{row.ticker}</span><span aria-hidden="true" className="h-2 rounded bg-white/10"><span className="block h-2 rounded bg-slate-400" style={{ width: `${Math.abs(row.changePercent) / max * 100}%` }}/></span><span className="text-right">{pct(row.changePercent)}</span></li>)}</ul>}
  </section>;
}

/** Presentation only. Rows, ordering, scores and eligibility arrive from the existing calculation. */
export default function MoversView(props: MoversViewProps) {
  const { data, loading, error, rows, environment, permissionedCount, activeTab, assetFilter, setupMode } = props;
  const [expandedSelection, setExpandedSelection] = useState<string | null>(null);
  const selection = `${activeTab}/${assetFilter}/${setupMode}`;
  const showAll = expandedSelection === selection;
  const visible = showAll ? rows : rows.slice(0, 5);
  const hasObservations = Boolean(data && (data.topGainers.length || data.topLosers.length || data.mostActive.length));
  const assessment = loading ? 'Loading recorded movers…' : error ? 'Movers could not be collected.' : !hasObservations ? 'No mover observations collected.' : rows.length === 0 ? 'No movers match this selection.' : environment.deploymentMode === 'YES' ? 'Conditions support further research.' : environment.deploymentMode === 'NO' ? 'Conditions do not meet the research criteria.' : 'Conditions show mixed evidence.';
  return <section className="min-w-0 space-y-3 text-white" aria-label="Market Movers">
    <header><h1 className="text-xl font-semibold">Market Movers</h1><p data-movers-verdict role="status" className="mt-2 text-sm font-medium">{assessment}</p></header>
    {!loading && !error && (data?.extremeHiddenCount ?? 0) > 0 && <p className="text-sm text-slate-300">{data!.extremeHiddenCount === 1 ? '1 extreme move hidden' : `${data!.extremeHiddenCount} extreme moves hidden`}</p>}
    <ComplianceDisclaimer collapsible />
    {!loading && !error && hasObservations && <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mover lists">
        {([['gainers','Gainers'],['losers','Decliners'],['active','Most active']] as const).map(([id,label]) => <button key={id} type="button" className={control} aria-pressed={activeTab === id} onClick={() => props.onTab(id)}>{label}</button>)}
      </div>
      <CollapsibleSection title="Filters" summary={`${assetFilter === 'all' ? 'All assets' : assetFilter === 'equity' ? 'Stocks' : 'Crypto'} · ${setupMode === 'breakout' ? 'Breakout' : setupMode === 'reversal' ? 'Reversal' : 'Momentum'}`}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Asset filter">{([['all','All assets'],['equity','Stocks'],['crypto','Crypto']] as const).map(([id,label]) => <button key={id} type="button" className={control} aria-pressed={assetFilter === id} onClick={() => props.onAsset(id)}>{label}</button>)}</div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Research filter">{([['breakout','Breakout'],['reversal','Reversal'],['momentum','Momentum']] as const).map(([id,label]) => <button key={id} type="button" className={control} aria-pressed={setupMode === id} onClick={() => props.onSetup(id)}>{label}</button>)}</div>
      </CollapsibleSection>
      <p className="text-xs text-slate-400">Showing {visible.length} of {rows.length} movers · {permissionedCount} aligned in the evaluated list</p>
      <ul className="space-y-2" aria-label="Mover observations">{visible.map((row, i) => {
        const research = moverResearchLink(row, environment.deploymentMode);
        return <li key={`${row.asset_class}/${row.ticker}/${i}`} data-mover-row className="min-w-0 rounded-lg border border-slate-700 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm"><Link className="inline-flex min-h-10 items-center break-all font-semibold" href={symbolHref(row.ticker,row.asset_class)}>{row.ticker}</Link><span>{pct(row.changePercent)}</span><span className="ml-auto text-xs text-slate-400">{stateLabel(row.deployment)}</span></div>
          <details><summary className="min-h-10 cursor-pointer content-center text-xs text-slate-400">Evidence · {row.asset_class === 'equity' ? 'Stock' : 'Crypto'} · {number(row.relVolume,2)}× cohort volume</summary>
            <dl className="grid grid-cols-2 gap-2 py-3 text-xs">{[
              ['Price', Number.isFinite(row.price) ? `$${number(row.price, row.price < 1 ? 6 : 2)}` : 'Not collected'],
              ['Structure',marketText(row.structureBias)], ['Alignment score',number(row.confluenceScore)],
              ['Liquidity score',number(row.liquidityScore)], ['Group',marketText(row.cluster).replaceAll('_', ' ')],
              ['RSI',row.inUniverse ? number(row.rsi14) : 'Not collected'],
              ['Distance from 200-day average',row.inUniverse && row.ema200_dist != null ? pct(row.ema200_dist) : 'Not collected'],
              ['Relative strength',row.rsLabel ? marketText(row.rsLabel) : 'Not collected'],
              ['Momentum',row.inUniverse && row.accelLabel ? marketText(row.accelLabel) : 'Not collected'],
              ['Crypto score',row.asset_class === 'crypto' ? number(row.crcsUser) : 'Not applicable'],
            ].map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
            {row.deployment === 'blocked' ? <p className="text-xs text-slate-400">{marketText(row.overlayReasons?.length ? row.overlayReasons.join(' · ') : row.blockReason || 'Outside the current research criteria')}</p> : <Link className={control} href={research.href}>{marketText(research.label)}</Link>}
          </details>
        </li>;
      })}</ul>
      {rows.length > 5 && <button type="button" className={control} onClick={() => setExpandedSelection(showAll ? null : selection)}>{showAll ? 'Show five' : `Show all ${rows.length}`}</button>}
      <CollapsibleSection title="Market context" summary={`${number(environment.adaptiveConfidence)} /100 alignment`}>
        <dl className="grid grid-cols-2 gap-3 text-sm">{[['Market',environment.marketMode],['Breadth',environment.breadthState],['Liquidity',environment.liquidityState],['Volatility',environment.volatilityState],['High-volatility assets',environment.highBetaPolicy],['Breakouts',environment.breakoutPolicy],['Reversals',environment.meanReversionPolicy],['Median cohort volume',number(environment.medianVol,0)]].map(([label,value])=><div key={label}><dt className="text-slate-400">{label}</dt><dd>{marketText(value)}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-slate-400">Cohort volume compares this observation with this list, not the symbol’s historical volume. Crypto scores apply only to crypto. Scores summarise research criteria.</p>
      </CollapsibleSection>
      <CollapsibleSection title="Change charts" summary="Recorded gainers and decliners"><div className="grid gap-5 md:grid-cols-2"><MoversChart title="Gainers" rows={data!.topGainers} medianVol={environment.medianVol}/><MoversChart title="Decliners" rows={data!.topLosers} medianVol={environment.medianVol}/></div></CollapsibleSection>
    </>}
    {!loading && data && !error && <SourceLine source={`${equityMoversBasisLabel(data.equityFeed) || 'Equity movers'} · crypto market snapshot`} asOf={data.equityAsOf || undefined} basis="Equity observation time when supplied · crypto observations have a separate feed basis; no shared observation time supplied" />}
    {error && <p className="text-sm text-amber-200">No current list is shown. Reload this page to try again.</p>}
  </section>;
}
