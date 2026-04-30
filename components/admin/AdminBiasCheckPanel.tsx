"use client";

import { useEffect, useState } from "react";
import { runOperatorBiasCheck } from "@/lib/admin/operatorBiasCheck";

type PacketLite = {
  symbol: string;
  assetClass: string;
  bias: string;
  lifecycle: string;
  trapDetection: { trapType: string[] };
  dataTruth: { status: string };
  contradictionFlags: string[];
};

export default function AdminBiasCheckPanel() {
  const [packets, setPackets] = useState<PacketLite[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/priority-desk", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      const merged = [
        ...(json.bestEquities || []),
        ...(json.bestCrypto || []),
      ];
      setPackets(merged.slice(0, 12));
    }
    load().catch(() => undefined);
  }, []);

  const result = runOperatorBiasCheck({
    recentPackets: packets as never,
    savedCaseScores: [],
    repeatedMistakeCount: 0,
  });

  return (
    <section className="rounded-xl border border-white/10 bg-[#0F172A]/60 p-3 text-xs">
      <h3 className="mb-2 text-sm font-bold text-white">Bias Check Layer</h3>
      <div className="mb-2 text-white/70">Bias health score: <span className="font-semibold text-emerald-300">{result.biasScore}</span></div>
      {result.signals.length === 0 ? (
        <div className="text-white/45">No significant bias signals detected in recent packet focus.</div>
      ) : (
        <div className="space-y-1">
          {result.signals.map((s) => (
            <div key={s.code} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1">
              <span className="text-amber-300">[{s.severity}]</span> {s.reason}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
