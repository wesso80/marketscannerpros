"use client";

/**
 * Position (weekly/daily) levels display, shared by the admin decision pages. These are the main levels for the
 * team's 6+ week position trades; the scan's 15m levels are shown separately as "Intraday timing (15m)".
 * Maths: lib/admin/positionLevels.
 */
import {
  INTRADAY_LEVELS_LABEL,
  POSITION_LEVELS_LABEL,
  entryStatusLabel,
  positionFlags,
  positionLevelView,
  type PositionLevelView,
  type PositionLevels,
} from "@/lib/admin/positionLevels";
import { formatHitPrice } from "@/lib/admin/hitIntegrity";

export { INTRADAY_LEVELS_LABEL, POSITION_LEVELS_LABEL };

const px = (n: number | null | undefined) => formatHitPrice(n ?? null);

/** Accepts a ready view (hits, edge packets) or the raw levels + bias (snapshots). */
export function resolvePositionView(input: { view?: PositionLevelView | null; levels?: PositionLevels | null; bias?: string | null }): PositionLevelView {
  if (input.view && typeof input.view === "object" && "status" in input.view) return input.view;
  return positionLevelView(input.levels ?? null, input.bias ?? null);
}

/** Timeframe tag so the two level sets are never confused. */
export function TimeframeTag({ kind }: { kind: "position" | "intraday" }) {
  return kind === "position"
    ? <span className="rounded border border-sky-400/40 bg-sky-500/10 px-1 text-[10px] font-bold text-sky-200">{POSITION_LEVELS_LABEL}</span>
    : <span className="rounded border border-white/15 bg-white/5 px-1 text-[10px] text-white/45">{INTRADAY_LEVELS_LABEL}</span>;
}

/** One-line position levels: trigger/zone, stop, TP1-TP3 with R, hold, flags. */
export function PositionLevelsLine(props: { view?: PositionLevelView | null; levels?: PositionLevels | null; bias?: string | null; className?: string }) {
  const v = resolvePositionView(props);
  if (v.status !== "ok") {
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${props.className ?? ""}`}>
        <TimeframeTag kind="position" />
        <span className="text-amber-300/90">{v.message}</span>
      </div>
    );
  }
  const flags = positionFlags(v);
  const tp = (label: string, i: number) => {
    const t = v.targets[i];
    if (!t) return null;
    return (
      <span className="text-emerald-200/90" title={t.source}>
        {label} {px(t.price)} <span className="text-white/40">({t.r}R{t.timeframe === "projection" ? " proj" : t.timeframe === "monthly" ? " M" : " W"})</span>
      </span>
    );
  };
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] ${props.className ?? ""}`}>
      <TimeframeTag kind="position" />
      <span className="text-white/75" title={`${v.triggerSource ?? ""}. ${v.entryNote ?? ""}`}>
        Trigger {px(v.entryTrigger)} <span className="text-white/40">(daily close {v.direction === "LONG" ? "above" : "below"}; zone {px(v.entryZoneLow)}–{px(v.entryZoneHigh)}; {entryStatusLabel(v.entryStatus)})</span>
      </span>
      <span className="text-red-300" title={v.stopSource ?? undefined}>
        Stop {px(v.stop)} <span className="text-white/40">({v.direction === "LONG" ? "below" : "above"} weekly {v.direction === "LONG" ? "low" : "high"} {px(v.stopLevel)}; risk {v.riskPct}%)</span>
      </span>
      {v.obstacles.length > 0 && (
        <span className="text-amber-200/70" title={v.obstacles.map((o) => `${o.source} ${px(o.price)} (${o.r}R)`).join("; ")}>
          {v.obstacles.length} level{v.obstacles.length === 1 ? "" : "s"} before TP1
        </span>
      )}
      {tp("TP1", 0)}
      {tp("TP2", 1)}
      {tp("TP3", 2)}
      <span className="text-white/45">Hold {v.expectedHold.split(" (")[0]}</span>
      {flags.map((f) => <span key={f} className="rounded bg-amber-500/15 px-1 text-amber-200">{f}</span>)}
    </div>
  );
}

/** Card for the symbol / terminal pages: full position plan with sources. */
export function PositionLevelsCard(props: { view?: PositionLevelView | null; levels?: PositionLevels | null; bias?: string | null }) {
  const v = resolvePositionView(props);
  const row = (label: string, value: string, tone = "text-white/85", title?: string) => (
    <div className="flex items-center justify-between gap-3 py-1 text-sm" title={title}>
      <span className="text-white/55">{label}</span>
      <span className={`font-medium ${tone}`}>{value}</span>
    </div>
  );
  return (
    <div className="rounded-lg border border-sky-400/25 bg-[#101826] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white/90">Position plan</div>
        <TimeframeTag kind="position" />
      </div>
      {v.status !== "ok" ? (
        <div className="text-sm text-amber-300/90">{v.message}</div>
      ) : (
        <>
          {row("Direction", v.direction === "LONG" ? "Long" : "Short", v.direction === "LONG" ? "text-emerald-300" : "text-red-300")}
          {row("Entry trigger (daily close)", `${px(v.entryTrigger)} ${v.direction === "LONG" ? "close above" : "close below"}`, "text-white/85", v.triggerSource ?? undefined)}
          {row("Entry zone", `${px(v.entryZoneLow)}–${px(v.entryZoneHigh)} · ${entryStatusLabel(v.entryStatus)}`)}
          {row("Stop (weekly)", `${px(v.stop)} · ${v.stopAtr} ATR · ${v.riskPct}%`, "text-red-300", v.stopSource ?? undefined)}
          {v.targets.map((t, i) => row(`Target ${i + 1} (${t.timeframe === "projection" ? "projection" : t.timeframe})`, `${px(t.price)} · ${t.r}R`, "text-emerald-200", t.source))}
          {v.obstacles.length > 0 && row(
            `Levels before TP1 (< ${v.minRewardR}R)`,
            v.obstacles.map((o) => `${px(o.price)} (${o.r}R)`).join(", "),
            "text-amber-200/80",
            v.obstacles.map((o) => o.source).join("; "),
          )}
          {row("Expected hold", v.expectedHold, "text-white/70")}
          {row(`Daily ATR(${v.atrPeriod})`, `${px(v.atr)}${v.atrPct != null ? ` · ${v.atrPct}%` : ""}`, "text-white/60")}
          {v.entryNote && <div className="mt-1 text-[11px] text-white/55">{v.entryNote}</div>}
          {positionFlags(v).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
              {positionFlags(v).map((f) => <span key={f} className="rounded bg-amber-500/15 px-1 text-amber-200">{f}</span>)}
            </div>
          )}
          <div className="mt-2 text-[10px] text-white/35">
            Stop beyond the latest weekly swing ± 0.5 daily ATR; targets at weekly/monthly levels (min 1.5R); daily bars as of {v.dailyAsOf ?? "—"}. Research only, no execution.
          </div>
        </>
      )}
    </div>
  );
}
