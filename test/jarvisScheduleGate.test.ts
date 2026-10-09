import { describe, expect, it } from 'vitest';
import { nyClock, scheduledRunDecision } from '@/lib/jarvis/radar/scheduleGate';

describe('Jarvis overnight schedule gate', () => {
  it('treats both 7 Oct EDT crons as inside the window, and retries a started marker', () => {
    const first = nyClock(Date.parse('2026-10-07T21:15:00Z'));
    const second = nyClock(Date.parse('2026-10-07T22:15:00Z'));
    expect(first.weekday).toBe('Wed');
    expect(scheduledRunDecision(first, null)).toEqual({ run: true, reason: 'due' });
    expect(scheduledRunDecision(second, null).run).toBe(true);
    expect(scheduledRunDecision(second, { at: '2026-10-07T21:15:05Z', status: 'started' })).toEqual({ run: true, reason: 'retry-incomplete' });
    expect(scheduledRunDecision(second, { at: '2026-10-07T21:40:00Z', status: 'completed' })).toEqual({ run: false, reason: 'already-ran' });
    expect(scheduledRunDecision(second, { at: '2026-10-07T21:40:00Z' })).toEqual({ run: false, reason: 'already-ran' });
  });

  it('keeps the weekend and the post-DST 21:15Z cron outside the run', () => {
    expect(scheduledRunDecision({ weekday: 'Sat', minutes: 17 * 60 }, null)).toEqual({ run: false, reason: 'weekend' });
    const early = nyClock(Date.parse('2026-11-03T21:15:00Z'));
    const later = nyClock(Date.parse('2026-11-03T22:15:00Z'));
    expect(scheduledRunDecision(early, null).reason).toBe('outside-window');
    expect(scheduledRunDecision(later, null).reason).toBe('due');
  });
});
