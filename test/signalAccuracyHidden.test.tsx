// @vitest-environment jsdom
import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { SHOW_SIGNAL_OUTCOME_STATS } from '@/lib/signals/outcomeStatsVisibility';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn() }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro', isLoggedIn: true, isLoading: false, isAdmin: false }) }));

import { GET } from '@/app/api/ai/accuracy/route';
import Accuracy from '@/app/tools/signal-accuracy/page';

it('hides historical outcome totals by default', async () => {
  expect(SHOW_SIGNAL_OUTCOME_STATS).toBe(false);
  const { container } = render(<Accuracy />);
  expect(screen.getByText('Historical outcome totals are hidden while stored labels are being checked.')).toBeTruthy();
  expect(container.textContent).toContain('General information only, not financial advice.');
  expect(container.textContent).not.toMatch(/\b(signal|edge|win rate|guaranteed)\b/i);
  expect(container.textContent).not.toMatch(/%/);

  const res = await GET(new NextRequest('http://localhost/api/ai/accuracy'));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.hidden).toBe(true);
  expect(body.stats).toEqual([]);
  expect(body.overall).toBeNull();
  expect(body.metadata.note).toContain('General information only, not financial advice.');
});
