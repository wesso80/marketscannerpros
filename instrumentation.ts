/**
 * Next.js server boot hook. The memory line runs only in the Node.js web
 * process, and only when MEMORY_DEBUG_LOG=true. Default boot does not import
 * the logger or start a timer.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.MEMORY_DEBUG_LOG !== 'true') return;
  const { startMemoryDebugLog } = await import('./lib/memory/debugLog');
  startMemoryDebugLog();
}
