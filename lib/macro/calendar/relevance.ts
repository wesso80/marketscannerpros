import type { AssetTag, CalendarEvent, CountryCode, EventCategory, RelevanceScore } from './types';

/**
 * Catalyst relevance — which upcoming releases matter most for a set of focus
 * assets. This ranks *attention*, not direction; nothing here predicts price.
 *
 * Weights are 0..1 per (asset, country) and per (asset, category) and are
 * multiplied. Tune here; nothing else needs to change.
 */

export const DEFAULT_FOCUS_ASSETS: AssetTag[] = ['SPX', 'NQ', 'USD'];
export const ALL_FOCUS_ASSETS: AssetTag[] = ['NQ', 'SPX', 'BTC', 'ETH', 'Gold', 'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD'];

type CountryWeights = Partial<Record<CountryCode, number>>;
type CategoryWeights = Partial<Record<EventCategory, number>>;

const US_RATES_ASSET: CountryWeights = { US: 1, JP: 0.5, EU: 0.35, UK: 0.25, CN: 0.3, CA: 0.15, AU: 0.15, NZ: 0.05, CH: 0.1, KR: 0.05, IN: 0.05 };

export const ASSET_COUNTRY_WEIGHTS: Record<AssetTag, CountryWeights> = {
  NQ: US_RATES_ASSET,
  SPX: US_RATES_ASSET,
  US10Y: { US: 1, JP: 0.6, EU: 0.4, UK: 0.3, CN: 0.25, CA: 0.15, AU: 0.1, NZ: 0.05, CH: 0.1, KR: 0.05, IN: 0.05 },
  BTC: { US: 1, JP: 0.45, EU: 0.3, UK: 0.15, CN: 0.25, CA: 0.05, AU: 0.05, NZ: 0.02, CH: 0.05, KR: 0.15, IN: 0.05 },
  ETH: { US: 1, JP: 0.45, EU: 0.3, UK: 0.15, CN: 0.25, CA: 0.05, AU: 0.05, NZ: 0.02, CH: 0.05, KR: 0.15, IN: 0.05 },
  Gold: { US: 1, JP: 0.3, EU: 0.4, UK: 0.2, CN: 0.5, CA: 0.1, AU: 0.15, NZ: 0.05, CH: 0.25, KR: 0.05, IN: 0.25 },
  USD: { US: 1, JP: 0.45, EU: 0.5, UK: 0.3, CN: 0.35, CA: 0.25, AU: 0.2, NZ: 0.1, CH: 0.15, KR: 0.1, IN: 0.1 },
  JPY: { JP: 1, US: 0.9, EU: 0.2, UK: 0.1, CN: 0.2, CA: 0.05, AU: 0.1, NZ: 0.05, CH: 0.1, KR: 0.05, IN: 0.02 },
  EUR: { EU: 1, US: 0.85, UK: 0.3, JP: 0.15, CN: 0.2, CH: 0.35, CA: 0.05, AU: 0.05, NZ: 0.02, KR: 0.02, IN: 0.02 },
  GBP: { UK: 1, US: 0.8, EU: 0.45, JP: 0.1, CN: 0.1, CH: 0.1, CA: 0.05, AU: 0.05, NZ: 0.02, KR: 0.02, IN: 0.02 },
  AUD: { AU: 1, US: 0.8, CN: 0.7, NZ: 0.35, JP: 0.2, EU: 0.15, UK: 0.1, CA: 0.1, CH: 0.05, KR: 0.1, IN: 0.05 },
  CAD: { CA: 1, US: 0.95, CN: 0.2, EU: 0.15, UK: 0.1, JP: 0.1, AU: 0.1, NZ: 0.02, CH: 0.02, KR: 0.02, IN: 0.02 },
};

const RATES_SENSITIVE: CategoryWeights = { central_bank: 1, inflation: 1, employment: 0.9, gdp: 0.7, pmi: 0.55, consumer: 0.5, manufacturing: 0.5, wages: 0.6, other: 0.3 };
const FX: CategoryWeights = { central_bank: 1, inflation: 0.95, employment: 0.85, gdp: 0.7, wages: 0.7, pmi: 0.5, consumer: 0.5, manufacturing: 0.45, other: 0.3 };
const CRYPTO: CategoryWeights = { central_bank: 1, inflation: 0.95, employment: 0.75, gdp: 0.5, pmi: 0.35, consumer: 0.3, manufacturing: 0.3, wages: 0.35, other: 0.2 };
const GOLD: CategoryWeights = { central_bank: 1, inflation: 1, employment: 0.75, gdp: 0.5, pmi: 0.35, consumer: 0.3, manufacturing: 0.3, wages: 0.4, other: 0.2 };

export const ASSET_CATEGORY_WEIGHTS: Record<AssetTag, CategoryWeights> = {
  NQ: RATES_SENSITIVE,
  SPX: RATES_SENSITIVE,
  US10Y: RATES_SENSITIVE,
  BTC: CRYPTO,
  ETH: CRYPTO,
  Gold: GOLD,
  USD: FX,
  JPY: FX,
  EUR: FX,
  GBP: FX,
  AUD: FX,
  CAD: FX,
};

const IMPORTANCE_WEIGHT = { high: 1, medium: 0.55, low: 0.2 } as const;

/** 0..100 relevance of one event for the focus set (max across assets). */
export function scoreRelevance(event: CalendarEvent, focusAssets: AssetTag[] = DEFAULT_FOCUS_ASSETS): RelevanceScore {
  const assets = focusAssets.length ? focusAssets : DEFAULT_FOCUS_ASSETS;
  let best = 0;
  const reasons: string[] = [];
  for (const asset of assets) {
    const c = ASSET_COUNTRY_WEIGHTS[asset]?.[event.countryCode] ?? 0.05;
    const k = ASSET_CATEGORY_WEIGHTS[asset]?.[event.category] ?? 0.3;
    const s = c * k * IMPORTANCE_WEIGHT[event.importance];
    if (s > best) best = s;
    if (s >= 0.5) reasons.push(`${asset}: ${event.countryCode} ${event.category.replace('_', ' ')} is a primary catalyst`);
    else if (s >= 0.25) reasons.push(`${asset}: secondary sensitivity via ${event.countryCode} ${event.category.replace('_', ' ')}`);
  }
  return { score: Math.round(best * 100), focusAssets: assets, reasons };
}

/**
 * Next HIGH-impact event with the best relevance for the focus set, searched
 * within a look-ahead window so a marginal event tomorrow can outrank an
 * irrelevant one in 20 minutes. Ties resolve to the earlier release.
 */
export function selectNextRelevantEvent(
  events: CalendarEvent[],
  nowUtcMs: number,
  focusAssets: AssetTag[] = DEFAULT_FOCUS_ASSETS,
  opts: { countries?: CountryCode[] | null; lookaheadHours?: number; minScore?: number } = {},
): { event: CalendarEvent; relevance: RelevanceScore } | null {
  const lookahead = (opts.lookaheadHours ?? 72) * 3_600_000;
  const minScore = opts.minScore ?? 25;
  const candidates = events
    .filter((e) => e.importance === 'high')
    .filter((e) => !opts.countries || opts.countries.length === 0 || opts.countries.includes(e.countryCode))
    .map((e) => ({ e, ms: Date.parse(e.releaseTimeUtc) }))
    .filter(({ ms }) => ms > nowUtcMs && ms <= nowUtcMs + lookahead)
    .map(({ e, ms }) => ({ event: e, ms, relevance: scoreRelevance(e, focusAssets) }))
    .filter((c) => c.relevance.score >= minScore)
    .sort((a, b) => b.relevance.score - a.relevance.score || a.ms - b.ms);
  if (!candidates.length) return null;
  return { event: candidates[0].event, relevance: candidates[0].relevance };
}

export function parseFocusAssets(raw: string | null | undefined): AssetTag[] {
  if (!raw) return DEFAULT_FOCUS_ASSETS;
  const wanted = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const byLower = new Map(ALL_FOCUS_ASSETS.map((a) => [a.toLowerCase(), a] as const));
  const out = wanted.map((w) => byLower.get(w.toLowerCase())).filter((a): a is AssetTag => Boolean(a));
  return out.length ? [...new Set(out)] : DEFAULT_FOCUS_ASSETS;
}
