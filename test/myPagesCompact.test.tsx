// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
const state=vi.hoisted(()=>({favorites:[] as string[],loading:false,error:null as string|null,degraded:false,toggleFavorite:vi.fn()}));
vi.mock('@/hooks/useFavorites',()=>({useFavorites:()=>state}));
import FavoritesPanel from '@/components/FavoritesPanel';
import {TOOL_CATALOG,getToolByKey,resolveFavoriteTools} from '@/lib/toolCatalog';
beforeEach(()=>{vi.stubGlobal('React',React);vi.clearAllMocks();state.favorites=TOOL_CATALOG.slice(0,8).map(t=>t.key);state.loading=false;state.error=null;state.degraded=false;});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it('shows five shortcuts in original order with one summary/source and a closed catalogue',()=>{
 const {container}=render(<FavoritesPanel embeddedInDashboard/>);
 expect(container.querySelectorAll('[data-favorite-card]')).toHaveLength(5);
 expect(container.querySelectorAll('[data-my-pages-summary]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(screen.getByRole('button',{name:'Manage pages'}).getAttribute('aria-expanded')).toBe('false');
 expect(screen.queryByText('Browse Workflow Tools')).toBeNull();
 const links=[...container.querySelectorAll('[data-favorite-card] a')].map(a=>a.getAttribute('href'));
 expect(links).toEqual(resolveFavoriteTools(state.favorites).slice(0,5).map(t=>t.href));
 fireEvent.click(screen.getByRole('button',{name:'Show all 8'}));expect(container.querySelectorAll('[data-favorite-card]')).toHaveLength(8);
 fireEvent.click(screen.getByRole('button',{name:'Show five'}));expect(container.querySelectorAll('[data-favorite-card]')).toHaveLength(5);
});

it('keeps remove buttons visible without hover and removes all stored aliases',async()=>{
 state.favorites=['golden-egg','/tools/golden-egg'];
 const {container}=render(<FavoritesPanel embeddedInDashboard/>);
 expect(container.querySelectorAll('[data-favorite-card]')).toHaveLength(1);
 const remove=screen.getByRole('button',{name:'Remove Symbol from My Pages'});
 expect(remove.className).toContain('min-h-10');expect(remove.className).toContain('min-w-10');expect(remove.className).not.toContain('opacity-0');
 fireEvent.click(remove);
 await waitFor(()=>expect(state.toggleFavorite).toHaveBeenCalledTimes(2));
 expect(state.toggleFavorite.mock.calls.map(call => call[0])).toEqual(['golden-egg', '/tools/golden-egg']);
});

it('retains category filtering and adding the canonical key',()=>{
 state.favorites=[];render(<FavoritesPanel embeddedInDashboard/>);
 fireEvent.click(screen.getByRole('button',{name:'Manage pages'}));
 const tool=TOOL_CATALOG.find(t=>t.key==='scanner')!;
 fireEvent.click(screen.getByRole('button',{name:tool.category,exact:true}));
 expect(screen.getByRole('button',{name:tool.category,exact:true}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:`Add ${tool.label} to My Pages`}));
 expect(state.toggleFavorite).toHaveBeenCalledExactlyOnceWith(tool.key);
 expect(getToolByKey(tool.key)?.href).toBe('/tools/scanner');
});

it('distinguishes cached, signed-out, loading and failed preferences without raw errors',()=>{
 state.degraded=true;const {container,rerender}=render(<FavoritesPanel/>);
 expect(screen.getByRole('status').textContent).toContain('shown from cache');expect(container.textContent).toContain('Cached saved-page preferences');
 state.loading=true;rerender(<FavoritesPanel/>);expect(screen.getByRole('status').textContent).toContain('Loading');expect(container.querySelectorAll('[data-source-line]')).toHaveLength(0);
 state.loading=false;state.error='Sign in to load your saved pages.';rerender(<FavoritesPanel/>);expect(screen.getByRole('link',{name:'Sign in'}).getAttribute('href')).toBe('/auth?next=/tools/dashboard');
 state.error='DATABASE_UNKNOWN';rerender(<FavoritesPanel/>);expect(container.textContent).not.toContain('DATABASE_UNKNOWN');expect(screen.getByRole('status').textContent).toContain('could not be loaded');
});
