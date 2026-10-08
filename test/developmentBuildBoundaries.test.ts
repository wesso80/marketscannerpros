import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
afterEach(()=>vi.unstubAllEnvs());
it.each(['production','development','test'])('limits eval CSP to development: %s',async environment=>{
 vi.stubEnv('NODE_ENV',environment);
 const {default:config}=await import('../next.config.mjs');
 const rules=await config.headers();
 const csp=rules[0].headers.find((h:{key:string})=>h.key==='Content-Security-Policy').value;
 expect(csp.includes("'unsafe-eval'")).toBe(environment==='development');
});
it('keeps the summary source valid UTF-8',()=>{
 const bytes=readFileSync('components/research/SymbolAiSummary.tsx');
 expect(()=>new TextDecoder('utf-8',{fatal:true}).decode(bytes)).not.toThrow();
});
