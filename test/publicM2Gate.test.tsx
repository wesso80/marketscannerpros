// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
const h=vi.hoisted(()=>({path:'/intelligence/global-m2',tier:'free',isLoggedIn:true}));
vi.mock('next/navigation',()=>({usePathname:()=>h.path}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({...h,isAdmin:false,isLoading:false})}));
vi.mock('@/components/free/LockedPreview',()=>({default:()=> <p>Locked</p>}));
import Gate from '@/components/free/IntelligenceGate';
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');h.path='/intelligence/global-m2';h.tier='free';h.isLoggedIn=true;});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
it('shows the summary page to signed-in Free',()=>{render(<Gate>Summary</Gate>);expect(screen.getByText('Summary')).toBeTruthy();});
it.each(['/intelligence','/intelligence/fragility','/intelligence/global-m2/private'])('does not unlock another intelligence path %s',path=>{h.path=path;render(<Gate>Private</Gate>);expect(screen.queryByText('Private')).toBeNull();});
it('retains flag-off and signed-out gates',()=>{vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','false');render(<Gate>Summary</Gate>);expect(screen.queryByText('Summary')).toBeNull();cleanup();vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');h.tier='anonymous';h.isLoggedIn=false;render(<Gate>Summary</Gate>);expect(screen.queryByText('Summary')).toBeNull();});
