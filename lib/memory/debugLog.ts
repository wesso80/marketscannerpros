/**
 * Process memory line for the web service. Off unless MEMORY_DEBUG_LOG=true.
 * One JSON line a minute: rss / heap / external / arrayBuffers, the V8 heap
 * limit, cgroup usage when the files are readable, plus whatever module-level
 * caches have registered after they were actually loaded.
 *
 * Next bundles this file once for instrumentation and again per route. The
 * gauge map and the timer live on globalThis so every copy shares them
 * (same idea as global.__pgPool). Registration is a no-op when the flag is
 * off, so production stays quiet.
 */
import fs from 'node:fs';
import v8 from 'node:v8';

export type MemoryGauge = () => Record<string, number>;

type MemoryGlobal = typeof globalThis & {
  __mspMemoryGauges?: Map<string, MemoryGauge>;
  __mspMemoryDebugTimer?: ReturnType<typeof setInterval>;
};

function memoryGlobal(): MemoryGlobal {
  return globalThis as MemoryGlobal;
}

function gaugeMap(): Map<string, MemoryGauge> {
  const g = memoryGlobal();
  return (g.__mspMemoryGauges ??= new Map());
}

export function memoryDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEMORY_DEBUG_LOG === 'true';
}

/** Remember a gauge. Ignored when the flag is off, so the closure is not retained. */
export function registerMemoryGauge(name: string, gauge: MemoryGauge): void {
  if (!memoryDebugEnabled()) return;
  gaugeMap().set(name, gauge);
}

export function registeredGaugeNames(): string[] {
  return [...gaugeMap().keys()];
}

export interface MemorySnapshot {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  /** v8.getHeapStatistics().heap_size_limit — the old-space cap, in bytes. */
  heapSizeLimit?: number;
  /** v8.getHeapStatistics().total_available_size */
  totalAvailableSize?: number;
  /** cgroup memory.current (v2) or memory.usage_in_bytes (v1), bytes. Omitted if unreadable. */
  cgroupCurrent?: number;
  /** cgroup memory.max (v2) or memory.limit_in_bytes (v1), bytes. Omitted if unreadable or "max". */
  cgroupMax?: number;
  caches: Record<string, number>;
}

function readText(path: string): string | null {
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

function asBytes(text: string | null): number | undefined {
  if (text == null || text === '' || text === 'max') return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** cgroup v2, then v1. Never throws. Fields stay absent when the file cannot be read. */
export function readCgroupMemory(): { cgroupCurrent?: number; cgroupMax?: number } {
  try {
    const v2Current = asBytes(readText('/sys/fs/cgroup/memory.current'));
    const v2Max = asBytes(readText('/sys/fs/cgroup/memory.max'));
    if (v2Current !== undefined || v2Max !== undefined) {
      return {
        ...(v2Current !== undefined ? { cgroupCurrent: v2Current } : {}),
        ...(v2Max !== undefined ? { cgroupMax: v2Max } : {}),
      };
    }
    const v1Current = asBytes(readText('/sys/fs/cgroup/memory/memory.usage_in_bytes'));
    const v1Max = asBytes(readText('/sys/fs/cgroup/memory/memory.limit_in_bytes'));
    return {
      ...(v1Current !== undefined ? { cgroupCurrent: v1Current } : {}),
      ...(v1Max !== undefined ? { cgroupMax: v1Max } : {}),
    };
  } catch {
    return {};
  }
}

function heapLimit(): { heapSizeLimit?: number; totalAvailableSize?: number } {
  try {
    const stats = v8.getHeapStatistics();
    const heapSizeLimit = stats.heap_size_limit;
    const totalAvailableSize = stats.total_available_size;
    return {
      ...(typeof heapSizeLimit === 'number' && Number.isFinite(heapSizeLimit) ? { heapSizeLimit } : {}),
      ...(typeof totalAvailableSize === 'number' && Number.isFinite(totalAvailableSize) ? { totalAvailableSize } : {}),
    };
  } catch {
    return {};
  }
}

export function collectMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  const caches: Record<string, number> = {};
  for (const [name, gauge] of gaugeMap()) {
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
    ...heapLimit(),
    ...readCgroupMemory(),
    caches,
  };
}

export function formatMemoryLog(snapshot: MemorySnapshot = collectMemorySnapshot()): string {
  return `[memory] ${JSON.stringify(snapshot)}`;
}

/** Log once immediately, then every `intervalMs`. Idempotent across module copies. Timer is unref'd. */
export function startMemoryDebugLog(intervalMs = 60_000): void {
  const g = memoryGlobal();
  if (!memoryDebugEnabled() || g.__mspMemoryDebugTimer) return;
  const tick = () => {
    try {
      console.log(formatMemoryLog());
    } catch {
      // A debug line must not take down the server.
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  g.__mspMemoryDebugTimer = timer;
}

export function stopMemoryDebugLog(): void {
  const g = memoryGlobal();
  if (g.__mspMemoryDebugTimer) clearInterval(g.__mspMemoryDebugTimer);
  g.__mspMemoryDebugTimer = undefined;
}

/** Test hook. Drops gauges and the timer from the shared global registry. */
export function resetMemoryDebugForTests(): void {
  stopMemoryDebugLog();
  gaugeMap().clear();
}
