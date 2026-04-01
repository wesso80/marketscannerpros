"use client";

import SymbolSearch from "./SymbolSearch";
import ScannerFeedPanel from "./ScannerFeedPanel";
import RecentSymbolsPanel from "./RecentSymbolsPanel";
import AlertsMiniFeed from "./AlertsMiniFeed";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import type { ScannerHit } from "@/lib/admin/types";

export default function OperatorLeftRail({ hits }: { hits: ScannerHit[] }) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      <SymbolSearch />
      <ScannerFeedPanel hits={hits} />
      <RecentSymbolsPanel />
      <AlertsMiniFeed />
      <WorkspaceSwitcher />
    </div>
  );
}
