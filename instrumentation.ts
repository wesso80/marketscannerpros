/**
 * Next.js server boot hook. The memory line runs only in the Node.js web
 * process, and only when MEMORY_DEBUG_LOG=true. Default boot does not import
 * the logger or start a timer.
 */
function debugIntervalMs(): number {
  const raw = Number(process.env.MEMORY_DEBUG_LOG_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 1000) return 60_000;
  return Math.floor(raw);
}

export async function register(): Promise<void> {
  // Keep the Node-only import inside the runtime branch so Edge bundling can omit it.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.MEMORY_DEBUG_LOG !== 'true') return;
    const { startMemoryDebugLog } = await import('./lib/memory/debugLog');
    startMemoryDebugLog(debugIntervalMs());
  }
}
