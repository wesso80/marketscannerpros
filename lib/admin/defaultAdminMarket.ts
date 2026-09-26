/**
 * Server-side admin market default: CRYPTO only when crypto market data is on (OPERATOR_CG_FETCH_ENABLED),
 * otherwise EQUITIES. Use this for API fallbacks, jobs and server page wrappers; pass the value to client pages.
 */
import { operatorCgFetchEnabled } from "@/lib/operator/market-data";
import { adminMarketFor, parseAdminMarket, type AdminMarket } from "@/lib/admin/adminMarket";

export type { AdminMarket };

export function defaultAdminMarket(): AdminMarket {
  return adminMarketFor(operatorCgFetchEnabled());
}

/** A requested market, or the default when the value is missing/unknown. */
export function resolveAdminMarket(raw: unknown): AdminMarket {
  return parseAdminMarket(raw, defaultAdminMarket());
}
