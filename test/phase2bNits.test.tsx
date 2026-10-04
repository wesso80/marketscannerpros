// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { openMacroAnchor } from '@/lib/overview/macroAnchor';

describe('Macro anchor folds', () => {
  it('opens the details element that contains the hash, including a hash already set', () => {
    document.body.innerHTML = '<details><section id="decision">Decision</section></details><details><section id="rates">Rates</section></details>';
    expect(openMacroAnchor('#decision')).toBe(true);
    expect((document.querySelector('#decision')!.closest('details') as HTMLDetailsElement).open).toBe(true);
    expect((document.querySelector('#rates')!.closest('details') as HTMLDetailsElement).open).toBe(false);
    window.location.hash = '#rates';
    expect(openMacroAnchor(window.location.hash)).toBe(true);
    expect((document.querySelector('#rates')!.closest('details') as HTMLDetailsElement).open).toBe(true);
  });
});
