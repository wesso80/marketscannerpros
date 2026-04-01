"use client";

import SymbolSearch from "./SymbolSearch";
import ScannerFeedPanel from "./ScannerFeedPanel";
import RecentSymbolsPanel from "./RecentSymbolsPanel";
import AlertsMiniFeed from "./AlertsMiniFeed";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

export default function OperatorLeftRail() {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      <SymbolSearch />
      <ScannerFeedPanel />
      <RecentSymbolsPanel />
      <AlertsMiniFeed />
      <WorkspaceSwitcher />
    </div>
  );
}
