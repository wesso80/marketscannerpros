import type { GoldenEggPayload, GoldenEggCanonical } from '@/src/features/goldenEgg/types';

/**
 * Public Symbol contract (W3: P3-07, P3-08, P4-01, P4-02). The Symbol page's response is BUILT from an allow-list of
 * dated evidence; it is not the internal Golden Egg packet with fields deleted, and the internal packet is never
 * mutated (it stays cached and is still used by private consumers).
 *
 * Not public (internal engine verdicts and plans): assessment, direction verdict, grade, permission, confluence and
 * every score / score breakdown, flip conditions, primary driver/blocker text, size multiplier, hypothetical R:R and
 * risk sizing, R multiples, the playbook (doctrine), the narrative, time-confluence prediction / confidence /
 * "best window", "agree/disagree with the setup" verdicts, DVE breakout / trap / exhaustion scores, cross-market
 * relation to the direction verdict, and the canonical/legacy verdict blocks.
 * Undecided product items are omitted until decided: setup classification and thesis, third-party analyst targets and
 * ratings and the beat/miss against consensus, engine confirmation/invalidation lists.
 */
export const PUBLIC_SYMBOL_CONTRACT = 'public-symbol-v1' as const;

type C = GoldenEggCanonical;
type TC = NonNullable<GoldenEggPayload['layer3']['timeConfluence']>;

export interface PublicSymbolPacket {
  contract: typeof PUBLIC_SYMBOL_CONTRACT;
  meta: GoldenEggPayload['meta'];
  priceEvidence: GoldenEggPayload['priceEvidence'] | null;
  timingEvidence: GoldenEggPayload['timingEvidence'] | null;
  optionsRequest: GoldenEggPayload['optionsRequest'] | null;
  canonical: {
    symbol: string; assetClass: C['assetClass']; timeframe: string; barInterval: string | null; price: number; changePct: number;
    priceTs: string; lastCompletedBarAt: string | null; historyBars: number; source: string | null;
    indicators: C['indicators']; liquidity: C['liquidity'];
    dataTrust: { level: C['dataTrust']['level']; label: string; reasons: string[]; freshness: string };
    options: C['options'];
    fundamentals: Omit<NonNullable<C['fundamentals']>, 'analystTarget' | 'analystCount' | 'lastEpsBeat'> | null;
    network: C['network'];
    derivatives: C['derivatives'];
    crossMarket: { summary: string; items: Array<{ symbol: string; label: string; price: number | null; changePct: number | null; trend: string; detail: string }> };
    levels: {
      reference: C['levels']['reference'];
      invalidation: C['levels']['invalidation'];
      zones: Array<{ price: number; basis: 'structural' | 'mechanical'; label: string }>;
    };
  } | null;
  layer2: {
    setup: { timeframeAlignment: { aligned: number; of: number; details: string[] }; keyLevels: GoldenEggPayload['layer2']['setup']['keyLevels']; invalidation: string };
    scenario: {
      referenceTrigger: string;
      referenceLevel: GoldenEggPayload['layer2']['scenario']['referenceLevel'];
      invalidationLevel: GoldenEggPayload['layer2']['scenario']['invalidationLevel'];
      reactionZones: Array<{ price: number; note?: string }>;
    };
  };
  layer3: {
    structure: { trend: GoldenEggPayload['layer3']['structure']['trend']; volatility: { regime: GoldenEggPayload['layer3']['structure']['volatility']['regime']; atr?: number; bbwp?: number }; liquidity: GoldenEggPayload['layer3']['structure']['liquidity'] };
    momentum: { indicators: GoldenEggPayload['layer3']['momentum']['indicators'] };
    options: { enabled: boolean; highlights: Array<{ label: string; value: string }>; notes: string[] } | null;
    timeConfluence: {
      enabled: boolean; banners: string[]; sessionState: TC['sessionState'] | null; displayNote: string | null;
      closeSchedule: TC['closeSchedule'];
      decompression: { unmeasuredTFs: string[]; activeCount: number; clusteredCount: number };
      decompressionTarget: TC['decompressionTarget'];
      closes: { closingNowCount: number; closingNowTFs: string[]; closingSoonCount: number; isMonthEnd: boolean; isWeekEnd: boolean };
    } | null;
  };
}

const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? { ...x } : x)) : []);

export function toPublicSymbolPacket(p: GoldenEggPayload): PublicSymbolPacket {
  const c = p.canonical, s = p.layer2.setup, sc = p.layer2.scenario, st = p.layer3.structure, tc = p.layer3.timeConfluence;
  const fundamentals = c?.fundamentals ? (({ analystTarget: _t, analystCount: _n, lastEpsBeat: _b, ...rest }) => ({ ...rest }))(c.fundamentals) : null;
  return {
    contract: PUBLIC_SYMBOL_CONTRACT,
    meta: { symbol: p.meta.symbol, assetClass: p.meta.assetClass, price: p.meta.price, asOfTs: p.meta.asOfTs, timeframe: p.meta.timeframe },
    priceEvidence: p.priceEvidence ?? null,
    timingEvidence: p.timingEvidence ?? null,
    optionsRequest: p.optionsRequest ?? null,
    canonical: c ? {
      symbol: c.symbol, assetClass: c.assetClass, timeframe: c.timeframe, barInterval: c.barInterval, price: c.price, changePct: c.changePct,
      priceTs: c.priceTs, lastCompletedBarAt: c.lastCompletedBarAt, historyBars: c.historyBars, source: c.source,
      indicators: { ...c.indicators }, liquidity: { ...c.liquidity },
      dataTrust: { level: c.dataTrust.level, label: c.dataTrust.label, reasons: [...c.dataTrust.reasons], freshness: c.dataTrust.freshness },
      options: c.options ? { ...c.options } : null,
      fundamentals,
      network: c.network ? { ...c.network } : null,
      derivatives: c.derivatives ? { ...c.derivatives } : null,
      crossMarket: { summary: c.crossMarket.summary, items: c.crossMarket.items.map(({ symbol, label, price, changePct, trend, detail }) => ({ symbol, label, price, changePct, trend, detail })) },
      levels: { reference: { ...c.levels.reference }, invalidation: { ...c.levels.invalidation }, zones: c.levels.zones.map(({ price, basis, label }) => ({ price, basis, label })) },
    } : null,
    layer2: {
      setup: { timeframeAlignment: { aligned: s.timeframeAlignment.score, of: s.timeframeAlignment.max, details: [...s.timeframeAlignment.details] }, keyLevels: arr(s.keyLevels), invalidation: s.invalidation },
      scenario: { referenceTrigger: sc.referenceTrigger, referenceLevel: { ...sc.referenceLevel }, invalidationLevel: { ...sc.invalidationLevel }, reactionZones: sc.reactionZones.map(({ price, note }) => (note ? { price, note } : { price })) },
    },
    layer3: {
      structure: { trend: { ...st.trend }, volatility: { regime: st.volatility.regime, ...(st.volatility.atr != null ? { atr: st.volatility.atr } : {}), ...(st.volatility.bbwp != null ? { bbwp: st.volatility.bbwp } : {}) }, liquidity: { ...st.liquidity } },
      momentum: { indicators: arr(p.layer3.momentum?.indicators) },
      options: p.layer3.options ? { enabled: p.layer3.options.enabled, highlights: arr(p.layer3.options.highlights), notes: [...(p.layer3.options.notes ?? [])] } : null,
      timeConfluence: tc ? {
        enabled: tc.enabled, banners: [...tc.banners], sessionState: tc.sessionState ?? null, displayNote: tc.displayNote ?? null,
        closeSchedule: arr(tc.closeSchedule),
        decompression: { unmeasuredTFs: [...(tc.decompression.unmeasuredTFs ?? [])], activeCount: tc.decompression.activeCount, clusteredCount: tc.decompression.clusteredCount },
        decompressionTarget: tc.decompressionTarget ? { ...tc.decompressionTarget, contributingTFs: [...tc.decompressionTarget.contributingTFs] } : null,
        closes: { closingNowCount: tc.candleCloseConfluence.closingNowCount, closingNowTFs: [...tc.candleCloseConfluence.closingNowTFs], closingSoonCount: tc.candleCloseConfluence.closingSoonCount, isMonthEnd: tc.candleCloseConfluence.isMonthEnd, isWeekEnd: tc.candleCloseConfluence.isWeekEnd },
      } : null,
    },
  };
}
