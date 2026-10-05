// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
const mocks = vi.hoisted(() => ({list:vi.fn(), remove:vi.fn(), update:vi.fn(), navigate:vi.fn(), select:vi.fn()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams({tab:'saved'})}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro',isLoggedIn:true,isLoading:false})}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({navigateTo:mocks.navigate,selectSymbol:mocks.select})}));
vi.mock('@/app/v2/_lib/api',()=>({useNews:()=>({data:null,loading:false}),useEconomicCalendar:()=>({data:null,loading:false}),useEarningsCalendar:()=>({data:null,loading:false})}));
vi.mock('@/lib/clientResearchCases',()=>({listSavedResearchCases:mocks.list,deleteSavedResearchCase:mocks.remove,updateSavedResearchCaseOutcome:mocks.update}));
import Research from '@/app/tools/research/page';
import { savedCaseLabel } from '@/lib/savedCasePresentation';
const cases = Array.from({length:8}, (_, i) => ({id:`case-${i}`,symbol:`TEST${i}`,assetClass:'equity',sourceType:'scanner',title:null,dataQuality:'DEGRADED',generatedAt:null,createdAt:'2026-10-02T20:00:00Z',lifecycleState:'NO_SETUP',outcomeStatus:'pending',researchCase:{},outcomeSuggestion:{status:'reviewed',confidence:'low',reason:'Saved evidence available'}}));
beforeEach(()=>{vi.stubGlobal('React',React);vi.clearAllMocks();mocks.list.mockResolvedValue(structuredClone(cases));mocks.remove.mockResolvedValue(undefined);mocks.update.mockImplementation(async(input)=>({...cases[0],...input}));vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected network request');}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it('caps the stored list, keeps details closed, and never invents missing evidence counts',async()=>{
 const {container}=render(<Research/>);await screen.findByText('8 saved research cases loaded');
 expect(container.querySelectorAll('[data-saved-case]')).toHaveLength(5);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-research-verdict]')).toHaveLength(1);
 expect(container.textContent).not.toMatch(/DEGRADED|NO_SETUP/);
 expect(container.textContent).toContain('Recorded evidence gaps: Not supplied');
 expect(container.textContent).toContain('not current market observations');
 fireEvent.click(screen.getByRole('button',{name:'Show all 8'}));expect(container.querySelectorAll('[data-saved-case]')).toHaveLength(8);
 fireEvent.click(screen.getByRole('button',{name:'Show five'}));expect(container.querySelectorAll('[data-saved-case]')).toHaveLength(5);
 expect(mocks.list).toHaveBeenCalledWith({limit:50});
});

it('preserves Symbol navigation, explicit suggestion apply, outcome values and delete identity',async()=>{
 const {container}=render(<Research/>);await screen.findByText('8 saved research cases loaded');
 fireEvent.click(screen.getByRole('button',{name:'Open TEST0 saved research case in Symbol'}));
 expect(mocks.navigate).toHaveBeenCalledWith('golden-egg','TEST0');
 const row=within(container.querySelector('[data-saved-case]') as HTMLElement);
 fireEvent.click(row.getByText('Case details and actions'));
 fireEvent.click(row.getByRole('button',{name:'Apply'}));
 await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id:'case-0',outcomeStatus:'reviewed',outcomeNote:'Saved evidence available'})));
 await waitFor(()=>expect((row.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(row.getByRole('button',{name:'Confirm'}));
 await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({id:'case-0',outcomeStatus:'confirmed',outcomeMetadata:{source:'tools-research-archive'}})));
 fireEvent.click(row.getByRole('button',{name:'Delete'}));
 await waitFor(()=>expect(mocks.remove).toHaveBeenCalledWith('case-0'));
 await screen.findByText('7 saved research cases loaded');
});

it('distinguishes failed refresh from an empty archive and hides backend error codes',async()=>{
 mocks.list.mockRejectedValueOnce(new Error('DATABASE_UNKNOWN secret detail'));
 const {container}=render(<Research/>);await screen.findByText('The last request did not complete.');
 expect(container.textContent).not.toMatch(/DATABASE_UNKNOWN|No saved research cases yet/);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText('8 saved research cases loaded');
 mocks.list.mockRejectedValueOnce(new Error('FAIL'));
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText(/Previously loaded cases remain below/);
 expect(container.querySelectorAll('[data-saved-case]')).toHaveLength(5);
});

it('uses explicit labels without claiming unknown engine states have meaning',()=>{
 expect(savedCaseLabel('LIVE')).toBe('Live at capture');
 expect(savedCaseLabel('ARMED')).toBe('Criteria met');
 expect(savedCaseLabel('NEW_ENGINE_CODE')).toBe('Not supplied');
 expect(savedCaseLabel(null)).toBe('Not supplied');
});
