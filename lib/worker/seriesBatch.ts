/** Symbols handled back-to-back before the worker drops in-process bar arrays. */
export const WORKER_INGEST_BATCH = 20;

/**
 * Split `items` into sequential batches of `size`. The worker processes one batch, then releases bar arrays,
 * so a cycle never keeps the whole universe's history live at once. Order is unchanged; nothing is dropped.
 */
export function sequentialBatches<T>(items: readonly T[], size = WORKER_INGEST_BATCH): T[][] {
  const n = Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
