/**
 * Admin Terminal operating modes.
 *
 * See .claude/ADMIN_TERMINAL.md for full doctrine.
 *
 * Portfolio Separation Rule:
 *   Personal portfolio exposure must NOT block, hide, or downgrade
 *   opportunities in any mode except `risk-desk`. In every other mode,
 *   exposure may only be displayed as a context badge.
 */

export type AdminMode =
  | 'opportunity-scout'
  | 'research-desk'
  | 'risk-desk'
  | 'data-integrity'
  | 'strategy-lab'
  | 'alert-command'
  | 'truth-layer';

export const ADMIN_MODES: readonly AdminMode[] = [
  'opportunity-scout',
  'research-desk',
  'risk-desk',
  'data-integrity',
  'strategy-lab',
  'alert-command',
  'truth-layer',
] as const;

/**
 * Returns true ONLY when the current mode is allowed to use personal
 * portfolio exposure as a primary scoring or filtering input.
 *
 * Currently: only `risk-desk`.
 *
 * Use this as a hard guard before any code path that filters out,
 * hides, or downgrades a setup based on owner holdings.
 */
export function usePortfolioAsBlocker(mode: AdminMode): boolean {
  return mode === 'risk-desk';
}

/**
 * Returns true if the mode is permitted to display personal exposure
 * data at all (as a non-blocking context badge or as primary input).
 * All admin modes may display it; only `risk-desk` may act on it.
 */
export function canDisplayPortfolioExposure(_mode: AdminMode): boolean {
  return true;
}

export function isAdminMode(value: unknown): value is AdminMode {
  return typeof value === 'string' && (ADMIN_MODES as readonly string[]).includes(value);
}
