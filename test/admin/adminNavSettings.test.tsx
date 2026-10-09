/**
 * Admin audit A6: one navigation source (the active admin layout), and a Settings page that promises no controls.
 */
// @vitest-environment jsdom
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import SettingsPage from '@/app/admin/settings/page';

it('the unused alternate admin shell is gone and the active layout is the one navigation source', () => {
  for (const f of ['AdminShell', 'AdminSidebar', 'AdminTopBar', 'AdminStatusBar']) {
    expect(existsSync(`components/admin/layout/${f}.tsx`), f).toBe(false);
  }
  expect(readFileSync('app/admin/admin-client-layout.tsx', 'utf8')).toContain('{ href: "/admin/settings", label: "Settings"');
});

it('Settings is read-only and says where each setting lives', () => {
  const html = renderToStaticMarkup(<SettingsPage />);
  expect(html).toContain('Nothing can be changed on this page');
  expect(html).toContain('href="/admin/login"');
  expect(html).toContain('href="/admin/health"');
  expect(html).toContain('12 hours');
  expect(html).toContain('CRYPTO_MARKETS_PAUSE_EXITS');
  // Accuracy (Codex combined review): revocation covers issued cookies and logout ends both sessions (session PR),
  // and the saved research-alert pause is pointed to rather than denied.
  expect(html).toContain('including admin cookies already issued');
  expect(html).toContain('Logout ends both the admin cookie and the app session');
  expect(html).toContain('href="/admin/alerts"');
  expect(html).not.toContain('notification preferences have no saved settings');
  expect(html).not.toMatch(/<input|<button|<form|Admin secret rotation|Manage Alpha Vantage, Stripe, and OpenAI API key configuration/);
});
