// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import ToolGuideSearch from '@/components/guide/ToolGuideSearch';
import { TOOL_GUIDES } from '@/lib/guides/toolGuides';
vi.mock('next/link', () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}));
afterEach(() => vi.unstubAllGlobals());
it('groups all guides, searches instructions, and keeps individual instructions folded', () => {
 vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 const node = document.createElement('div'); const root = createRoot(node);
 act(() => root.render(<ToolGuideSearch guides={TOOL_GUIDES} />));
 expect([...node.querySelectorAll('section > details > summary')].map(e => e.textContent?.split(' ·')[0])).toEqual(['Today','Scan & Analyse','Markets','Intelligence','Track','Learn','Account']);
 expect(node.querySelectorAll('details[open]')).toHaveLength(0);
 expect(node.querySelector('a[href="/operator"]')).toBeNull();
 const input = node.querySelector('input')!;
 act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'billing email'); input.dispatchEvent(new Event('input', {bubbles:true})); });
 expect(node.textContent).toContain('1 guides match your search');
 expect(node.textContent).toContain('Sign In & Activation');
 expect(node.textContent).not.toContain('Market Scanner');
 expect(node.querySelectorAll('section > details[open]')).toHaveLength(1);
 expect(node.querySelectorAll('details details[open]')).toHaveLength(0);
 act(() => root.unmount());
});
