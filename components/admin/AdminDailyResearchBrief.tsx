"use client";

import { useEffect, useState } from "react";

type Brief = {
  generatedAt: string;
  overview: string;
  highestPriority: string[];
  regimeChanges: string[];
  macroNewsEarningsWatch: string[];
  cryptoMovers: string[];
  dataHealthWarnings: string[];
  alertsFired: number;
  arcaSummary: string;
  avoidList: string[];
  nextActions: string[];
};

export default function AdminDailyResearchBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    async function buildBrief() {
      const [priorityRes, eventsRes] = await Promise.all([
        fetch("/api/admin/priority-desk", { credentials: "include" }),
        fetch("/api/admin/research-events?limit=60", { credentials: "include" }),
      ]);
      const priority = await priorityRes.json().catch(() => ({}));
      const events = await eventsRes.json().catch(() => ({}));

      const top = (priority.bestEquities || []).slice(0, 3).map((p: any) => `${p.symbol} (${p.trustAdjustedScore?.toFixed?.(1) ?? p.trustAdjustedScore})`);
      const crypto = (priority.bestCrypto || []).slice(0, 3).map((p: any) => `${p.symbol} (${p.trustAdjustedScore?.toFixed?.(1) ?? p.trustAdjustedScore})`);
      const degraded = (priority.dataDegradedList || []).slice(0, 4).map((p: any) => `${p.symbol}: ${p.lifecycle}`);
      const avoid = (priority.avoidTrapList || []).slice(0, 4).map((p: any) => `${p.symbol}: ${p.mainRisk}`);

      const fired = Array.isArray(events.events)
        ? events.events.filter((e: any) => e.event_type === "ALERT_FIRED").length
        : 0;

      setBrief({
        generatedAt: new Date().toISOString(),
        overview: "Overnight and intraday scans consolidated into trust-adjusted priority queues.",
        highestPriority: top,
        regimeChanges: ["Review macro and volatility state shifts from top-ranked packets."],
        macroNewsEarningsWatch: ["Track elevated news/earnings-risk packets before escalation."],
        cryptoMovers: crypto,
        dataHealthWarnings: degraded,
        alertsFired: fired,
        arcaSummary: priority.arcaTopCandidate
          ? `${priority.arcaTopCandidate.symbol} currently leads by trust-adjusted score.`
          : "No ARCA top candidate available.",
        avoidList: avoid,
        nextActions: [
          "Recheck top candidates for contradiction flags.",
          "Review trap list before issuing any internal research alert.",
          "Refresh watchlist scheduler run before market open/close windows.",
        ],
      });
    }

    buildBrief().catch(() => undefined);
  }, []);

  if (!brief) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-[#0F172A]/60 p-4 text-xs text-white/85">
      <h3 className="mb-2 text-sm font-bold text-white">Command Centre Daily Research Brief</h3>
      <div className="mb-2 text-white/55">{new Date(brief.generatedAt).toLocaleString()}</div>
      <Line title="Overnight Summary" items={[brief.overview]} />
      <Line title="Highest Priority Research Setups" items={brief.highestPriority} />
      <Line title="Major Regime Changes" items={brief.regimeChanges} />
      <Line title="Macro / News / Earnings Watch" items={brief.macroNewsEarningsWatch} />
      <Line title="Crypto Movers" items={brief.cryptoMovers} />
      <Line title="Data Health Warnings" items={brief.dataHealthWarnings} />
      <Line title="ARCA Summary" items={[brief.arcaSummary]} />
      <Line title="Avoid List" items={brief.avoidList} />
      <Line title="Next Research Actions" items={brief.nextActions} />
      <div className="mt-2 text-white/65">Alerts fired in recent tape: {brief.alertsFired}</div>
    </section>
  );
}

function Line({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-2 rounded border border-white/10 bg-white/[0.03] p-2">
      <div className="mb-1 text-white/55">{title}</div>
      {items.length === 0 ? (
        <div className="text-white/45">None</div>
      ) : (
        <ul className="list-disc pl-5 space-y-0.5">
          {items.map((i) => <li key={`${title}:${i}`}>{i}</li>)}
        </ul>
      )}
    </div>
  );
}
