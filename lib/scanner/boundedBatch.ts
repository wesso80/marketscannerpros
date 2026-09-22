/** Collect independent provider reads without letting a slow symbol hold the queue open. */
export async function boundedBatch<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
  options: { concurrency: number; budgetMs: number },
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = items.map(() => ({
    status: 'rejected', reason: new Error('Scan data deadline exceeded; retry this symbol.'),
  }));
  if (options.budgetMs <= 0 || items.length === 0) return results;
  let next = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const workers = Array.from({ length: Math.min(items.length, Math.max(1, options.concurrency)) }, async () => {
    while (!closed && next < items.length) {
      const index = next++;
      try {
        const value = await read(items[index]);
        if (!closed) results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        if (!closed) results[index] = { status: 'rejected', reason };
      }
    }
  });
  try {
    await Promise.race([
      Promise.all(workers),
      new Promise<void>(resolve => { timer = setTimeout(resolve, Math.max(0, options.budgetMs)); }),
    ]);
  } finally {
    closed = true;
    clearTimeout(timer);
  }
  // Outstanding reads are handled above; they cannot mutate a returned response
  // or start more work. Callers also bound each underlying HTTP request.
  return results;
}
