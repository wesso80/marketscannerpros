import { describe, expect, it } from 'vitest';
import { JARVIS_RUN_MAX_MS, nyClock, scheduledRunDecision } from '@/lib/jarvis/radar/scheduleGate';

describe('Jarvis overnight schedule gate', () => {
  it('treats both 7 Oct EDT crons as inside the window, and retries a started marker', () => {
    const first = nyClock(Date.parse('2026-10-07T21:15:00Z'));
    const second = nyClock(Date.parse('2026-10-07T22:15:00Z'));
    expect(first.weekday).toBe('Wed');
    expect(scheduledRunDecision(first, null)).toEqual({ run: true, reason: 'due' });
    expect(scheduledRunDecision(second, null).run).toBe(true);
    const secondMs = Date.parse('2026-10-07T22:15:00Z');
    expect(scheduledRunDecision(second, { at: '2026-10-07T21:15:05Z', status: 'started' }, secondMs)).toEqual({ run: true, reason: 'retry-incomplete' });
    expect(scheduledRunDecision(second, { at: '2026-10-07T21:40:00Z', status: 'completed' })).toEqual({ run: false, reason: 'already-ran' });
    expect(scheduledRunDecision(second, { at: '2026-10-07T21:40:00Z' })).toEqual({ run: false, reason: 'already-ran' });
  });

  it('holds the 22:15Z retry while the first run is inside its 45 minute window', () => {
    expect(JARVIS_RUN_MAX_MS).toBe(45 * 60 * 1000);
    const started = Date.parse('2026-10-07T21:15:05Z');
    const ny = nyClock(Date.parse('2026-10-07T22:15:00Z'));
    const marker = { at: '2026-10-07T21:15:05Z', status: 'started' };
    expect(scheduledRunDecision(ny, marker, started + 10 * 60 * 1000)).toEqual({ run: false, reason: 'in-progress' });
    expect(scheduledRunDecision(ny, marker, started + JARVIS_RUN_MAX_MS - 1)).toEqual({ run: false, reason: 'in-progress' });
    expect(scheduledRunDecision(ny, marker, started + 60 * 60 * 1000)).toEqual({ run: true, reason: 'retry-incomplete' });
    expect(scheduledRunDecision(ny, { status: 'started' }, started + 10 * 60 * 1000)).toEqual({ run: true, reason: 'retry-incomplete' });
  });

  it('keeps the weekend and the post-DST 21:15Z cron outside the run', () => {
    expect(scheduledRunDecision({ weekday: 'Sat', minutes: 17 * 60 }, null)).toEqual({ run: false, reason: 'weekend' });
    const early = nyClock(Date.parse('2026-11-03T21:15:00Z'));
    const later = nyClock(Date.parse('2026-11-03T22:15:00Z'));
    expect(scheduledRunDecision(early, null).reason).toBe('outside-window');
    expect(scheduledRunDecision(later, null).reason).toBe('due');
  });
});
