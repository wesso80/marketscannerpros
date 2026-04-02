"use client";

import type { ScannerHit } from "@/lib/admin/types";

export default function AlertsMiniFeed({ hits = [] }: { hits?: ScannerHit[] }) {
  const alerts = hits
    .filter(h => h.permission === "GO" || h.permission === "WAIT")
    .slice(0, 5)
    .map(h => `${h.symbol} — ${h.permission} · ${h.bias} · ${h.confidence}%`);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Alerts Feed</span>
        <span className="text-[10px] text-amber-400/70">{alerts.length}</span>
      </div>
      <div className="space-y-1">
        {alerts.length === 0 ? (
          <div className="text-xs text-white/30">No alerts</div>
        ) : (
          alerts.map((a, i) => (
            <div key={i} className="text-xs text-white/50 leading-relaxed">
              • {a}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
