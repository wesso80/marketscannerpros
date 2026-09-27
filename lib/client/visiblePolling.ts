/** Poll only while the owning page is mounted and the document is visible.
 * Schedule after completion: slow requests never accumulate behind an interval.
 * The returned cleanup removes both the timer and visibility listener.
 */
export function startVisiblePolling(work: () => unknown | Promise<unknown>, intervalMs: number, immediate = true): () => void {
  let stopped = false;
  let running = false;
  let hasRun = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    clear();
    if (!stopped && !document.hidden && intervalMs > 0) timer = setTimeout(() => { void run(); }, intervalMs);
  };
  const run = async () => {
    if (stopped || running || document.hidden) return;
    clear();
    running = true;
    hasRun = true;
    try { await work(); }
    catch { /* Fetch callbacks own their error UI; keep subsequent recovery possible. */ }
    finally { running = false; schedule(); }
  };
  const onVisibility = () => {
    clear();
    if (!document.hidden && (intervalMs > 0 || (immediate && !hasRun))) void run();
  };
  document.addEventListener('visibilitychange', onVisibility);
  if (immediate) void run(); else schedule();
  return () => { stopped = true; clear(); document.removeEventListener('visibilitychange', onVisibility); };
}
