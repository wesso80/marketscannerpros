/**
 * Server-side admin market default: always EQUITIES (admin landing, Morning Brief, API fallbacks and jobs), whatever
 * the crypto switches say. Crypto is opened explicitly (market=CRYPTO / the Crypto toggle); whether it is available
 * at all is isAdminCryptoEnabled() (lib/admin/adminCrypto). It used to follow OPERATOR_CG_FETCH_ENABLED, so turning
 * CoinGecko on also turned the daily brief email into a crypto brief.
 */
import { parseAdminMarket, type AdminMarket } from "@/lib/admin/adminMarket";

export type { AdminMarket };

export function defaultAdminMarket(): AdminMarket {
  return "EQUITIES";
}

/** A requested market, or the default when the value is missing/unknown. */
export function resolveAdminMarket(raw: unknown): AdminMarket {
  return parseAdminMarket(raw, defaultAdminMarket());
}
