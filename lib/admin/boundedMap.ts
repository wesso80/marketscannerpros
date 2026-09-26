/**
 * Map over items with at most `limit` promises in flight; results keep input order.
 * Admin routes use it for per-symbol DB work so one page load neither runs ~2 queries per
 * symbol strictly one after another (slow) nor grabs the whole pg pool at once (starves
 * the other admin requests sharing it).
 */
export async function boundedMap<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: width }, worker));
  return out;
}
