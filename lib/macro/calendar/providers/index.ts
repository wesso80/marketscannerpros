import type { ProviderId } from '../types';
import { curatedProvider } from './curated';
import { eodhdProvider } from './eodhd';
import { tradingEconomicsProvider } from './tradingEconomics';
import type { EconomicCalendarProvider } from './types';

export const PROVIDERS: Record<ProviderId, EconomicCalendarProvider> = {
  curated: curatedProvider,
  'trading-economics': tradingEconomicsProvider,
  eodhd: eodhdProvider,
};

/**
 * Default live-provider precedence. Neither live provider is production-
 * primary until the parity report has been reviewed; when both are keyed the
 * order below decides which one wins value conflicts.
 */
export const DEFAULT_LIVE_ORDER: ProviderId[] = ['trading-economics', 'eodhd'];

/**
 * Resolve the provider precedence for a feed build.
 * `CALENDAR_PROVIDER_ORDER` (comma-separated ids) overrides the default live
 * order; curated is always appended last as the schedule fallback.
 */
export function resolveProviderOrder(envOrder: string | undefined = process.env.CALENDAR_PROVIDER_ORDER): ProviderId[] {
  const requested = (envOrder ?? '')
    .split(',')
    .map((s) => s.trim() as ProviderId)
    .filter((id): id is ProviderId => id in PROVIDERS && id !== 'curated');
  const live = requested.length ? requested : DEFAULT_LIVE_ORDER;
  return [...live, 'curated'];
}

export function getProvider(id: ProviderId): EconomicCalendarProvider {
  return PROVIDERS[id];
}

export type { EconomicCalendarProvider, ProviderCalendarResult, ProviderQuery } from './types';
