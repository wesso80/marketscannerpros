import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {primaryNavTools} from '@/lib/toolWorkflows';
const read=(p:string)=>readFileSync(p,'utf8');
const prohibited=(source:string)=>/(?:href|path)\s*[:=]\s*(?:\{\s*)?['"`]\/(?:admin|operator)(?:[/?'"`])/.test(source);
it('has the five layout destinations in order',()=>expect(primaryNavTools.map(({label,href})=>[label,href])).toEqual([
 ['Overview','/tools/command-center'],['Scanner','/tools/scanner'],['Symbol','/tools/golden-egg'],['Options','/tools/options'],['Track','/tools/workspace?tab=journal']
]));
it('lands both login paths and checkout on Overview',()=>{
 expect(read('app/auth/page.tsx').match(/router\.(?:push|replace)\(['"]\/tools\/command-center['"]\)/g)).toHaveLength(2);
 expect(read('app/after-checkout/page.tsx')).toContain('router.replace("/tools/command-center")');
});
it('keeps internal admin routes out of all public navigation and catalogues',()=>{
 for(const p of ['components/Header.tsx','components/ToolsNavBar.tsx','components/MobileNav.tsx','components/Footer.tsx','lib/toolCatalog.ts','lib/toolWorkflows.ts','app/sitemap.ts'])expect(prohibited(read(p)),p).toBe(false);
 // Mutation check proves the scan catches a newly inserted link.
 expect(prohibited(read('components/Header.tsx')+'\n<a href="/admin">Admin</a>')).toBe(true);
 expect(prohibited('const tool = { path: "/operator" };')).toBe(true);
 const robots=read('app/robots.ts');expect(robots).toContain("'/admin/'");expect(robots).toContain("'/operator/'");
});
