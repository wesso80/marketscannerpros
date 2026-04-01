"use client";

import SymbolContextHeader from "./SymbolContextHeader";
import ChartToolbar from "./ChartToolbar";
import LiveChartPanel from "./LiveChartPanel";
import OverlayLegend from "./OverlayLegend";
import TimeConfluenceStrip from "./TimeConfluenceStrip";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function OperatorCenterPanel({ data }: { data: AdminSymbolIntelligence | null }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <SymbolContextHeader data={data} />
      <ChartToolbar />
      <LiveChartPanel data={data} />
      <OverlayLegend />
      <TimeConfluenceStrip data={data} />
    </div>
  );
}
