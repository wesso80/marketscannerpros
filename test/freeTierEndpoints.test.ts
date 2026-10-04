import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({used:2,workspace:null as string|null,fail:false,params:[] as unknown[]}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>state.workspace?{workspaceId:state.workspace}:null}));
vi.mock('@/lib/db',()=>({q:async(_sql:string,params:unknown[])=>{state.params=params;if(state.fail)throw new Error('PRIVATE');return [{scan_count:state.used}];}}));
vi.mock('@/lib/rateLimit',()=>({getClientIP:()=> '127.0.0.1'}));
import { GET } from '@/app/api/scanner/usage/route';
beforeEach(()=>{state.workspace=null;state.fail=false;state.used=2;state.params=[];});
it('issues a visitor cookie, reads the IP fallback until the browser sends it, and never caches private allowance',async()=>{
 const response=await GET(new NextRequest('https://example.test/api/scanner/usage'));
 const body=await response.json();expect(body.used).toBe(2);expect(body.limit).toBe(5);expect(body.resetsAt).toMatch(/T00:00:00.000Z$/);
 expect(response.headers.get('set-cookie')).toMatch(/msp_scan_visitor=.*HttpOnly/i);expect(response.headers.get('cache-control')).toContain('no-store');
 expect(String(state.params[0])).toMatch(/^anon:ip:/);
});
it('does not reset the quota on read failure or leak database errors',async()=>{
 state.fail=true;const response=await GET(new NextRequest('https://example.test/api/scanner/usage'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE');
});
it('signed-in quota uses workspace identity',async()=>{
 state.workspace='ws-123';const response=await GET(new NextRequest('https://example.test/api/scanner/usage'));expect(state.params[0]).toBe('ws-123');expect(response.headers.get('set-cookie')).toBeNull();
});
