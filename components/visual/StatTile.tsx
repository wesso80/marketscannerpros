import StatCard from "./StatCard";
import { sectorTone } from "@/lib/overview/today";
/** Display only; callers supply measured values, never placeholder zeroes. */
export default function StatTile({
  label,
  value,
  change,
  warning = false,
}: {
  label: string;
  value: string | number | null | undefined;
  change?: number | null;
  warning?: boolean;
}) {
  if (value == null || (typeof value === "number" && !Number.isFinite(value)))
    return null;
  const measuredChange =
    typeof change === "number" && Number.isFinite(change) ? change : null;
  return (
    <StatCard
      label={label}
      value={String(value)}
      large
      color={warning ? "var(--msp-warn)" : sectorTone(measuredChange).color}
      detail={
        measuredChange == null
          ? undefined
          : `${measuredChange > 0 ? "+" : ""}${measuredChange}%`
      }
    />
  );
}
