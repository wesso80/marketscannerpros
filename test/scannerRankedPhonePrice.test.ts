/** SC-14: Ranked cards on phones show the price, like the desktop Ranked table and the Pro cards. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/tools/scanner/page.tsx'), 'utf8');

function componentSource(name: string): string {
  const start = page.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(0);
  const next = page.indexOf('\nfunction ', start + 1);
  return page.slice(start, next > 0 ? next : undefined);
}

describe('SC-14: Ranked phone cards show price', () => {
  it.each(['RankedMobileCards', 'RankedFallbackList'])('%s renders the row price under the symbol', (name) => {
    const src = componentSource(name);
    expect(src).toContain('data-testid="ranked-card-price"><ScannerRowStamp row={row} /></div>');
  });

  it('uses the same formatter as the desktop Ranked table Price column', () => {
    expect(page).toContain('<td className="py-2.5 px-2 text-slate-300 font-mono whitespace-nowrap"><ScannerRowStamp row={r} /></td>');
  });
});
