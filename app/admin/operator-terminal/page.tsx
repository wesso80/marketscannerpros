"use client";

import OperatorTopToolbar from "@/components/admin/operator/OperatorTopToolbar";
import OperatorLeftRail from "@/components/admin/operator/OperatorLeftRail";
import OperatorCenterPanel from "@/components/admin/operator/OperatorCenterPanel";
import OperatorRightRail from "@/components/admin/operator/OperatorRightRail";
import OperatorBottomTabs from "@/components/admin/operator/OperatorBottomTabs";
import { useScannerFeed, useSymbolIntelligence } from "@/lib/admin/hooks";
import { useState, useEffect } from "react";

export default function OperatorTerminalPage() {
  const [focusSymbol, setFocusSymbol] = useState("ADA");
  const [timeframe, setTimeframe] = useState("15m");
  const [market, setMarket] = useState("CRYPTO");

  const { hits, health, loading: scanLoading, refetch: rescan } = useScannerFeed(undefined, market, timeframe);
  const { data: symbolData, loading: symbolLoading } = useSymbolIntelligence(focusSymbol, market, timeframe);

  // Auto-select first hit when scan results arrive and no symbol is manually selected
  useEffect(() => {
    if (hits.length > 0 && !hits.some((h) => h.symbol === focusSymbol)) {
      setFocusSymbol(hits[0].symbol);
    }
  }, [hits, focusSymbol]);

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <OperatorTopToolbar
        timeframe={timeframe}
        market={market}
        onTimeframeChange={setTimeframe}
        onMarketChange={setMarket}
        onRescan={rescan}
        scanning={scanLoading}
      />

      {(scanLoading || symbolLoading) && (
        <div className="text-center text-white/30 text-xs py-1">
          {scanLoading ? "Running live scan…" : `Loading ${focusSymbol} intelligence…`}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px] flex-1 min-h-0">
        <OperatorLeftRail hits={hits} activeSymbol={focusSymbol} onSelectSymbol={setFocusSymbol} />
        <OperatorCenterPanel data={symbolData} />
        <OperatorRightRail data={symbolData} />
      </div>

      <OperatorBottomTabs />
    </div>
  );
}
