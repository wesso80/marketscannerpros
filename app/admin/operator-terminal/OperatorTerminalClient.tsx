"use client";

import OperatorTopToolbar from "@/components/admin/operator/OperatorTopToolbar";
import OperatorLeftRail from "@/components/admin/operator/OperatorLeftRail";
import OperatorCenterPanel from "@/components/admin/operator/OperatorCenterPanel";
import OperatorRightRail from "@/components/admin/operator/OperatorRightRail";
import OperatorBottomTabs from "@/components/admin/operator/OperatorBottomTabs";
import { useScannerFeed, useSymbolIntelligence } from "@/lib/admin/hooks";
import SavedScanStatus, { requestRescan } from "@/components/admin/SavedScanStatus";
import { useState, useEffect, useCallback } from "react";

const DEFAULT_FOCUS: Record<string, string> = { CRYPTO: "ADA", EQUITIES: "SPY" };

/** Opens on Equities when crypto market data is off (OPERATOR_CG_FETCH_ENABLED), since crypto has no data then. */
export function initialOperatorMarket(cryptoEnabled: boolean): "CRYPTO" | "EQUITIES" {
  return cryptoEnabled ? "CRYPTO" : "EQUITIES";
}

export default function OperatorTerminalClient({ cryptoEnabled }: { cryptoEnabled: boolean }) {
  const [market, setMarketState] = useState<string>(() => initialOperatorMarket(cryptoEnabled));
  const [focusSymbol, setFocusSymbol] = useState(() => DEFAULT_FOCUS[initialOperatorMarket(cryptoEnabled)]);
  const [timeframe, setTimeframe] = useState("15m");
  // Switching market also switches the focus symbol, so an equity is never looked up as crypto (or vice versa).
  const setMarket = useCallback((m: string) => {
    setMarketState(m);
    setFocusSymbol(DEFAULT_FOCUS[m] ?? "SPY");
  }, []);
  const [killActive, setKillActive] = useState(false);

  // Re-read the shared saved scan every 60s (a DB read — no market-data calls).
  const { hits, savedScan, loading: scanLoading, refetch } = useScannerFeed(undefined, market, timeframe, 60000);
  const [rescanNote, setRescanNote] = useState<string | null>(null);
  // "R" / toolbar rescan asks the shared job for a rescan (rate-limited, refused while one runs).
  const rescan = useCallback(async () => {
    const r = await requestRescan(market, timeframe);
    setRescanNote(r.message);
    refetch();
    if (r.ok) setTimeout(refetch, 45_000);
  }, [market, timeframe, refetch]);
  const { data: symbolData, loading: symbolLoading } = useSymbolIntelligence(focusSymbol, market, timeframe);

  // Auto-select first hit when scan results arrive and no symbol is manually selected
  useEffect(() => {
    if (hits.length > 0 && !hits.some((h) => h.symbol === focusSymbol)) {
      setFocusSymbol(hits[0].symbol);
    }
  }, [hits, focusSymbol]);

  // Pause-alerts handler
  const handleKillSwitch = useCallback(() => {
    setKillActive((prev) => !prev);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case "r":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); rescan(); }
          break;
        case "k":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handleKillSwitch(); }
          break;
        case "arrowup":
          e.preventDefault();
          setFocusSymbol((prev) => {
            const idx = hits.findIndex((h) => h.symbol === prev);
            return idx > 0 ? hits[idx - 1].symbol : prev;
          });
          break;
        case "arrowdown":
          e.preventDefault();
          setFocusSymbol((prev) => {
            const idx = hits.findIndex((h) => h.symbol === prev);
            return idx < hits.length - 1 ? hits[idx + 1].symbol : prev;
          });
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [rescan, handleKillSwitch, hits]);

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <OperatorTopToolbar
        timeframe={timeframe}
        market={market}
        onTimeframeChange={setTimeframe}
        onMarketChange={setMarket}
        onRescan={rescan}
        onKillSwitch={handleKillSwitch}
        scanning={scanLoading}
        killActive={killActive}
        cryptoEnabled={cryptoEnabled}
      />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <SavedScanStatus status={savedScan} compact onRescanStarted={() => setTimeout(refetch, 45_000)} />
        {rescanNote && <span className="text-[10px] text-white/40">{rescanNote}</span>}
      </div>

      {(scanLoading || symbolLoading) && (
        <div className="text-center text-white/30 text-xs py-1">
          {scanLoading ? "Loading saved scan…" : `Loading ${focusSymbol} intelligence…`}
        </div>
      )}

      {killActive && (
        <div className="text-center py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs font-medium">
          ⏸ Auto-Scan Paused — Research alerts suppressed
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px] flex-1 min-h-0">
        <OperatorLeftRail hits={hits} activeSymbol={focusSymbol} onSelectSymbol={setFocusSymbol} />
        <OperatorCenterPanel data={symbolData} timeframe={timeframe} onTimeframeChange={setTimeframe} />
        <OperatorRightRail data={symbolData} />
      </div>

      <OperatorBottomTabs hits={hits} activeData={symbolData} />

      {/* Keyboard shortcut hint */}
      <div className="flex justify-center gap-4 text-[9px] text-white/15 pb-1">
        <span>R = rescan</span>
        <span>K = pause alerts</span>
        <span>↑↓ = navigate symbols</span>
      </div>
    </div>
  );
}
