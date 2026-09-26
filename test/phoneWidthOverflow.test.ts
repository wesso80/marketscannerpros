import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Layout guard for RS-11 (verified by screenshot at 390px; jsdom has no layout, so this pins the classes that fix it).
describe('phone width: no horizontal overflow (RS-11)', () => {
  const hero = readFileSync('components/ui/PageHero.tsx', 'utf8');
  it('PageHero columns can shrink below their nowrap metric text', () => {
    expect(hero).toContain('"grid grid-cols-1 gap-3 xl:grid-cols-');
    expect(hero).toContain('<div className="min-w-0">');
    expect(hero).toContain('grid min-w-0 grid-cols-1 self-start gap-1.5 sm:grid-cols-2');
  });
  it('Research lens tabs wrap instead of scrolling off-screen', () => {
    const research = readFileSync('app/tools/research/page.tsx', 'utf8');
    const strip = research.slice(research.indexOf('{TABS.map(t => (') - 200, research.indexOf('{TABS.map(t => ('));
    expect(strip).toContain('flex flex-wrap items-center gap-1');
    expect(strip).not.toContain('overflow-x-auto');
  });
});
