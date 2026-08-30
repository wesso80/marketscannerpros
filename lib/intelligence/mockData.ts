// Development fixtures for the Intelligence engines.
// These are the ONLY source of numbers the API currently serves. When the
// native Python/market-data engines are ready, swap these builders for real
// engine outputs — the API contract and UI stay unchanged.

import type {
  EngineResult,
  MasterResult,
  EngineStatusRow,
  LiquidityResult,
  AuctionResult,
  PressureResult,
  LeadLagResult,
  FragilityResult,
} from './types';
import { computeMaster, type MasterEngineInput } from './engines/master';

function nowIso(): string {
  return new Date().toISOString();
}

// Approximate current readings supplied as development fixtures.
const FIXTURE = {
  macro: 72.44,
  fragilityRaw: 50.89,
  fragility: 75.45,
  leadLag: 50,
  pressureRaw: 3.85,
  pressure: 51.92,
  auctionRaw: -26.38,
  auction: 36.81,
  composite: 57,
  edge: 57,
  agreement: 67,
  context: 67,
  execution: 44,
  gap: 23,
};

export function buildEngines(timestamp: string): EngineResult[] {
  return [
    {
      engine: 'macro',
      label: 'Macro / Transmission',
      timestamp,
      rawValue: FIXTURE.macro,
      orientation: FIXTURE.macro,
      score: FIXTURE.macro,
      state: 'Strong Long',
      semantic: 'strong-positive',
      confidence: 0.74,
      trend: 'stable',
      gate: 'PASS',
      weightPct: 25,
      dirSupport: FIXTURE.macro,
      moduleDir: 'LONG',
      role: 'Regime / capital-flow foundation',
      status: 'MOCK',
      components: [
        { label: 'Validated risk-on', value: 71, state: 'strong-positive' },
        { label: 'Downstream risk', value: 79, state: 'strong-positive' },
        { label: 'Early-warning risk', value: 19, state: 'strong-positive', detail: 'Clear' },
      ],
    },
    {
      engine: 'fragility',
      label: 'Market Structure',
      timestamp,
      rawValue: FIXTURE.fragilityRaw,
      orientation: FIXTURE.fragility,
      score: FIXTURE.fragility,
      state: 'Strong Long',
      semantic: 'strong-positive',
      confidence: 0.7,
      trend: 'improving',
      gate: 'PASS',
      weightPct: 15,
      dirSupport: FIXTURE.fragility,
      moduleDir: 'LONG',
      role: 'Health / fragility / regime filter',
      status: 'MOCK',
      components: [
        { label: 'Health', value: 73, state: 'positive' },
        { label: 'Fragility', value: 28, state: 'positive', detail: 'Low' },
        { label: 'Transition risk', value: 32, state: 'positive' },
      ],
    },
    {
      engine: 'lead-lag',
      label: 'Cross-Asset Lead/Lag',
      timestamp,
      rawValue: 0,
      orientation: FIXTURE.leadLag,
      score: FIXTURE.leadLag,
      state: 'Neutral',
      semantic: 'neutral',
      confidence: 0.4,
      trend: 'none',
      gate: 'WAIT',
      weightPct: 15,
      dirSupport: FIXTURE.leadLag,
      moduleDir: 'NEUTRAL',
      role: 'Predictive cross-asset leadership',
      status: 'MOCK',
      components: [
        { label: 'True leader', value: 'None', state: 'neutral', detail: 'No qualified predictive lead' },
        { label: 'Reliability', value: '—', state: 'neutral' },
      ],
    },
    {
      engine: 'nq-pressure',
      label: 'NQ Pressure',
      timestamp,
      symbol: 'NQ1!',
      timeframe: '5m',
      rawValue: FIXTURE.pressureRaw,
      orientation: FIXTURE.pressure,
      score: FIXTURE.pressure,
      state: 'Neutral',
      semantic: 'neutral',
      confidence: 0.55,
      trend: 'improving',
      gate: 'WAIT',
      weightPct: 20,
      dirSupport: FIXTURE.pressure,
      moduleDir: 'NEUTRAL',
      role: 'Institutional / MTF session pressure',
      status: 'MOCK',
      components: [
        { label: 'Stack', value: '3/5 BULL', state: 'neutral' },
        { label: '5m core', value: 8, state: 'positive' },
        { label: '1h anchor', value: -6, state: 'warning' },
        { label: 'RVOL', value: '1.08x', state: 'neutral' },
      ],
    },
    {
      engine: 'auction',
      label: 'NQ Auction',
      timestamp,
      symbol: 'NQ1!',
      timeframe: '5m',
      rawValue: FIXTURE.auctionRaw,
      orientation: FIXTURE.auction,
      score: FIXTURE.auction,
      state: 'Short',
      semantic: 'negative',
      confidence: 0.52,
      trend: 'recovering',
      gate: 'WAIT',
      weightPct: 25,
      dirSupport: FIXTURE.auction,
      moduleDir: 'SHORT',
      role: 'Auction structure / entry confirmation',
      status: 'MOCK',
      components: [
        { label: 'Active level', value: 'PDL', state: 'warning' },
        { label: 'Stage', value: 'RETEST', state: 'warning' },
        { label: 'Acceptance', value: 41, state: 'warning' },
      ],
    },
  ];
}

const MASTER_BUCKETS: Record<string, { bucket: 'context' | 'execution'; gateRequired: number }> = {
  macro: { bucket: 'context', gateRequired: 58 },
  fragility: { bucket: 'context', gateRequired: 58 },
  'lead-lag': { bucket: 'context', gateRequired: 55 },
  'nq-pressure': { bucket: 'execution', gateRequired: 60 },
  auction: { bucket: 'execution', gateRequired: 62 },
};

// The Master page is now computed by the ported fusion engine
// (lib/intelligence/engines/master.ts). Engine readings remain mock; the fusion
// is real and parity-tested against TradingView.
export function getMasterResult(): MasterResult {
  const timestamp = nowIso();
  const source = buildEngines(timestamp);
  const inputs: MasterEngineInput[] = source.map((e) => {
    const meta = MASTER_BUCKETS[e.engine];
    return {
      key: e.engine,
      label: e.label,
      raw: e.rawValue ?? e.orientation,
      orientation: e.orientation,
      weight: e.weightPct ?? 0,
      bucket: meta.bucket,
      role: e.role ?? '',
      gateRequired: meta.gateRequired,
      status: e.status,
      symbol: e.symbol,
      timeframe: e.timeframe,
      confidence: e.confidence,
      trend: e.trend,
    };
  });

  const master = computeMaster(inputs, undefined, timestamp);
  const componentsByKey = new Map(source.map((e) => [e.engine, e.components] as const));
  master.engines = master.engines.map((e) => ({ ...e, components: componentsByKey.get(e.engine) }));
  return master;
}

export function getLiquidityResult(): LiquidityResult {
  const timestamp = nowIso();
  return {
    timestamp,
    flowState: 'RISK-ON',
    flowSemantic: 'strong-positive',
    clock: '7/8 ALT EXPANSION',
    cycle: 'LATE EXPANSION',
    validated: 71,
    downstream: 79,
    earlyWarning: 19,
    earlyWarningState: 'CLEAR',
    earlyWarningSemantic: 'strong-positive',
    globalM2: '$114.86T',
    m2_1m: '+0.30%',
    m2_3mAnn: '+9.94%',
    m2_yoy: '+8.63%',
    m2Accel: '-0.84pp',
    m2Coverage: '10/11',
    cryptoWindow: '+2-3M',
    stages: [
      { stage: 1, name: 'Liquidity Ignition', driver: 'Global M2', grade: 'CORE', gradeSemantic: 'neutral', confMonth: '0.3%', live20d: 'n/a', live5d: 'n/a', score: 75, state: 'CONFIRMED', semantic: 'strong-positive', role: 'Liquidity impulse starts the chain', next: 'Watch DXY for release' },
      { stage: 2, name: 'USD Release', driver: 'DXY', grade: 'A', gradeSemantic: 'strong-positive', confMonth: '-1.35%', live20d: '-0.84%', live5d: '0.29%', score: 63, state: 'SUPPORTIVE', semantic: 'positive', role: 'Validated A: weaker USD confirms easing conditions', next: 'Credit should confirm' },
      { stage: 3, name: 'Credit Easing', driver: 'HYG / LQD', grade: 'B', gradeSemantic: 'positive', confMonth: '-1.6%', live20d: '0.4%', live5d: '0.51%', score: 62, state: 'SUPPORTIVE', semantic: 'positive', role: 'Validated B: credit participates', next: 'Copper / global breadth should follow' },
      { stage: 4, name: 'Cyclical / Global Breadth', driver: 'Copper / EEM / VGK', grade: 'A', gradeSemantic: 'strong-positive', confMonth: '-0.21%', live20d: '3.17%', live5d: '1.21%', score: 73, state: 'CONFIRMED', semantic: 'strong-positive', role: 'Validated A: copper + global equities broaden', next: 'Watch US equity transmission' },
      { stage: 5, name: 'US Risk Transmission', driver: 'SPX / NDX', grade: 'C / CONTEXT', gradeSemantic: 'neutral', confMonth: '-3.37%', live20d: '4.7%', live5d: '1.32%', score: 65, state: 'SUPPORTIVE', semantic: 'positive', role: 'US equities receive transmission; contextual edge', next: 'Watch crypto majors' },
      { stage: 6, name: 'Crypto Majors', driver: 'BTC / ETH', grade: 'DOWNSTREAM', gradeSemantic: 'neutral', confMonth: '12.93%', live20d: '27.51%', live5d: '3.91%', score: 94, state: 'CONFIRMED', semantic: 'strong-positive', role: 'BTC / ETH receive flow; NOT direct validated M2 timing', next: 'Watch TOTAL2 breadth' },
      { stage: 7, name: 'Alt Expansion', driver: 'TOTAL2 vs BTC', grade: 'B EXPANSION', gradeSemantic: 'positive', confMonth: '4.49%', live20d: '20.37%', live5d: '2.37%', score: 90, state: 'CONFIRMED', semantic: 'strong-positive', role: 'Validated B expansion-only TOTAL2 delay channel', next: 'Monitor late-cycle divergence' },
      { stage: 8, name: 'Late-Cycle / Divergence', driver: 'Risk vs Validated Flow', grade: 'MODEL', gradeSemantic: 'neutral', confMonth: 'n/a', live20d: '+6.12 gap', live5d: 'n/a', score: 19, state: 'CLEAR', semantic: 'strong-positive', role: 'Early-warning risk: downstream stretch vs validated liquidity', next: 'Watch for reset / new cycle' },
    ],
    drivers: [
      { label: 'DXY (A)', detail: '-1.35% | -0.84% | 0.29%', score: 70, semantic: 'positive' },
      { label: 'Copper (A)', detail: '3.38% | 1.78% | 1.86%', score: 68, semantic: 'positive' },
      { label: 'EEM (A)', detail: '-6.31% | 6.32% | 1.49%', score: 60, semantic: 'positive' },
      { label: 'Europe (A)', detail: '2.32% | 1.42% | 0.29%', score: 62, semantic: 'positive' },
      { label: 'A Avg', detail: '71 / 100', score: 71, semantic: 'positive' },
      { label: 'Credit (B)', detail: '62 / 100', score: 62, semantic: 'positive' },
      { label: 'Metals (B)', detail: '79 / 100', score: 79, semantic: 'strong-positive' },
      { label: 'VIX (B)', detail: '91 / 100', score: 91, semantic: 'strong-positive' },
      { label: 'US Risk', detail: '65 / 100', score: 65, semantic: 'positive' },
      { label: 'TOTAL2 (B)', detail: '90 / 100', score: 90, semantic: 'strong-positive' },
    ],
  };
}

export function getAuctionResult(): AuctionResult {
  const timestamp = nowIso();
  return {
    timestamp,
    symbol: 'NQ1! · 5m',
    session: 'TRANSITION',
    transition: 'ENTRY',
    auction: 'BALANCED / ROTATION',
    setup: 'OPEN SHORT PLAN',
    setupSemantic: 'negative',
    setupScore: '0 · LOW',
    activeLevel: 'NONE',
    stage: 'WAIT',
    accept: '—',
    rvol: '0.23x · LOW PARTICIPATION',
    execState: 'MANAGE',
    execSemantic: 'positive',
    entry: '29517.25',
    stop: '29541.82',
    risk: '24.57 pts / 1.34 ATR',
    tp1: '29424 (PDL)',
    rr1: '3.8R',
    tp2: '29411.71',
    rr2: '4.3R',
    tp3: '29399.43',
    rr3: '4.8R',
    lastEvent: 'PWL',
    lastStage: 'EXPIRED',
    emaState: 'BULL',
    flow: '-6.38',
    atr: '18.31',
    osc: '-26.38',
    htf: '10/100',
    liveR: '+0.32R',
    mfe: '3.12R',
    mae: '0.5R',
    tradeState: 'ARMED RETEST SHORT',
    levels: [
      { name: 'PDH', price: '29811.75', state: 'BELOW', semantic: 'neutral', dist: '+302.25' },
      { name: 'PDL', price: '29437.00', state: 'ABOVE', semantic: 'positive', dist: '+72.50' },
      { name: 'ONH', price: '29707.25', state: 'BELOW', semantic: 'neutral', dist: '+197.75' },
      { name: 'ONL', price: '29577.75', state: 'BREAKDOWN', semantic: 'negative', dist: '-68.25' },
      { name: 'ORH', price: '29704.00', state: 'BELOW', semantic: 'neutral', dist: '+194.50' },
      { name: 'ORL', price: '29562.50', state: 'BREAKDOWN', semantic: 'negative', dist: '-53.00' },
      { name: 'PWH', price: '30339.75', state: 'BELOW', semantic: 'neutral', dist: '+830.25' },
      { name: 'PWL', price: '29202.50', state: 'ABOVE', semantic: 'positive', dist: '+307.00' },
      { name: 'VWAP', price: 'n/a', state: 'NEUTRAL', semantic: 'neutral', dist: 'n/a' },
    ],
  };
}

export function getPressureResult(): PressureResult {
  const timestamp = nowIso();
  return {
    timestamp,
    symbol: 'NQ1! · 5m',
    pressure: '+3.85',
    pressureSemantic: 'neutral',
    regime: 'NEUTRAL',
    regimeSemantic: 'neutral',
    confidence: '48.3 MOD',
    confidenceSemantic: 'warning',
    session: 'TRANSITION',
    setup: 'WAIT / ROTATION',
    playbook: 'NO EDGE / WAIT',
    stack: '4/5 BULL · 85%',
    momentum: 'IMPROVING',
    momentumSemantic: 'positive',
    sessionP: '-21.26',
    crossP: '+0.38',
    vwap: 'BELOW -83.78pt',
    rvol: '0.69x',
    dayType: 'LOW VOL / WAIT',
    magnetUp: 'ORH +194.5 pts',
    magnetDn: 'PDL -107.25 pts',
    pdhpdl: '29707.5 / 29402.25',
    orhorl: '29704 / 29562.5',
    onhonl: '29707.25 / 29577.75',
    pwhpwl: '30339.75 / 29202.5',
    crossAgree: '37.5%',
    stackRungs: [
      { label: '1M Trigger', value: '+14.29', semantic: 'positive' },
      { label: '3M Fast', value: '+33.54', semantic: 'positive' },
      { label: '5M Core', value: '+58.92', semantic: 'strong-positive' },
      { label: '15M Struct', value: '+1.56', semantic: 'neutral' },
      { label: '1H Anchor', value: '-31.46', semantic: 'negative' },
    ],
    crossMarkets: [
      { label: 'ES', state: 'BULL', semantic: 'positive' },
      { label: 'SOX', state: 'BEAR', semantic: 'negative' },
      { label: 'QQQ', state: 'NEUTRAL', semantic: 'neutral' },
      { label: 'NVDA', state: 'BEAR', semantic: 'negative' },
      { label: 'BTC', state: 'BEAR', semantic: 'negative' },
      { label: 'VIX', state: 'NEUTRAL', semantic: 'neutral' },
      { label: 'DXY', state: 'NEUTRAL', semantic: 'neutral' },
      { label: 'US10Y', state: 'SUPPORTIVE', semantic: 'positive' },
    ],
  };
}

export function getLeadLagResult(): LeadLagResult {
  const timestamp = nowIso();
  return {
    timestamp,
    symbol: 'NQ1! · 5m',
    predEdge: 'n/a · NEUTRAL',
    confirm: '+13.45 · NEUTRAL',
    confirmSemantic: 'neutral',
    session: 'OVERNIGHT · LIVE',
    leaders: ['NO VALID LEAD', 'NO VALID LEAD', 'NO VALID LEAD'],
    noValidLead: true,
    rows: [
      { market: 'ES', sync: '+0.93 ↑ STRONG', syncSemantic: 'strong-positive', trueLead: '+5m +0.14 ↑ V.WEAK', trueLeadSemantic: 'neutral', adv: '-0.78', rel: 'LOW 47.12', relSemantic: 'neutral', edgeStatus: 'NO EDGE · WEAK', edgeSemantic: 'neutral', moveZ: '+0.07', predImp: '+0' },
      { market: 'SOX', sync: '+0.74 ↑ STRONG', syncSemantic: 'strong-positive', trueLead: '+60m -0.26 ↓ WEAK', trueLeadSemantic: 'warning', adv: '-0.47', rel: 'MED 67.49', relSemantic: 'positive', edgeStatus: 'RTH ONLY · NO EDGE', edgeSemantic: 'neutral', moveZ: '+0.11', predImp: 'OFF' },
      { market: 'QQQ', sync: '+0.98 ↑ V.STRONG', syncSemantic: 'strong-positive', trueLead: '+60m -0.26 ↓ WEAK', trueLeadSemantic: 'warning', adv: '-0.72', rel: 'MED 67.04', relSemantic: 'positive', edgeStatus: 'RTH ONLY · NO EDGE', edgeSemantic: 'neutral', moveZ: '+0.2', predImp: 'OFF' },
      { market: 'NVDA', sync: '+0.67 ↑ STRONG', syncSemantic: 'strong-positive', trueLead: '+30m +0.32 ↓ WEAK', trueLeadSemantic: 'warning', adv: '-0.35', rel: 'MED 71.52', relSemantic: 'positive', edgeStatus: 'RTH ONLY · NO EDGE', edgeSemantic: 'neutral', moveZ: '+0.74', predImp: 'OFF' },
      { market: 'VIX', sync: '-0.64 ↓ STRONG', syncSemantic: 'negative', trueLead: '+15m -0.09 ↓ V.WEAK', trueLeadSemantic: 'neutral', adv: '-0.55', rel: 'MED 56.26', relSemantic: 'positive', edgeStatus: 'RTH ONLY · NO EDGE', edgeSemantic: 'neutral', moveZ: '+0.16', predImp: 'OFF' },
      { market: 'DXY', sync: '-0.23 ↓ WEAK', syncSemantic: 'warning', trueLead: '+15m +0.26 ↓ WEAK', trueLeadSemantic: 'warning', adv: '+0.03', rel: 'LOW 44.87', relSemantic: 'neutral', edgeStatus: 'NO EDGE · BREAKING', edgeSemantic: 'warning', moveZ: '-1.01', predImp: '+0' },
      { market: 'US10Y', sync: '-0.28 ↓ WEAK', syncSemantic: 'warning', trueLead: '+5m -0.16 ↓ WEAK', trueLeadSemantic: 'warning', adv: '-0.12', rel: 'LOW 48.32', relSemantic: 'neutral', edgeStatus: 'NO EDGE · WEAK', edgeSemantic: 'neutral', moveZ: '-0.77', predImp: '+0' },
      { market: 'HYG', sync: '+0.43 ↑ MOD', syncSemantic: 'positive', trueLead: '+5m +0.12 ↑ WEAK', trueLeadSemantic: 'warning', adv: '-0.31', rel: 'LOW 48.13', relSemantic: 'neutral', edgeStatus: 'NO EDGE · WEAK', edgeSemantic: 'neutral', moveZ: '+1.59', predImp: 'OFF' },
      { market: 'BTC', sync: '+0.41 ↑ MOD', syncSemantic: 'positive', trueLead: '+10m +0.22 ↑ WEAK', trueLeadSemantic: 'warning', adv: '-0.19', rel: 'MED 64.73', relSemantic: 'positive', edgeStatus: 'NO EDGE · STABLE', edgeSemantic: 'neutral', moveZ: '+0.14', predImp: '+0' },
      { market: 'GOLD', sync: '+0.5 ↑ MOD', syncSemantic: 'positive', trueLead: '+15m -0.15 ↓ V.WEAK', trueLeadSemantic: 'neutral', adv: '-0.35', rel: 'MED 60.29', relSemantic: 'positive', edgeStatus: 'NO EDGE · WEAK', edgeSemantic: 'neutral', moveZ: '+0.3', predImp: '+0' },
      { market: 'COPPER', sync: '+0.4 ↑ MOD', syncSemantic: 'positive', trueLead: '+60m -0.15 ↓ V.WEAK', trueLeadSemantic: 'neutral', adv: '-0.26', rel: 'MED 59.73', relSemantic: 'positive', edgeStatus: 'NO EDGE · WEAK', edgeSemantic: 'neutral', moveZ: '+0.42', predImp: '+0' },
    ],
  };
}

export function getFragilityResult(): FragilityResult {
  const timestamp = nowIso();
  return {
    timestamp,
    health: '67.8 · HEALTHY',
    healthSemantic: 'positive',
    fragility: '17.71',
    transition: '7.97',
    divergence: '0',
    rotation: 'MIXED ROTATION',
    verdict: 'RISK-ON',
    verdictSemantic: 'strong-positive',
    components: [
      { label: 'Breadth', value: 66.55, semantic: 'positive' },
      { label: 'Credit', value: 45.87, semantic: 'neutral' },
      { label: 'Vol', value: 98.12, semantic: 'strong-positive' },
      { label: 'USD/Rates', value: 59.79, semantic: 'positive' },
      { label: 'Leadership', value: 66.48, semantic: 'positive' },
      { label: 'Trend', value: 83.33, semantic: 'strong-positive' },
    ],
    warnings: [
      { label: 'Warnings', state: '0/5', semantic: 'strong-positive' },
      { label: 'Breadth', state: 'CLEAR', semantic: 'strong-positive' },
      { label: 'Credit', state: 'CLEAR', semantic: 'strong-positive' },
      { label: 'Vol', state: 'CLEAR', semantic: 'strong-positive' },
      { label: 'USD/Rates', state: 'CLEAR', semantic: 'strong-positive' },
      { label: 'Lead', state: 'CLEAR', semantic: 'strong-positive' },
    ],
    path: 'RISK-ON STABLE',
    playbook: 'FAVOR PULLBACKS',
    confidence: '80.06 · HIGH',
    rot1: 'CRYPTO 90.14',
    rot2: 'METALS 80.25',
    rot3: 'EM 73',
    internals: [
      { metric: 'Equal Weight / SPY', value: '-1.15%', state: 'NEUTRAL', semantic: 'neutral', risk: 'OK', detail: 'RSP breadth', trend: 'BULL' },
      { metric: 'Small Caps / SPY', value: '-1.5%', state: 'NEUTRAL', semantic: 'neutral', risk: 'OK', detail: 'IWM participation', trend: 'BULL' },
      { metric: 'Semis / Nasdaq', value: '-0.37%', state: 'NEUTRAL', semantic: 'neutral', risk: 'OK', detail: 'SOX leadership', trend: 'MIXED' },
      { metric: 'High Yield / IG', value: '+0.2%', state: 'CONFIRM', semantic: 'positive', risk: 'OK', detail: 'HYG 20D 0.5%', trend: 'MIXED' },
      { metric: 'VIX Term', value: '+17.37%', state: 'CONTANGO', semantic: 'positive', risk: 'OK', detail: 'VIX 5D -9.37%', trend: 'BEAR' },
      { metric: 'Dollar', value: '-0.84%', state: 'TAILWIND', semantic: 'positive', risk: 'OK', detail: 'DXY 20D', trend: 'MIXED' },
      { metric: 'US 10Y Shock', value: '+0.3bp', state: 'OK', semantic: 'strong-positive', risk: 'OK', detail: '2s10s +44.2bp', trend: 'RATES' },
      { metric: 'Cyclical / Defensive', value: '+3.56%', state: 'LEADING', semantic: 'strong-positive', risk: 'OK', detail: 'XLY vs XLP', trend: 'MIXED' },
      { metric: 'Price vs Internals', value: 'PRICE STRONG', state: 'ALIGNED', semantic: 'strong-positive', risk: '0', detail: 'Health Δ5 0', trend: 'Δ20 0' },
    ],
    radar: [
      { sector: 'Growth', score: 66.89, state: 'BUILDING', semantic: 'positive', representative: 'QQQ / SOX / XLK', m20: '5.49%', relSpy: '+1.53%' },
      { sector: 'Small Caps', score: 63.58, state: 'BUILDING', semantic: 'positive', representative: 'IWM', m20: '2.47%', relSpy: '-1.5%' },
      { sector: 'Cyclicals', score: 57.37, state: 'MIXED', semantic: 'neutral', representative: 'XLI / XLY / XLF', m20: '0.23%', relSpy: '-3.74%' },
      { sector: 'EM', score: 73, state: 'STRONG', semantic: 'strong-positive', representative: 'EEM', m20: '6.32%', relSpy: '+2.36%' },
      { sector: 'Crypto', score: 90.14, state: 'STRONG', semantic: 'strong-positive', representative: 'BTC / ETH / TOTAL3', m20: '23.74%', relSpy: '+19.77%' },
      { sector: 'Metals', score: 80.25, state: 'STRONG', semantic: 'strong-positive', representative: 'GOLD / SILVER', m20: '12.16%', relSpy: 'ABS' },
      { sector: 'Commodities', score: 65.81, state: 'BUILDING', semantic: 'positive', representative: 'COPPER / OIL', m20: '1.78%', relSpy: 'ABS' },
      { sector: 'Bonds', score: 43.92, state: 'WEAK', semantic: 'warning', representative: 'TLT', m20: '0.4%', relSpy: '-3.57%' },
      { sector: 'Defensive', score: 37.53, state: 'WEAK', semantic: 'warning', representative: 'XLP / XLU', m20: '-0.46%', relSpy: '-4.42%' },
    ],
  };
}

export function getEngineStatus(): EngineStatusRow[] {
  const timestamp = nowIso();
  return [
    { engine: 'macro', label: 'Global Liquidity', href: '/intelligence/liquidity', score: 72, state: 'Risk-On', semantic: 'strong-positive', trend: 'stable', timestamp },
    { engine: 'fragility', label: 'Fragility', href: '/intelligence/fragility', score: 75, state: 'Healthy', semantic: 'strong-positive', trend: 'improving', timestamp },
    { engine: 'lead-lag', label: 'Lead/Lag', href: '/intelligence/lead-lag', score: 50, state: 'Neutral', semantic: 'neutral', trend: 'none', timestamp },
    { engine: 'nq-pressure', label: 'NQ Pressure', href: '/intelligence/nq-pressure', score: 52, state: 'Neutral', semantic: 'neutral', trend: 'improving', timestamp },
    { engine: 'auction', label: 'Auction', href: '/intelligence/auction', score: 37, state: 'Short', semantic: 'negative', trend: 'recovering', timestamp },
    { engine: 'master', label: 'Master', href: '/intelligence/master', score: 57, state: 'Lean Long', semantic: 'positive', trend: 'stable', timestamp },
  ];
}
