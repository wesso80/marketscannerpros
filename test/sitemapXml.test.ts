/**
 * @vitest-environment jsdom
 */
import { expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { resolveSitemap } from 'next/dist/esm/build/webpack/loaders/metadata/resolve-route-data.js';

it('parses sitemap.xml as XML and omits the heatmap query', () => {
  const xml = resolveSitemap(sitemap());
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  const locs = [...doc.getElementsByTagName('loc')].map((node) => node.textContent ?? '');
  expect(locs.some((url) => url.endsWith('/tools/explorer'))).toBe(true);
  expect(locs.some((url) => url.includes('section=heatmap') || url.includes('&'))).toBe(false);
});
