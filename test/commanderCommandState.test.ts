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
    expect(page).toContain('RESEARCH ALERTS PAUSED');
    expect(page).toContain('Data Age');
    expect(page).toContain('Risk Age');
    expect(page).toContain('sourceLabel(brief.risk.source)');
    expect(page).toContain('brief.riskGovernor.lockouts');
    expect(page).toContain('Risk source is fallback; live equity unavailable.');
  });
});
