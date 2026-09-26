/**
 * Status labels for the Intelligence overview tiles, derived from the same endpoint data and rules the module pages
 * use, so a tile never disagrees with the page it links to. Pure — safe for server and client.
 */
import type { EngineMeta } from './types';

export type ModuleStatusLabel = string;

/** Market Fragility: the page's data-source badge rule (app/intelligence/fragility DataSourceBadge). */
export function fragilityStatusLabel(meta: Pick<EngineMeta, 'sourceStatus' | 'isStale'> | null | undefined): ModuleStatusLabel {
  const status = meta?.sourceStatus ?? 'MOCK';
  if (meta?.isStale) return 'STALE';
  if (status === 'OK') return 'LIVE';
  if (status === 'PARTIAL') return 'LIVE · PARTIAL';
  return status.replace(/_/g, ' ');
}

/**
 * Global M2: LIVE when the headline regime is eligible (weighted coverage over the included blocs meets the threshold),
 * otherwise LIVE · PARTIAL — the page shows its "DIAGNOSTIC — not the headline" banner in exactly that case, and
 * Liquidity Transmission already labels its M2 upstream with this same rule.
 */
export function globalM2StatusLabel(dto: { enabled: boolean; interpretationEligible: boolean } | null | undefined): ModuleStatusLabel {
  if (!dto) return 'UNAVAILABLE';
  if (!dto.enabled) return 'NOT ENABLED';
  return dto.interpretationEligible ? 'LIVE' : 'LIVE · PARTIAL';
}

/** Liquidity Transmission: the status chip the page shows (built by liquidityTransmissionPageMapper). */
export function liquidityStatusLabel(dto: { statusLabel?: string | null } | null | undefined): ModuleStatusLabel {
  return dto?.statusLabel || 'UNAVAILABLE';
}

/** Tile label while the endpoint loads or when it fails. */
export function tileStatus(state: { loading: boolean; error: string | null }, label: () => ModuleStatusLabel): ModuleStatusLabel {
  if (state.loading) return 'CHECKING';
  if (state.error) return 'UNAVAILABLE';
  return label();
}
