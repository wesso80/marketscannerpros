import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { macroResponseAccess } from '@/lib/macro/accessState';

describe('macro response access', () => {
  it('locks 401 and 403 and leaves other failures unavailable', () => {
    expect(macroResponseAccess(401)).toBe('locked');
    expect(macroResponseAccess(403)).toBe('locked');
    expect(macroResponseAccess(200)).toBe('ok');
    expect(macroResponseAccess(500)).toBe('unavailable');
    expect(macroResponseAccess(404)).toBe('unavailable');
  });

  it('keeps the economic-indicators route behind the session check', () => {
    const route = readFileSync('app/api/economic-indicators/route.ts', 'utf8');
    expect(route).toMatch(/if \(!session\?\.workspaceId\)/);
    expect(route).toContain('status: 401');
  });
});
