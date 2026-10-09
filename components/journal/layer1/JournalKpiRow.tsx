import { JournalKpisModel } from "@/types/journal";
import { formatUsd } from "@/lib/journal/display";
import StatTile from "@/components/visual/StatTile";
function metricMoney(value: number): string {
  return Math.abs(value) >= 10_000
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value)
    : formatUsd(value);
}
/** Personal records only; zero/missing metrics are omitted rather than shown as placeholders. */
export default function JournalKpiRow({ kpis }: { kpis?: JournalKpisModel }) {
  if (!kpis) return null;
  const metrics = [
    {
      label: "Recorded P&L",
      raw: kpis.realizedPnlTotal,
      value: metricMoney(kpis.realizedPnlTotal ?? 0),
    },
    {
      label: "Realized P&L · 30 days",
      raw: kpis.realizedPnl30d,
      value: metricMoney(kpis.realizedPnl30d),
    },
    {
      label: "Estimated open P&L",
      raw: kpis.unrealizedPnlOpen,
      value: metricMoney(kpis.unrealizedPnlOpen ?? 0),
    },
    {
      label: "Win rate · your own trades",
      raw: kpis.winRate30d,
      value: `${((kpis.winRate30d ?? 0) * 100).toFixed(1)}%`,
    },
    {
      label: "Profit factor · 30 days",
      raw: kpis.profitFactor30d,
      value: (kpis.profitFactor30d ?? 0).toFixed(2),
    },
  ].filter(
    (metric) =>
      typeof metric.raw === "number" &&
      Number.isFinite(metric.raw) &&
      metric.raw !== 0,
  );
  return (
    <>
      <div
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 100px), 1fr))",
        }}
        className="grid gap-2 [&_[data-stat-card]]:p-2 [&_[data-stat-card]]:space-y-1 [&_[data-stat-card]>p:first-child]:!text-lg"
      >
        {metrics.map((metric) => (
          <StatTile
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Personal records only; automated and paper research are excluded.
        Periods use close dates. Open P&amp;L is an estimate before fees, not
        account equity.
        {kpis.unpricedOpenTrades
          ? ` ${kpis.unpricedOpenTrades} open records need a usable quote before a complete total can be measured.`
          : ""}
        {kpis.excludedClosedTrades
          ? ` ${kpis.excludedClosedTrades} closed records lack a valid close date or P&L and are excluded.`
          : ""}
      </p>
    </>
  );
}
