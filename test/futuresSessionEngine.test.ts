import { describe, expect, it } from 'vitest';
import { buildFuturesSessionState } from '../lib/terminal/futures/futuresSessionEngine';

describe('futuresSessionEngine boundaries', () => {
  it('transitions to closed at Friday 17:00 ET', () => {
    const beforeClose = buildFuturesSessionState('/ES', new Date('2026-01-09T21:59:00.000Z')); // Fri 16:59 ET
    const atClose = buildFuturesSessionState('/ES', new Date('2026-01-09T22:00:00.000Z')); // Fri 17:00 ET

    expect(beforeClose.currentSession).toBe('post_rth');
    expect(beforeClose.nextSessionEvent).toBe('globex_open');
    expect(beforeClose.minutesToNextSessionEvent).toBe(1);

    expect(atClose.currentSession).toBe('closed');
    expect(atClose.nextSessionEvent).toBe('globex_open');
  });

  it('reopens to globex at Sunday 18:00 ET', () => {
    const beforeOpen = buildFuturesSessionState('/ES', new Date('2026-01-11T22:59:00.000Z')); // Sun 17:59 ET
    const atOpen = buildFuturesSessionState('/ES', new Date('2026-01-11T23:00:00.000Z')); // Sun 18:00 ET

    expect(beforeOpen.currentSession).toBe('closed');
    expect(beforeOpen.nextSessionEvent).toBe('globex_open');
    expect(beforeOpen.minutesToNextSessionEvent).toBe(1);

    expect(atOpen.currentSession).toBe('globex_overnight');
  });

  it('enters and exits maintenance from 17:00-18:00 ET on weekdays', () => {
    const beforeMaintenance = buildFuturesSessionState('/NQ', new Date('2026-01-13T21:59:00.000Z')); // Tue 16:59 ET
    const duringMaintenance = buildFuturesSessionState('/NQ', new Date('2026-01-13T22:00:00.000Z')); // Tue 17:00 ET
    const afterMaintenance = buildFuturesSessionState('/NQ', new Date('2026-01-13T23:00:00.000Z')); // Tue 18:00 ET

    expect(beforeMaintenance.currentSession).toBe('post_rth');
    expect(beforeMaintenance.nextSessionEvent).toBe('maintenance_start');
    expect(beforeMaintenance.minutesToNextSessionEvent).toBe(1);

    expect(duringMaintenance.currentSession).toBe('maintenance_break');
    expect(duringMaintenance.nextSessionEvent).toBe('maintenance_end');
    expect(duringMaintenance.minutesToNextSessionEvent).toBe(60);

    expect(afterMaintenance.currentSession).toBe('globex_overnight');
  });
});
