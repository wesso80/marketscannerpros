'use client';
import dynamic from 'next/dynamic';
import { publicDesignEnabled } from '@/lib/publicDesign';
const ResearchOverview = dynamic(() => import('@/components/public-design/ResearchOverview'));
import { calendarDataWarning, upcomingConfirmedEvents } from '@/lib/calendarPresentation';

/* ---------------------------------------------------------------------------
   COMMAND CENTER — 30-second market intelligence overview (Stage 2)

   Consolidates EXISTING data (regime, sectors, crypto overview, movers,
   economic calendar) into one educational screen. No new data sources, no
   buy/sell language, no probabilities. Composite/evidence framing comes from
   lib/analysis (Stage 1). Interpretation logic lives in
   lib/analysis/commandCenter.ts and is unit-tested.
   --------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from 'react';
import {
  DAILY_PICKS_CURRENT_PATH,
  useDailyPicksBundle,
  useRegime,
  useSectorsHeatmap,
  useCryptoOverview,
  useMarketMovers,
  useEconomicCalendar,
  type Mover,
} from '@/app/v2/_lib/api';
import { Card, Badge } from '@/app/v2/_components/ui';
import { PageHero } from '@/components/ui';
import BuildingInterestPanel from '@/components/analysis/BuildingInterestPanel';
import CrossAssetPanel from '@/components/analysis/CrossAssetPanel';
import Link from 'next/link';
import RadarReportCard from '@/components/overview/RadarReportCard';
import PriceStamp from '@/components/market/PriceStamp';
import {freshness} from '@/lib/crypto/breakdown/freshness';
import {trustBadgeState} from '@/components/market/TrustBadge';
import ChipRow from '@/components/visual/ChipRow';
import { marketText } from '@/lib/marketsPresentation';
import TodayStrip from '@/components/overview/TodayStrip';
import ViewerDate from '@/components/visual/ViewerDate';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import DeskFolds from '@/components/desk/DeskFolds';
import { COPY } from '@/components/visual/copy';
import {OverviewPicks} from '@/components/market/OverviewPicks';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import {usePublicMarketFeed} from '@/hooks/usePublicMarketFeed';
import {diffPicks,previousScanDate,topPicks,type MarketPick,type PicksResponse} from '@/lib/market/overview';
import {quoteStamp,type DisplayQuote} from '@/lib/market/quotePresentation';
import {formatMarketTime} from '@/lib/market/priceStamp';
import {symbolHref} from '@/lib/market/links';
import { applyFeedHealth, assessSessionFreshness, degradedFeedList } from '@/lib/analysis/sessionDataHealth';
import { CRYPTO_MAX_AGE_MINUTES, equityLayerTiming } from '@/lib/analysis/providerAsOf';
import {
  describeRegime,
  rankSectorStrength,
  deriveRiskTone,
  interpretCryptoParticipation,
  summarizeEventClock,
  assessEvidenceQuality,
  classifyBuilding,
  rankBuilding,
  crossSectionalRelativeVolume,
  filterMoversByFloor,
  describeCrossAsset,
  parsePct,
  buildSessionSnapshot,
  diffSessionSnapshots,
  EDUCATIONAL_DISCLOSURE,
  type AnalyticalStance,
  type EvidenceQualityLevel,
  type BuildingAssessment,
  type SessionSnapshot,
} from '@/lib/analysis';

const SNAPSHOT_KEY = 'msp:cc:snapshot';

function stanceColor(stance: AnalyticalStance): string {
  switch (stance) {
    case 'bullish': return 'var(--msp-bull)';
    case 'bearish': return 'var(--msp-bear)';
    case 'neutral': return 'var(--msp-flat)';
    case 'mixed': return 'var(--msp-warn)';
    default: return 'var(--msp-text-faint)';
  }
}

function toneColor(tone: 'risk_on' | 'risk_off' | 'mixed'): string {
  if (tone === 'risk_on') return 'var(--msp-bull)';
  if (tone === 'risk_off') return 'var(--msp-bear)';
  return 'var(--msp-warn)';
}

function eqColor(level: EvidenceQualityLevel): string {
  switch (level) {
    case 'HIGH': return 'var(--msp-bull)';
    case 'MEDIUM': return 'var(--msp-warn)';
    case 'LOW': return 'var(--msp-bear)';
    default: return 'var(--msp-text-faint)';
  }
}

function pctColor(v: number): string {
  if (v > 0) return 'var(--msp-bull)';
  if (v < 0) return 'var(--msp-bear)';
  return 'var(--msp-text-muted)';
}

function deltaColor(kind: 'regime' | 'risk' | 'sector' | 'crypto' | 'building' | 'event'): string {
  switch (kind) {
    case 'regime': return 'var(--msp-accent, #10B981)';
    case 'risk': return 'var(--msp-warn)';
    case 'sector': return 'var(--msp-bull)';
    case 'crypto': return 'var(--msp-flat)';
    case 'building': return 'var(--msp-bull)';
    case 'event': return 'var(--msp-bear)';
    default: return 'var(--msp-text-muted)';
  }
}

function plainLabel(value: string) {
  return marketText(value);
}
function SectionTitle({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-black tracking-widest text-slate-500">{n}</span>
      <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-200">{title}</h2>
      {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
    </div>
  );
}

export default function CommandCenterPage() {
  return publicDesignEnabled() ? <ResearchOverview /> : <LegacyCommandCenter />;
}

function LegacyCommandCenter() {
  const regime = useRegime();
  const sectors = useSectorsHeatmap();
  const crypto = useCryptoOverview();
  const movers = useMarketMovers();
  const calendar = useEconomicCalendar();
  const [asset,setAsset]=useState<'crypto'|'equity'>('crypto');
  const quotes=usePublicMarketFeed<{quotes:Record<string,DisplayQuote>}>('/api/cached/bulk-quotes?symbols=BTC,ETH,SOL,SPY,QQQ,IWM,DIA');
  const funding=usePublicMarketFeed<{coins:Array<{symbol:string;fundingRatePercent:number}>;timestamp?:string;freshnessStatus?:string;source?:string}>('/api/funding-rates');
  // Same current-day limit=20 read as DeskFolds (one in-flight GET). The server re-sorts that
  // window by verdict, so this shell takes the first 5 of the shared result rather than a separate limit=5.
  const dailyPicks=useDailyPicksBundle();
  const picks: { data: PicksResponse | null; loading: boolean; error: string | null } = {
    data: dailyPicks.data ? {
      success: dailyPicks.data.success,
      topPicks: {
        equity: dailyPicks.data.equity as MarketPick[],
        crypto: dailyPicks.data.crypto as MarketPick[],
      },
    } : null,
    loading: dailyPicks.loading,
    error: dailyPicks.error || (dailyPicks.data?.success === false ? 'Data unavailable' : null),
  };
  const rows=topPicks(picks.data,asset);
  const previousDate=previousScanDate(rows[0]?.scan_date,asset);
  // Same query as the current-day read, plus the date, then the same top-5 slice. A limit=5
  // previous day is a different verdict window and would report adds and drops that did not happen.
  const previous=usePublicMarketFeed<PicksResponse>(previousDate?`${DAILY_PICKS_CURRENT_PATH}&date=${previousDate}`:null);
  const changes=diffPicks(rows,topPicks(previous.data,asset));

  // Snapshot the market environment on each visit so we can show the user what
  // materially changed since they were last here (regime, risk tone, breadth,
  // leadership, crypto participation, new building names, events).
  const [priorSnapshot, setPriorSnapshot] = useState<SessionSnapshot | null>(null);
  const [snapshotCaptured, setSnapshotCaptured] = useState(false);
  const prevRegime = priorSnapshot?.regime ?? null;

  const sectorData = sectors.data?.sectors ?? [];
  const cryptoData = crypto.data?.data ?? null;
  const moverList: Mover[] = useMemo(
    () => filterMoversByFloor([...(movers.data?.topGainers ?? []), ...(movers.data?.topLosers ?? [])]),
    [movers.data],
  );

  const reg = describeRegime(regime.data ?? null, prevRegime);
  const strength = rankSectorStrength(sectorData);
  const riskTone = deriveRiskTone(strength.total ? strength.greenRatio : null, cryptoData?.marketCapChange24h);
  const flow = interpretCryptoParticipation(cryptoData);
  const calendarWarning = calendarDataWarning(calendar.data?.events);
  const eventClock = summarizeEventClock(upcomingConfirmedEvents(calendar.data?.events ?? []));

  // Cross-asset: crypto total cap vs. equity sector breadth (association only).
  // Sectors with no change (null) are left out of the average instead of counting as 0%.
  const sectorMoves = sectorData
    .map((x) => x.changePercent)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const meanSectorChange = sectorMoves.length
    ? sectorMoves.reduce((s, v) => s + v, 0) / sectorMoves.length
    : undefined;
  const crossReadings = [
    describeCrossAsset({
      a: { label: 'Crypto (total cap)', changePct: cryptoData?.marketCapChange24h ?? undefined },
      b: { label: 'Equity sectors (avg)', changePct: meanSectorChange },
      baseline: 'positive',
      freshness: 'delayed',
    }),
  ];

  // Building / Early engine — classify developing activity from the movers
  // cohort. Only price + cohort-relative volume are available here (no per-symbol
  // volatility/OI), so evidence quality reflects that honestly.
  const buildingByClass = (assetClass: 'equity' | 'crypto'): Array<BuildingAssessment & { changePct: number }> => {
    const cohort = moverList.filter((m) => m.asset_class === assetClass);
    const cohortVolumes = cohort.map((m) => parsePct(m.volume) || Number(String(m.volume).replace(/[^0-9.]/g, '')) || 0);
    const assessed = cohort.map((m) => {
      const changePct = parsePct(m.change_percentage);
      const vol = Number(String(m.volume).replace(/[^0-9.]/g, '')) || 0;
      const relativeVolume = crossSectionalRelativeVolume(vol, cohortVolumes);
      const a = classifyBuilding({ symbol: m.ticker, changePct, relativeVolume, freshness: 'delayed' });
      return { ...a, changePct };
    });
    return rankBuilding(assessed)
      .filter((a) => a.state === 'BUILDING' || a.state === 'EXPANDING')
      .slice(0, 6) as Array<BuildingAssessment & { changePct: number }>;
  };
  const buildingEquity = useMemo(() => buildingByClass('equity'), [moverList]);
  const buildingCrypto = useMemo(() => buildingByClass('crypto'), [moverList]);

  // Evidence quality across the five consolidated layers.
  const availableFactors = [
    Boolean(regime.data?.regime),
    sectorData.length > 0,
    Boolean(cryptoData),
    moverList.length > 0,
    !calendarWarning,
  ].filter(Boolean).length;
  // Shared freshness rule (lib/analysis/sessionDataHealth.ts): "current" needs a provider
  // as-of time within cadence. Each feed passes the provider's own time (OV-7): the sector
  // ETF quotes give only a trading day, so they can be stale but not proven current
  // intraday; crypto uses CoinGecko's update time; movers use Alpha Vantage's last_updated.
  const sessionNow = new Date();
  const sessionFreshness = assessSessionFreshness([
    { name: 'regime', available: Boolean(regime.data?.regime) && reg.available, asOf: reg.asOf, stale: reg.stale },
    { name: 'sectors', available: sectorData.length > 0, ...equityLayerTiming({ asOf: sectors.data?.asOf, tradingDay: sectors.data?.asOfTradingDay }, sessionNow) },
    { name: 'crypto', available: Boolean(cryptoData), asOf: crypto.data?.asOf ?? null, cadenceMinutes: CRYPTO_MAX_AGE_MINUTES },
    { name: 'movers', available: moverList.length > 0, ...equityLayerTiming({ asOf: movers.data?.equityAsOf }, sessionNow) },
  ], sessionNow.getTime());
  // Same degraded-feed list and wording as the Market dashboard, for the feeds this page reads.
  const degradedFeeds = degradedFeedList({
    feeds: [
      { label: 'Regime', error: regime.error },
      { label: 'Sectors', error: sectors.error },
      { label: 'Crypto overview', error: crypto.error },
      { label: 'Movers', error: movers.error },
      { label: 'Calendar', error: calendar.error },
    ],
    calendarWarning: calendar.loading ? null : calendarWarning,
  });
  const baseEvidence = assessEvidenceQuality({
    availableFactors,
    totalFactors: 5,
    freshness: sessionFreshness.freshness,
    missing: [
      !sectorData.length ? 'sectors' : null,
      !cryptoData ? 'crypto' : null,
      !moverList.length ? 'movers' : null,
    ].filter(Boolean) as string[],
  });
  const evidence = applyFeedHealth(
    { ...baseEvidence, reasons: [...baseEvidence.reasons, ...sessionFreshness.notes] },
    degradedFeeds,
  );

  const anyLoading = regime.loading || sectors.loading || crypto.loading || movers.loading;

  // Build the current-visit snapshot from the derived environment.
  const nextHighImpactEvent = eventClock.find((e) => e.importance === 'high')?.event;
  const currentSnapshot = useMemo(
    () =>
      buildSessionSnapshot({
        regime: regime.data?.regime ?? null,
        riskTone: riskTone.tone,
        greenRatio: strength.greenRatio,
        cryptoCapChange: typeof cryptoData?.marketCapChange24h === 'number' ? cryptoData.marketCapChange24h : undefined,
        strongestSector: strength.strongest[0]?.name,
        weakestSector: strength.weakest[0]?.name,
        cryptoParticipationLabel: flow.label,
        buildingSymbols: [...buildingEquity, ...buildingCrypto].map((b) => b.symbol),
        nextHighImpactEvent,
      }),
    [regime.data?.regime, riskTone.tone, strength, cryptoData?.marketCapChange24h, flow.label, buildingEquity, buildingCrypto, nextHighImpactEvent],
  );

  // Once the essential data is ready, read the prior snapshot, then persist the
  // current one. Captured only once per mount so the diff is stable.
  const dataReady = Boolean(regime.data?.regime) && !anyLoading;
  useEffect(() => {
    if (!dataReady || snapshotCaptured) return;
    try {
      const stored = localStorage.getItem(SNAPSHOT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SessionSnapshot;
        if (parsed && typeof parsed.ts === 'number') setPriorSnapshot(parsed);
      }
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(currentSnapshot));
    } catch {
      /* localStorage unavailable — session digest simply disabled */
    }
    setSnapshotCaptured(true);
  }, [dataReady, snapshotCaptured, currentSnapshot]);

  const sessionDelta = useMemo(
    () => (priorSnapshot ? diffSessionSnapshots(priorSnapshot, currentSnapshot) : null),
    [priorSnapshot, currentSnapshot],
  );

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><TodayStrip regime={reg} loading={regime.loading} hasRegimeData={Boolean(regime.data)} regimeColor={stanceColor(reg.stance)} sectors={sectorData} sectorTime={sectors.data?.asOf} sectorDay={sectors.data?.asOfTradingDay} strength={strength} quotes={quotes.data?.quotes} quotesLoading={quotes.loading} /></div>
        <RadarReportCard />
      </div>

      <ViewerDate />
      <ChipRow items={[{id: 'feed-health', label: (degradedFeeds.length || quotes.error || funding.error || picks.error) ? 'Some feeds need a check' : 'Observation coverage', warning: Boolean(degradedFeeds.length || quotes.error || funding.error || picks.error), detail: <ul className="space-y-1 text-sm">{[
        ['Regime', regime.error ? 'Could not load' : reg.stale ? 'Older observations' : reg.available ? 'Collected' : 'Not collected'],
        ['Sectors', sectors.error ? 'Could not load' : sectorData.length ? 'Collected' : 'Not collected'],
        ['Crypto overview', crypto.error ? 'Could not load' : cryptoData ? 'Collected' : 'Not collected'],
        ['Quotes', quotes.error ? 'Could not load' : Object.keys(quotes.data?.quotes ?? {}).length ? 'Collected' : 'Not collected'],
        ['Funding', funding.error ? 'Could not load' : funding.data?.coins.length ? 'Collected' : 'Not collected'],
        ['Daily picks', picks.error ? 'Could not load' : rows.length ? 'Stored scan' : 'Not collected'],
        ['Movers', movers.error ? 'Could not load' : moverList.length ? 'Collected' : 'Not collected'],
        ['Event clock', calendarWarning ? 'Schedule needs a check' : 'Schedule only'],
      ].map(([label,status]) => <li key={label}>{label}: {status}</li>)}</ul>}]} />
      <SourceLine source="Stored market feeds" asOf={reg.asOf || crypto.data?.asOf || sectors.data?.asOf} basis="Independent observations · dates in research detail" />
      <CollapsibleSection title="Market evidence" summary={`${strength.total} sectors · ${rows.length} stored picks`}>
      <div className="space-y-3">


      <section data-regime-box className="space-y-4 rounded-lg border p-4" style={{ borderColor: stanceColor(reg.stance) }}>
        <SectionTitle n="01" title="Drivers and risk clock" hint={reg.available && reg.stale ? 'contains stale inputs' : undefined} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-2xl font-black" style={{ color: stanceColor(reg.stance) }}>{plainLabel(reg.regimeLabel)}</div>
          <Badge label={plainLabel(reg.riskLabel)} color="var(--msp-text-muted)" small />
          {reg.changed && reg.previousLabel ? <Badge label={`Was: ${reg.previousLabel}`} color="var(--msp-warn)" small /> : null}
          {regime.loading && !regime.data
            ? <Badge label="Loading…" color="var(--msp-text-muted)" small />
            : !reg.available
              ? <Badge label="Not available right now" color="var(--msp-text-muted)" small />
              : reg.stale
                ? <Badge label="Stale inputs" color="var(--msp-bear)" small />
                : <Badge label="Current" color="var(--msp-bull)" small />}
          {reg.asOf ? <span className="text-[11px] text-slate-500">Data as of {new Date(reg.asOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span> : null}
        </div>
        <p className="text-sm leading-6 text-slate-300">{plainLabel(reg.summary)}</p>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Market Drivers</h3>
          <p className="mb-2 text-xs text-slate-500">Association, not causation.</p>
          <CrossAssetPanel readings={crossReadings} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Risk / Event Clock</h3>
          <p className="mb-2 text-xs text-slate-500">Schedule only. Outcomes are not predicted.</p>
          {eventClock.length ? (
            <ul className="divide-y divide-white/5">
              {eventClock.map((e, i) => (
                <li key={`${e.event}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-slate-200">{e.event}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                    <span>{e.market}</span>
                    <span title={e.whenTitle}>{e.when}</span>
                    <Badge label={e.importance.toUpperCase()} small color={e.importance === 'high' ? 'var(--msp-bear)' : e.importance === 'medium' ? 'var(--msp-warn)' : 'var(--msp-flat)'} />
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No scheduled events in the current calendar.</p>}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-white/10 p-4">
        <h2 className="text-lg font-bold">Market pulse</h2>
        <div role="tablist" aria-label="Market pulse" className="flex gap-2">{(['crypto','equity'] as const).map(type=><button key={type} role="tab" aria-selected={asset===type} onClick={()=>setAsset(type)} className={`rounded border px-4 py-2 ${asset===type?'text-emerald-300 border-emerald-400':'border-slate-700'}`}>{type==='crypto'?'Crypto':'Stocks'}</button>)}</div>
        {quotes.error&&<p className="text-amber-300">Quotes could not be loaded.</p>}
        <div className="grid gap-3 md:grid-cols-2">{(asset==='crypto'?['BTC','ETH','SOL']:['SPY','QQQ','IWM','DIA']).map(symbol => {
          const reading = quoteStamp(symbol, asset, quotes.data?.quotes?.[symbol]);
          const measured = typeof reading.price === 'number' && Number.isFinite(reading.price) && reading.price !== 0;
          return <Link key={symbol} href={symbolHref(symbol, asset)} className="rounded border border-white/10 p-3">{measured ? <PriceStamp plain {...reading} /> : <span>{symbol} {COPY.today.unavailable}</span>}</Link>;
        })}</div>
        {asset==='crypto'?<>
          {cryptoData ? <p>BTC dominance {cryptoData.btcDominance.toFixed(1)}% · Market cap {cryptoData.totalMarketCapFormatted}</p> : null}
          <p className="text-xs text-slate-400">Crypto market snapshot · {formatMarketTime(crypto.data?.asOf) || "Observation time not supplied"}</p>
          <CollapsibleSection title="Funding" summary="OKX 8h equivalent">
            {funding.error?<p className="text-amber-300">Funding could not be loaded.</p>:['BTC','ETH','SOL'].map(symbol=>{
              const rate = funding.data?.coins.find(c=>c.symbol===symbol)?.fundingRatePercent;
              return typeof rate === 'number' ? <p key={symbol}>{symbol}: {rate.toFixed(4)}%</p> : null;
            })}
          </CollapsibleSection>
      <div className="grid gap-3 md:grid-cols-2">
        {/* LAYER 2 — RISK TONE / DRIVERS */}
        <Card className="p-4">
          <SectionTitle n="02" title="Risk Tone" hint="breadth + crypto participation" />
          <div className="text-lg font-black" style={{ color: toneColor(riskTone.tone) }}>{plainLabel(riskTone.label)}</div>
          <p className="mt-1 text-sm text-slate-300">{plainLabel(riskTone.note)}</p>
          <div className="mt-2 text-xs text-slate-500">
            Sector breadth: {(strength.greenRatio * 100).toFixed(0)}% positive ({strength.total} sampled).
            {typeof cryptoData?.marketCapChange24h === 'number'
              ? ` Crypto cap ${cryptoData.marketCapChange24h >= 0 ? '+' : ''}${cryptoData.marketCapChange24h.toFixed(1)}% (24h).`
              : ' Crypto participation is not in this snapshot.'}
          </div>
          <p className="mt-2 text-[11px] italic text-slate-500">Cross-asset relationships are described as associations, not causation. Delayed data is labelled where applicable.</p>
        </Card>

        {/* LAYER 4 — CRYPTO PARTICIPATION */}
        <Card className="p-4">
          <SectionTitle n="03" title="Crypto Participation" />
          <div className="text-lg font-black" style={{ color: stanceColor(flow.stance) }}>{plainLabel(flow.label)}</div>
          <p className="mt-1 text-sm text-slate-300">{plainLabel(flow.note)}</p>
          <Link className="text-emerald-300" href="/tools/crypto-dashboard">Market-wide derivatives</Link>
        </Card>
      </div>

        </>:<ul className="grid gap-2 md:grid-cols-2">{sectorData.filter(sector => typeof sector.changePercent === 'number').map(sector=><li key={sector.symbol}>{sector.name}: {sector.changePercent!.toFixed(2)}% vs prior close</li>)}</ul>}
      </section>
      <Card className="p-3">
        <h2 className="text-sm font-bold">Daily Picks · {asset==='crypto'?'Crypto':'Stocks'}</h2>
        {picks.loading?<p>Loading…</p>:picks.error?<p className="text-amber-300">Stored picks could not be loaded.</p>:rows.length?<OverviewPicks rows={rows.slice(0,5)} asset={asset}/>:<p>No picks in the latest stored scan.</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link className="inline-flex min-h-10 items-center text-emerald-300" href="/daily-pick">Open Daily Picks</Link>
          <Link className="inline-flex min-h-10 items-center text-emerald-300" href={`/tools/scanner?type=${asset}`}>See all in Scanner</Link>
        </div>
      </Card>
      <CollapsibleSection title="What changed" summary="Previous scan and last visit">
      <section className="space-y-2">
        <h2 className="text-lg font-bold">What changed since the previous scan</h2>
        {previous.loading?<p>Loading…</p>:previous.error?<p className="text-amber-300">Earlier scan is not available right now.</p>:!changes.hasPrevious?<p>No earlier scan stored{previousDate?` for ${previousDate}`:''}.</p>:<>
          <p>vs {previousDate} scan · {asset==='crypto'?'UTC':'New York market date'}</p>
          <p>New: {changes.added.map(p=>p.symbol).join(', ')||'none'} · Dropped: {changes.dropped.map(p=>p.symbol).join(', ')||'none'}</p>
        </>}
        <p>{reg.changed?`Regime changed from ${reg.previousLabel} to ${reg.regimeLabel} since your last visit.`:'No regime change observed since your last visit.'}</p>
      {/* WHAT CHANGED SINCE LAST SESSION */}
      {sessionDelta ? (
        <Card className="p-4" style={{ borderColor: 'var(--msp-accent, #10B981)', borderWidth: 1 }}>
          <SectionTitle n="00" title="Since your last session" hint={sessionDelta.elapsedLabel} />
          {sessionDelta.quiet ? (
            <p className="text-sm text-slate-400">No material change in the market environment since you were last here.</p>
          ) : (
            <ul className="space-y-1.5">
              {sessionDelta.items.map((item, i) => (
                <li key={`${item.kind}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <Badge label={item.label} small color={deltaColor(item.kind)} />
                  <span className="text-slate-300">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] italic text-slate-500">Descriptive changes in the observed environment since your previous visit. Not trade instructions or predictions.</p>
        </Card>
      ) : null}

      </section>
      </CollapsibleSection>
      <CollapsibleSection title="More detail" summary="Relative strength and areas to research">
      <div className="space-y-3">
      {/* LAYER 3 — STRENGTH / WEAKNESS */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <SectionTitle n="04" title="Relative Strength" hint="ranked by observed change" />
          {strength.strongest.length ? (
            <ul className="space-y-1">
              {strength.strongest.map((s) => (
                <li key={s.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{s.name}</span>
                  <span className="font-black" style={{ color: pctColor(s.changePercent) }}>{s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">Sector data is not in this snapshot.</p>}
        </Card>
        <Card className="p-4">
          <SectionTitle n="05" title="Relative Weakness" hint="ranked by observed change" />
          {strength.weakest.length ? (
            <ul className="space-y-1">
              {strength.weakest.map((s) => (
                <li key={s.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{s.name}</span>
                  <span className="font-black" style={{ color: pctColor(s.changePercent) }}>{s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">Sector data is not in this snapshot.</p>}
        </Card>
      </div>

      {/* LAYER 7 — AREAS DESERVING RESEARCH (Building / Early engine) */}
      <Card className="p-4">
        <SectionTitle n="07" title="Areas Deserving Further Research" hint="developing activity, not trade instructions" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-500">Equities, building or expanding</div>
            <BuildingInterestPanel items={buildingEquity} emptyText="No developing equity activity in the current mover sample." />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-500">Crypto, building or expanding</div>
            <BuildingInterestPanel items={buildingCrypto} emptyText="No developing crypto activity in the current mover sample." />
          </div>
        </div>
        <p className="mt-2 text-[11px] italic text-slate-500">Volume is measured relative to today&rsquo;s mover cohort (a transparent proxy when a per-symbol historical baseline is not in this snapshot). Per-symbol volatility and positioning inputs, where present, further refine these states in the dedicated tools.</p>
      </Card>

      </div>
      </CollapsibleSection>
      <DeskFolds />
      <CollapsibleSection title="Evidence quality" summary={evidence.level}>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Evidence quality</span>
          <Badge label={evidence.level} color={eqColor(evidence.level)} />
          <span className="text-xs text-slate-400">{Math.round(evidence.completeness * 100)}% of layers available</span>
        </div>
        <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
          {evidence.reasons.map((r, i) => <li key={i}>{plainLabel(r)}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-slate-600">Covers the layers on this page (regime, sectors, crypto, movers, calendar). Scanner feed health is in the folded research context.</p>
      </Card>
      </CollapsibleSection>

      </div>
      </CollapsibleSection>
      <p className="px-1 text-[11px] text-slate-600">{EDUCATIONAL_DISCLOSURE}</p>
      <ComplianceDisclaimer/>
    </div>
  );
}
