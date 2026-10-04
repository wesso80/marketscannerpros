import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {primaryNavTools} from '@/lib/toolWorkflows';
const read=(p:string)=>readFileSync(p,'utf8');
const prohibited=(source:string)=>/(?:href|path)\s*[:=]\s*(?:\{\s*)?['"`]\/(?:admin|operator)(?:[/?'"`])/.test(source);
it('has the seven navigation groups in order',()=>expect(primaryNavTools.map(({label,href})=>[label,href])).toEqual([
 ['Today','/tools/command-center'],['Scan & Analyse','/tools/scanner'],['Markets','/tools/explorer'],['Intelligence','/intelligence'],['Track','/tools/workspace?tab=journal'],['Learn','/guide'],['Account','/account']
]));
it('lands free logins on Today and paid logins on Overview',()=>{
 const auth=read('app/auth/page.tsx');
 expect(auth).toContain('router.push("/tools/command-center")');
 expect(auth).toContain("'/tools/command-center' : '/tools/start'");
 expect(read('app/after-checkout/page.tsx')).toContain('router.replace("/tools/command-center")');
 const verify=read('app/auth/verify/page.tsx');
 expect(verify).toContain("'/tools/command-center' : '/tools/start'");
 expect(verify).not.toMatch(/\/tools\/(?:scanner|explorer)/);
});
it('keeps internal admin routes out of all public navigation and catalogues',()=>{
 for(const p of ['components/Header.tsx','components/ToolsNavBar.tsx','components/NavigationGroups.tsx','components/Footer.tsx','lib/toolCatalog.ts','lib/toolWorkflows.ts','app/sitemap.ts'])expect(prohibited(read(p)),p).toBe(false);
 // Mutation check proves the scan catches a newly inserted link.
 expect(prohibited(read('components/Header.tsx')+'\n<a href="/admin">Admin</a>')).toBe(true);
 expect(prohibited('const tool = { path: "/operator" };')).toBe(true);
 const robots=read('app/robots.ts');expect(robots).toContain("'/admin/'");expect(robots).toContain("'/operator/'");
});
