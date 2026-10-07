import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {META_DDL,metaDdlStatements,toMetaRows,scoreLiveSignals} from '@/lib/admin/cryptoMetaModelJob';
import {FEATURE_NAMES} from '@/lib/admin/cryptoMetaModel';
import {discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
import {q} from '@/lib/db';
describe('shadow model job (research only, log only)',()=>{
 it('migration matches the code DDL',()=>{
  expect(META_DDL).toBe(readFileSync('migrations/124_crypto_meta_model.sql','utf8'));
  expect(metaDdlStatements()).toHaveLength(4);
 });
 it('labels: closed fixed-plan outcomes only; window-end marks and gaps are excluded; target is net R > 0',()=>{
  const base={signal_at:'2024-01-01T04:00:00Z',v:{rsi14_4h:55}};
  const rows=toMetaRows([
   {...base,signal_id:'win',fixed:{status:'CLOSED',r:1.9,exit:'TAKE_PROFIT',at:'2024-01-02T00:00:00Z'}},
   {...base,signal_id:'flat',fixed:{status:'CLOSED',r:0,exit:'TIME_EXIT',at:'2024-01-04T00:00:00Z'}},
   {...base,signal_id:'end',fixed:{status:'CLOSED',r:0.4,exit:'WINDOW_END',at:'2024-01-03T00:00:00Z'}},
   {...base,signal_id:'gap',fixed:{status:'DATA_GAP',r:null,exit:null,at:null}},
   {...base,signal_id:'none',fixed:null}]);
  expect(rows.map(r=>[r.id,r.y])).toEqual([['win',1],['flat',0]]);
  expect(rows[0].x).toHaveLength(FEATURE_NAMES.length);expect(rows[0].exitAt).toBe(Date.parse('2024-01-02T00:00:00Z'));
 });
 it('live scoring without a trained model does nothing and never throws',async()=>{
  vi.mocked(q).mockImplementation(async()=>[]);
  await expect(scoreLiveSignals()).resolves.toEqual({ok:true,skipped:'No trained model'});
  vi.mocked(q).mockImplementation(async()=>{throw Error('db down');});
  await expect(scoreLiveSignals()).resolves.toMatchObject({ok:false});
 });
 it('the shadow model API stays reachable in discovery-only mode',()=>{expect(discoveryOnlyAction('/api/admin/crypto-markets/meta-model','POST')).toBe('allow');});
});
