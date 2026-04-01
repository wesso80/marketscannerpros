"use client";

import SymbolContextHeader from "./SymbolContextHeader";
import ChartToolbar from "./ChartToolbar";
import LiveChartPanel from "./LiveChartPanel";
import OverlayLegend from "./OverlayLegend";
import TimeConfluenceStrip from "./TimeConfluenceStrip";

export default function OperatorCenterPanel() {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <SymbolContextHeader />
      <ChartToolbar />
      <LiveChartPanel />
      <OverlayLegend />
      <TimeConfluenceStrip />
    </div>
  );
}
