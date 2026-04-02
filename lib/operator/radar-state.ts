/**
 * MSP Operator — Shared radar state
 * Module-level singleton so radar route can read auto-scan results.
 * @internal
 */

import type { RadarOpportunity } from '@/types/operator';

export interface RadarState {
  liveRadar: RadarOpportunity[];
  lastScanAt: string | null;
}

/** Shared in-memory radar state — written by auto-scan, read by radar route */
export const radarState: RadarState = {
  liveRadar: [],
  lastScanAt: null,
};
