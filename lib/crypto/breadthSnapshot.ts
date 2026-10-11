/**
 * Breadth for one trending snapshot.
 * The coin list and the 24h signs both come from the cached /search/trending payload.
 * Live simple prices stay noStore for freshness and are not part of this percent.
 */
export interface BreadthCoin { id: string; change24h: number | null }
export interface BreadthCategory { change1h: number | null }
export interface BreadthInputs { coins: BreadthCoin[]; categories: BreadthCategory[] }
export interface BreadthSnapshot {
  percent: number;
  asOf: string;
  coinUpPct: number;
  universe: string[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const memory = new Map<string, BreadthSnapshot>();

export function resetBreadthMemory() { memory.clear(); }

export function breadthInputsFromTrending(trending: {
  coins?: { item: { id: string; data?: { price_change_percentage_24h?: { usd?: number } } } }[];
  categories?: { market_cap_1h_change?: number }[];
} | null | undefined): BreadthInputs {
  return {
    coins: (trending?.coins ?? []).map(({ item }) => ({
      id: item.id,
      change24h: finite(item.data?.price_change_percentage_24h?.usd) ? item.data!.price_change_percentage_24h!.usd : null,
    })),
    categories: (trending?.categories ?? []).slice(0, 5).map((cat) => ({
      change1h: finite(cat.market_cap_1h_change) ? cat.market_cap_1h_change : null,
    })),
  };
}

export function breadthPercent(inputs: BreadthInputs): { percent: number; coinUpPct: number; universe: string[] } | null {
  const coins = inputs.coins.filter((c) => c.id && finite(c.change24h));
  if (!coins.length) return null;
  const coinUpPct = (coins.filter((c) => (c.change24h as number) > 0).length / coins.length) * 100;
  const cats = inputs.categories.filter((c) => finite(c.change1h));
  const catUpPct = cats.length ? (cats.filter((c) => (c.change1h as number) > 0).length / cats.length) * 100 : coinUpPct;
  return {
    percent: Math.round(coinUpPct * 0.7 + catUpPct * 0.3),
    coinUpPct,
    universe: coins.map((c) => c.id),
  };
}

/** Same snapshot content keeps the same percent and as-of. A new snapshot gets a new as-of. */
export function rememberBreadthSnapshot(inputs: BreadthInputs, now = new Date()): BreadthSnapshot | null {
  const measured = breadthPercent(inputs);
  if (!measured) return null;
  const key = `${measured.universe.map((id, i) => `${id}:${inputs.coins.find((c) => c.id === id)?.change24h}`).join('|')}#${inputs.categories.map((c) => c.change1h ?? 'x').join('|')}`;
  const hit = memory.get(key);
  if (hit) return hit;
  const snap: BreadthSnapshot = { ...measured, asOf: now.toISOString() };
  memory.set(key, snap);
  if (memory.size > 32) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  return snap;
}

export function formatBreadthAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${hh}:${mm} UTC`;
}
