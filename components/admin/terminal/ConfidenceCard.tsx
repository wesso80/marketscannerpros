"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import type { AdminSymbolIntelligence } from "@/lib/admin/types";

export default function ConfidenceCard({ data }: { data: AdminSymbolIntelligence | null }) {
  if (!data) return <AdminCard title="Confidence"><div className="text-white/30 text-sm">Loading…</div></AdminCard>;
  return (
    <AdminCard title="Confidence">
      <DataRow label="Confidence" value={`${data.confidence}%`} valueColor="text-sky-300" />
      <DataRow label="Elite Score" value={data.eliteScore != null ? `${data.eliteScore.toFixed(1)} (${data.eliteGrade ?? "—"})` : "—"} valueColor="text-emerald-300" />
      <DataRow label="Symbol Trust" value={`${data.symbolTrust}%`} />
      <DataRow label="Size Multiplier" value={`${data.sizeMultiplier}x`} />
      {data.featureImportance && data.featureImportance.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">Score Drivers</div>
          <div className="space-y-1.5">
            {data.featureImportance.slice(0, 3).map((item) => (
              <div key={item.factor} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/70">{item.factor}</span>
                  <span className="font-mono text-emerald-300">+{item.contribution.toFixed(1)}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-white/10">
                  <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-white/35">Weight {item.weight.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminCard>
  );
}
