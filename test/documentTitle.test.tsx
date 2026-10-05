// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const state = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));

function Tab({ name }: { name: string }) { useDocumentTitle(name); return null; }

let root: Root | undefined;
afterEach(() => { vi.unstubAllGlobals(); });

async function mount(path: string, name: string) {
  state.pathname = path;
  window.history.pushState({}, '', path);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(<Tab name={name} />));
}

it('survives streamed metadata, follows tab changes, and stops observing on unmount', async () => {
  await mount('/', 'Journal');
  expect(document.title).toBe('Journal | MarketScanner Pros');
  await act(async () => { document.title = 'Track | MarketScanner Pros'; await Promise.resolve(); });
  expect(document.title).toBe('Journal | MarketScanner Pros');
  await act(async () => root!.render(<Tab name="Portfolio" />));
  expect(document.title).toBe('Portfolio | MarketScanner Pros');
  await act(async () => root!.unmount());
  document.title = 'Next page';
  await Promise.resolve();
  expect(document.title).toBe('Next page');
});

it('does not reapply an old tab title after the pathname changes', async () => {
  await mount('/tools/workspace', 'Journal');
  expect(document.title).toBe('Journal | MarketScanner Pros');

  // Location moves before unmount. Streamed metadata for the next route must stick.
  window.history.pushState({}, '', '/pricing');
  await act(async () => { document.title = 'Pricing | MarketScanner Pros'; await Promise.resolve(); });
  expect(document.title).toBe('Pricing | MarketScanner Pros');

  window.history.pushState({}, '', '/about');
  await act(async () => { document.title = 'About | MarketScanner Pros'; await Promise.resolve(); });
  expect(document.title).toBe('About | MarketScanner Pros');

  // Router pathname catches up while this hook is still mounted.
  state.pathname = '/pricing';
  window.history.pushState({}, '', '/pricing');
  await act(async () => root!.render(<Tab name="Journal" />));
  await act(async () => { document.title = 'Pricing | MarketScanner Pros'; await Promise.resolve(); });
  expect(document.title).toBe('Pricing | MarketScanner Pros');
  await act(async () => root!.unmount());
});
