import type { CapitalFlowResult } from '@/lib/capitalFlowEngine';

/**
 * /api/options-scan public boundary, interim step (W3). Removes the payloads the acceptance matrix lists as private
 * and that no page reads:
 *   - adaptiveLayer.profile / .match: the workspace's personal trading profile (sample size, wins, style bias, risk DNA,
 *     timing, personality match, adaptive score). It still feeds the server-side scoring; it is never serialized.
 *   - capitalFlow: only the leaves the Options views read are sent (bias, conviction, market mode, key strikes, flip
 *     zones, liquidity levels, most likely path, risk notes). The brain decision (permission, size multiplier, risk
 *     governor, execution plan, brain score, probability matrix), trade permission and risk governor stay on the server.
 * Still sent, pending the product decision on the Options setup scanner: the analyzer's grade, direction, strategy
 * recommendation, trade levels and entry timing, the institutional filter, scored candidates and the canonical verdict.
 */
export type PublicCapitalFlow = Pick<CapitalFlowResult, 'bias' | 'conviction' | 'market_mode' | 'key_strikes' | 'flip_zones' | 'liquidity_levels' | 'most_likely_path' | 'risk'>;

export function toPublicCapitalFlow(c: CapitalFlowResult | null | undefined): PublicCapitalFlow | null {
  if (!c) return null;
  return structuredClone({
    bias: c.bias, conviction: c.conviction, market_mode: c.market_mode,
    key_strikes: c.key_strikes ?? [], flip_zones: c.flip_zones ?? [], liquidity_levels: c.liquidity_levels ?? [],
    most_likely_path: c.most_likely_path ?? [], risk: c.risk ?? [],
  });
}
