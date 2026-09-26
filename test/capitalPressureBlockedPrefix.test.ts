import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blockedReasonLabel, stripBlockedPrefix } from '@/lib/flow-trade-permission';

describe('RS-9: no doubled "Blocked: BLOCKED:" prefix', () => {
  it('labels an engine reason once', () => {
    expect(blockedReasonLabel('BLOCKED: Trade Permission Score 52 below threshold (65)')).toBe('Blocked: Trade Permission Score 52 below threshold (65)');
    expect(blockedReasonLabel('NO-TRADE MODE: data health stale')).toBe('NO-TRADE MODE: data health stale');
    expect(blockedReasonLabel('')).toBe('Blocked: permission conditions not met');
    expect(blockedReasonLabel(undefined)).toBe('Blocked: permission conditions not met');
    expect(stripBlockedPrefix('BLOCKED: x')).toBe('x');
    expect(stripBlockedPrefix('Unavailable in midday session: y')).toBe('Unavailable in midday session: y');
  });
  it('the Terminal uses the helpers instead of prepending its own prefix', () => {
    const page = readFileSync(resolve(__dirname, '../app/tools/terminal/page.tsx'), 'utf8');
    expect(page).not.toContain('`Blocked: ${perm.noTradeMode?.reason');
    expect(page).not.toContain('`Analysis paused: ${perm.noTradeMode?.reason');
    expect(page).toContain('blockedReasonLabel(perm.noTradeMode?.reason)');
  });
});
