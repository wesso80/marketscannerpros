"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AdminResearchEventTape from "@/components/admin/AdminResearchEventTape";
import SavedScanStatus, { type SavedScanStatusData } from "@/components/admin/SavedScanStatus";

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
  savedScan?: { status: string; ageLabel: string; stale: boolean; error: string | null };
};

type PriorityDeskResponse = {
  generatedAt: string | null;
  savedScan?: { equities: SavedScanStatusData; crypto: SavedScanStatusData };
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

  // Reads saved results (cheap DB read). Poll every 2 min, never overlapping; a rescan re-polls sooner.
  const inFlight = useRef(false);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/priority-desk", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      if (alive.current) setData(json as PriorityDeskResponse);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : "Failed to load priority desk");
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const id = setInterval(load, 120_000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [load]);

  const afterRescan = useCallback(() => {
    // Results are saved per symbol as the run progresses; re-read a few times.
    [30_000, 90_000, 180_000].forEach((ms) => setTimeout(() => { if (alive.current) load(); }, ms));
  }, [load]);

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
          <div>{loading ? "Refreshing..." : "Saved scan results"}</div>
          <div>Newest result: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "--"}</div>
        </div>
      </header>

      <section className="space-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
        <SavedScanStatus status={data?.savedScan?.equities} onRescanStarted={afterRescan} />
        <SavedScanStatus status={data?.savedScan?.crypto} onRescanStarted={afterRescan} />
        <div className="text-[10px] text-white/35">
          Rankings use saved results that are current and succeeded; failed, skipped or stale symbols are listed under Data-Degraded.
        </div>
      </section>

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
        <Panel
          title="Best Options-Pressure Setups — PLACEHOLDER"
          note="Placeholder: options pressure is a synthetic estimate derived from price indicators, not real options-chain data. Do not read it as real options flow."
          rows={data?.bestOptionsPressure || []}
        />
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

function Panel({ title, rows, danger = false, note }: { title: string; rows: Packet[]; danger?: boolean; note?: string }) {
  return (
    <section className={`rounded-xl border p-3 ${danger ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-[#0F172A]/60"}`}>
      <h2 className="mb-2 text-sm font-bold text-white/90">{title}</h2>
      {note && <div className="mb-2 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">{note}</div>}
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
        <div className="text-white/60">
          {packet.assetClass}
          {packet.savedScan && (
            <span className={packet.savedScan.status !== "ok" || packet.savedScan.stale ? "ml-2 text-amber-300" : "ml-2 text-white/40"}>
              {packet.savedScan.status !== "ok" ? `${packet.savedScan.status} · ` : packet.savedScan.stale ? "stale · " : ""}
              scanned {packet.savedScan.ageLabel}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>Setup: <span className="text-white/80">{packet.setup.label || packet.setup.type}</span></div>
        <div>Trust-Adjusted: <span className="text-white/80">{packet.trustAdjustedScore.toFixed(1)}</span></div>
        <div>Data Trust: <span className="text-white/80">{packet.dataTrustScore.toFixed(1)}</span></div>
        <div>Lifecycle: <span className="text-white/80">{packet.lifecycle}</span></div>
      </div>
      <div className="mt-1 text-white/80">Why ranked: {packet.primaryReason}</div>
      <div className="text-amber-200/85">Main risk: {packet.mainRisk}</div>
      <div className="text-white/65">What changed: {packet.whatChanged}</div>
      <div className="text-white/65">Next check: {packet.nextResearchChecks?.[0] || "Re-evaluate after next scan."}</div>
      {packet.savedScan?.error && <div className="text-red-300/80">Last scan: {packet.savedScan.error}</div>}
      <div className="mt-1">
        <Link href={`/admin/symbol/${encodeURIComponent(packet.symbol)}`} className="text-cyan-300 hover:text-cyan-200">
          Open Symbol Research Terminal
        </Link>
      </div>
    </div>
  );
}
