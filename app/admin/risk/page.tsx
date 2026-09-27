"use client";

import { useState } from "react";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import MiniStat from "@/components/admin/shared/MiniStat";
import StatusPill from "@/components/admin/shared/StatusPill";
import { useRiskState } from "@/lib/admin/hooks";

export default function RiskPage() {
  const { risk, error, refetch } = useRiskState(15_000);

  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const capture = async () => {
    setCapturing(true);
    setCaptureMessage(null);
    try {
      const response = await fetch('/api/admin/risk/capture', { method: 'POST', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Capture failed');
      setCaptureMessage(data.status === 'captured' ? `Saved account observation for ${data.date} UTC.`
        : data.status === 'blocked' ? data.reason : 'Capture is already running or was checked in the last minute.');
      await refetch();
    } catch (err) { setCaptureMessage(err instanceof Error ? err.message : 'Capture failed'); }
    finally { setCapturing(false); }
  };

  const exposure = risk?.openExposure ?? 0;
  const openRiskUsd = risk?.openRiskUsd ?? 0;
  const drawdown = risk?.dailyDrawdown ?? 0;
  const killActive = risk?.killSwitchActive ?? false;

  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Research Guard" subtitle={error ? `Error: ${error}` : undefined} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
        <MiniStat label="Open Risk" value={`$${openRiskUsd.toLocaleString()}`} />
        <MiniStat label="Snapshot Daily Loss" value={risk?.dailyDrawdownKnown ? `${(drawdown * 100).toFixed(2)}%` : "Unavailable"} />
        <MiniStat label="Correlation Risk" value={risk ? `${(risk.correlationRisk * 100).toFixed(0)}%` : "—"} />
        <MiniStat label="Open Scenarios" value={risk ? `${risk.activePositions} / ${risk.maxPositions}` : "\u2014 / \u2014"} />
      </div>

      <AdminCard title="Alert Posture" actions={
        <button
          onClick={refetch}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white/60 hover:bg-white/20 transition"
        >
          ↻ Refresh
        </button>
      }>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-white/55 text-sm">Research Gate</span>
            <StatusPill
              label={risk?.permission ?? "WAIT"}
              tone={risk?.permission === "GO" ? "green" : risk?.permission === "BLOCK" ? "red" : "yellow"}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55 text-sm">Data Source</span>
            <span className="text-white/60 text-xs font-mono">{risk?.source ?? "fallback"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55 text-sm">Open Exposure</span>
            <span className="text-white/90 text-sm font-mono">{risk?.equity ? `${(exposure * 100).toFixed(2)}%` : "Unavailable"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55 text-sm">Size Multiplier</span>
            <span className="text-white/90 text-sm font-mono">{risk?.sizeMultiplier?.toFixed(2) ?? "—"}×</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55 text-sm">Alert Posture</span>
            <StatusPill
              label={killActive ? "ALERTS PAUSED" : "ALERTS ACTIVE"}
              tone={killActive ? "red" : "green"}
            />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Risk Data Basis">
        <div className="space-y-2 text-sm text-white/70">
          <p>Account equity: {risk?.equity ? `$${risk.equity.toLocaleString()}` : "Unavailable"}</p>
          <p>Prior-day baseline: {risk?.dailyRiskBaselineEquity ? `$${risk.dailyRiskBaselineEquity.toLocaleString()}` : "Unavailable"}</p>
          <p>Snapshot date (UTC): {risk?.dailyRiskAsOf ?? "Unavailable"}</p>
          {risk?.notes?.map((note, i) => <p key={i}>{note}</p>)}
        </div>
      </AdminCard>

      <AdminCard title="Scheduled Account History" actions={
        <button onClick={capture} disabled={capturing}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/20 disabled:opacity-50">
          {capturing ? 'Checking account…' : risk?.capture?.enabled ? 'Capture current equity' : 'Start daily account history'}
        </button>
      }>
        <div className="space-y-2 text-sm text-white/70">
          <p>{risk?.capture?.enabled ? 'Enabled: the data worker checks this account every 15 minutes.' : 'Not enabled for this account.'}</p>
          <p>Uses saved capital and cash flows, reconciled closed positions, and provider-timestamped prices or completed equity session closes. Missing or unsupported inputs pause capture.</p>
          <p>Recorded days: {risk?.capture?.observations ?? 0} · Latest date: {risk?.capture?.latest_date ?? 'None'}</p>
          <p>Last successful capture: {risk?.capture?.last_success_at ?? 'None'}</p>
          {risk?.capture?.last_error && <p className="text-amber-300">Capture paused: {risk.capture.last_error}</p>}
          {captureMessage && <p role="status">{captureMessage}</p>}
          <p>Only the current UTC date is recorded. Daily loss remains unavailable until consecutive days exist. Options, futures and margin positions require a supported contract valuation before unattended capture can run.</p>
        </div>
      </AdminCard>

      <AdminCard title="Research Scenario Limits">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-white/55">Max Concurrent Scenarios</span>
            <span className="text-white/90 font-mono">{risk?.maxPositions ?? 10}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55">Active Research Scenarios</span>
            <span className="text-white/90 font-mono">{risk?.activePositions ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55">Daily Loss Guard</span>
            <span className="text-white/90 font-mono">2.0%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55">Daily Loss Hard Stop</span>
            <span className="text-white/90 font-mono">4.0%</span>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
