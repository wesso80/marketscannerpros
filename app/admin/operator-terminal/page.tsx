/**
 * /admin/operator-terminal. Server wrapper: passes whether admin crypto is on (ADMIN_CRYPTO_ENABLED, server-only,
 * on by default; crypto runs on Alpha Vantage data even with CoinGecko off) and the admin default market
 * (EQUITIES), so the terminal opens on Equities and the Crypto toggle is live unless crypto is switched off.
 */
import { isAdminCryptoEnabled } from "@/lib/admin/adminCrypto";
import { defaultAdminMarket } from "@/lib/admin/defaultAdminMarket";
import OperatorTerminalClient from "./OperatorTerminalClient";

export const dynamic = "force-dynamic";

export default function OperatorTerminalPage() {
  return <OperatorTerminalClient cryptoEnabled={isAdminCryptoEnabled()} defaultMarket={defaultAdminMarket()} />;
}
