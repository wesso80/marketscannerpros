import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the strike header in its column instead of over the delta header', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  expect(css).toContain('.sticky-strike { position: static; left: auto; z-index: 1; }');
  expect(css).not.toMatch(/\.sticky-strike\s*\{[^}]*left:\s*50%/);
  const desktop = readFileSync('components/options-terminal/OptionsTerminalView.tsx', 'utf8');
  expect(desktop).not.toContain('left-1/2');
  expect(desktop).toContain('min-w-0 max-w-full overflow-auto');
  const mobile = readFileSync('components/options-terminal/MobileOptionsChain.tsx', 'utf8');
  expect(mobile).toContain('overflow-x-hidden');
  expect(mobile).toContain("['Strike','Bid','Ask','Vol','OI','IV','Delta']");
});
