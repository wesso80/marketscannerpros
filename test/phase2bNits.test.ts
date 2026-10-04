import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { sessionChangeBarWidths } from '@/lib/overview/pickBars';
import { friendlyStatus } from '@/lib/free/friendlyStatus';

describe('Phase 2B review nits', () => {
  it('scales daily-pick bars to the largest change in the list', () => {
    expect(sessionChangeBarWidths([0.4, -2, null])).toEqual([20, 100, null]);
    expect(sessionChangeBarWidths([0.15])).toEqual([100]);
    expect(sessionChangeBarWidths([0, 0])).toEqual([0, 0]);
  });

  it('keeps an explicit Unknown freshness label and still plain-words other tokens', () => {
    expect(friendlyStatus('Unknown')).toBe('Unknown');
    expect(friendlyStatus('UNKNOWN')).toBe('Not available right now');
    expect(friendlyStatus('DEGRADED')).not.toMatch(/DEGRADED/);
  });

  it('names the dashboard share cards Dashboard and Overview', () => {
    const layout = readFileSync('app/tools/dashboard/layout.tsx', 'utf8');
    expect(layout).toContain("title: 'Dashboard | MarketScanner Pros'");
    expect(layout).toContain('Overview is the market home.');
    expect(layout).not.toMatch(/Research Dashboard|Command Center/);
  });
});
