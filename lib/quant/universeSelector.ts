/**
 * Universe Selector — Dynamic Universe Based on Regime + Liquidity
 * @internal — NEVER import into user-facing components.
 *
 * Adjusts the scanning universe based on the current market regime.
 * In RISK_OFF, narrows to only the most liquid names.
 * In TREND_UP with expansion, broadens to include smaller/riskier names.
 * In compression, focuses on the symbols most likely to break out.
 */

import type { MarketPhase } from './types';
import { EQUITY_UNIVERSE, CRYPTO_UNIVERSE } from './discoveryEngine';

// ─── Liquidity Tiers ────────────────────────────────────────────────────────

/** Most liquid — always included regardless of regime */
const EQUITY_CORE = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'JPM', 'V', 'MA', 'UNH', 'JNJ', 'WMT', 'XOM',
  'AMD', 'NFLX', 'AVGO', 'CRM',
]);

const CRYPTO_CORE = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA',
]);

/** Expanded universe — included in favorable regimes */
const EQUITY_EXPANDED = new Set(
  EQUITY_UNIVERSE.filter(s => !EQUITY_CORE.has(s)),
);

const CRYPTO_EXPANDED = new Set(
  CRYPTO_UNIVERSE.filter(s => !CRYPTO_CORE.has(s)),
);

// ─── Selection Logic ────────────────────────────────────────────────────────

export interface UniverseSelection {
  equities: string[];
  crypto: string[];
  reason: string;
}

/**
 * Select the scanning universe based on the current regime.
 *
 * RISK_OFF → core only (defensive)
 * VOL_CLIMAX → core only (dangerous)
 * RANGE_COMPRESSION → full universe (breakout hunting)
 * TREND_UP / VOL_EXPANSION → full universe (opportunity)
 * RANGE_NEUTRAL / TREND_DOWN → core + partial expanded
 */
export function selectUniverse(
  regime: MarketPhase,
  enabledAssets: ('equity' | 'crypto')[] = ['equity', 'crypto'],
): UniverseSelection {
  const includeEquity = enabledAssets.includes('equity');
  const includeCrypto = enabledAssets.includes('crypto');

  switch (regime) {
    case 'RISK_OFF':
    case 'VOL_CLIMAX':
      return {
        equities: includeEquity ? [...EQUITY_CORE] : [],
        crypto: includeCrypto ? [...CRYPTO_CORE] : [],
        reason: `${regime}: Narrowed to liquid core only`,
      };

    case 'RANGE_COMPRESSION':
    case 'TREND_UP':
    case 'VOL_EXPANSION':
      return {
        equities: includeEquity ? [...EQUITY_CORE, ...EQUITY_EXPANDED] : [],
        crypto: includeCrypto ? [...CRYPTO_CORE, ...CRYPTO_EXPANDED] : [],
        reason: `${regime}: Full universe scan`,
      };

    case 'TREND_DOWN':
    case 'RANGE_NEUTRAL':
    default:
      // Core + half of expanded (top half by default ordering)
      return {
        equities: includeEquity
          ? [...EQUITY_CORE, ...[...EQUITY_EXPANDED].slice(0, Math.ceil(EQUITY_EXPANDED.size * 0.6))]
          : [],
        crypto: includeCrypto
          ? [...CRYPTO_CORE, ...[...CRYPTO_EXPANDED].slice(0, Math.ceil(CRYPTO_EXPANDED.size * 0.6))]
          : [],
        reason: `${regime}: Core + partial expanded`,
      };
  }
}
