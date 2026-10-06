import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('Deep-Dive informational block stays collapsible without an inner scroll box', () => {
  it.each([
    ['app/tools/equity-explorer/page.tsx', "equityExplorerLabel('Zone 3')"],
    ['app/tools/crypto-explorer/page.tsx', 'Zone 3 • Informational'],
  ])('%s', (file, label) => {
    const src = read(file);
    const zone3 = src.match(/<details([^>]*)>\s*<summary[^>]*>\s*<span>([^<]*)<\/span>/);
    expect(zone3, 'informational <details> block').not.toBeNull();
    expect(zone3![2]).toContain(label);
    // The compact explorer pass removed the native open attribute. This audit does not add a fold or re-open it.
    expect(zone3![1]).not.toMatch(/\sopen[\s>]/);
    expect(zone3![2]).not.toMatch(/collapsed by default/i);
    expect(src).toContain('group-open:inline">Collapse');
    // Now that Zone 3 opens by default there must be no inner scroll box (no second scroll to reach tickers/About).
    const body = src.slice(zone3!.index!, src.indexOf('</details>', zone3!.index!));
    expect(body).not.toMatch(/max-h-\[\d+px\]/);
    expect(body).not.toMatch(/overflow-y-(auto|scroll)/);
  });
});
