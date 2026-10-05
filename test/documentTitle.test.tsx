// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
function Tab({ name }: { name: string }) { useDocumentTitle(name); return null; }
it('survives streamed metadata, follows tab changes, and stops observing on unmount', async () => {
 vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const node=document.createElement('div'),root=createRoot(node);
 await act(async()=>root.render(<Tab name="Journal"/>));
 expect(document.title).toBe('Journal | MarketScanner Pros');
 await act(async()=>{document.title='Track | MarketScanner Pros';await Promise.resolve();});
 expect(document.title).toBe('Journal | MarketScanner Pros');
 await act(async()=>root.render(<Tab name="Portfolio"/>));
 expect(document.title).toBe('Portfolio | MarketScanner Pros');
 await act(async()=>root.unmount());
 document.title='Next page';await Promise.resolve();expect(document.title).toBe('Next page');vi.unstubAllGlobals();
});
