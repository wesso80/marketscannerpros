/**
 * MSP Operator — Shared utilities for all engine services.
 * @internal
 */

import crypto from 'crypto';
import type { EnvironmentMode } from '@/types/operator';

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Create a deterministic hash for idempotency §13.5 */
export function hashIntent(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url').slice(0, 24);
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

/** Default adaptive scoring weights — see spec §6.6 */
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

/** Permission score thresholds — see spec §6.6 */
export const PERMISSION_THRESHOLDS = {
  ALLOW: 0.80,
  ALLOW_REDUCED: 0.68,
  WAIT: 0.55,
  // below 0.55 → BLOCK
} as const;

/** Max weight shift per learning cycle — see spec §8.2 */
export const MAX_WEIGHT_DELTA = 0.03;

/** Minimum sample size for learning adjustment */
export const MIN_LEARNING_SAMPLE = 30;

/** §13.6 environment mode — determines execution behavior */
export const ENVIRONMENT_MODE: EnvironmentMode = (
  process.env.OPERATOR_ENV_MODE as EnvironmentMode
) || 'RESEARCH';

/** Whether execution should submit real orders */
export function isLiveExecution(): boolean {
  return ENVIRONMENT_MODE === 'LIVE_ASSISTED' || ENVIRONMENT_MODE === 'LIVE_AUTO';
}

/** Whether the mode requires manual approval */
export function requiresApproval(): boolean {
  return ENVIRONMENT_MODE === 'LIVE_ASSISTED' || ENVIRONMENT_MODE === 'PAPER';
}
