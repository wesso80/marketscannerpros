/**
 * Single source of truth for the two crypto switches in the admin area (server-only env vars).
 *
 * - isAdminCryptoEnabled(): is the admin crypto workspace on at all (shared crypto scan, crypto crons, crypto
 *   edge packets, Morning Brief / Operator Terminal / Live Scanner crypto)? ON by default. Crypto bars and key
 *   levels come from Alpha Vantage, so it does not depend on CoinGecko. Kill switch: ADMIN_CRYPTO_ENABLED=false.
 * - isCoinGeckoEnabled(): may the admin/operator path spend CoinGecko quota (bulk crypto quote shortlist, CG
 *   daily-OHLC key levels)? OFF by default; OPERATOR_CG_FETCH_ENABLED=true turns it on. It only picks the data
 *   source, it never switches crypto off.
 *
 * Admin pages still open on EQUITIES by default (defaultAdminMarket); crypto is one click away.
 */

const TRUE_VALUES = ["1", "true", "yes", "on"];
const FALSE_VALUES = ["0", "false", "no", "off"];

export function isAdminCryptoEnabled(): boolean {
  const raw = (process.env.ADMIN_CRYPTO_ENABLED || "").trim().toLowerCase();
  return !FALSE_VALUES.includes(raw);
}

export function isCoinGeckoEnabled(): boolean {
  const raw = (process.env.OPERATOR_CG_FETCH_ENABLED || "").trim().toLowerCase();
  return TRUE_VALUES.includes(raw);
}

export const ADMIN_CRYPTO_DISABLED_MESSAGE =
  "Admin crypto is switched off (ADMIN_CRYPTO_ENABLED=false); crypto is never looked up through stock endpoints.";
