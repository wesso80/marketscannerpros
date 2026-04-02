"use client";

import { useState } from "react";
import TruthRail from "./TruthRail";
import RiskGovernorCard from "./RiskGovernorCard";
import IndicatorMatrixCard from "./IndicatorMatrixCard";
import DVESummaryCard from "./DVESummaryCard";
import LiquidityLevelsCard from "./LiquidityLevelsCard";
import TargetsInvalidationCard from "./TargetsInvalidationCard";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function OperatorRightRail({ data }: { data: AdminSymbolIntelligence | null }) {
  const [showTier2, setShowTier2] = useState(false);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      {/* Tier 1 — Truth Layer (always visible) */}
      <TruthRail truth={data?.truth ?? null} />

      {/* Tier 2 toggle */}
      <button
        onClick={() => setShowTier2((s) => !s)}
        className="text-xs text-white/30 hover:text-white/50 transition py-1 text-center"
      >
        {showTier2 ? "▲ Collapse details" : "▼ Show regime · playbook · levels · trust"}
      </button>

      {/* Tier 2 — Setup details (visible on expand) */}
      {showTier2 && (
        <>
          <RiskGovernorCard data={data} />
          <TargetsInvalidationCard data={data} />
          <LiquidityLevelsCard data={data} />
          <DVESummaryCard data={data} />
        </>
      )}

      {/* Tier 3 — Raw diagnostics (deep expand) */}
      {showTier2 && (
        <details className="group">
          <summary className="text-xs text-white/20 hover:text-white/40 cursor-pointer py-1 text-center transition">
            Raw diagnostics
          </summary>
          <div className="mt-2">
            <IndicatorMatrixCard data={data} />
          </div>
        </details>
      )}
    </div>
  );
}
