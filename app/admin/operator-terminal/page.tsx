"use client";

import OperatorTopToolbar from "@/components/admin/operator/OperatorTopToolbar";
import OperatorLeftRail from "@/components/admin/operator/OperatorLeftRail";
import OperatorCenterPanel from "@/components/admin/operator/OperatorCenterPanel";
import OperatorRightRail from "@/components/admin/operator/OperatorRightRail";
import OperatorBottomTabs from "@/components/admin/operator/OperatorBottomTabs";
import { useScannerFeed, useSymbolIntelligence } from "@/lib/admin/hooks";
import { useState } from "react";

export default function OperatorTerminalPage() {
  const [focusSymbol, setFocusSymbol] = useState("ADA");
  const { hits, health, loading: scanLoading } = useScannerFeed(undefined, "CRYPTO", "15m");
  const { data: symbolData, loading: symbolLoading } = useSymbolIntelligence(focusSymbol, "CRYPTO", "15m");

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <OperatorTopToolbar />

      {scanLoading && (
        <div className="text-center text-white/30 text-xs py-1">Running live scan…</div>
      )}

      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px] flex-1 min-h-0">
        <OperatorLeftRail hits={hits} />
        <OperatorCenterPanel data={symbolData} />
        <OperatorRightRail data={symbolData} />
      </div>

      <OperatorBottomTabs />
    </div>
  );
}
