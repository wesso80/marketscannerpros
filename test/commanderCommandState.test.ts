import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('admin commander command state strip', () => {
  it('surfaces hard command state, risk source, alert posture, data age, and allowed action', () => {
    const page = read('app/admin/commander/page.tsx');

    expect(page).toContain('CommandStateStrip');
    expect(page).toContain('Command State');
    expect(page).toContain('deriveCommandState');
    expect(page).toContain('Allowed Next Action');
    // 8f84ced4 split account risk from notification controls: the pill names the account stop, the reason names the paused alerts.
    expect(page).toContain('ACCOUNT STOP ACTIVE');
    expect(page).toContain('Research alerts are paused.');
    expect(page).toContain('Data Age');
    expect(page).toContain('Risk Age');
    expect(page).toContain('sourceLabel(brief.risk.source)');
    expect(page).toContain('brief.riskGovernor.lockouts');
    expect(page).toContain('Risk source is fallback; live equity unavailable.');
  });
});
