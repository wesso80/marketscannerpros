/**
 * /admin/operator-terminal. Server wrapper so the terminal knows whether crypto market data is on
 * (OPERATOR_CG_FETCH_ENABLED, a server-only env var) and opens on Equities when it is off, instead of a blank
 * crypto workspace labelled "Auto-Scan Live".
 */
import { operatorCgFetchEnabled } from "@/lib/operator/market-data";
import OperatorTerminalClient from "./OperatorTerminalClient";

export const dynamic = "force-dynamic";

export default function OperatorTerminalPage() {
  return <OperatorTerminalClient cryptoEnabled={operatorCgFetchEnabled()} />;
}
