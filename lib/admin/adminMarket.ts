/**
 * Admin market defaults (pure helpers, safe for client components).
 *
 * Every admin page, API fallback and job opens on EQUITIES (`defaultAdminMarket()`, lib/admin/defaultAdminMarket.ts);
 * crypto is opened explicitly. Whether admin crypto is available is `isAdminCryptoEnabled()` (lib/admin/adminCrypto,
 * ADMIN_CRYPTO_ENABLED, on by default); server wrappers pass both values to client pages.
 */
import { DEFAULT_WATCHLISTS } from "@/lib/operator/watchlists";

export type AdminMarket = "EQUITIES" | "CRYPTO";

/** Parse a market query/body value ("EQUITY", "stocks" and "EQUITIES" all mean EQUITIES); fallback otherwise. */
export function parseAdminMarket(raw: unknown, fallback: AdminMarket): AdminMarket {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "CRYPTO") return "CRYPTO";
  if (s === "EQUITIES" || s === "EQUITY" || s === "STOCKS" || s === "STOCK") return "EQUITIES";
  return fallback;
}


let symbolSets: { crypto: Set<string>; equities: Set<string> } | null = null;
function watchlistSets() {
  if (!symbolSets) {
    // Crypto anchors the admin scan pins (some are not in the watchlists).
    const crypto = new Set<string>(["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"]);
    // Index ETFs the admin scan pins as anchors (not in the watchlists).
    const equities = new Set<string>(["SPY", "QQQ", "IWM", "DIA"]);
    for (const wl of Object.values(DEFAULT_WATCHLISTS)) {
      for (const s of wl.symbols) (wl.market === "CRYPTO" ? crypto : equities).add(s.toUpperCase());
    }
    symbolSets = { crypto, equities };
  }
  return symbolSets;
}

/**
 * Market for a symbol page/API when no ?market= is given: "-USD"/"USDT" pairs and admin crypto-watchlist symbols
 * are CRYPTO, admin equity-watchlist symbols are EQUITIES; unknown or ambiguous symbols (in both lists, e.g. STX)
 * use the fallback. `/admin/symbol/AAPL` used to ask for crypto "AAPL" because the default was CRYPTO.
 */
export function marketForSymbol(symbol: string, fallback: AdminMarket): AdminMarket {
  const s = String(symbol ?? "").trim().toUpperCase();
  if (/[-/](USD|USDT)$/.test(s) || /.USDT$/.test(s)) return "CRYPTO";
  const { crypto, equities } = watchlistSets();
  const inCrypto = crypto.has(s);
  const inEquities = equities.has(s);
  if (inCrypto && !inEquities) return "CRYPTO";
  if (inEquities && !inCrypto) return "EQUITIES";
  return fallback;
}
