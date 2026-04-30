"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminResearchEventTape from "@/components/admin/AdminResearchEventTape";

type Packet = {
  symbol: string;
  assetClass: string;
  setup: { type: string; label: string };
  trustAdjustedScore: number;
  dataTrustScore: number;
  lifecycle: string;
  primaryReason: string;
  mainRisk: string;
  whatChanged: string;
  nextResearchChecks: string[];
};

type PriorityDeskResponse = {
  generatedAt: string;
  timeframe: string;
  bestEquities: Packet[];
  bestCrypto: Packet[];
  bestOptionsPressure: Packet[];
  bestVolatilityCompression: Packet[];
  bestTimeConfluence: Packet[];
  bestNewsDriven: Packet[];
  bestEarningsWatch: Packet[];
  avoidTrapList: Packet[];
  dataDegradedList: Packet[];
  arcaTopCandidate: Packet | null;
};

export default function PriorityDeskPage() {
  const [data, setData] = useState<PriorityDeskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/priority-desk", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (alive) setData(json as PriorityDeskResponse);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load priority desk");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-4 text-white">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Priority Desk</h1>
          <p className="text-xs uppercase tracking-wider text-emerald-300/80">
            Private Research Intelligence Desk - no broker execution
          </p>
        </div>
        <div className="text-right text-xs text-white/45">
          <div>{loading ? "Refreshing..." : "Live"}</div>
          <div>{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "--"}</div>
        </div>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {data?.arcaTopCandidate && (
        <section className="rounded-xl border border-cyan-400/30 bg-cyan-500/5 p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-cyan-300">ARCA Top Research Candidate</div>
          <Row packet={data.arcaTopCandidate} />
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Best Equity Research Setups" rows={data?.bestEquities || []} />
        <Panel title="Best Crypto Research Setups" rows={data?.bestCrypto || []} />
        <Panel title="Best Options-Pressure Setups" rows={data?.bestOptionsPressure || []} />
        <Panel title="Best Volatility-Compression Setups" rows={data?.bestVolatilityCompression || []} />
        <Panel title="Best Time-Confluence Setups" rows={data?.bestTimeConfluence || []} />
        <Panel title="Best News-Driven Setups" rows={data?.bestNewsDriven || []} />
        <Panel title="Best Earnings-Watch Setups" rows={data?.bestEarningsWatch || []} />
        <Panel title="Avoid / Trap List" rows={data?.avoidTrapList || []} danger />
        <Panel title="Data-Degraded List" rows={data?.dataDegradedList || []} danger />
      </div>

      <AdminResearchEventTape limit={50} />
    </div>
  );
}

function Panel({ title, rows, danger = false }: { title: string; rows: Packet[]; danger?: boolean }) {
  return (
    <section className={`rounded-xl border p-3 ${danger ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-[#0F172A]/60"}`}>
      <h2 className="mb-2 text-sm font-bold text-white/90">{title}</h2>
      <div className="space-y-2">
        {rows.map((row) => <Row key={`${title}:${row.symbol}:${row.setup.type}`} packet={row} />)}
        {rows.length === 0 && <div className="py-2 text-xs text-white/45">No rows.</div>}
      </div>
    </section>
  );
}

function Row({ packet }: { packet: Packet }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-emerald-300">{packet.symbol}</div>
        <div className="text-white/60">{packet.assetClass}</div>
      </div>
      <div className="mt-1 grid gap-1 md:grid-cols-2">
        <div>Setup: <span className="text-white/80">{packet.setup.label || packet.setup.type}</span></div>
        <div>Trust-Adjusted: <span className="text-white/80">{packet.trustAdjustedScore.toFixed(1)}</span></div>
        <div>Data Trust: <span className="text-white/80">{packet.dataTrustScore.toFixed(1)}</span></div>
        <div>Lifecycle: <span className="text-white/80">{packet.lifecycle}</span></div>
      </div>
      <div className="mt-1 text-white/80">Why ranked: {packet.primaryReason}</div>
      <div className="text-amber-200/85">Main risk: {packet.mainRisk}</div>
      <div className="text-white/65">What changed: {packet.whatChanged}</div>
      <div className="text-white/65">Next check: {packet.nextResearchChecks?.[0] || "Re-evaluate after next scan."}</div>
      <div className="mt-1">
        <Link href={`/admin/symbol/${encodeURIComponent(packet.symbol)}`} className="text-cyan-300 hover:text-cyan-200">
          Open Symbol Research Terminal
        </Link>
      </div>
    </div>
  );
}
