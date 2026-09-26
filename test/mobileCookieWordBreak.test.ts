import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// jsdom has no layout; these pin the CSS verified in headless Chrome at 390/320 px (desktop 1280 unchanged).
const css = readFileSync('app/globals.css', 'utf8');

function block(start: string, len = 900): string {
  const i = css.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, i + len);
}

describe('site-wide mobile CSS', () => {
  it('the phone safety net wraps only unbreakable strings instead of splitting words mid-word', () => {
    const net = block('MOBILE RESPONSIVE SAFETY NET', 1400);
    const rule = net.slice(net.indexOf('.msp-layout-terminal {'), net.indexOf('}', net.indexOf('.msp-layout-terminal {')));
    expect(rule).toContain('overflow-wrap: break-word;');
    expect(rule).not.toMatch(/^\s*word-break:/m);
  });

  it('the cookie banner stacks text above the buttons on phones only', () => {
    const cookie = block('/* Cookie banner */', 1200);
    expect(cookie).toMatch(/@media \(max-width: 640px\) \{\s*\.cookie-row \{\s*flex-direction: column;/);
    // Desktop rule unchanged: text and buttons side by side.
    expect(cookie).toMatch(/\.cookie-row \{\s*display: flex;\s*gap: 1rem;\s*align-items: flex-start;\s*padding-block: 1rem;\s*\}/);
  });
});
