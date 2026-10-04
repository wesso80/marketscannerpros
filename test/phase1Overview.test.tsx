// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import PageHero from '@/components/ui/PageHero';

describe('Symbol header hierarchy', () => {
  it('retains h1 by default and accepts h2', () => {
    expect(renderToStaticMarkup(<PageHero eyebrow="Test" title="Title" />)).toContain('<h1');
    expect(renderToStaticMarkup(<PageHero eyebrow="Test" title="Title" titleAs="h2" />)).not.toContain('<h1');
  });
  it('removes header composite displays but retains the lower evidence block', () => {
    const source = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    const header = source.slice(source.indexOf('      <PageHero'), source.indexOf('      <section', source.indexOf('      <PageHero')));
    expect(header).toContain('titleAs="h2"');
    expect(header).not.toMatch(/Indicator composite|INDICATOR_COMPOSITE_LABEL|geConfluenceScore/);
    expect(source.slice(source.indexOf(header) + header.length)).toContain('INDICATOR_COMPOSITE_LABEL');
    expect(source).toContain('CANONICAL_SETUP_TOOLTIP');
  });
});
