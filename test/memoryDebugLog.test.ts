import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectMemorySnapshot,
  formatMemoryLog,
  memoryDebugEnabled,
  registerMemoryGauge,
  registeredGaugeNames,
  resetMemoryDebugForTests,
  startMemoryDebugLog,
} from '../lib/memory/debugLog';

describe('memory debug log', () => {
  const previous = process.env.MEMORY_DEBUG_LOG;

  afterEach(() => {
    resetMemoryDebugForTests();
    if (previous === undefined) delete process.env.MEMORY_DEBUG_LOG;
    else process.env.MEMORY_DEBUG_LOG = previous;
    vi.restoreAllMocks();
  });

  it('stays off unless MEMORY_DEBUG_LOG=true', () => {
    delete process.env.MEMORY_DEBUG_LOG;
    expect(memoryDebugEnabled()).toBe(false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    registerMemoryGauge('hidden', () => ({ entries: 9 }));
    startMemoryDebugLog(1_000);
    expect(registeredGaugeNames()).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('includes rss, heap, external, arrayBuffers, and registered cache sizes', () => {
    process.env.MEMORY_DEBUG_LOG = 'true';
    registerMemoryGauge('demo', () => ({ entries: 3, bars: 10 }));
    registerMemoryGauge('broken', () => {
      throw new Error('gauge failed');
    });
    const snapshot = collectMemorySnapshot();
    expect(snapshot.rss).toBeGreaterThan(0);
    expect(snapshot.heapUsed).toBeGreaterThan(0);
    expect(typeof snapshot.external).toBe('number');
    expect(typeof snapshot.arrayBuffers).toBe('number');
    expect(snapshot.caches['demo.entries']).toBe(3);
    expect(snapshot.caches['demo.bars']).toBe(10);
    expect(snapshot.caches['broken.error']).toBe(1);

    const line = formatMemoryLog(snapshot);
    expect(line.startsWith('[memory] ')).toBe(true);
    const parsed = JSON.parse(line.slice('[memory] '.length)) as typeof snapshot;
    expect(parsed.heapUsed).toBe(snapshot.heapUsed);
    expect(parsed.caches['demo.bars']).toBe(10);
  });

  it('logs once on start and does not start a second timer', () => {
    process.env.MEMORY_DEBUG_LOG = 'true';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    startMemoryDebugLog(60_000);
    startMemoryDebugLog(60_000);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line.startsWith('[memory] ')).toBe(true);
    const parsed = JSON.parse(line.slice('[memory] '.length)) as { rss: number; heapUsed: number; external: number; arrayBuffers: number };
    expect(parsed.rss).toBeGreaterThan(0);
    expect(parsed.heapUsed).toBeGreaterThan(0);
    expect(typeof parsed.external).toBe('number');
    expect(typeof parsed.arrayBuffers).toBe('number');
  });
});
