/**
 * Private Jarvis — brief assembly. Composes the analyst layers into JarvisBrief.
 */
import { assessBreadth, assessConfidence, assessCrossAsset, assessFragility, assessLeadership, assessLiquidity, assessMacroRegime, buildCandidates, buildCases, buildCatalysts, buildWhatChanged, rankDrivers, type Inputs } from './analyst';
import type { Dataset, JarvisBrief } from './types';

const f1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(1));
const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const usable = (d: Dataset<unknown>) => d.data !== null && d.freshness !== 'MISSING';

function oneLiners(i: Inputs): Pick<JarvisBrief['marketState'], 'volatility' | 'usd' | 'rates' | 'crypto'> {
  const r = usable(i.regime) ? i.regime.data!.latest : null;
  const m = usable(i.macro) ? i.macro.data! : null;
  const stale = i.macro.freshness === 'STALE';
  const c = usable(i.crypto) ? i.crypto.data! : null;
  const volatility = [r ? `UPE ${r.volatility_state} (avg |move| ${f1(Number(r.components.avgAbsChangePercent))}%)` : null, m?.VIX ? `VIX ${f1(m.VIX.value)} @ ${m.VIX.observedOn}${stale ? ' [STALE]' : ''}` : null].filter(Boolean).join('; ') || 'INSUFFICIENT_DATA';
  const usd = m?.DXY ? `Broad dollar ${f1(m.DXY.value)} (${m.DXY.prior !== null ? (m.DXY.value > m.DXY.prior ? 'up' : 'down') + ' vs ' + f1(m.DXY.prior) : 'no prior'}) @ ${m.DXY.observedOn}${stale ? ' [STALE — not used in classification]' : ''}` : 'INSUFFICIENT_DATA (no USD series)';
  const rates = m?.US10Y ? `US10Y ${f1(m.US10Y.value)}%, US2Y ${f1(m.US2Y?.value ?? null)}%, 2s10s ${f1(m.YIELD_2S10S?.value ?? null)}bp, Fed funds ${f1(m.FED_FUNDS_RATE?.value ?? null)}% @ ${m.US10Y.observedOn}${stale ? ' [STALE — not used in classification]' : ''}` : 'INSUFFICIENT_DATA (no rates series)';
  const crypto = c ? `Total cap ${c.totalMarketCapUsd ? '$' + (c.totalMarketCapUsd / 1e12).toFixed(2) + 'T' : 'n/a'} ${pct(c.marketCapChange24hPct)} 24h; BTC dom ${f1(c.btcDominance)}%, ETH dom ${f1(c.ethDominance)}%; breadth ${f1(c.breadth24hPct)}% (24h) / ${f1(c.breadth7dPct)}% (7d); BTC funding ${c.funding.BTC ? c.funding.BTC.fundingRatePct.toFixed(3) + '% (' + c.funding.BTC.sentiment + ')' : 'n/a'}` : 'INSUFFICIENT_DATA';
  return { volatility, usd, rates, crypto };
}

function cryptoSection(i: Inputs): Record<string, string> {
  if (!usable(i.crypto)) return { status: 'INSUFFICIENT_DATA' };
  const c = i.crypto.data!;
  const oi = (s: string) => (c.openInterest[s] ? `$${(c.openInterest[s]!.totalOI / 1e9).toFixed(2)}B across ${c.openInterest[s]!.exchangeCount} venues` : 'n/a');
  const fr = (s: string) => (c.funding[s] ? `${c.funding[s]!.fundingRatePct.toFixed(4)}% (${c.funding[s]!.annualised.toFixed(1)}% ann., ${c.funding[s]!.sentiment})` : 'n/a');
  const db = usable(i.derivativesDb) ? i.derivativesDb.data! : [];
  const dbNote = db.length ? `Worker derivatives_snapshots last captured ${db[0].captured_at.slice(0, 10)} (${i.derivativesDb.freshness}); live CoinGecko used for funding/OI above.` : 'No worker derivatives snapshots.';
  return {
    BTC: `${pct(c.btc24h, 2)} 24h; funding ${fr('BTC')}; OI ${oi('BTC')}`,
    ETH: `${pct(c.eth24h, 2)} 24h; funding ${fr('ETH')}; OI ${oi('ETH')}`,
    SOL: `funding ${fr('SOL')}; OI ${oi('SOL')}`,
    alts: `median top-100 alt ${pct(c.medianAlt24h, 2)} 24h — ${c.medianAlt24h !== null && c.btc24h !== null ? (c.medianAlt24h > c.btc24h ? 'alts outperforming BTC' : 'BTC outperforming alts') : 'n/a'}`,
    dominance: `BTC ${f1(c.btcDominance)}%, ETH ${f1(c.ethDominance)}%`,
    breadth: `${f1(c.breadth24hPct)}% of top-100 up 24h, ${f1(c.breadth7dPct)}% up 7d`,
    liquidations: 'not ingested (exchange liquidation feeds are session-gated routes; no persisted table)',
    relativeStrength: `ETH − BTC 24h spread ${c.eth24h !== null && c.btc24h !== null ? pct(c.eth24h - c.btc24h, 2) : 'n/a'}`,
    derivativesProvenance: dbNote,
  };
}

function executiveSummary(b: Omit<JarvisBrief, 'executiveSummary'>, i: Inputs): string[] {
  const s = b.marketState;
  const out: string[] = [];
  out.push(`Research confidence is ${b.confidence.label} (${b.confidence.score}/100) with ${b.criticalCoverage.covered}/${b.criticalCoverage.total} critical datasets fresh${b.criticalCoverage.stale.length ? `; stale: ${b.criticalCoverage.stale.join(', ')}` : ''}. ${b.criticalCoverage.sufficient ? 'Coverage is sufficient for a qualified read.' : 'INSUFFICIENT DATA FOR HIGH-CONFIDENCE ASSESSMENT.'}`);
  out.push(`The macro regime reads ${s.regime.label}. ${s.regime.evidence[0] ?? ''} ${s.regime.conflicts[0] ?? ''}`.trim());
  out.push(`Liquidity is ${s.liquidity.label} and fragility is ${s.fragility.label}${s.fragility.score !== null ? ` at ${s.fragility.score.toFixed(1)}` : ''}. ${s.liquidity.evidence[0] ?? ''} ${s.fragility.evidence[1] ?? ''}`.trim());
  out.push(`Breadth is ${s.breadth.label}; cross-asset confirmation is ${s.crossAsset.label}. ${s.breadth.conflicts[0] ?? s.breadth.evidence[0] ?? ''} ${s.crossAsset.conflicts[0] ?? ''}`.trim());
  if (b.leadership.strongestSectors.length) out.push(`Persistent sector leadership sits in ${b.leadership.strongestSectors.map((x) => x.name).join(', ')}; ${b.leadership.weakestSectors.map((x) => x.name).join(', ')} lag on 5d/1m/3m ranks. Leadership is assessed on multi-period persistence, not a single session.`);
  const hp = b.candidates.filter((c) => c.researchStatus === 'HIGH_PRIORITY');
  out.push(hp.length ? `Scanner evidence concentrates in ${hp.slice(0, 5).map((c) => c.symbol).join(', ')} (HIGH_PRIORITY on CRCS composite with eligible capital mode); ${b.candidates.filter((c) => c.researchStatus === 'WATCH').length} names are WATCH.` : `No scanner candidates reach HIGH_PRIORITY under the current capital mode; ${b.candidates.length} names are on WATCH/IMPROVING.`);
  const next = b.catalysts.next24Hours[0] ?? b.catalysts.next72Hours[0];
  if (next) out.push(`Nearest material catalyst: ${next.event} (${next.country}) at ${next.timeLocal}, timing ${next.timingStatus}; most exposed ${next.assetsMostExposed.slice(0, 4).join('/')}. ${b.catalysts.next72Hours.filter((c) => c.importance === 'high').length} high-impact events inside 72h.`);
  out.push(`Base case: ${b.cases.base[1] ?? b.cases.base[0]} The view would strengthen if ${b.cases.whatWouldChangeTheView.strengthenIf[0]?.toLowerCase()} and weaken if ${b.cases.whatWouldChangeTheView.weakenIf[0]?.toLowerCase()}`);
  void i;
  return out;
}

export function buildBrief(i: Inputs): JarvisBrief {
  const regime = assessMacroRegime(i);
  const crossAsset = assessCrossAsset(i);
  const liquidity = assessLiquidity(i);
  const fragility = assessFragility(i);
  const breadth = assessBreadth(i);
  const marketState: JarvisBrief['marketState'] = { regime, crossAsset, liquidity, fragility, breadth, ...oneLiners(i) };
  const catalysts = buildCatalysts(i);
  const { candidates, deteriorating } = buildCandidates(i, catalysts);
  const leadership = assessLeadership(i);
  const whatChanged = buildWhatChanged(i, { regime, liquidity, fragility, breadth }, candidates, leadership.strongestSectors.concat(leadership.weakestSectors));
  const cases = buildCases(marketState, usable(i.crypto) ? i.crypto.data! : null);
  const conf = assessConfidence(i, marketState);
  const all: Dataset<unknown>[] = [i.regime, i.micro, i.quotes, i.indicators, i.sectors, i.scanner, i.crypto, i.derivativesDb, i.macro, i.intelligence, i.calendar, i.tickerCatalysts, ...i.unavailable];
  const datasets = all.map(({ data: _d, ...rest }) => rest);
  const dataHealth = {
    stale: all.filter((d) => d.freshness === 'STALE').map((d) => `${d.label} — last ${d.observedAt ?? 'n/a'} (${d.ageMinutes ?? '?'}m)`),
    missing: all.filter((d) => d.freshness === 'MISSING').map((d) => `${d.label} — ${d.warnings[0] ?? 'unavailable'}`),
    proxies: ['USD: FRED broad-dollar index used as DXY proxy', 'Equity indices: SPY/QQQ/IWM/DIA ETFs used as SPX/NQ/RTY/DJIA proxies', 'Gold/Silver: GLD/SLV ETFs', 'Liquidity Transmission upstream: UUP/CPER/GLD/SLV/SPY/QQQ proxies (engine-documented)'],
    conflicts: [...regime.conflicts, ...crossAsset.conflicts, ...breadth.conflicts, ...liquidity.conflicts].filter((c) => /disagree|differ|vs|conflict|CONFLICT/i.test(c)),
    warnings: all.flatMap((d) => d.warnings.map((w) => `${d.key}: ${w}`)),
  };
  const partial: Omit<JarvisBrief, 'executiveSummary'> = {
    generatedAt: new Date(i.nowMs).toISOString(),
    environmentNote: 'Mixed environment: PRODUCTION_DB = worker-populated production tables; PRODUCTION_LIVE = production HTTP intelligence endpoints; LOCAL_LIVE = same provider libraries executed from the dev machine (CoinGecko, Alpha Vantage); LIB = shared code path (calendar). Nothing here is fabricated; unavailable data is stated as unavailable.',
    confidence: { label: conf.label, score: conf.score, methodology: conf.methodology },
    criticalCoverage: conf.coverage,
    datasets,
    marketState,
    drivers: rankDrivers(i, marketState),
    leadership,
    crypto: cryptoSection(i),
    candidates,
    deteriorating,
    catalysts,
    whatChanged,
    cases,
    dataHealth,
  };
  return { ...partial, executiveSummary: executiveSummary(partial, i) };
}
