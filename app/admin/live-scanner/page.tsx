/**
 * /admin/live-scanner. Server wrapper so the page knows whether crypto market data is on (OPERATOR_CG_FETCH_ENABLED,
 * server-only) and opens on Equities when it is off, instead of an idle crypto-only feed.
 */
import { operatorCgFetchEnabled } from "@/lib/operator/market-data";
import LiveScannerClient from "./LiveScannerClient";

export const dynamic = "force-dynamic";

export default function LiveScannerPage() {
  return <LiveScannerClient cryptoEnabled={operatorCgFetchEnabled()} />;
}
