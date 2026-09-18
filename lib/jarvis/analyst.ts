/**
 * Private Jarvis — analyst layers. Pure functions over Dataset envelopes.
 * Never classifies from missing data; every label carries evidence[] and provenance[].
 */
import type { CalendarFeed } from '../macro/calendar/feed';
import { scoreRelevance } from '../macro/calendar/relevance';
import type { CalendarEvent } from '../macro/calendar/types';
import type {
  Assessment, BreadthLabel, CatalystItem, ConfidenceLabel, ConfirmationLabel, CrcsRow, CryptoSnapshot, Dataset, DerivativesDbRow,
  FragilityLabel, IndicatorRow, IntelligenceBundle, JarvisBrief, LiquidityLabel, MacroRegimeLabel, MacroSeriesPoint, MicroRegimeRow,
  QuoteRow, RegimeSnapshotRow, ResearchCandidate, ResearchStatus, SectorPerf, WhatChanged, BreadthAggregate,
} from './types';

export interface Inputs {
  nowMs: number;
  regime: Dataset<{ latest: RegimeSnapshotRow; previousDay: RegimeSnapshotRow | null; history: RegimeSnapshotRow[] }>;
  micro: Dataset<{ latest: MicroRegimeRow[]; previousDay: MicroRegimeRow[] }>;
  quotes: Dataset<{ key: Record<string, QuoteRow>; breadth: BreadthAggregate[]; equityAsOf: string | null; cryptoAsOf: string | null }>;
  indicators: Dataset<Record<string, IndicatorRow>>;
  sectors: Dataset<SectorPerf[]>;
  scanner: Dataset<{ latest: CrcsRow[]; previousDay: CrcsRow[]; batchAt: string; previousBatchAt: string | null }>;
  crypto: Dataset<CryptoSnapshot>;
  derivativesDb: Dataset<DerivativesDbRow[]>;
  macro: Dataset<Record<string, MacroSeriesPoint>>;
  intelligence: Dataset<IntelligenceBundle>;
  calendar: Dataset<CalendarFeed>;
  tickerCatalysts: Dataset<Record<string, Array<{ type: string; headline: string; at: string; severity: string }>>>;
  unavailable: Dataset<null>[];
  previous: JarvisBrief | null;
}

const usable = (d: Dataset<unknown>) => d.data !== null && d.freshness !== 'MISSING';
const fresh = (d: Dataset<unknown>) => usable(d) && d.freshness !== 'STALE';
const prov = (d: Dataset<unknown>) => `${d.label} [${d.freshness}${d.ageMinutes !== null ? `, ${d.ageMinutes}m` : ''}, ${d.environment}]`;
const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`);
const f1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(1));

function assess<L extends string>(label: L, evidence: string[], conflicts: string[], provenance: string[], confidence: number): Assessment<L> {
  return { label, evidence, conflicts, provenance, confidence: Math.max(0, Math.min(100, Math.round(confidence))) };
}

// ───────────────────────────── Layer 1: macro regime ─────────────────────────────

export function assessMacroRegime(i: Inputs): Assessment<MacroRegimeLabel> {
  const ev: string[] = [], cf: string[] = [], pv: string[] = [];
  let riskOff = 0, riskOn = 0, votes = 0;
  if (usable(i.regime)) {
    const r = i.regime.data!.latest;
    votes++; pv.push(prov(i.regime));
    if (r.regime === 'risk_off') { riskOff++; ev.push(`UPE global regime ${r.regime.toUpperCase()} (${r.snapshot_type}, confidence ${r.adaptive_confidence}) — breadth ${f1(Number(r.components.breadthPercent))}%, volatility ${r.volatility_state}, liquidity ${r.liquidity_state}, capital mode ${r.capital_mode}.`); }
    else if (r.regime === 'risk_on') { riskOn++; ev.push(`UPE global regime RISK_ON (${r.snapshot_type}, confidence ${r.adaptive_confidence}).`); }
    else ev.push(`UPE global regime NEUTRAL (${r.snapshot_type}).`);
  }
  const intel = usable(i.intelligence) ? i.intelligence.data! : null;
  if (intel?.fragility) {
    votes++; pv.push('Fragility engine [PRODUCTION_LIVE]');
    const v = String(intel.fragility.verdict ?? '');
    if (v === 'DEFENSIVE') { riskOff++; ev.push(`Fragility verdict DEFENSIVE (fragility ${intel.fragility.fragility}, health ${intel.fragility.health}).`); }
    else if (v === 'CONSTRUCTIVE' || v === 'OFFENSIVE') { riskOn++; ev.push(`Fragility verdict ${v}.`); }
    else ev.push(`Fragility verdict ${v || 'n/a'}.`);
  }
  if (intel?.liquidity?.headline) {
    votes++; pv.push('Liquidity Transmission [PRODUCTION_LIVE, PARTIAL UPSTREAM]');
    const h = intel.liquidity.headline;
    if (String(h.flow).includes('RISK-OFF')) { riskOff++; ev.push(`Liquidity Transmission flow "${h.flow}", master link ${h.masterLink}, clock ${h.clock} ${h.clockName}, cycle ${h.liquidityCycle}.`); }
    else if (String(h.flow).includes('RISK-ON')) { riskOn++; ev.push(`Liquidity Transmission flow "${h.flow}", master link ${h.masterLink}.`); }
    else ev.push(`Liquidity Transmission flow "${h.flow}".`);
  }
  if (intel?.globalM2) {
    votes++; pv.push('Global M2 [PRODUCTION_LIVE, PARTIAL]');
    const m = intel.globalM2;
    const slowing = m.accelerationState === 'SLOWING' || m.liquidityCycle === 'DECELERATION';
    if (slowing) { riskOff += 0.5; ev.push(`Global M2 ${m.accelerationState} / ${m.liquidityCycle} / turn ${m.turnState} (1m ${pct(m.oneMonthPct, 2)}, 3m ${pct(m.threeMonthPct, 2)}, YoY ${pct(m.yoyPct, 2)}); coverage ${f1(m.estimatedWeightedCoveragePercent)}% — interpretation ${m.interpretationEligible ? 'eligible' : 'NOT eligible'}.`); }
    else { riskOn += 0.5; ev.push(`Global M2 ${m.accelerationState} (YoY ${pct(m.yoyPct, 2)}).`); }
    if (!m.interpretationEligible) cf.push('Global M2 below the 95% weighted-coverage threshold; treated as half-weight evidence.');
  }
  if (usable(i.crypto)) {
    const c = i.crypto.data!;
    votes++; pv.push(prov(i.crypto));
    if ((c.marketCapChange24hPct ?? 0) > 1 && (c.breadth24hPct ?? 0) > 60) { riskOn++; ev.push(`Crypto total cap ${pct(c.marketCapChange24hPct)} 24h with ${f1(c.breadth24hPct)}% of top-100 advancing — risk appetite present in crypto.`); }
    else if ((c.marketCapChange24hPct ?? 0) < -1 && (c.breadth24hPct ?? 100) < 40) { riskOff++; ev.push(`Crypto total cap ${pct(c.marketCapChange24hPct)} 24h, breadth ${f1(c.breadth24hPct)}%.`); }
    else ev.push(`Crypto total cap ${pct(c.marketCapChange24hPct)} 24h, top-100 breadth ${f1(c.breadth24hPct)}% — not decisive.`);
  }
  if (usable(i.macro)) {
    const m = i.macro.data!;
    const vix = m.VIX;
    if (vix) { pv.push(prov(i.macro)); const note = i.macro.freshness === 'STALE' ? ' (STALE — FRED ingest last observed ' + vix.observedOn + '; not used for direction)' : ''; ev.push(`VIX ${f1(vix.value)} as of ${vix.observedOn}${note}.`); if (i.macro.freshness === 'STALE') cf.push('Rates/USD/VIX series are stale (FRED ingest stopped ~3 months ago); macro regime excludes them from the vote.'); }
  } else cf.push('No rates/USD/VIX series available.');

  if (votes < 2) return assess('INSUFFICIENT_DATA', ev, [...cf, 'Fewer than two independent regime sources available.'], pv, 20);
  const total = riskOff + riskOn;
  const label: MacroRegimeLabel = riskOff >= 3 && riskOn === 0 ? 'RISK_OFF' : riskOn >= 3 && riskOff === 0 ? 'RISK_ON' : riskOff > riskOn && riskOn > 0 ? 'TRANSITION' : riskOn > riskOff && riskOff > 0 ? 'TRANSITION' : total === 0 ? 'RANGE' : 'MIXED';
  if (riskOn > 0 && riskOff > 0) cf.push(`Sources disagree: ${riskOff} risk-off vs ${riskOn} risk-on votes.`);
  const agreement = total ? Math.max(riskOff, riskOn) / total : 0;
  return assess(label, ev, cf, pv, 40 + agreement * 40 + Math.min(votes, 5) * 3 - (i.macro.freshness === 'STALE' ? 8 : 0));
}

// ───────────────────────────── Layer 2: cross-asset confirmation ─────────────────────────────

export function assessCrossAsset(i: Inputs): Assessment<ConfirmationLabel> & { pairs: Array<{ pair: string; reading: string }> } {
  const pairs: Array<{ pair: string; reading: string }> = [];
  const ev: string[] = [], cf: string[] = [], pv: string[] = [];
  if (!usable(i.quotes)) return { ...assess('INSUFFICIENT_DATA', [], ['Quotes unavailable.'], [], 10), pairs };
  const k = i.quotes.data!.key; pv.push(prov(i.quotes));
  const c = usable(i.crypto) ? i.crypto.data! : null; if (c) pv.push(prov(i.crypto));
  const sign = (v: number | null | undefined) => (v === null || v === undefined ? 0 : v > 0.15 ? 1 : v < -0.15 ? -1 : 0);
  const spx = k.SPY?.change_percent ?? null, nq = k.QQQ?.change_percent ?? null, rty = k.IWM?.change_percent ?? null, gld = k.GLD?.change_percent ?? null, xle = k.XLE?.change_percent ?? null, xlf = k.XLF?.change_percent ?? null;
  const btc = c?.btc24h ?? k.BTC?.change_percent ?? null, eth = c?.eth24h ?? k.ETH?.change_percent ?? null;
  const eqDay = k.SPY?.latest_trading_day ?? '?';
  pairs.push({ pair: 'SPX (SPY) vs NQ (QQQ)', reading: `SPY ${pct(spx, 2)} / QQQ ${pct(nq, 2)} on ${eqDay}` + (sign(spx) === sign(nq) ? ' — aligned' : ' — divergent (growth leadership vs broad tape)') });
  pairs.push({ pair: 'Large vs small caps (SPY vs IWM)', reading: `IWM ${pct(rty, 2)}` + (rty !== null && spx !== null ? (rty < spx - 0.3 ? ' — small caps underperforming' : rty > spx + 0.3 ? ' — small caps outperforming' : ' — in line') : '') });
  pairs.push({ pair: 'Equities vs crypto', reading: `BTC ${pct(btc, 2)} / ETH ${pct(eth, 2)} (24h, live) vs SPY ${pct(spx, 2)} (last close)` + (sign(btc) !== 0 && sign(spx) !== 0 ? (sign(btc) === sign(spx) ? ' — confirming' : ' — DIVERGENCE (different measurement windows; crypto is 24h rolling)') : '') });
  pairs.push({ pair: 'Gold vs equities', reading: `GLD ${pct(gld, 2)}` + (gld !== null && spx !== null ? (sign(gld) === -sign(spx) && sign(gld) !== 0 ? ' — classic risk hedge behaviour' : sign(gld) === sign(spx) ? ' — same direction (liquidity-driven, not hedge)' : ' — flat') : '') });
  pairs.push({ pair: 'Energy / Financials (XLE, XLF)', reading: `XLE ${pct(xle, 2)} / XLF ${pct(xlf, 2)}` });
  const stale = i.macro.freshness === 'STALE';
  const m = usable(i.macro) ? i.macro.data! : null;
  pairs.push({ pair: 'Rates (US10Y / 2s10s)', reading: m?.US10Y ? `US10Y ${f1(m.US10Y.value)}% (${m.US10Y.observedOn}) 2s10s ${f1(m.YIELD_2S10S?.value ?? null)}bp` + (stale ? ' — STALE, not used' : '') : 'unavailable' });
  pairs.push({ pair: 'USD (FRED broad dollar, DXY proxy)', reading: m?.DXY ? `${f1(m.DXY.value)} (${m.DXY.observedOn})` + (stale ? ' — STALE, not used' : '') : 'unavailable' });
  pairs.push({ pair: 'Credit (HY OAS)', reading: m?.CREDIT_HY_OAS ? `${f1(m.CREDIT_HY_OAS.value)}% (${m.CREDIT_HY_OAS.observedOn})` + (stale ? ' — STALE, not used' : '') : 'unavailable (HYG/LQD not in universe)' });
  pairs.push({ pair: 'Oil', reading: 'unavailable — USO/WTI not in scan universe; commodities route is session-gated' });

  const eqSigns = [spx, nq, rty].map(sign).filter((s) => s !== 0);
  const cryptoSigns = [btc, eth].map(sign).filter((s) => s !== 0);
  const eqDir = eqSigns.length ? Math.sign(eqSigns.reduce((a, b) => a + b, 0)) : 0;
  const crDir = cryptoSigns.length ? Math.sign(cryptoSigns.reduce((a, b) => a + b, 0)) : 0;
  const eqInternal = new Set(eqSigns).size <= 1;
  if (eqSigns.length) ev.push(`Equity indices ${eqInternal ? 'internally aligned' : 'internally mixed'}: SPY ${pct(spx, 2)}, QQQ ${pct(nq, 2)}, IWM ${pct(rty, 2)}.`);
  if (cryptoSigns.length) ev.push(`Crypto majors ${crDir > 0 ? 'positive' : crDir < 0 ? 'negative' : 'flat'} over 24h (BTC ${pct(btc, 2)}, ETH ${pct(eth, 2)}).`);
  if (gld !== null) ev.push(`Gold ${pct(gld, 2)}.`);
  cf.push('Rates, USD and credit confirmation cannot be assessed: FRED series stale; HYG/LQD/TLT/USO absent from the universe.');
  let label: ConfirmationLabel;
  const legs = [eqDir, crDir].filter((d) => d !== 0);
  if (legs.length < 2) label = 'INSUFFICIENT_DATA';
  else if (eqDir === crDir && eqInternal) label = 'CONFIRMED';
  else if (eqDir === crDir) label = 'PARTIAL_CONFIRMATION';
  else if (eqInternal) label = 'DIVERGENCE';
  else label = 'CONFLICTED';
  if (label === 'DIVERGENCE' || label === 'CONFLICTED') cf.push('Equities (last close) and crypto (rolling 24h) point in different directions — measurement windows overlap only partially.');
  return { ...assess(label, ev, cf, pv, label === 'INSUFFICIENT_DATA' ? 20 : 45 + (label === 'CONFIRMED' ? 20 : 0) - 10), pairs };
}

// ───────────────────────────── Layer 3: liquidity ─────────────────────────────

export function assessLiquidity(i: Inputs): Assessment<LiquidityLabel> {
  const ev: string[] = [], cf: string[] = [], pv: string[] = [];
  let score = 0, n = 0;
  const intel = usable(i.intelligence) ? i.intelligence.data! : null;
  if (intel?.globalM2) {
    const m = intel.globalM2; n++; pv.push('Global M2 [PRODUCTION_LIVE]');
    const w = m.interpretationEligible ? 1 : 0.5;
    if (m.accelerationState === 'SLOWING') { score -= 1 * w; ev.push(`Global M2 total $${(Number(m.totalUsd) / 1e12).toFixed(1)}T, 1m ${pct(m.oneMonthPct, 2)}, 3m ann. ${pct(m.threeMonthAnnualizedPct, 2)}, YoY ${pct(m.yoyPct, 2)} — acceleration SLOWING, cycle ${m.liquidityCycle}, turn ${m.turnState}.`); }
    else if (m.accelerationState === 'ACCELERATING') { score += 1 * w; ev.push(`Global M2 accelerating (YoY ${pct(m.yoyPct, 2)}).`); }
    else ev.push(`Global M2 ${m.accelerationState} (YoY ${pct(m.yoyPct, 2)}).`);
    if (!m.interpretationEligible) cf.push(`M2 coverage ${f1(m.estimatedWeightedCoveragePercent)}% (${m.validBlocCount}/${m.validBlocCount + m.missingBlocCount} blocs) — half weight.`);
  }
  if (intel?.liquidity?.headline) {
    const h = intel.liquidity.headline; n++; pv.push('Liquidity Transmission [PRODUCTION_LIVE]');
    const ml = Number(h.masterLink);
    if (ml < 45) { score -= 1; ev.push(`Liquidity Transmission master link ${ml} (validated ${h.validated}, downstream ${h.downstream}); flow ${h.flow}; clock ${h.clock} ${h.clockName}; risk–liquidity gap ${h.riskLiquidityGap}.`); }
    else if (ml > 55) { score += 1; ev.push(`Liquidity Transmission master link ${ml}; flow ${h.flow}.`); }
    else ev.push(`Liquidity Transmission master link ${ml} — neutral zone.`);
    if (h.stage8Active) cf.push('Stage-8 warning active.');
  }
  if (usable(i.regime)) {
    const r = i.regime.data!.latest; n++; pv.push(prov(i.regime));
    if (r.liquidity_state === 'contracting') { score -= 1; ev.push(`UPE equity liquidity state CONTRACTING (median volume ${Number(r.components.medianVolume ?? 0).toLocaleString()}).`); }
    else if (r.liquidity_state === 'expanding') { score += 1; ev.push('UPE equity liquidity state EXPANDING.'); }
    else ev.push(`UPE equity liquidity state ${r.liquidity_state}.`);
  }
  if (usable(i.crypto)) {
    const c = i.crypto.data!; n++; pv.push(prov(i.crypto));
    if ((c.breadth24hPct ?? 0) >= 65 && (c.marketCapChange24hPct ?? 0) > 0) { score += 0.5; ev.push(`Crypto participation constructive: ${f1(c.breadth24hPct)}% of top-100 up 24h, total cap ${pct(c.marketCapChange24hPct)}.`); }
    else if ((c.breadth24hPct ?? 100) <= 35) { score -= 0.5; ev.push(`Crypto participation weak: ${f1(c.breadth24hPct)}% up.`); }
    else ev.push(`Crypto participation mixed (${f1(c.breadth24hPct)}% up 24h).`);
  }
  if (i.macro.freshness === 'STALE' || !usable(i.macro)) cf.push('Rates and USD legs of the liquidity read are unavailable (FRED series stale) — classification leans on M2, Transmission engine and volume state.');
  if (n < 2) return assess('INSUFFICIENT_DATA', ev, cf, pv, 15);
  const label: LiquidityLabel = score <= -2.5 ? 'STRONGLY_DETERIORATING' : score <= -1 ? 'DETERIORATING' : score >= 2.5 ? 'STRONGLY_IMPROVING' : score >= 1 ? 'IMPROVING' : 'NEUTRAL';
  return assess(label, ev, cf, pv, 40 + Math.min(Math.abs(score), 3) * 12 + n * 4 - cf.length * 4);
}

// ───────────────────────────── Layer 4: fragility ─────────────────────────────

export function assessFragility(i: Inputs): Assessment<FragilityLabel> & { score: number | null; components: Array<{ label: string; value: number; semantic: string }> } {
  const intel = usable(i.intelligence) ? i.intelligence.data! : null;
  const f = intel?.fragility;
  if (!f) return { ...assess('INSUFFICIENT_DATA', [], ['Fragility engine unavailable.'], [], 0), score: null, components: [] };
  const score = Number(f.fragility);
  const comps: Array<{ label: string; value: number; semantic: string }> = (f.components ?? []).map((c: any) => ({ label: c.label, value: Number(c.value), semantic: c.semantic }));
  const weak = comps.filter((c) => c.semantic === 'negative' || c.semantic === 'warning').map((c) => `${c.label} ${f1(c.value)}`);
  const ev = [`Fragility ${f1(score)}, health ${f.health}, transition ${f.transition}, divergence ${f.divergence}, rotation ${f.rotation}, verdict ${f.verdict}.`, `Components under pressure: ${weak.join(', ') || 'none'}.`];
  const prevScore = i.previous?.marketState.fragility.score ?? null;
  let label: FragilityLabel;
  const cf: string[] = [];
  if (prevScore !== null && Number.isFinite(prevScore)) {
    const d = score - prevScore;
    ev.push(`Change vs previous Jarvis snapshot: ${d > 0 ? '+' : ''}${d.toFixed(2)}.`);
    label = score >= 60 ? 'ELEVATED' : d > 1.5 ? 'RISING' : d < -1.5 ? 'FALLING' : 'STABLE';
  } else {
    cf.push('No prior Jarvis snapshot — direction uses the engine\'s own transition/divergence reads, not a stored delta.');
    label = score >= 60 ? 'ELEVATED' : Number(f.transition) >= 60 ? 'RISING' : 'STABLE';
  }
  return { ...assess(label, ev, cf, ['Fragility engine [PRODUCTION_LIVE]'], 70 - cf.length * 10), score, components: comps };
}

// ───────────────────────────── Layer 5: breadth / participation ─────────────────────────────

export function assessBreadth(i: Inputs): Assessment<BreadthLabel> {
  const ev: string[] = [], cf: string[] = [], pv: string[] = [];
  let eqBreadth: number | null = null, crBreadth: number | null = null;
  if (usable(i.quotes)) {
    pv.push(prov(i.quotes));
    for (const b of i.quotes.data!.breadth) {
      if (b.assetClass === 'equity') eqBreadth = b.breadthPct; else crBreadth = b.breadthPct;
      ev.push(`${b.assetClass}: ${b.advancing} up / ${b.declining} down of ${b.total} (${f1(b.breadthPct)}% advancing, avg |move| ${f1(b.avgAbsChange)}%).`);
    }
  }
  if (usable(i.regime)) { const r = i.regime.data!.latest; pv.push(prov(i.regime)); ev.push(`UPE close breadth ${f1(Number(r.components.breadthPercent))}% (${r.components.advancingCount}/${r.components.equitiesCount}).`); }
  if (usable(i.sectors)) {
    const s = i.sectors.data!; pv.push(prov(i.sectors));
    const green1d = s.filter((x) => x.d1 > 0).length, green1m = s.filter((x) => x.m1 > 0).length;
    ev.push(`Sectors green: ${green1d}/11 (1d), ${green1m}/11 (1m).`);
  }
  if (usable(i.crypto)) { const c = i.crypto.data!; pv.push(prov(i.crypto)); ev.push(`Crypto top-100: ${f1(c.breadth24hPct)}% up 24h, ${f1(c.breadth7dPct)}% up 7d; median alt ${pct(c.medianAlt24h, 2)} vs BTC ${pct(c.btc24h, 2)}, ETH ${pct(c.eth24h, 2)} — ${c.medianAlt24h !== null && c.btc24h !== null ? (c.medianAlt24h > c.btc24h ? 'alts leading BTC' : 'BTC leading alts') : 'n/a'}.`); }
  if (usable(i.quotes)) { const k = i.quotes.data!.key; if (k.IWM && k.SPY) ev.push(`Small caps (IWM ${pct(k.IWM.change_percent, 2)}) vs SPY ${pct(k.SPY.change_percent, 2)}.`); }
  if (eqBreadth === null && crBreadth === null) return assess('INSUFFICIENT_DATA', ev, ['No breadth aggregates available.'], pv, 10);
  let label: BreadthLabel;
  if (eqBreadth !== null && crBreadth !== null && Math.abs(eqBreadth - crBreadth) >= 30) { label = 'CONFLICTED'; cf.push(`Equity breadth ${f1(eqBreadth)}% vs crypto breadth ${f1(crBreadth)}% — asset classes disagree.`); }
  else { const b = eqBreadth ?? crBreadth!; label = b >= 65 ? 'BROADENING' : b >= 50 ? 'HEALTHY' : b >= 40 ? 'NARROWING' : 'WEAK'; }
  cf.push('Equity breadth is measured on the 337-symbol scan universe at last close, not the full index.');
  return assess(label, ev, cf, pv, 55 + pv.length * 5 - (label === 'CONFLICTED' ? 10 : 0));
}

// ───────────────────────────── Layer 6: leadership ─────────────────────────────

export function assessLeadership(i: Inputs): JarvisBrief['leadership'] {
  const sectors = usable(i.sectors) ? [...i.sectors.data!].sort((a, b) => a.persistenceRank - b.persistenceRank) : [];
  const k = usable(i.quotes) ? i.quotes.data!.key : {};
  const c = usable(i.crypto) ? i.crypto.data! : null;
  const ind = usable(i.indicators) ? i.indicators.data! : {};
  const noteFor = (sym: string) => {
    const x = ind[sym]; const qq = k[sym];
    if (!x || !qq) return 'no indicator context';
    const parts: string[] = [];
    if (x.ema200 && qq.price) parts.push(`${qq.price > x.ema200 ? 'above' : 'below'} 200d (${(((qq.price - x.ema200) / x.ema200) * 100).toFixed(1)}%)`);
    if (x.adx14 !== null) parts.push(`ADX ${f1(x.adx14)}`);
    if (x.rsi14 !== null) parts.push(`RSI ${f1(x.rsi14)}`);
    if (x.roc12 !== null) parts.push(`ROC12 ${pct(x.roc12)}`);
    if (x.in_squeeze) parts.push('squeeze');
    return parts.join(', ');
  };
  const assetClasses = [['SPY', 'US large cap'], ['QQQ', 'US growth / NQ'], ['IWM', 'US small cap'], ['GLD', 'Gold (GLD)'], ['SLV', 'Silver (SLV)'], ['XLE', 'Energy'], ['XLF', 'Financials'], ['BTC', 'Bitcoin'], ['ETH', 'Ether']]
    .map(([sym, asset]) => ({ asset, change: sym === 'BTC' ? c?.btc24h ?? k.BTC?.change_percent ?? null : sym === 'ETH' ? c?.eth24h ?? k.ETH?.change_percent ?? null : k[sym]?.change_percent ?? null, note: noteFor(sym) }))
    .sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  const cats = (c?.categories ?? []).filter((x) => x.change24h !== null && (x.marketCap ?? 0) > 2e9).sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
  return { strongestSectors: sectors.slice(0, 3), weakestSectors: sectors.slice(-3).reverse(), assetClasses, strongestCryptoGroups: cats.slice(0, 5).map((x) => ({ name: x.name, change24h: x.change24h })), weakestCryptoGroups: cats.slice(-5).reverse().map((x) => ({ name: x.name, change24h: x.change24h })) };
}

// ───────────────────────────── Layer 7: scanner research candidates ─────────────────────────────

export function buildCandidates(i: Inputs, catalysts: JarvisBrief['catalysts']): { candidates: ResearchCandidate[]; deteriorating: string[] } {
  if (!usable(i.scanner)) return { candidates: [], deteriorating: ['Scanner universe unavailable — no candidates produced.'] };
  const { latest, previousDay } = i.scanner.data!;
  const ind = usable(i.indicators) ? i.indicators.data! : {};
  const k = usable(i.quotes) ? i.quotes.data!.key : {};
  const allQuotes = usable(i.quotes) ? i.quotes.data! : null;
  const tcat = usable(i.tickerCatalysts) ? i.tickerCatalysts.data! : {};
  const prevMap = new Map(previousDay.map((r) => [r.symbol, r]));
  const sorted = [...latest].sort((a, b) => b.crcs_final - a.crcs_final);
  const n = sorted.length;
  const highCountryEvents = catalysts.next72Hours.filter((e) => e.importance === 'high');
  const quoteFor = (sym: string) => k[sym] ?? null;
  const rows: ResearchCandidate[] = [];
  const deteriorating: string[] = [];
  sorted.forEach((r, idx) => {
    const prev = prevMap.get(r.symbol);
    const delta = prev ? r.crcs_final - prev.crcs_final : null;
    const x = ind[r.symbol];
    const qq = quoteFor(r.symbol);
    const why: string[] = [], conf: string[] = [], contra: string[] = [];
    why.push(`CRCS ${f1(r.crcs_final)} (confluence ${f1(r.confluence_score)}, RAR ${f1(r.rar_score)}), rank ${idx + 1}/${n}, cluster ${r.cluster}, eligibility ${r.global_eligibility}.`);
    if (delta !== null) (delta >= 0 ? conf : contra).push(`Composite ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs ~24h ago.`);
    let bias: ResearchCandidate['bias'] = 'neutral';
    if (x && qq) {
      const above200 = x.ema200 ? qq.price > x.ema200 : null;
      const above50 = x.ema50 ? qq.price > x.ema50 : null;
      const up = [above200, above50, (x.macd_hist ?? 0) > 0].filter((v) => v === true).length;
      const down = [above200, above50, (x.macd_hist ?? 0) > 0].filter((v) => v === false).length;
      bias = up >= 2 && down === 0 ? 'constructive' : down >= 2 && up === 0 ? 'deteriorating' : 'neutral';
      if (above200 !== null) (above200 ? conf : contra).push(`Price ${above200 ? 'above' : 'below'} 200d EMA (${(((qq.price - (x.ema200 as number)) / (x.ema200 as number)) * 100).toFixed(1)}%).`);
      if (x.adx14 !== null) (x.adx14 >= 20 ? conf : contra).push(`ADX ${f1(x.adx14)} (${x.adx14 >= 20 ? 'trending' : 'no trend'}).`);
      if (x.rsi14 !== null) { if (x.rsi14 > 75) contra.push(`RSI ${f1(x.rsi14)} — extended.`); else if (x.rsi14 < 30 && bias === 'constructive') contra.push(`RSI ${f1(x.rsi14)} — oversold against constructive structure.`); else conf.push(`RSI ${f1(x.rsi14)}.`); }
      if (x.in_squeeze) why.push('Volatility squeeze active (compression precedes expansion; direction unknown).');
      if (x.macd_hist !== null) (x.macd_hist > 0 ? conf : contra).push(`MACD histogram ${x.macd_hist > 0 ? 'positive' : 'negative'}.`);
    } else contra.push('No persisted daily indicators for this symbol — evidence limited to composite.');
    if (r.global_eligibility === 'blocked') contra.push('Global eligibility BLOCKED by UPE capital mode.');
    if (r.global_eligibility === 'conditional') contra.push('Eligibility CONDITIONAL under current capital mode.');
    const sym = r.symbol.replace(/-?USD$/i, '');
    const tickerEvents = tcat[r.symbol] ?? tcat[sym] ?? [];
    const cats = tickerEvents.map((e) => `${e.type}: ${e.headline} (${e.at.slice(0, 10)})`);
    const macroExposure = highCountryEvents.filter((e) => (r.asset_class === 'crypto' ? e.assetsMostExposed.some((a) => ['BTC', 'ETH'].includes(a)) : e.assetsMostExposed.some((a) => ['SPX', 'NQ', 'USD'].includes(a)))).slice(0, 2).map((e) => `${e.event} (${e.country}, ${e.timeLocal})`);
    cats.push(...macroExposure);
    const eventRisk: ResearchCandidate['eventRisk'] = tickerEvents.some((e) => e.severity === 'high' || e.type === 'EARNINGS') ? 'HIGH' : macroExposure.length ? 'MEDIUM' : usable(i.tickerCatalysts) ? 'LOW' : 'UNKNOWN';
    const dq = !x ? 'PARTIAL' : i.indicators.freshness === 'STALE' || i.scanner.freshness === 'STALE' ? 'STALE' : i.scanner.freshness;
    let status: ResearchStatus;
    if (r.global_eligibility === 'blocked' || !x) status = 'AVOID_LOW_QUALITY';
    else if (delta !== null && delta <= -5) status = 'DETERIORATING';
    else if (r.global_eligibility === 'eligible' && r.crcs_final >= 70 && bias !== 'deteriorating') status = 'HIGH_PRIORITY';
    else if (delta !== null && delta >= 5) status = 'IMPROVING';
    else status = 'WATCH';
    const confirmation = x?.bb_upper && bias !== 'deteriorating' ? `Daily close above upper Bollinger ${x.bb_upper.toFixed(2)} with ADX rising` : x?.bb_lower && bias === 'deteriorating' ? `Daily close below lower Bollinger ${x.bb_lower.toFixed(2)}` : null;
    const invalidation = x?.ema50 && bias !== 'deteriorating' ? `Daily close below 50d EMA ${x.ema50.toFixed(2)}` : x?.ema50 && bias === 'deteriorating' ? `Daily close back above 50d EMA ${x.ema50.toFixed(2)}` : null;
    const liq = r.cluster === 'micro_cap' ? 'thin (micro cap cluster)' : allQuotes && qq ? (qq.volume > 0 ? `volume ${qq.volume.toLocaleString()}` : 'volume n/a') : 'n/a';
    rows.push({ symbol: r.symbol, assetClass: r.asset_class, rank: idx + 1, composite: Math.round(r.crcs_final * 10) / 10, percentile: Math.round(((n - idx) / n) * 100), bias, confidence: Math.max(10, Math.min(90, Math.round(r.confluence_score * 0.6 + (x ? 20 : 0) + (r.global_eligibility === 'eligible' ? 10 : 0) - contra.length * 4))), whyInteresting: why, confirmingEvidence: conf, conflictingEvidence: contra, confirmationLevel: confirmation, invalidationLevel: invalidation, catalysts: cats, eventRisk, liquidityState: liq, dataQuality: dq, researchStatus: status });
    if (status === 'DETERIORATING' && idx < 60) deteriorating.push(`${r.symbol}: composite ${delta !== null && delta < 0 ? delta.toFixed(1) : ''} vs 24h ago (now ${f1(r.crcs_final)}).`);
  });
  const priority: Record<ResearchStatus, number> = { HIGH_PRIORITY: 0, IMPROVING: 1, WATCH: 2, DETERIORATING: 3, AVOID_LOW_QUALITY: 4 };
  const top = rows.filter((r) => r.researchStatus !== 'AVOID_LOW_QUALITY').sort((a, b) => priority[a.researchStatus] - priority[b.researchStatus] || b.composite - a.composite).slice(0, 10);
  // Weakest evidence areas: eligible-universe names with the largest composite declines.
  const declines = rows.filter((r) => r.conflictingEvidence.some((c) => c.startsWith('Composite -'))).sort((a, b) => Number(a.conflictingEvidence.find((c) => c.startsWith('Composite'))?.match(/-?\d+\.\d/)?.[0] ?? 0) - Number(b.conflictingEvidence.find((c) => c.startsWith('Composite'))?.match(/-?\d+\.\d/)?.[0] ?? 0)).slice(0, 8);
  return { candidates: top, deteriorating: deteriorating.length ? deteriorating.slice(0, 8) : declines.map((d) => `${d.symbol}: ${d.conflictingEvidence.find((c) => c.startsWith('Composite'))} now ${d.composite}.`) };
}

// ───────────────────────────── Layer 8: catalysts ─────────────────────────────

const CB_REASON: Record<string, string> = {
  JP: 'A change in Japanese policy rates or guidance alters carry-trade economics and global liquidity expectations.',
  US: 'Fed path repricing moves the discount rate for every risk asset; USD and front-end yields react first.',
  EU: 'ECB decisions reprice EUR and European duration; spillover to USD and global rates.',
  UK: 'BoE repricing moves GBP and gilts; secondary global effect.',
  AU: 'RBA repricing moves AUD, the liquid China/commodity proxy.',
  CA: 'BoC repricing moves CAD; tightly linked to US front end.',
  CN: 'PBoC/China data repricing moves AUD, industrial metals and EM risk.',
  NZ: 'RBNZ moves NZD; AUD sympathy.',
  CH: 'SNB moves CHF and EUR crosses.',
};

function toCatalyst(e: CalendarEvent): CatalystItem {
  const rel = scoreRelevance(e, ['NQ', 'SPX', 'USD', 'BTC', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'Gold']);
  const exposed = [...e.assetImpact.primary];
  if (e.countryCode === 'JP') for (const a of ['JPY', 'NQ', 'BTC', 'Gold']) if (!exposed.includes(a as any)) exposed.push(a as any);
  const why = e.category === 'central_bank' ? CB_REASON[e.countryCode] ?? 'Policy repricing.' : e.category === 'inflation' ? `Inflation surprise reprices ${e.currency} rate expectations (higher = hawkish).` : e.category === 'employment' ? `Labour data shifts growth and policy expectations for ${e.currency}.` : e.category === 'gdp' ? 'Growth surprise reprices policy path and cyclical leadership.' : `${e.category.replace('_', ' ')} print for ${e.country}.`;
  return { event: e.eventName + (e.referencePeriod ? ` (${e.referencePeriod})` : ''), country: e.country, timeUtc: e.releaseTimeUtc, timeLocal: e.releaseTimeLocal, importance: e.importance, assetsMostExposed: exposed, whyItMatters: why, currentMarketSensitivity: `relevance ${rel.score}/100 for equity/USD/crypto focus; ${e.consensus !== null ? `consensus ${e.display.consensus}, previous ${e.display.previous}` : 'no consensus available'}`, timingStatus: e.timingStatus, sourceAuthority: e.sourceAuthority };
}

export function buildCatalysts(i: Inputs): JarvisBrief['catalysts'] {
  if (!usable(i.calendar)) return { next24Hours: [], next72Hours: [], next7Days: [] };
  const events = i.calendar.data!.events.filter((e) => Date.parse(e.releaseTimeUtc) > i.nowMs && e.importance !== 'low');
  const within = (h: number) => events.filter((e) => Date.parse(e.releaseTimeUtc) <= i.nowMs + h * 3_600_000).map(toCatalyst);
  return { next24Hours: within(24), next72Hours: within(72), next7Days: within(24 * 7) };
}

// ───────────────────────────── Layer 9: what changed ─────────────────────────────

export function buildWhatChanged(i: Inputs, current: { regime: Assessment<MacroRegimeLabel>; liquidity: Assessment<LiquidityLabel>; fragility: Assessment<FragilityLabel> & { score: number | null }; breadth: Assessment<BreadthLabel> }, candidates: ResearchCandidate[], sectors: SectorPerf[]): WhatChanged {
  const out: WhatChanged = { basis: '', NEW_STRENGTH: [], NEW_WEAKNESS: [], REGIME_CHANGES: [], BREADTH_CHANGES: [], LIQUIDITY_CHANGES: [], FRAGILITY_CHANGES: [], SCANNER_ROTATION: [], SECTOR_ROTATION: [], CRYPTO_ROTATION: [], CATALYST_CHANGES: [] };
  const p = i.previous;
  if (p) {
    out.basis = `Previous Jarvis snapshot ${p.generatedAt}`;
    if (p.marketState.regime.label !== current.regime.label) out.REGIME_CHANGES.push(`Macro regime ${p.marketState.regime.label} → ${current.regime.label}.`);
    if (p.marketState.liquidity.label !== current.liquidity.label) out.LIQUIDITY_CHANGES.push(`Liquidity ${p.marketState.liquidity.label} → ${current.liquidity.label}.`);
    if (p.marketState.breadth.label !== current.breadth.label) out.BREADTH_CHANGES.push(`Breadth ${p.marketState.breadth.label} → ${current.breadth.label}.`);
    if (p.marketState.fragility.score !== null && current.fragility.score !== null) { const d = current.fragility.score - p.marketState.fragility.score; if (Math.abs(d) >= 1) out.FRAGILITY_CHANGES.push(`Fragility ${p.marketState.fragility.score.toFixed(1)} → ${current.fragility.score.toFixed(1)} (${d > 0 ? '+' : ''}${d.toFixed(1)}).`); }
    const prevSyms = new Map(p.candidates.map((c) => [c.symbol, c]));
    for (const c of candidates) { const pc = prevSyms.get(c.symbol); if (!pc) out.SCANNER_ROTATION.push(`${c.symbol} entered top research (${c.researchStatus}, composite ${c.composite}).`); else if (pc.researchStatus !== c.researchStatus) out.SCANNER_ROTATION.push(`${c.symbol} ${pc.researchStatus} → ${c.researchStatus} (composite ${pc.composite} → ${c.composite}).`); }
    for (const pc of p.candidates) if (!candidates.find((c) => c.symbol === pc.symbol)) out.SCANNER_ROTATION.push(`${pc.symbol} dropped from top research (was ${pc.researchStatus}).`);
    const prevStrong = p.leadership.strongestSectors.map((s) => s.name);
    for (const s of sectors.slice(0, 3)) if (!prevStrong.includes(s.name)) out.SECTOR_ROTATION.push(`${s.name} entered top-3 persistence leadership.`);
    for (const c of p.catalysts.next24Hours) if (!i.calendar.data?.events.some((e) => e.eventName === c.event.split(' (')[0] && e.country === c.country)) out.CATALYST_CHANGES.push(`${c.event} (${c.country}) has passed.`);
  } else {
    out.basis = 'No previous Jarvis snapshot on disk — deltas below use the nearest ≥23h-old production worker snapshots (UPE regime, micro regime, CRCS batch) as the comparison basis.';
  }
  // DB-derived deltas (always available when the worker tables have history).
  if (usable(i.regime) && i.regime.data!.previousDay) {
    const a = i.regime.data!.previousDay, b = i.regime.data!.latest;
    if (a.regime !== b.regime) out.REGIME_CHANGES.push(`UPE regime ${a.regime} → ${b.regime} (${a.created_at.slice(0, 16)}Z → ${b.created_at.slice(0, 16)}Z).`);
    if (a.volatility_state !== b.volatility_state) out.REGIME_CHANGES.push(`UPE volatility ${a.volatility_state} → ${b.volatility_state}.`);
    if (a.liquidity_state !== b.liquidity_state) out.LIQUIDITY_CHANGES.push(`UPE liquidity ${a.liquidity_state} → ${b.liquidity_state}.`);
    const ba = Number(a.components.breadthPercent), bb = Number(b.components.breadthPercent);
    if (Number.isFinite(ba) && Number.isFinite(bb) && Math.abs(bb - ba) >= 3) out.BREADTH_CHANGES.push(`UPE equity breadth ${ba.toFixed(1)}% → ${bb.toFixed(1)}% (${bb - ba > 0 ? '+' : ''}${(bb - ba).toFixed(1)}pp).`);
  }
  if (usable(i.micro) && i.micro.data!.previousDay.length) {
    for (const cur of i.micro.data!.latest) { const prv = i.micro.data!.previousDay.find((x) => x.asset_class === cur.asset_class); if (!prv) continue; if (prv.micro_state !== cur.micro_state) (cur.asset_class === 'crypto' ? out.CRYPTO_ROTATION : out.BREADTH_CHANGES).push(`${cur.asset_class} micro state ${prv.micro_state} → ${cur.micro_state}.`); if (prv.breadthPercent !== null && cur.breadthPercent !== null && Math.abs(cur.breadthPercent - prv.breadthPercent) >= 5) (cur.asset_class === 'crypto' ? out.CRYPTO_ROTATION : out.BREADTH_CHANGES).push(`${cur.asset_class} hourly breadth ${prv.breadthPercent.toFixed(1)}% → ${cur.breadthPercent.toFixed(1)}%.`); }
  }
  if (usable(i.scanner) && i.scanner.data!.previousDay.length) {
    const { latest, previousDay } = i.scanner.data!;
    const topNow = [...latest].sort((a, b) => b.crcs_final - a.crcs_final).slice(0, 15).map((r) => r.symbol);
    const topPrev = [...previousDay].sort((a, b) => b.crcs_final - a.crcs_final).slice(0, 15).map((r) => r.symbol);
    const entered = topNow.filter((s) => !topPrev.includes(s)), left = topPrev.filter((s) => !topNow.includes(s));
    if (entered.length) out.NEW_STRENGTH.push(`Entered CRCS top-15: ${entered.join(', ')}.`);
    if (left.length) out.NEW_WEAKNESS.push(`Left CRCS top-15: ${left.join(', ')}.`);
    const prevMap = new Map(previousDay.map((r) => [r.symbol, r.crcs_final]));
    const moves = latest.map((r) => ({ s: r.symbol, d: prevMap.has(r.symbol) ? r.crcs_final - (prevMap.get(r.symbol) as number) : 0 })).filter((m) => Math.abs(m.d) >= 8).sort((a, b) => b.d - a.d);
    for (const m of moves.slice(0, 4)) out.NEW_STRENGTH.push(`${m.s} composite +${m.d.toFixed(1)} in ~24h.`);
    for (const m of moves.slice(-4).filter((m) => m.d < 0)) out.NEW_WEAKNESS.push(`${m.s} composite ${m.d.toFixed(1)} in ~24h.`);
    if (!entered.length && !left.length) out.SCANNER_ROTATION.push('CRCS top-15 membership unchanged vs ~24h ago.');
  }
  if (usable(i.crypto) && usable(i.derivativesDb)) {
    const c = i.crypto.data!; for (const d of i.derivativesDb.data!) { const live = c.funding[d.symbol]; if (live && Math.sign(live.fundingRatePct) !== Math.sign(d.funding_rate_pct)) out.CRYPTO_ROTATION.push(`${d.symbol} funding sign flipped vs last worker snapshot (${d.captured_at.slice(0, 10)}): ${d.funding_rate_pct.toFixed(3)}% → ${live.fundingRatePct.toFixed(3)}%.`); }
  }
  return out;
}

// ───────────────────────────── Layer 10: contrarian review ─────────────────────────────

export function buildCases(state: JarvisBrief['marketState'], crypto: CryptoSnapshot | null): JarvisBrief['cases'] {
  const bull = ['Equity breadth recovers above 50% advancing on the scan universe and holds for consecutive closes.', 'Fragility credit and breadth components move out of negative/warning.', 'Liquidity Transmission master link recovers above 50 with flow no longer LEAN RISK-OFF.', 'Global M2 acceleration state turns from SLOWING to STABLE/ACCELERATING with coverage ≥95%.', 'QQQ and IWM confirm SPY direction on the same session (no growth-only leadership).'];
  const bear = ['Fragility rises through 60 (ELEVATED) with Vol component joining Credit in negative.', 'Crypto breadth collapses below 40% while BTC dominance rises (defensive rotation inside crypto).', 'Liquidity Transmission stage-8 activates or clock advances to 8/8.', 'UPE regime stays risk_off with capital mode defensive across both open and close snapshots for 3+ sessions.', 'Sector persistence leadership narrows to defensives (Utilities/Staples/Healthcare).'];
  const base = [`Regime ${state.regime.label}; liquidity ${state.liquidity.label}; fragility ${state.fragility.label}; breadth ${state.breadth.label}; cross-asset ${state.crossAsset.label}.`, 'Equities are defensive on the worker regime while crypto participation is constructive — the two asset classes are not telling the same story, so the base case is a fragmented tape rather than a clean risk-on or risk-off.'];
  if (crypto?.btcDominance !== null && crypto?.btcDominance !== undefined) base.push(`BTC dominance ${crypto.btcDominance.toFixed(1)}% frames crypto leadership.`);
  return { bull, bear, base, whatWouldChangeTheView: { strengthenIf: bull.slice(0, 4), weakenIf: bear.slice(0, 4) } };
}

// ───────────────────────────── Confidence + coverage ─────────────────────────────

export function assessConfidence(i: Inputs, state: JarvisBrief['marketState']): JarvisBrief['confidence'] & { coverage: JarvisBrief['criticalCoverage'] } {
  const all: Dataset<unknown>[] = [i.regime, i.quotes, i.scanner, i.crypto, i.macro, i.intelligence, i.calendar, i.sectors, i.indicators, i.micro, i.derivativesDb, i.tickerCatalysts];
  const critical = all.filter((d) => d.critical);
  const covered = critical.filter((d) => usable(d) && d.freshness !== 'STALE');
  const missingC = critical.filter((d) => !usable(d)).map((d) => d.label);
  const staleC = critical.filter((d) => usable(d) && d.freshness === 'STALE').map((d) => d.label);
  const pctCov = Math.round((covered.length / critical.length) * 100);
  const methodology: string[] = [];
  let score = 0;
  const freshnessScore = (covered.length / critical.length) * 35; score += freshnessScore; methodology.push(`Critical freshness/coverage: ${covered.length}/${critical.length} critical datasets usable and not stale → ${freshnessScore.toFixed(0)}/35.`);
  const layers = [state.regime, state.liquidity, state.fragility, state.breadth, state.crossAsset];
  const decided = layers.filter((l) => l.label !== 'INSUFFICIENT_DATA');
  const layerScore = (decided.length / layers.length) * 20; score += layerScore; methodology.push(`Layers classified (not INSUFFICIENT_DATA): ${decided.length}/${layers.length} → ${layerScore.toFixed(0)}/20.`);
  const conflicts = layers.reduce((s, l) => s + l.conflicts.length, 0);
  const agreementScore = Math.max(0, 25 - conflicts * 3); score += agreementScore; methodology.push(`Cross-engine agreement: ${conflicts} recorded conflicts → ${agreementScore}/25.`);
  const avgLayerConf = decided.length ? decided.reduce((s, l) => s + l.confidence, 0) / decided.length : 0;
  const layerConfScore = (avgLayerConf / 100) * 20; score += layerConfScore; methodology.push(`Mean layer confidence ${avgLayerConf.toFixed(0)} → ${layerConfScore.toFixed(0)}/20.`);
  const sufficient = pctCov >= 60 && missingC.length <= 1;
  const rounded = Math.round(score);
  const label: ConfidenceLabel = !sufficient ? 'INSUFFICIENT_DATA' : rounded >= 80 ? 'VERY_HIGH' : rounded >= 65 ? 'HIGH' : rounded >= 45 ? 'MODERATE' : 'LOW';
  if (!sufficient) methodology.push('INSUFFICIENT DATA FOR HIGH-CONFIDENCE ASSESSMENT: critical coverage below 60% or more than one critical dataset missing.');
  return { label, score: rounded, methodology, coverage: { covered: covered.length, total: critical.length, pct: pctCov, sufficient, missing: missingC, stale: staleC } };
}

// ───────────────────────────── Drivers + summary ─────────────────────────────

export function rankDrivers(i: Inputs, state: JarvisBrief['marketState']): JarvisBrief['drivers'] {
  const d: Array<{ driver: string; evidence: string; weight: number }> = [];
  const intel = usable(i.intelligence) ? i.intelligence.data! : null;
  if (usable(i.regime)) { const r = i.regime.data!.latest; d.push({ driver: `Equity internals: ${r.regime.replace('_', '-')} regime with ${r.volatility_state} volatility and ${r.liquidity_state} liquidity`, evidence: `UPE close snapshot ${r.created_at.slice(0, 16)}Z, breadth ${f1(Number(r.components.breadthPercent))}%, avg |move| ${f1(Number(r.components.avgAbsChangePercent))}%`, weight: 5 }); }
  if (intel?.fragility) d.push({ driver: `Systemic fragility ${f1(Number(intel.fragility.fragility))} with credit the weakest component`, evidence: (intel.fragility.components ?? []).map((c: any) => `${c.label} ${Number(c.value).toFixed(0)}`).join(', '), weight: 4 });
  if (intel?.liquidity?.headline) d.push({ driver: `Liquidity transmission ${intel.liquidity.headline.flow} at clock ${intel.liquidity.headline.clock} (${intel.liquidity.headline.clockName})`, evidence: `master ${intel.liquidity.headline.masterLink}, validated ${intel.liquidity.headline.validated}, downstream ${intel.liquidity.headline.downstream}`, weight: 4 });
  if (intel?.globalM2) d.push({ driver: `Global M2 ${intel.globalM2.accelerationState} (${intel.globalM2.liquidityCycle})`, evidence: `YoY ${pct(intel.globalM2.yoyPct, 2)}, 3m ann. ${pct(intel.globalM2.threeMonthAnnualizedPct, 2)}, coverage ${f1(intel.globalM2.estimatedWeightedCoveragePercent)}%`, weight: 3 });
  if (usable(i.crypto)) { const c = i.crypto.data!; d.push({ driver: `Crypto participation ${(c.breadth24hPct ?? 0) >= 60 ? 'broad' : 'narrow'} (${f1(c.breadth24hPct)}% up) with total cap ${pct(c.marketCapChange24hPct)}`, evidence: `BTC ${pct(c.btc24h, 2)}, ETH ${pct(c.eth24h, 2)}, BTC dominance ${f1(c.btcDominance)}%, BTC funding ${c.funding.BTC ? c.funding.BTC.fundingRatePct.toFixed(3) + '%' : 'n/a'}`, weight: 3 }); }
  if (usable(i.sectors)) { const s = [...i.sectors.data!].sort((a, b) => a.persistenceRank - b.persistenceRank); d.push({ driver: `Sector persistence leadership: ${s.slice(0, 2).map((x) => x.name).join(', ')}; lagging: ${s.slice(-2).map((x) => x.name).join(', ')}`, evidence: s.slice(0, 2).map((x) => `${x.name} 1m ${pct(x.m1)} 3m ${pct(x.m3)}`).join('; '), weight: 2 }); }
  if (usable(i.calendar) && i.calendar.data!.nextMajorEvent) { const e = i.calendar.data!.nextMajorEvent; d.push({ driver: `Event risk: next high-impact catalyst ${e.eventName} (${e.country}) at ${e.releaseTimeLocal}`, evidence: `${e.timingStatus} timing, ${e.sourceAuthority} source`, weight: 2 }); }
  return d.sort((a, b) => b.weight - a.weight).map((x, idx) => ({ rank: idx + 1, driver: x.driver, evidence: x.evidence }));
}
