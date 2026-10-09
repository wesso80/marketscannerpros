// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
}));

import AuthPage from '@/app/auth/page';
import AdminLoginPage from '@/app/admin/login/page';

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ authenticated: false }) })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('does not render the admin direct login box on the public sign-in page', async () => {
  render(<AuthPage />);
  await screen.findByLabelText('Email address');
  expect(screen.queryByText('Admin Direct Login')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Admin Sign In' })).toBeNull();
  expect(screen.queryByPlaceholderText('Passphrase')).toBeNull();
  const source = readFileSync('app/auth/page.tsx', 'utf8');
  expect(source).not.toContain('Admin Direct Login');
  expect(source).not.toContain('/api/auth/admin-login');
});

it('keeps the same admin sign-in form on the unlinked admin route', async () => {
  render(<AdminLoginPage />);
  expect(screen.getByText('Admin Direct Login')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Admin email'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'phrase' } });
  fireEvent.click(screen.getByRole('button', { name: 'Admin Sign In' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/auth/admin-login', expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ email: 'owner@example.test', passphrase: 'phrase' }),
  })));
  const page = readFileSync('app/admin/login/page.tsx', 'utf8');
  expect(page).toContain('index: false');
});
