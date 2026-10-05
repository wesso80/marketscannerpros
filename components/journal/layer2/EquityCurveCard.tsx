import { EquityCurveModel } from "@/types/journal";
import { formatUsd } from "@/lib/journal/display";
export default function EquityCurveCard({
  equityCurve,
}: {
  equityCurve?: EquityCurveModel;
}) {
  const points = equityCurve?.points ?? [];
  if (!points.length) return null;
  const values = points.map((p) => p.value),
    min = Math.min(0, ...values),
    max = Math.max(0, ...values),
    range = max - min || 1;
  const line = points
    .map(
      (p, i) =>
        `${points.length > 1 ? (i / (points.length - 1)) * 300 : 150},${75 - ((p.value - min) / range) * 65}`,
    )
    .join(" ");
  return (
    <figure className="rounded-lg border border-slate-700 p-3">
      <figcaption className="flex flex-wrap justify-between gap-2 text-sm">
        <span>
          Cumulative closed P&amp;L · {points.length} personal records
        </span>
        <strong>{formatUsd(values[values.length - 1])}</strong>
      </figcaption>
      <svg
        viewBox="0 0 300 85"
        role="img"
        aria-label="Cumulative personal closed P&L"
        className="mt-2 h-12 w-full"
        preserveAspectRatio="none"
      >
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={points.length > 1 ? 300 : 150}
          cy={75 - ((values[values.length - 1] - min) / range) * 65}
          r="2"
          fill="currentColor"
        />
      </svg>
    </figure>
  );
}
