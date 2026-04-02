"use client";

import SymbolSearch from "./SymbolSearch";
import ScannerFeedPanel from "./ScannerFeedPanel";
import RecentSymbolsPanel from "./RecentSymbolsPanel";
import AlertsMiniFeed from "./AlertsMiniFeed";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import type { ScannerHit } from "@/lib/admin/types";

export default function OperatorLeftRail({ hits, activeSymbol, onSelectSymbol }: {
  hits: ScannerHit[];
  activeSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      <SymbolSearch onSelect={onSelectSymbol} />
      <ScannerFeedPanel hits={hits} activeSymbol={activeSymbol} onSelect={onSelectSymbol} />
      <RecentSymbolsPanel hits={hits} />
      <AlertsMiniFeed hits={hits} />
      <WorkspaceSwitcher />
    </div>
  );
}
