"use client";

import StatusPill from "../shared/StatusPill";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function SymbolContextHeader() {
  const s = mockSymbol;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#101826] px-4 py-3">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{s.symbol}</span>
            <span className="text-xs text-white/30">ISB FILES</span>
          </div>
          <div className="text-xs text-white/40 mt-0.5">
            Next scan 15:45 pm · 68%/60% Stats: 24 symbols scanned
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs text-white/50">
        <div className="flex items-center gap-1.5">
          <span className="text-white/30">EMAol</span>
          <span className="text-white/70">A Indices:</span>
          <span>88.4a/7.3dn</span>
        </div>
        <div>Scnrs</div>
        <div>CrgGk +3.0% 651,825</div>
        <div>+39.67b</div>
        <div>+90.5Ma 125% 55h 80d Am</div>
      </div>
    </div>
  );
}
