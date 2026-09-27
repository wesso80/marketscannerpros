/** Coalesce concurrent reads only; never cache completed results or share workspace keys. */
export function createSingleFlight<T>() {
  const running = new Map<string, Promise<T>>();
  return (key: string, work: () => Promise<T>): Promise<T> => {
    const existing = running.get(key);
    if (existing) return existing;
    const pending = Promise.resolve().then(work).finally(() => { running.delete(key); });
    running.set(key, pending);
    return pending;
  };
}
