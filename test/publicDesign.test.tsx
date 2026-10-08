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
 expect(screen.getByRole('link',{name:'Open workspace ↗'}).getAttribute('href')).toBe('/tools/command-center');
 expect(screen.getByRole('link',{name:'Account',exact:true}).getAttribute('href')).toBe('/account');
});

it('keeps M2 service rollout separate from presentation',()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','false');
 expect(publicDesignEnabled()).toBe(true);expect(m2ResearchEnabled()).toBe(false);
});
it.each(['/auth/verify','/account','/about','/daily-pick','/share/scan/AAPL','/legal/privacy','/new-public-page'])('covers secondary public route %s',path=>expect(publicDesignScope(path)).toBe('website'));
it.each(['/api/scanner/run','/_next/static/file.js',''])('does not wrap a non-page %s',path=>expect(publicDesignScope(path)).toBeNull());
