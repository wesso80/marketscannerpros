"use client";

import OperatorTopToolbar from "@/components/admin/operator/OperatorTopToolbar";
import OperatorLeftRail from "@/components/admin/operator/OperatorLeftRail";
import OperatorCenterPanel from "@/components/admin/operator/OperatorCenterPanel";
import OperatorRightRail from "@/components/admin/operator/OperatorRightRail";
import OperatorBottomTabs from "@/components/admin/operator/OperatorBottomTabs";

export default function OperatorTerminalPage() {
  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <OperatorTopToolbar />

      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px] flex-1 min-h-0">
        <OperatorLeftRail />
        <OperatorCenterPanel />
        <OperatorRightRail />
      </div>

      <OperatorBottomTabs />
    </div>
  );
}
