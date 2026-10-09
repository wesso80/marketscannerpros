import {readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {PUBLIC_DESTINATIONS,publicDesignEnabled,m2ResearchEnabled,publicDesignScope,publicDestination} from '@/lib/publicDesign';
vi.mock('next/navigation',()=>({usePathname:()=>'/tools/workspace',useSearchParams:()=>new URLSearchParams('tab=Journal')}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({isLoggedIn:true,isLoading:false})}));
vi.mock('next/link',()=>({default:({children,href,...props}:any)=><a href={href} {...props}>{children}</a>}));
import PublicDesignShell from '@/components/public-design/PublicDesignShell';
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
it('always uses the approved design and defines exactly seven destinations',()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','');expect(publicDesignEnabled()).toBe(true);
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');expect(publicDesignEnabled()).toBe(true);
 expect(PUBLIC_DESTINATIONS.map(d=>d.label)).toEqual(['Overview','Symbol','Macro Outlook','Global M2 Intelligence','Portfolio','Journal','Learning']);
});
it.each(['/admin','/admin/portfolio-lab','/operator','/operator/research','/v2','/v2/tools'])('excludes private route %s',path=>expect(publicDesignScope(path)).toBeNull());
it('binds Portfolio and Journal to actual workspace tab routes',()=>{
 expect(publicDestination('/tools/workspace','Portfolio')).toBe('Portfolio');
 expect(publicDestination('/tools/workspace','journal')).toBe('Journal');
 expect(publicDestination('/tools/workspace','Alerts')).toBeNull();
 expect(publicDestination('/tools/macro',null)).toBe('Macro Outlook');
});
it('retains children, legal links and account access with correct current destination',()=>{
 render(<PublicDesignShell workspace><button>Existing account action</button></PublicDesignShell>);
 expect(screen.getByRole('button',{name:'Existing account action'})).toBeTruthy();
 expect(screen.getAllByRole('link',{name:'Journal'}).every(a=>a.getAttribute('aria-current')==='page')).toBe(true);
 expect(screen.getByRole('link',{name:'Your account'}).getAttribute('href')).toBe('/account');
 expect(screen.getByRole('link',{name:'Research & risk disclosure'}).getAttribute('href')).toBe('/disclaimer');
 expect(screen.getByRole('link',{name:'Skip to content'}).getAttribute('href')).toBe('#public-research-content');
});
it('uses account-aware public website links without creating a new auth flow',()=>{
 render(<PublicDesignShell workspace={false}>Content</PublicDesignShell>);
 expect(screen.getByRole('link',{name:'Open workspace'}).getAttribute('href')).toBe('/tools/command-center');
 expect(screen.getByRole('link',{name:'Product'}).getAttribute('href')).toBe('/tools/command-center');
 expect(screen.getByRole('link',{name:'Account',exact:true}).getAttribute('href')).toBe('/account');
});

it('keeps M2 service rollout separate from presentation',()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','false');
 expect(publicDesignEnabled()).toBe(true);expect(m2ResearchEnabled()).toBe(false);
});
it.each(['/auth/verify','/account','/about','/daily-pick','/share/scan/AAPL','/legal/privacy','/new-public-page'])('covers secondary public route %s',path=>expect(publicDesignScope(path)).toBe('website'));
it.each(['/api/scanner/run','/_next/static/file.js',''])('does not wrap a non-page %s',path=>expect(publicDesignScope(path)).toBeNull());

it('every public page resolves to the approved shell, while internal pages stay excluded',()=>{
 function pages(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?pages(join(dir,entry.name)):entry.name==='page.tsx'?[join(dir,entry.name)]:[]);}
 const routes=pages('app').map(file=>'/'+relative('app',file).replace(/\\/g,'/').replace(/\/?page\.tsx$/,''));
 expect(routes.length).toBeGreaterThan(100);
 for(const path of routes){if(/^\/(admin|operator|v2)(\/|$)/.test(path))expect(publicDesignScope(path),path).toBeNull();else expect(publicDesignScope(path),path).not.toBeNull();}
});
it('old records URLs preserve the intended destination and Macro never redirects to the old dashboard',async()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','false');
 const config=(await import('../next.config.mjs')).default;
 const redirects=await config.redirects();
 expect(redirects.some((r:any)=>r.source==='/tools/macro')).toBe(false);
 expect(redirects.find((r:any)=>r.source==='/portfolio')?.destination).toBe('/tools/workspace?tab=Portfolio');
 expect(redirects.find((r:any)=>r.source==='/journal')?.destination).toBe('/tools/workspace?tab=Journal');
});
