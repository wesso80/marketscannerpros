// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import PortfolioOverview from '@/components/portfolio/PortfolioOverview';
import EmptyState from '@/components/visual/EmptyState';
import TabBar from '@/components/visual/TabBar';
vi.stubGlobal('React', React);
afterEach(cleanup);
it('shows measured open value and an honest daily-change gap, with neutral allocation chart', () => {
  const allocation = [{symbol:'AAPL',value:1000,percentage:80},{symbol:'NEAR',value:250,percentage:20}];
  const before = JSON.stringify(allocation);
  const {container} = render(<PortfolioOverview value={1250} totalCost={1000} openPL={125} allocation={allocation} limit={25}/>);
  expect(screen.getByText('Value simulated')).toBeTruthy();
  expect(container.querySelector('.lg\\:grid-cols-5')).toBeTruthy();
  expect(container.querySelector('.col-span-2')).toBeTruthy();
  expect(screen.getByText('Not measured')).toBeTruthy();
  expect(screen.getByRole('img', {name:'Allocation by recorded position value'})).toBeTruthy();
  expect(container.textContent).not.toMatch(/N\/A|—|NaN|undefined/);
  expect(JSON.stringify(allocation)).toBe(before);
});
it('new-user state offers a position action and labels its illustration, without zero-value tiles', () => {
  const {container} = render(<EmptyState title="Add your first position" action="Add Position" href="/tools/workspace?tab=portfolio&view=add"/>);
  expect(screen.getByRole('link',{name:'Add Position'}).getAttribute('href')).toContain('view=add');
  expect(screen.getByText('Example · illustrative layout, no account data')).toBeTruthy();
  expect(container.textContent).not.toMatch(/\$0\.00|N\/A|—/);
});
it('Portfolio has five actual tabs and Add Position is an action, not a tab', () => {
  const page = readFileSync('app/tools/portfolio/page.tsx','utf8');
  const items = [...page.slice(page.indexOf('const modeItems = ['),page.indexOf('] as const;',page.indexOf('const modeItems = ['))).matchAll(/key: '([^']+)', label: '([^']+)'/g)].map(m=>({id:m[1],label:m[2]}));
  render(<TabBar label="Portfolio views" items={items} activeId="overview"/>);
  expect(within(screen.getByRole('tablist')).getAllByRole('tab').map(t=>t.textContent)).toEqual(['Overview','Positions','Ledger','Risk','Allocation']);
  expect(page).not.toContain('<CommandStrip');
  expect(page).not.toContain('<DecisionCockpit');
});
it('Track shell uses one title and shared tab bar, without duplicate hero', () => {
  const page = readFileSync('app/tools/workspace/page.tsx','utf8');
  expect(page).toContain('>Track</h1>');
  expect(page.match(/<TabBar/g)).toHaveLength(1);
  expect(page).not.toContain('PageHero');
  expect(page).not.toContain('WorkspaceMetric');
});
