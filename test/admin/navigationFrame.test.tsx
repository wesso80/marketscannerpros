// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdminNavigationFrame from '@/components/admin/AdminNavigationFrame';

const state = vi.hoisted(() => ({ pathname: '/admin/health' }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  state.pathname = '/admin/health';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const frame = () => <AdminNavigationFrame sidebar={<><a href="/admin/settings" onClick={event => event.preventDefault()}>Settings</a><button>Logout</button></>}><h1>Health</h1></AdminNavigationFrame>;

it('moves focus into the drawer, traps it, and restores focus and body scrolling on Escape', () => {
  render(frame());
  const menu = screen.getByRole('button', { name: 'Menu' });
  fireEvent.click(menu);
  const close = screen.getByRole('button', { name: 'Close navigation' });
  expect(document.activeElement).toBe(close);
  expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Logout' }));
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(menu);
  expect(document.body.style.overflow).toBe('');
});

it('closes when a navigation link is chosen, including same-route links', () => {
  render(frame());
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes on a route change and releases the page on unmount', () => {
  const view = render(frame());
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  state.pathname = '/admin/settings'; view.rerender(frame());
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  view.unmount(); expect(document.body.style.overflow).toBe('');
});
