import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const hub = readFileSync('components/home/CommandHub.tsx', 'utf8');
const page = readFileSync('app/page.tsx', 'utf8');

describe('Homepage: workflow once, tidy MSP AI section', () => {
  it('shows four workflow steps: Scanner, Symbol, Backtest, Track', () => {
    const steps = [...hub.matchAll(/\{ step: '(\d+)', href: '([^']+)', title: '([^']+)'/g)].map((m) => [m[1], m[2], m[3]]);
    expect(steps).toEqual([
      ['01', '/tools/scanner', 'Scanner'],
      ['02', '/tools/golden-egg', 'Symbol'],
      ['03', '/tools/workspace?tab=backtest', 'Backtest'],
      ['04', '/tools/workspace', 'Track'],
    ]);
    expect(hub.match(/Golden Egg, our Symbol validation workflow/g)).toHaveLength(1);
    expect(hub).not.toContain('Open workflow map');
  });

  it('drops the value stack, which repeated the four steps', () => {
    expect(hub).not.toContain('30-second value stack');
    expect(hub).not.toContain('What MSP helps you do');
    expect(hub).not.toContain('valueStack');
    expect(hub).not.toContain('Track your edge');
  });

  it('MSP AI section has no image, an accuracy caveat and an Open the Scanner button', () => {
    expect(hub).not.toContain('arcxa-chip.png');
    expect(hub).not.toMatch(/ARCxA|ARCA/);
    expect(hub).toContain('AI summaries can be incomplete or wrong. Check them against the source data and timestamps.');
    expect(hub).toContain('Open the Scanner');
    expect(hub).not.toContain('Explore the AI Engine');
  });

  it('removes the referral strip and adds a plain Pricing link with no price', () => {
    expect(hub).not.toContain('Refer a Friend');
    expect(hub).not.toContain('/tools/referrals');
    expect(hub).toMatch(/<Link href="\/pricing"[^>]*>\s*Pricing\s*<\/Link>/);
    expect(hub).not.toMatch(/\$\d/);
  });

  it('drops "5-step" from the social description only', () => {
    expect(page).toContain('a structured research workflow.');
    expect(page).not.toContain('5-step');
  });
});
