import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { expect, it } from 'vitest';
import { GET } from '@/app/login/route';

function locationOf(res: Response): URL {
  const location = res.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location as string);
}

it('permanently redirects /login to the sign-in page and keeps next and redirect', () => {
  expect(existsSync('app/auth/page.tsx')).toBe(true);
  const res = GET(new NextRequest('https://marketscannerpros.app/login?next=%2Ftools%2Fscanner&redirect=%2Fpricing&plan=pro'));
  expect(res.status).toBe(308);
  const dest = locationOf(res);
  expect(dest.origin).toBe('https://marketscannerpros.app');
  expect(dest.pathname).toBe('/auth');
  expect(dest.searchParams.get('next')).toBe('/tools/scanner');
  expect(dest.searchParams.get('redirect')).toBe('/pricing');
  expect(dest.searchParams.get('plan')).toBe('pro');
});

it('keeps /login on this host when next or redirect is an absolute URL', () => {
  const res = GET(new NextRequest('https://marketscannerpros.app/login?next=https%3A%2F%2Fevil.example%2Fphish&redirect=%2F%2Fevil.example'));
  expect(res.status).toBe(308);
  const dest = locationOf(res);
  expect(dest.origin).toBe('https://marketscannerpros.app');
  expect(dest.pathname).toBe('/auth');
  expect(dest.searchParams.get('next')).toBe('https://evil.example/phish');
  expect(dest.searchParams.get('redirect')).toBe('//evil.example');
});

it('redirects /login with no query to /auth', () => {
  const res = GET(new NextRequest('https://app.marketscannerpros.app/login'));
  expect(res.status).toBe(308);
  const dest = locationOf(res);
  expect(dest.origin).toBe('https://app.marketscannerpros.app');
  expect(dest.pathname).toBe('/auth');
  expect(dest.search).toBe('');
});
