// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({score:0}));
vi.mock('@/lib/time-confluence',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/lib/time-confluence')>();
 return {...actual,getTimeConfluenceState:(_date:Date,asset:'crypto'|'equity')=>({...actual.getTimeConfluenceState(new Date('2026-10-05T14:00:00Z'),asset),nowConfluenceScore:fixture.score})};
});
import TimeConfluenceWidget from '@/components/TimeConfluenceWidget';
afterEach(()=>cleanup());
it.each([0,14])('crypto score %s has no equity badge/windows, invented hit rate or nonfunctional alert',score=>{
 fixture.score=score;const {container}=render(<TimeConfluenceWidget assetClass="crypto" symbol="BTCUSD"/>);
 expect(container.textContent).toContain('24/7 crypto');
 expect(container.textContent).not.toMatch(/Market Open|US EQUITY|NEXT US|Set Alert|Alert Active|hit rate|pattern setups/);
});
it('equity keeps its session context without invented hit rates or local-only alerts',()=>{
 fixture.score=14;const {container}=render(<TimeConfluenceWidget assetClass="equity" symbol="MU"/>);
 expect(container.textContent).toContain('Market Open');
 expect(container.textContent).not.toMatch(/Set Alert|Alert Active|hit rate|pattern setups/);
});

it('switching from equity to crypto removes the US-anchored current panel',()=>{
 const {container,rerender}=render(<TimeConfluenceWidget assetClass="equity" symbol="MU"/>);
 rerender(<TimeConfluenceWidget assetClass="crypto" symbol="BTCUSD"/>);
 expect(container.textContent).toContain('24/7 crypto');
 expect(container.textContent).not.toMatch(/Market Open|US equity session windows|Next US/);
});
