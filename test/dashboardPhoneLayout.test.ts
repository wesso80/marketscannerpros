import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(__dirname, '../app/tools/dashboard/page.tsx'), 'utf8');

describe('Market dashboard hero fits a phone screen (OV-11)', () => {
  it('hero grid columns can shrink below their content width', () => {
    expect(page).toContain('grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]');
    expect(page).toContain('grid min-w-0 grid-cols-[minmax(0,1fr)] self-start gap-1.5 sm:grid-cols-[repeat(2,minmax(0,1fr))]');
  });

  it('metric tile detail wraps instead of forcing a single no-wrap line', () => {
    const metric = page.slice(page.indexOf('function DashboardMetric'), page.indexOf('function PanelHeader'));
    expect(metric).not.toContain("whiteSpace: 'nowrap'");
    expect(metric).toContain("overflowWrap: 'anywhere'");
    expect(metric).toContain('minWidth: 0');
  });
});
