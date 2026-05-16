/**
 * lib/playbooks/types.ts — playbook type system.
 *
 * A "playbook" is a named, evidence-backed setup template. The scanner
 * classifies raw setups into a playbook so the Edge Ledger can group
 * outcomes meaningfully (e.g. "vwap-reclaim" wins 62% in trend-up regimes).
 *
 * Playbooks are pure declarative: triggers (entry conditions), invalidations
 * (what kills the thesis), preferred regime, IV bias, holding window.
 *
 * Boundary: DISCOVERY/RESEARCH. Playbooks describe what the system sees;
 * they do not place orders.
 */

export type PlaybookDirection = 'long' | 'short';
export type PlaybookType = 'breakout' | 'reversal' | 'continuation' | 'fade' | 'mean-revert' | 'event-driven';
export type PreferredRegime = 'trend-up' | 'trend-down' | 'chop' | 'vol-expand' | 'vol-contract' | 'risk-off' | 'any';
export type IvBias = 'iv-low' | 'iv-high' | 'iv-any';

export interface PlaybookTrigger {
  /** Short label describing the trigger, e.g. "Close > 20EMA after 3 inside days". */
  label: string;
  /** Optional code-level key — the scanner uses this to programmatically check the trigger. */
  key?: string;
}

export interface PlaybookInvalidation {
  label: string;
  key?: string;
}

export interface Playbook {
  id: string;                           // stable kebab-case id, used as edge_ledger_setups.playbook
  name: string;                         // human label
  type: PlaybookType;
  direction: PlaybookDirection;
  preferredRegime: PreferredRegime;
  ivBias: IvBias;
  /** Typical bars-to-target. Used for outcome window guidance. */
  expectedHoldBars: number;
  /** Default reward/risk target — informational, not enforced. */
  defaultRR: number;
  /** What must be true at entry. */
  triggers: PlaybookTrigger[];
  /** What kills the thesis. */
  invalidations: PlaybookInvalidation[];
  /** One-line summary for AI rationale. */
  summary: string;
  /** Optional: feature gate hints for the scanner (atr, vol, rsi, etc). */
  featureHints?: Record<string, string>;
}
