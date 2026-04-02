"use client";

import OperatorTopToolbar from "@/components/admin/operator/OperatorTopToolbar";
import OperatorLeftRail from "@/components/admin/operator/OperatorLeftRail";
import OperatorCenterPanel from "@/components/admin/operator/OperatorCenterPanel";
import OperatorRightRail from "@/components/admin/operator/OperatorRightRail";
import OperatorBottomTabs from "@/components/admin/operator/OperatorBottomTabs";
import { useScannerFeed, useSymbolIntelligence } from "@/lib/admin/hooks";
import { useState, useEffect, useCallback } from "react";

export default function OperatorTerminalPage() {
  const [focusSymbol, setFocusSymbol] = useState("ADA");
  const [timeframe, setTimeframe] = useState("15m");
  const [market, setMarket] = useState("CRYPTO");
  const [killActive, setKillActive] = useState(false);

  // Auto-poll scanner every 60s
  const { hits, health, loading: scanLoading, refetch: rescan } = useScannerFeed(undefined, market, timeframe, 60000);
  const { data: symbolData, loading: symbolLoading } = useSymbolIntelligence(focusSymbol, market, timeframe);

  // Auto-select first hit when scan results arrive and no symbol is manually selected
  useEffect(() => {
    if (hits.length > 0 && !hits.some((h) => h.symbol === focusSymbol)) {
      setFocusSymbol(hits[0].symbol);
    }
  }, [hits, focusSymbol]);

  // Kill switch handler
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
      />

      {(scanLoading || symbolLoading) && (
        <div className="text-center text-white/30 text-xs py-1">
          {scanLoading ? "Running live scan…" : `Loading ${focusSymbol} intelligence…`}
        </div>
      )}

      {killActive && (
        <div className="text-center py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs font-medium">
          ⛔ Kill Switch Active — All execution paused
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
        <span>K = kill switch</span>
        <span>↑↓ = navigate symbols</span>
      </div>
    </div>
  );
}
