import type { SavedPacket } from "./sharedScan";
import type { AdminResearchAlert } from "./adminTypes";
import { savedPacketCall, type AdminCallInput, type SavedScanPrice } from "./adminCallLog";

/** "MA, NVDA, AAPL" — the best-list symbols in rank order; "" when nothing ranks (no event). */
export function priorityDeskTopKey(top: Pick<SavedPacket, "symbol">[], max = 5): string {
  return top.slice(0, max).map((p) => p.symbol).join(", ");
}

/**
 * The Priority Desk's calls: every symbol in the best equities / crypto lists (with its rank) plus the ARCA top
 * candidate. Logged to ai_signal_log (admin-call:priority-desk) when the top list changes, for outcome labelling.
 */
export function priorityDeskCalls(bestEquities: SavedPacket[], bestCrypto: SavedPacket[], arcaTop: SavedPacket | null, nowMs: number = Date.now()): AdminCallInput[] {
  const calls: AdminCallInput[] = [];
  const add = (list: SavedPacket[], listName: string) =>
    list.forEach((p, i) => calls.push(savedPacketCall(p, "priority-desk", { verdict: `${listName} #${i + 1}`, trace: { list: listName, rank: i + 1 }, calledAtMs: nowMs })));
  add(bestEquities, "bestEquities");
  add(bestCrypto, "bestCrypto");
  if (arcaTop) calls.push(savedPacketCall(arcaTop, "priority-desk", { verdict: "ARCA top", trace: { list: "arcaTopCandidate", rank: 1 }, calledAtMs: nowMs }));
  return calls;
}

/** A FIRED research alert as an admin call (admin-call:research-alert), priced from the saved scan. */
export function researchAlertCall(alert: AdminResearchAlert, price: SavedScanPrice | undefined): AdminCallInput {
  const calledAtMs = Date.parse(alert.createdAt);
  return {
    source: "research-alert",
    symbol: alert.symbol,
    market: alert.market,
    direction: alert.bias,
    score: alert.score,
    secondaryScore: alert.dataTrustScore,
    price: price?.price ?? null,
    priceAt: price?.at ?? null,
    priceSource: "saved-scan",
    timeframe: alert.timeframe,
    verdict: "FIRED",
    trace: { alertId: alert.alertId, setup: alert.setup, dataTrustScore: alert.dataTrustScore },
    calledAtMs: Number.isFinite(calledAtMs) ? calledAtMs : undefined,
  };
}
