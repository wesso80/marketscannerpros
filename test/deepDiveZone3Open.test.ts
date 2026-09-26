import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('Deep-Dive Zone 3 is open by default and still collapsible', () => {
  it.each(['app/tools/equity-explorer/page.tsx', 'app/tools/crypto-explorer/page.tsx'])('%s', (file) => {
    const src = read(file);
    const zone3 = src.match(/<details([^>]*)>\s*<summary[^>]*>\s*<span>Zone 3 • ([^<]+)<\/span>/);
    expect(zone3, 'Zone 3 <details> block').not.toBeNull();
    // Native <details open>: expanded on first render; the summary still toggles it (uncontrolled, so no onClick override).
    expect(zone3![1]).toMatch(/\sopen[\s>]/);
    expect(zone3![2]).not.toMatch(/collapsed by default/i);
    expect(src).toContain('group-open:inline">Collapse');
  });
});
