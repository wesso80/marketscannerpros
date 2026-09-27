import { describe, expect, it } from 'vitest';
import { accountChecklistStatus, accountDisplaySize } from '@/lib/admin/accountPresentation';
const account = { permission: 'GO', killSwitchActive: false, dailyDrawdownKnown: true, sizeMultiplier: .7 };
describe('brief account presentation', () => {
  it.each(['WAIT', 'BLOCK'])('never calls %s a pass or displays old scan sizing', permission => {
    const risk = { ...account, permission };
    expect(accountChecklistStatus(risk)).toBe(permission);
    expect(accountDisplaySize(risk, 1)).toBe(0);
  });
  it('withholds sizing and clearance for missing daily baseline or operator stop', () => {
    expect(accountChecklistStatus({ ...account, dailyDrawdownKnown: false })).toBe('WAIT');
    expect(accountDisplaySize({ ...account, dailyDrawdownKnown: false }, 1)).toBe(0);
    expect(accountChecklistStatus({ ...account, killSwitchActive: true })).toBe('BLOCK');
  });
  it('caps historical sizing at assessed account size and rejects invalid values', () => {
    expect(accountDisplaySize(account, 1)).toBe(.7);
    expect(accountDisplaySize(account, .3)).toBe(.3);
    expect(accountDisplaySize(account, NaN)).toBe(0);
    expect(accountDisplaySize({ ...account, sizeMultiplier: NaN }, 1)).toBe(0);
  });
});
