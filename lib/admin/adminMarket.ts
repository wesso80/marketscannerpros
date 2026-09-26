/**
 * Admin market defaults (pure helpers, safe for client components).
 *
 * Crypto market data for the admin area is switched by OPERATOR_CG_FETCH_ENABLED (server-only). While it is off,
 * crypto views are empty, so every admin page, API fallback and job should open on EQUITIES. Server code reads the
 * flag through `defaultAdminMarket()` (lib/admin/defaultAdminMarket.ts) and passes the result to client pages.
 */
export type AdminMarket = "EQUITIES" | "CRYPTO";

export function adminMarketFor(cryptoEnabled: boolean): AdminMarket {
  return cryptoEnabled ? "CRYPTO" : "EQUITIES";
}

/** Parse a market query/body value ("EQUITY", "stocks" and "EQUITIES" all mean EQUITIES); fallback otherwise. */
export function parseAdminMarket(raw: unknown, fallback: AdminMarket): AdminMarket {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "CRYPTO") return "CRYPTO";
  if (s === "EQUITIES" || s === "EQUITY" || s === "STOCKS" || s === "STOCK") return "EQUITIES";
  return fallback;
}
