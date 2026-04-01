"use client";

import { mockSymbol } from "@/lib/admin/mock-data";

export default function TimeConfluenceStrip() {
  const tc = mockSymbol.timeConfluence;
  return (
    <div className="flex items-center gap-4 text-[11px] text-white/40 px-1">
      <span>Time Confluence</span>
      <span className="text-white/60">Score: {tc.score}</span>
      <span>Alignments: {tc.alignmentCount}</span>
      <span>Next cluster: {tc.nextClusterAt}</span>
      {tc.hotWindow && <span className="text-amber-400">🔥 Hot Window</span>}
    </div>
  );
}
