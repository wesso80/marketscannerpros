/**
 * lib/admin/portfolio-lab/correlationLoader.ts
 *
 * Builds the input for `computeCorrelations` from live ARCA data:
 *   - Open positions from arca_positions.
 *   - Per-symbol historical prices reconstructed from admin_edge_packets
 *     (the AdminEdgePacket snapshot table). For each symbol we pull
 *     packets from the lookback window, then bucket by YYYY-MM-DD
 *     keeping the latest price observation per day.
 *
 * Returns the correlation result plus light loader metadata. No
 * external network calls — we only use what's already in the ledger.
 */

import { loadEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import {
  getDefaultPortfolio,
  listOpenPositions,
} from "./portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "./constants";
import {
  computeCorrelations,
  type CorrelationPositionInput,
  type CorrelationResult,
} from "./correlationEngine";

export interface LoadCorrelationOptions {
  workspaceId: string;
  /** How far back to pull price history per symbol. Default 90 days. */
  lookbackDays?: number;
  /** Minimum overlapping daily returns per pair. Default 10. */
  minPaired?: number;
}

export type CorrelationLoad =
  | { ok: true; result: CorrelationResult; lookbackDays: number }
  | { ok: false; reason: "no_portfolio" | "no_positions" };

export async function loadCorrelations(opts: LoadCorrelationOptions): Promise<CorrelationLoad> {
  const portfolio = await getDefaultPortfolio(opts.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return { ok: false, reason: "no_portfolio" };

  const positions = await listOpenPositions(opts.workspaceId, portfolio.id);
  if (positions.length === 0) return { ok: false, reason: "no_positions" };

  const lookbackDays = Math.max(10, Math.min(365, opts.lookbackDays ?? 90));
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();

  // Pull packet history per symbol in parallel.
  const symbols = Array.from(new Set(positions.map((p) => p.symbol)));
  const seriesBySymbol = new Map<string, Map<string, number>>();
  await Promise.all(symbols.map(async (sym) => {
    const rows = await loadEdgePackets({
      workspaceId: opts.workspaceId,
      symbol: sym,
      since,
      limit: 500,
    });
    const byDay = new Map<string, number>();
    // rows are DESC; iterate so that the LATEST observation per day wins.
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const px = (r.packetJson as unknown as { snapshot?: { price?: number } }).snapshot?.price;
      if (typeof px === "number" && Number.isFinite(px) && px > 0) {
        const day = (r.generatedAt || "").slice(0, 10);
        if (day) byDay.set(day, px);
      }
    }
    seriesBySymbol.set(sym, byDay);
  }));

  // Each open position becomes a row in the matrix; same symbol on two
  // distinct positions (e.g. long + short hedge) appears twice.
  const corrPositions: CorrelationPositionInput[] = positions.map((p) => ({
    positionId: p.id,
    symbol: p.symbol,
    assetClass: p.assetClass,
    side: p.side,
    notional: (p.currentPrice ?? p.averageEntry) * p.quantity,
    prices: seriesBySymbol.get(p.symbol) ?? new Map(),
  }));

  const result = computeCorrelations({
    positions: corrPositions,
    minPaired: opts.minPaired,
  });

  return { ok: true, result, lookbackDays };
}
