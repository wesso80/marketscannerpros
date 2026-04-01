"use client";

import LiveChartPanel from "../operator/LiveChartPanel";
import ChartToolbar from "../operator/ChartToolbar";
import ConfidenceCard from "./ConfidenceCard";
import SymbolTrustCard from "./SymbolTrustCard";
import EvidenceStackCard from "./EvidenceStackCard";
import DVEDetailCard from "./DVEDetailCard";
import TimeConfluenceDetailCard from "./TimeConfluenceDetailCard";
import RiskStateCard from "./RiskStateCard";
import PositionSizingCard from "./PositionSizingCard";
import SetupTypeCard from "./SetupTypeCard";
import KeyLevelsCard from "./KeyLevelsCard";
import LiquidityMapCard from "./LiquidityMapCard";
import CrossMarketCard from "./CrossMarketCard";
import EventRiskCard from "./EventRiskCard";
import FlowCard from "./FlowCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function TerminalMainGrid({ data }: { data: AdminSymbolIntelligence | null }) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_380px]">
      {/* Left: Chart + Detail cards */}
      <div className="space-y-3">
        <ChartToolbar />
        <LiveChartPanel data={data} />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <KeyLevelsCard data={data} />
          <LiquidityMapCard />
          <CrossMarketCard />
          <EventRiskCard />
          <FlowCard />
        </div>
      </div>

      {/* Right: Intelligence cards */}
      <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 14rem)" }}>
        <ConfidenceCard data={data} />
        <SymbolTrustCard />
        <EvidenceStackCard />
        <DVEDetailCard data={data} />
        <TimeConfluenceDetailCard data={data} />
        <RiskStateCard data={data} />
        <PositionSizingCard data={data} />
        <SetupTypeCard />
      </div>
    </div>
  );
}
