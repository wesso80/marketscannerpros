import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flowSideLabel } from '@/lib/options/flowSideLabel';

describe('flow side display labels', () => {
  it('maps the bid/ask buckets without renaming the classifier codes', () => {
    expect(flowSideLabel('bought')).toBe('Near ask');
    expect(flowSideLabel('sold')).toBe('Near bid');
    expect(flowSideLabel('neutral')).toBe('Mid');
    expect(flowSideLabel(null)).toBe('Mid');
    expect(flowSideLabel(undefined)).toBe('Mid');
  });

  it('renders those labels in the flow table instead of BOUGHT or SOLD', () => {
    const page = readFileSync('components/options-terminal/OptionsFlowView.tsx', 'utf8');
    expect(page).toContain('{flowSideLabel(f.direction)}');
    expect(page).not.toContain('{f.direction}');
    expect(page).not.toMatch(/>\s*BOUGHT\s*</);
    expect(page).not.toMatch(/>\s*SOLD\s*</);
  });
});
