"use client";

import { useState } from "react";
import AdminCard from "../shared/AdminCard";
import Tabs from "../shared/Tabs";

const tabs = ["trade-plan", "signals", "logs", "news", "notes", "golden-egg", "backtest"] as const;
type Tab = (typeof tabs)[number];

export default function TerminalBottomWorkspace() {
  const [active, setActive] = useState<Tab>("trade-plan");

  return (
    <AdminCard>
      <Tabs tabs={[...tabs]} active={active} onChange={setActive} />
      <div className="mt-3 rounded-lg border border-white/[0.06] bg-[#0b1220] p-4 text-sm text-white/50 min-h-[100px]">
        <span className="text-white/30">Active tab:</span> {active}
      </div>
    </AdminCard>
  );
}
