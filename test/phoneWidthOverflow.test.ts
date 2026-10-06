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
  it('Research lens tabs scroll within a shrinkable single-row container', () => {
    const research = readFileSync('app/tools/research/page.tsx', 'utf8');
    expect(research).toContain('<TabBar label="Research views"');
    const shared = readFileSync('components/visual/TabBar.tsx', 'utf8');
    expect(shared).toContain('flex flex-nowrap overflow-x-auto gap-1');
    expect(shared).toContain('min-w-0');
    expect(shared).toContain('shrink-0 whitespace-nowrap');
    expect(shared).not.toContain('flex flex-wrap gap-1');
  });
});
