import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startVisiblePolling } from '@/lib/client/visiblePolling';
let page: EventTarget & { hidden: boolean };
beforeEach(() => { vi.useFakeTimers(); page = Object.assign(new EventTarget(), { hidden: false }); vi.stubGlobal('document', page); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function visible(value: boolean) { page.hidden = !value; page.dispatchEvent(new Event('visibilitychange')); }
it('stops hidden polling, refreshes on return, and removes all work on unmount', async () => {
 const read = vi.fn(async () => undefined);
 const stop = startVisiblePolling(read, 1000);
 await vi.advanceTimersByTimeAsync(1000);
 expect(read).toHaveBeenCalledTimes(2);
 visible(false); await vi.advanceTimersByTimeAsync(10000);
 expect(read).toHaveBeenCalledTimes(2);
 visible(true); await vi.advanceTimersByTimeAsync(0);
 expect(read).toHaveBeenCalledTimes(3);
 stop(); visible(false); visible(true); await vi.advanceTimersByTimeAsync(10000);
 expect(read).toHaveBeenCalledTimes(3);
});
it('never overlaps a slow request, even across visibility changes', async () => {
 let resolve!: () => void;
 const read = vi.fn(() => new Promise<void>(done => { resolve = done; }));
 const stop = startVisiblePolling(read, 1000);
 await vi.advanceTimersByTimeAsync(10000); visible(false); visible(true);
 expect(read).toHaveBeenCalledTimes(1);
 resolve(); await vi.advanceTimersByTimeAsync(999); expect(read).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2);
 stop(); resolve(); await vi.advanceTimersByTimeAsync(5000); expect(read).toHaveBeenCalledTimes(2);
});
it('defers initial background-tab load and respects auto-refresh off', async () => {
 page.hidden = true;
 const read = vi.fn(async () => undefined);
 const stop = startVisiblePolling(read, 0);
 await vi.advanceTimersByTimeAsync(10000); expect(read).not.toHaveBeenCalled();
 visible(true); await vi.advanceTimersByTimeAsync(0); expect(read).toHaveBeenCalledTimes(1);
 visible(false); visible(true); await vi.advanceTimersByTimeAsync(10000); expect(read).toHaveBeenCalledTimes(1);
 stop();
});
it('does not turn optional auto-scan on during initial mount', async () => {
 const scan = vi.fn(async () => undefined);
 const stop = startVisiblePolling(scan, 60000, false);
 expect(scan).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(60000); expect(scan).toHaveBeenCalledTimes(1); stop();
});
