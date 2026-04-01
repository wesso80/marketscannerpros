/**
 * MSP Operator — Shared utilities for all engine services.
 * @internal
 */

import crypto from 'crypto';

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function makeEnvelope<T>(
  service: string,
  data: T,
  version = '1.0.0',
): { ok: true; requestId: string; timestamp: string; service: string; version: string; data: T } {
  return {
    ok: true,
    requestId: generateId('req'),
    timestamp: nowISO(),
    service,
    version,
    data,
  };
}

export function makeError(
  service: string,
  code: string,
  message: string,
  version = '1.0.0',
) {
  return {
    ok: false,
    requestId: generateId('req'),
    timestamp: nowISO(),
    service,
    version,
    error: { code, message },
  };
}

/** Default adaptive scoring weights — see blueprint §5.2 */
export const DEFAULT_SCORING_WEIGHTS = {
  regimeFit: 0.18,
  structureQuality: 0.18,
  timeConfluence: 0.10,
  volatilityAlignment: 0.14,
  participationFlow: 0.10,
  crossMarketConfirmation: 0.08,
  eventSafety: 0.07,
  extensionSafety: 0.05,
  symbolTrust: 0.05,
  modelHealth: 0.05,
} as const;

/** Permission score thresholds — see blueprint §5.4 */
export const PERMISSION_THRESHOLDS = {
  ALLOW: 0.80,
  ALLOW_REDUCED: 0.68,
  WAIT: 0.55,
  // below 0.55 → BLOCK
} as const;

/** Max weight shift per learning cycle — see blueprint §Step 5 */
export const MAX_WEIGHT_DELTA = 0.03;

/** Minimum sample size for learning adjustment */
export const MIN_LEARNING_SAMPLE = 30;
