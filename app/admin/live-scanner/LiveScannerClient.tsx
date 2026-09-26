"use client";

import { useState } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusPill from "@/components/admin/shared/StatusPill";
import { useScannerFeed } from "@/lib/admin/hooks";
import type { ScannerHit } from "@/lib/admin/types";
import { unionWatchlistSymbols } from "@/lib/operator/watchlists";

// Full deduped universe per market (DEFAULT_WATCHLISTS) — anchors pinned first.
// Admin-only page; safe to leak the wider universe (see no-public-leakage).
const SYMBOLS: Record<"CRYPTO" | "EQUITIES", string[]> = {
  CRYPTO: unionWatchlistSymbols("CRYPTO", ["BTC", "ETH", "SOL", "ADA", "AVAX", "DOT", "SUI", "LINK", "MATIC", "XRP"]),
  EQUITIES: unionWatchlistSymbols("EQUITIES", ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"]),
};

function permTone(p: string): "green" | "yellow" | "red" {
  if (p === "GO") return "green";
  if (p === "WAIT") return "yellow";
  return "red";
}

function HitRow({ hit }: { hit: ScannerHit }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 60px 70px 1fr 80px 70px 70px 90px", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "0.5rem 0", fontSize: "0.875rem" }}>
      <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{hit.symbol}</span>
      <StatusPill label={hit.bias} tone={hit.bias === "LONG" ? "green" : hit.bias === "SHORT" ? "red" : "neutral"} />
      <span style={{ textAlign: "right", fontFamily: "monospace", color: "#6EE7B7" }}>{hit.eliteScore != null ? hit.eliteScore.toFixed(1) : "—"}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>{hit.playbook ?? "—"}</span>
      <span><StatusPill label={hit.permission} tone={permTone(hit.permission)} /></span>
      <span style={{ textAlign: "right", fontFamily: "monospace", color: "rgba(255,255,255,0.7)" }}>{hit.confidence.toFixed(1)}%</span>
      <span style={{ textAlign: "right", fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>{hit.symbolTrust}%</span>
      <span style={{ textAlign: "right", fontSize: "0.625rem", color: "rgba(255,255,255,0.4)" }}>{hit.setupState ?? "—"}</span>
    </div>
  );
}

export default function LiveScannerClient({ cryptoEnabled, defaultMarket = "EQUITIES" }: { cryptoEnabled: boolean; defaultMarket?: "CRYPTO" | "EQUITIES" }) {
  const [polling, setPolling] = useState(false);
  // Crypto only when crypto market data is on; otherwise the equities saved scan (it used to be crypto-only).
  const [market, setMarket] = useState<"CRYPTO" | "EQUITIES">(cryptoEnabled ? defaultMarket : "EQUITIES");
  const { hits, health, loading, error, refetch } = useScannerFeed(
    SYMBOLS[market],
    market,
    "15m",
    polling ? 60_000 : 0,
  );

  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Live Scanner Feed" subtitle={health?.lastScanAt ? `Last scan: ${new Date(health.lastScanAt).toLocaleTimeString()}` : undefined} />

      <AdminCard title="Scanner Controls" actions={
        <div className="flex items-center gap-2">
          {(["EQUITIES", "CRYPTO"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              disabled={m === "CRYPTO" && !cryptoEnabled}
              title={m === "CRYPTO" && !cryptoEnabled ? "Admin crypto is switched off (ADMIN_CRYPTO_ENABLED=false)" : undefined}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${market === m ? "bg-sky-500/20 text-sky-200" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
            >
              {m === "EQUITIES" ? "Equities" : "Crypto"}
            </button>
          ))}
          <button
            onClick={() => setPolling((p) => !p)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${polling ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
          >
            {polling ? "⏸ Stop Auto" : "▶ Auto-Refresh"}
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white/60 hover:bg-white/20 disabled:opacity-40 transition"
          >
            {loading ? "Loading…" : "↻ Reload saved"}
          </button>
        </div>
      }>
        <div className="flex items-center gap-3">
          <StatusPill label={health?.scanner === "RUNNING" ? "Running" : "Idle"} tone={health?.scanner === "RUNNING" ? "green" : "neutral"} />
          <span className="text-white/50 text-xs">
            {hits.length} hit{hits.length !== 1 ? "s" : ""} · {health?.symbolsScanned ?? 0} symbols scanned
          </span>
          {error && <span className="text-red-400 text-xs">{error}</span>}
          {!cryptoEnabled && <span className="text-amber-300/80 text-xs">Crypto switched off</span>}
        </div>
      </AdminCard>

      <AdminCard title="Scanner Results">
        {hits.length === 0 ? (
          <p className="text-white/30 text-sm py-4 text-center">
            {loading ? "Loading saved results…" : "No current setups in the saved admin scan. Results refresh on the shared scan schedule; \"Rescan now\" is on Priority Desk / Operator Terminal."}
          </p>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "80px 60px 70px 1fr 80px 70px 70px 90px", gap: "0.5rem", paddingBottom: "0.5rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <span>Symbol</span>
              <span>Bias</span>
              <span style={{ textAlign: "right" }}>Elite</span>
              <span>Playbook</span>
              <span>Verdict</span>
              <span style={{ textAlign: "right" }}>Score</span>
              <span style={{ textAlign: "right" }}>Trust</span>
              <span style={{ textAlign: "right" }}>State</span>
            </div>
            {hits.map((hit) => (
              <HitRow key={hit.symbol} hit={hit} />
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
