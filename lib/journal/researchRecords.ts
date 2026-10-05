/** Shared presentation classification; saved records and free-tier counting stay intact. */
const AUTO_STRATEGIES = new Set([
  "scanner_signal",
  "strategy_signal",
  "alert_intelligence",
  "confluence_scan",
  "confluence_scanner",
  "options_confluence_scanner",
]);
export function isResearchRecord(row: {
  strategyTag?: string;
  strategy?: string;
  tags?: string[];
  executionMode?: string;
  execution_mode?: string;
}): boolean {
  if (
    String(row.executionMode ?? row.execution_mode ?? "").toUpperCase() ===
    "PAPER"
  )
    return true;
  const strategy = String(row.strategyTag ?? row.strategy ?? "").toLowerCase();
  return (
    AUTO_STRATEGIES.has(strategy) ||
    strategy.startsWith("auto_") ||
    (row.tags ?? []).some((raw) => {
      const tag = String(raw).toLowerCase();
      return (
        tag.startsWith("auto_") ||
        tag === "execution_engine" ||
        tag === "paper_trade" ||
        AUTO_STRATEGIES.has(tag)
      );
    })
  );
}
