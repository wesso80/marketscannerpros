"use client";

import VerdictHeaderCard from "./VerdictHeaderCard";
import RiskGovernorCard from "./RiskGovernorCard";
import IndicatorMatrixCard from "./IndicatorMatrixCard";
import DVESummaryCard from "./DVESummaryCard";
import LiquidityLevelsCard from "./LiquidityLevelsCard";
import TargetsInvalidationCard from "./TargetsInvalidationCard";

export default function OperatorRightRail() {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      <VerdictHeaderCard />
      <RiskGovernorCard />
      <IndicatorMatrixCard />
      <DVESummaryCard />
      <LiquidityLevelsCard />
      <TargetsInvalidationCard />
    </div>
  );
}
