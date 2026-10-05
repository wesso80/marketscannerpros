/**
 * Process memory line for the web service. Off unless MEMORY_DEBUG_LOG=true.
 * One JSON line a minute: rss / heap / external / arrayBuffers, plus whatever
 * module-level caches have registered after they were actually loaded.
 * Registration is a no-op when the flag is off, so production stays quiet.
 * Pool counters register themselves from lib/db.ts and lib/signalService.ts.
 */

export type MemoryGauge = () => Record<string, number>;

const gauges = new Map<string, MemoryGauge>();
let timer: ReturnType<typeof setInterval> | null = null;

export function memoryDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEMORY_DEBUG_LOG === 'true';
}

/** Remember a gauge. Ignored when the flag is off, so the closure is not retained. */
export function registerMemoryGauge(name: string, gauge: MemoryGauge): void {
  if (!memoryDebugEnabled()) return;
  gauges.set(name, gauge);
}

export function registeredGaugeNames(): string[] {
  return [...gauges.keys()];
}

export interface MemorySnapshot {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  caches: Record<string, number>;
}

export function collectMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  const caches: Record<string, number> = {};
  for (const [name, gauge] of gauges) {
    let stats: Record<string, number> = {};
    try {
      stats = gauge() ?? {};
    } catch {
      stats = { error: 1 };
    }
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === 'number' && Number.isFinite(value)) caches[`${name}.${key}`] = value;
    }
  }
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
    caches,
  };
}

export function formatMemoryLog(snapshot: MemorySnapshot = collectMemorySnapshot()): string {
  return `[memory] ${JSON.stringify(snapshot)}`;
}

/** Log once immediately, then every `intervalMs`. Idempotent. Timer is unref'd. */
export function startMemoryDebugLog(intervalMs = 60_000): void {
  if (!memoryDebugEnabled() || timer) return;
  const tick = () => {
    try {
      console.log(formatMemoryLog());
    } catch {
      // A debug line must not take down the server.
    }
  };
  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
}

export function stopMemoryDebugLog(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Test hook. Drops gauges and the timer. */
export function resetMemoryDebugForTests(): void {
  stopMemoryDebugLog();
  gauges.clear();
}
