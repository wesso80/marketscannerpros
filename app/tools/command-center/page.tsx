'use client';

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
import LeverageStatePanel from '@/components/analysis/LeverageStatePanel';
import CrossAssetPanel from '@/components/analysis/CrossAssetPanel';
import { useCryptoDerivatives } from '@/hooks/useCryptoDerivatives';
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
  classifyLeverageState,
  describeCrossAsset,
  parsePct,
  EDUCATIONAL_DISCLOSURE,
  type AnalyticalStance,
  type EvidenceQualityLevel,
  type BuildingAssessment,
} from '@/lib/analysis';

const PREV_REGIME_KEY = 'msp:cc:prevRegime';

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
  const regime = useRegime();
  const sectors = useSectorsHeatmap();
  const crypto = useCryptoOverview();
  const movers = useMarketMovers();
  const calendar = useEconomicCalendar();
  const derivatives = useCryptoDerivatives('BTC');

  // Track the previously observed regime (cross-session) to surface change.
  const [prevRegime, setPrevRegime] = useState<string | null>(null);
  useEffect(() => {
    const current = regime.data?.regime;
    if (!current) return;
    try {
      const stored = localStorage.getItem(PREV_REGIME_KEY);
      if (stored && stored !== current) setPrevRegime(stored);
      localStorage.setItem(PREV_REGIME_KEY, current);
    } catch {
      /* localStorage unavailable — change detection simply disabled */
    }
  }, [regime.data?.regime]);

  const sectorData = sectors.data?.sectors ?? [];
  const cryptoData = crypto.data?.data ?? null;
  const moverList: Mover[] = useMemo(
    () => [...(movers.data?.topGainers ?? []), ...(movers.data?.topLosers ?? [])],
    [movers.data],
  );

  const reg = describeRegime(regime.data ?? null, prevRegime);
  const strength = rankSectorStrength(sectorData);
  const riskTone = deriveRiskTone(strength.greenRatio, cryptoData?.marketCapChange24h);
  const flow = interpretCryptoParticipation(cryptoData);
  const eventClock = summarizeEventClock(calendar.data?.events ?? []);

  // Cross-asset: crypto total cap vs. equity sector breadth (association only).
  const meanSectorChange = sectorData.length
    ? sectorData.reduce((s, x) => s + (x.changePercent ?? 0), 0) / sectorData.length
    : undefined;
  const crossReadings = [
    describeCrossAsset({
      a: { label: 'Crypto (total cap)', changePct: cryptoData?.marketCapChange24h },
      b: { label: 'Equity sectors (avg)', changePct: meanSectorChange },
      baseline: 'positive',
      freshness: 'delayed',
    }),
  ];

  // BTC leverage/participation state from derivatives (price + funding available;
  // open-interest change and liquidations refine it in the Crypto tools).
  const btcLeverage = derivatives.data
    ? classifyLeverageState({
        priceChangePct: derivatives.data.coin.change24h,
        fundingRate: derivatives.data.aggregatedFunding.fundingRatePct,
        freshness: 'delayed',
      })
    : null;

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
    (calendar.data?.events?.length ?? 0) > 0,
  ].filter(Boolean).length;
  const evidence = assessEvidenceQuality({
    availableFactors,
    totalFactors: 5,
    freshness: reg.stale ? 'stale' : availableFactors >= 4 ? 'live' : 'delayed',
    missing: [
      !sectorData.length ? 'sectors' : null,
      !cryptoData ? 'crypto' : null,
      !moverList.length ? 'movers' : null,
    ].filter(Boolean) as string[],
  });

  const anyLoading = regime.loading || sectors.loading || crypto.loading || movers.loading;

  return (
    <div className="space-y-3">
      <PageHero
        ariaLabel="Command Center header"
        eyebrow="Market intelligence"
        badges={[
          { label: `Regime ${reg.regimeLabel}` },
          { label: `Evidence ${evidence.level}` },
          ...(reg.changed ? [{ label: 'Regime changed' }] : []),
          ...(anyLoading ? [{ label: 'Updating…' }] : []),
        ]}
        title="Command Center."
        subtitle="Understand the market environment in ~30 seconds: regime, risk tone, where strength and weakness sit, crypto participation, and the events ahead. Educational market intelligence — not personalised financial advice."
        actions={[
          { label: 'Open Scanner', variant: 'primary', href: '/tools/scanner' },
          { label: 'Open Golden Egg', variant: 'secondary', href: '/tools/golden-egg' },
          { label: 'Open Markets', variant: 'ghost', href: '/tools/explorer' },
        ]}
      />

      {/* LAYER 1 — MARKET REGIME (dominant) */}
      <Card className="p-4" style={{ borderColor: stanceColor(reg.stance), borderWidth: 1 }}>
        <SectionTitle n="01" title="Market Regime" hint={reg.stale ? 'contains stale inputs' : undefined} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-2xl font-black" style={{ color: stanceColor(reg.stance) }}>{reg.regimeLabel}</div>
          <Badge label={reg.riskLabel} color="var(--msp-text-muted)" small />
          {reg.changed && reg.previousLabel ? <Badge label={`Was: ${reg.previousLabel}`} color="var(--msp-warn)" small /> : null}
          {reg.stale ? <Badge label="Stale inputs" color="var(--msp-bear)" small /> : <Badge label="Current" color="var(--msp-bull)" small />}
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-300">{reg.summary}</p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {/* LAYER 2 — RISK TONE / DRIVERS */}
        <Card className="p-4">
          <SectionTitle n="02" title="Risk Tone" hint="breadth + crypto participation" />
          <div className="text-lg font-black" style={{ color: toneColor(riskTone.tone) }}>{riskTone.label}</div>
          <p className="mt-1 text-sm text-slate-300">{riskTone.note}</p>
          <div className="mt-2 text-xs text-slate-500">
            Sector breadth: {(strength.greenRatio * 100).toFixed(0)}% positive ({strength.total} sampled).
            {typeof cryptoData?.marketCapChange24h === 'number'
              ? ` Crypto cap ${cryptoData.marketCapChange24h >= 0 ? '+' : ''}${cryptoData.marketCapChange24h.toFixed(1)}% (24h).`
              : ' Crypto participation unavailable.'}
          </div>
          <p className="mt-2 text-[11px] italic text-slate-500">Cross-asset relationships are described as associations, not causation. Delayed data is labelled where applicable.</p>
        </Card>

        {/* LAYER 4 — CRYPTO PARTICIPATION */}
        <Card className="p-4">
          <SectionTitle n="03" title="Crypto Participation" />
          <div className="text-lg font-black" style={{ color: stanceColor(flow.stance) }}>{flow.label}</div>
          <p className="mt-1 text-sm text-slate-300">{flow.note}</p>
          {btcLeverage ? (
            <div className="mt-3">
              <LeverageStatePanel assessment={btcLeverage} symbol="BTC" />
            </div>
          ) : (
            <p className="mt-2 text-[11px] italic text-slate-500">A deeper leverage/positioning read (funding, open interest, liquidations) is available in the Crypto Command Center.</p>
          )}
        </Card>
      </div>

      {/* MARKET DRIVERS — cross-asset relationships (association, not causation) */}
      <Card className="p-4">
        <SectionTitle n="02b" title="Market Drivers" hint="association, not causation" />
        <CrossAssetPanel readings={crossReadings} />
      </Card>

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
          ) : <p className="text-sm text-slate-500">Sector data unavailable.</p>}
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
          ) : <p className="text-sm text-slate-500">Sector data unavailable.</p>}
        </Card>
      </div>

      {/* LAYER 6 — RISK / EVENT CLOCK */}
      <Card className="p-4">
        <SectionTitle n="06" title="Risk / Event Clock" hint="scheduled events — outcomes not predicted" />
        {eventClock.length ? (
          <ul className="divide-y divide-white/5">
            {eventClock.map((e, i) => (
              <li key={`${e.event}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-slate-200">{e.event}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                  <span>{e.market}</span>
                  <span>{e.when}</span>
                  <Badge label={e.importance.toUpperCase()} small color={e.importance === 'high' ? 'var(--msp-bear)' : e.importance === 'medium' ? 'var(--msp-warn)' : 'var(--msp-flat)'} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">No scheduled events available.</p>}
      </Card>

      {/* LAYER 7 — AREAS DESERVING RESEARCH (Building / Early engine) */}
      <Card className="p-4">
        <SectionTitle n="07" title="Areas Deserving Further Research" hint="developing activity — not trade instructions" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-500">Equities — building / expanding</div>
            <BuildingInterestPanel items={buildingEquity} emptyText="No developing equity activity in the current mover sample." />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-500">Crypto — building / expanding</div>
            <BuildingInterestPanel items={buildingCrypto} emptyText="No developing crypto activity in the current mover sample." />
          </div>
        </div>
        <p className="mt-2 text-[11px] italic text-slate-500">Volume is measured relative to today&rsquo;s mover cohort (a transparent proxy when a per-symbol historical baseline is unavailable). Per-symbol volatility and open-interest inputs, where available, further refine these states in the dedicated tools.</p>
      </Card>

      {/* EVIDENCE QUALITY FOOTER */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Evidence quality</span>
          <Badge label={evidence.level} color={eqColor(evidence.level)} />
          <span className="text-xs text-slate-400">{Math.round(evidence.completeness * 100)}% of layers available</span>
        </div>
        <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
          {evidence.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </Card>

      <p className="px-1 text-[11px] text-slate-600">{EDUCATIONAL_DISCLOSURE}</p>
    </div>
  );
}
