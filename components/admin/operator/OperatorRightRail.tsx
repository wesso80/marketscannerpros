"use client";

import VerdictHeaderCard from "./VerdictHeaderCard";
import RiskGovernorCard from "./RiskGovernorCard";
import IndicatorMatrixCard from "./IndicatorMatrixCard";
import DVESummaryCard from "./DVESummaryCard";
import LiquidityLevelsCard from "./LiquidityLevelsCard";
import TargetsInvalidationCard from "./TargetsInvalidationCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function OperatorRightRail({ data }: { data: AdminSymbolIntelligence | null }) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      <VerdictHeaderCard data={data} />
      <RiskGovernorCard data={data} />
      <IndicatorMatrixCard data={data} />
      <DVESummaryCard data={data} />
      <LiquidityLevelsCard data={data} />
      <TargetsInvalidationCard data={data} />
    </div>
  );
}
