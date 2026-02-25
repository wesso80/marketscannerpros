/**
 * Execution Engine — Validators
 *
 * Pre-flight validation on TradeIntent and composed TradeProposal.
 * Returns an array of ValidationError; empty = valid.
 */

import type {
  TradeIntent,
  TradeProposal,
  ValidationError,
  AssetClass,
} from './types';
import type { StrategyTag, Direction, Regime } from '@/lib/risk-governor-hard';

/* ------------------------------------------------------------------ */
/*  Intent Validation                                                  */
/* ------------------------------------------------------------------ */

const VALID_ASSET_CLASSES: AssetClass[] = ['equity', 'crypto', 'options', 'futures', 'forex'];
const VALID_DIRECTIONS: Direction[] = ['LONG', 'SHORT'];
const VALID_STRATEGIES: StrategyTag[] = [
  'BREAKOUT_CONTINUATION',
  'TREND_PULLBACK',
  'RANGE_FADE',
  'MEAN_REVERSION',
  'MOMENTUM_REVERSAL',
  'EVENT_STRATEGY',
];
const VALID_REGIMES: Regime[] = [
  'TREND_UP',
  'TREND_DOWN',
  'RANGE_NEUTRAL',
  'VOL_EXPANSION',
  'VOL_CONTRACTION',
  'RISK_OFF_STRESS',
];

export function validateIntent(intent: TradeIntent): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!intent.symbol || typeof intent.symbol !== 'string' || intent.symbol.trim().length === 0) {
    errors.push({ field: 'symbol', code: 'REQUIRED', message: 'Symbol is required.' });
  }

  if (!VALID_ASSET_CLASSES.includes(intent.asset_class)) {
    errors.push({
      field: 'asset_class',
      code: 'INVALID',
      message: `Invalid asset class "${intent.asset_class}". Must be one of: ${VALID_ASSET_CLASSES.join(', ')}.`,
    });
  }

  if (!VALID_DIRECTIONS.includes(intent.direction)) {
    errors.push({
      field: 'direction',
      code: 'INVALID',
      message: `Invalid direction "${intent.direction}". Must be LONG or SHORT.`,
    });
  }

  if (!VALID_STRATEGIES.includes(intent.strategy_tag)) {
    errors.push({
      field: 'strategy_tag',
      code: 'INVALID',
      message: `Invalid strategy tag "${intent.strategy_tag}".`,
    });
  }

  if (!VALID_REGIMES.includes(intent.regime)) {
    errors.push({
      field: 'regime',
      code: 'INVALID',
      message: `Invalid regime "${intent.regime}".`,
    });
  }

  if (typeof intent.confidence !== 'number' || intent.confidence < 0 || intent.confidence > 100) {
    errors.push({
      field: 'confidence',
      code: 'RANGE',
      message: 'Confidence must be 0–100.',
    });
  }

  if (typeof intent.entry_price !== 'number' || intent.entry_price <= 0) {
    errors.push({
      field: 'entry_price',
      code: 'POSITIVE',
      message: 'Entry price must be > 0.',
    });
  }

  if (typeof intent.atr !== 'number' || intent.atr <= 0) {
    errors.push({
      field: 'atr',
      code: 'POSITIVE',
      message: 'ATR must be > 0.',
    });
  }

  // Stop sanity (if provided)
  if (intent.stop_price != null) {
    if (typeof intent.stop_price !== 'number' || intent.stop_price <= 0) {
      errors.push({ field: 'stop_price', code: 'POSITIVE', message: 'Stop price must be > 0.' });
    } else if (intent.direction === 'LONG' && intent.stop_price >= intent.entry_price) {
      errors.push({
        field: 'stop_price',
        code: 'STOP_DIRECTION',
        message: 'LONG stop must be below entry.',
      });
    } else if (intent.direction === 'SHORT' && intent.stop_price <= intent.entry_price) {
      errors.push({
        field: 'stop_price',
        code: 'STOP_DIRECTION',
        message: 'SHORT stop must be above entry.',
      });
    }
  }

  // Risk pct sanity
  if (intent.risk_pct != null) {
    if (intent.risk_pct <= 0 || intent.risk_pct > 0.10) {
      errors.push({
        field: 'risk_pct',
        code: 'RANGE',
        message: 'Risk pct must be between 0 and 10%.',
      });
    }
  }

  // Leverage sanity
  if (intent.leverage != null) {
    if (intent.leverage < 1 || intent.leverage > 100) {
      errors.push({
        field: 'leverage',
        code: 'RANGE',
        message: 'Leverage must be 1–100.',
      });
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/*  Proposal Validation (post-assembly)                                */
/* ------------------------------------------------------------------ */

export function validateProposal(proposal: TradeProposal): ValidationError[] {
  const errors: ValidationError[] = [];

  // Governor blocked
  if (!proposal.governor.allowed) {
    errors.push({
      field: 'governor',
      code: 'GOVERNOR_BLOCKED',
      message: `Governor blocked: ${proposal.governor.reason_codes.join(', ')}.`,
    });
  }

  // Zero sizing
  if (proposal.sizing.quantity <= 0) {
    errors.push({
      field: 'sizing.quantity',
      code: 'ZERO_SIZE',
      message: 'Position size resolved to 0 — check stop distance and account equity.',
    });
  }

  // Exits sanity
  const { exits, intent } = proposal;
  if (intent.direction === 'LONG') {
    if (exits.stop_price >= intent.entry_price) {
      errors.push({
        field: 'exits.stop_price',
        code: 'STOP_ABOVE_ENTRY',
        message: 'Stop is above entry for a LONG trade.',
      });
    }
    if (exits.take_profit_1 <= intent.entry_price) {
      errors.push({
        field: 'exits.take_profit_1',
        code: 'TP_BELOW_ENTRY',
        message: 'TP1 is below entry for a LONG trade.',
      });
    }
  } else {
    if (exits.stop_price <= intent.entry_price) {
      errors.push({
        field: 'exits.stop_price',
        code: 'STOP_BELOW_ENTRY',
        message: 'Stop is below entry for a SHORT trade.',
      });
    }
    if (exits.take_profit_1 >= intent.entry_price) {
      errors.push({
        field: 'exits.take_profit_1',
        code: 'TP_ABOVE_ENTRY',
        message: 'TP1 is above entry for a SHORT trade.',
      });
    }
  }

  // Notional sanity (> 50% equity warning)
  if (proposal.sizing.notional_usd > proposal.sizing.account_equity * 0.5) {
    errors.push({
      field: 'sizing.notional_usd',
      code: 'HIGH_NOTIONAL',
      message: `Notional $${proposal.sizing.notional_usd.toFixed(0)} exceeds 50% of equity.`,
    });
  }

  return errors;
}
