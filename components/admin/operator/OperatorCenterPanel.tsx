"use client";

import SymbolContextHeader from "./SymbolContextHeader";
import ChartToolbar from "./ChartToolbar";
import LiveChartPanel from "./LiveChartPanel";
import OverlayLegend from "./OverlayLegend";
import TimeConfluenceStrip from "./TimeConfluenceStrip";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function OperatorCenterPanel({
  data,
  timeframe,
  onTimeframeChange,
}: {
  data: AdminSymbolIntelligence | null;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <SymbolContextHeader data={data} />
      <ChartToolbar timeframe={timeframe ?? data?.timeframe ?? "15m"} onTimeframeChange={onTimeframeChange} />
      <LiveChartPanel data={data} />
      <OverlayLegend data={data} />
      <TimeConfluenceStrip data={data} />
    </div>
  );
}
