import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {EXIT_DDL,exitDdlStatements,toExitRows} from '@/lib/admin/cryptoExitSelectJob';
import {EXIT_PLANS} from '@/lib/admin/cryptoExitSelect';
import {discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
const closed=(r:number)=>({status:'CLOSED',r});
const shadows=Object.fromEntries(EXIT_PLANS.slice(1).map((p,i)=>[p,closed(i/10)]));
const row=(id:string,o:any)=>({signal_id:id,signal_at:'2024-01-01T04:00:00Z',o,v:{adx14_4h:30}});
describe('exit selection job (research only, log only)',()=>{
 it('migration matches the code DDL',()=>{expect(EXIT_DDL).toBe(readFileSync('migrations/125_crypto_exit_select.sql','utf8'));expect(exitDdlStatements()).toHaveLength(2);});
 it('keeps only signals where every plan closed; purge time is the path end',()=>{
  const ok={fixed:{status:'CLOSED',r:1.9,exit:'TAKE_PROFIT'},shadows,pathEnd:'2024-01-08T05:00:00Z'};
  const {rows,incomplete}=toExitRows([row('ok',ok),row('end',{...ok,fixed:{status:'CLOSED',r:.3,exit:'WINDOW_END'}}),row('open',{...ok,shadows:{...shadows,'trail-only-v4':{status:'OPEN',r:null}}}),row('gap',{...ok,fixed:{status:'DATA_GAP',r:null,exit:null}}),row('none',null)]);
  expect(rows.map(r=>r.id)).toEqual(['ok']);expect(incomplete).toBe(4);
  expect(rows[0].r['fixed-2r']).toBe(1.9);expect(rows[0].r['trail-only-v4']).toBe(.2);expect(rows[0].exitAt).toBe(Date.parse('2024-01-08T05:00:00Z'));
 });
 it('the exit selection API stays reachable in discovery-only mode',()=>{expect(discoveryOnlyAction('/api/admin/crypto-markets/exit-select','POST')).toBe('allow');});
});
