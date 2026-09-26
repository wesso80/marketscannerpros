/**
 * /admin/live-scanner. Server wrapper: passes whether admin crypto is on (ADMIN_CRYPTO_ENABLED, server-only, on by
 * default; crypto runs on Alpha Vantage data even with CoinGecko off) and the admin default market (EQUITIES).
 */
import { isAdminCryptoEnabled } from "@/lib/admin/adminCrypto";
import { defaultAdminMarket } from "@/lib/admin/defaultAdminMarket";
import LiveScannerClient from "./LiveScannerClient";

export const dynamic = "force-dynamic";

export default function LiveScannerPage() {
  return <LiveScannerClient cryptoEnabled={isAdminCryptoEnabled()} defaultMarket={defaultAdminMarket()} />;
}
