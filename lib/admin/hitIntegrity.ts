/**
 * Scanner-hit integrity helpers (pure, no DB) used by the saved-scan readers and the
 * /api/admin/scanner/live feed.
 *
 * - normalizeHitConfidence: legacy saved hits stored `confidence` as a 0..1 fraction
 *   (serializer bug), which every page rendered as "0.8%". New hits carry
 *   `confidenceUnit: "pct"`; legacy ones are rescaled on read so the pages are right
 *   before the next rescan.
 * - collapseHits: the engine emits one pipeline per playbook, so one symbol can have
 *   several rows, sometimes LONG and SHORT at once. Keep the best row per
 *   symbol + direction (other playbooks listed on it) and flag symbols that have both
 *   directions as `twoSided`. LONG and SHORT are ranked with exactly the same rules;
 *   neither side is dropped or preferred.
 */
import type { ScannerHit } from "@/lib/admin/types";

export function normalizeHitConfidence<T extends { confidence?: number; confidenceUnit?: string }>(hit: T): T {
  if (!hit || hit.confidenceUnit === "pct") return hit;
  const c = Number(hit.confidence);
  if (!Number.isFinite(c) || c < 0 || c > 1) return hit;
  return { ...hit, confidence: Math.round(c * 1000) / 10, confidenceUnit: "pct" };
}

const DEAD_STATES = new Set(["INVALIDATED", "EXPIRED"]);
const PERMISSION_RANK: Record<string, number> = { GO: 2, WAIT: 1, BLOCK: 0 };

/** Positive when `a` is the better row. Same rules for LONG and SHORT. */
export function compareHits(a: ScannerHit, b: ScannerHit): number {
  const deadA = DEAD_STATES.has(String(a.setupState ?? "")) ? 1 : 0;
  const deadB = DEAD_STATES.has(String(b.setupState ?? "")) ? 1 : 0;
  if (deadA !== deadB) return deadB - deadA;
  const permA = PERMISSION_RANK[a.marketPermission] ?? 0;
  const permB = PERMISSION_RANK[b.marketPermission] ?? 0;
  if (permA !== permB) return permA - permB;
  const confA = Number(a.confidence) || 0;
  const confB = Number(b.confidence) || 0;
  if (confA !== confB) return confA - confB;
  return (Number(a.eliteScore) || 0) - (Number(b.eliteScore) || 0);
}

/**
 * One row per symbol + direction (best playbook wins, the rest listed in `otherPlaybooks`);
 * symbols with both a LONG and a SHORT row are kept in both directions and marked `twoSided`.
 * Output is sorted by confidence (desc), like the feed was before.
 */
export function collapseHits(hits: ScannerHit[]): ScannerHit[] {
  const best = new Map<string, { hit: ScannerHit; others: string[] }>();
  for (const hit of hits) {
    if (!hit?.symbol) continue;
    const key = `${hit.symbol.toUpperCase()}|${hit.bias}`;
    const cur = best.get(key);
    if (!cur) {
      best.set(key, { hit, others: [] });
      continue;
    }
    if (compareHits(hit, cur.hit) > 0) {
      if (cur.hit.playbook) cur.others.push(String(cur.hit.playbook));
      cur.hit = hit;
    } else if (hit.playbook) {
      cur.others.push(String(hit.playbook));
    }
  }
  const directions = new Map<string, Set<string>>();
  for (const { hit } of best.values()) {
    const sym = hit.symbol.toUpperCase();
    if (!directions.has(sym)) directions.set(sym, new Set());
    directions.get(sym)!.add(hit.bias);
  }
  return [...best.values()]
    .map(({ hit, others }) => {
      const dirs = directions.get(hit.symbol.toUpperCase())!;
      const twoSided = dirs.has("LONG") && dirs.has("SHORT");
      const otherPlaybooks = [...new Set(others)].filter((p) => p !== String(hit.playbook ?? ""));
      return {
        ...hit,
        ...(otherPlaybooks.length ? { otherPlaybooks } : {}),
        ...(twoSided ? { twoSided: true } : {}),
      };
    })
    .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
}

/** Stable, unique React key for a hit row (symbols repeat across playbooks/directions). */
export function hitRowKey(hit: Pick<ScannerHit, "symbol" | "bias" | "playbook">, index: number): string {
  return `${hit.symbol}|${hit.bias}|${hit.playbook ?? ""}|${index}`;
}

/**
 * Tooltip for the verdict pill. Discovery surfaces show `marketPermission` (doctrine, lib/admin/modes.ts);
 * the governance/portfolio permission and its reasons stay visible here.
 */
export function hitPermissionTitle(hit: Pick<ScannerHit, "marketPermission" | "permission" | "blockReasons" | "sizeMultiplier">): string {
  const parts = [`Market verdict: ${hit.marketPermission}`, `Governance/portfolio: ${hit.permission}`];
  if (hit.blockReasons?.length) parts.push(`Reasons: ${hit.blockReasons.join(", ")}`);
  parts.push(`Engine size: ${hit.sizeMultiplier}x`);
  return parts.join(" · ");
}

/** Compact absolute price (crypto sub-dollar prices keep significant digits). */
export function formatHitPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return "—";
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(4);
}

/** Label for the "other playbooks" suffix, e.g. "+2". */
export function otherPlaybooksLabel(hit: Pick<ScannerHit, "otherPlaybooks">): string | null {
  const n = hit.otherPlaybooks?.length ?? 0;
  return n > 0 ? `+${n}` : null;
}

/**
 * Symbol-intelligence `confidence` is a 0..1 fraction (serializer pipelineToSymbolIntelligence; the research
 * packet uses it as a score). Render it as a percent; values already > 1 are treated as percents.
 */
export function fractionConfidencePct(confidence: number | null | undefined): string {
  const c = Number(confidence);
  if (!Number.isFinite(c)) return "—";
  return `${(c <= 1 ? c * 100 : c).toFixed(1)}%`;
}
