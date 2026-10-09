import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {summarise,findings,barsPerDay,scannerDataAudit,type SymbolDepth} from '@/lib/admin/scannerDataAudit';
import {discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
import {q} from '@/lib/db';
const now=Date.parse('2026-10-07T00:00:00Z'),D=86400000;
const sym=(symbol:string,asset:string,years:number,lastDaysAgo:number,fill=1,zero=0):SymbolDepth=>{
 const last=now-lastDaysAgo*D,first=last-years*365.25*D,bars=Math.round((years*365.25+1)*barsPerDay(asset)*fill);
 return {symbol,asset,bars,first:new Date(first).toISOString(),last:new Date(last).toISOString(),zeroVolume:zero?bars:0};
};
describe('scanner data audit (read-only)',()=>{
 const rows=[sym('AAA','equity',8,1),sym('BBB','equity',2,1),sym('CCC','equity',4,60),sym('DDD','equity',3,1,.5),sym('BTC','crypto',5,0,1,1)];
 const s=summarise(rows,now);
 it('per-asset depth, staleness, dormancy, gaps and missing volume',()=>{
  const eq=s.find(a=>a.asset==='equity')!;
  expect(eq.symbols).toBe(4);expect(eq.stale).toBe(1);expect(eq.dormant).toBe(1);expect(eq.incomplete).toBe(1);
  expect(eq.depth['>=2000']).toBe(1);expect(eq.yearsFor['25']).toBeNull();
  expect(s.find(a=>a.asset==='crypto')!.zeroVolumeSymbols).toBe(1);
 });
 it('findings flag survivorship when nothing dormant is kept, and enabled symbols without bars',()=>{
  const f=findings(summarise([sym('AAA','equity',8,1)],now),[{asset:'equity',enabled:50,withoutBars:7}]);
  expect(f.some(x=>/survivorship-biased/.test(x))).toBe(true);
  expect(f.some(x=>/7 of 50 enabled scanner symbols have no stored daily bars/.test(x))).toBe(true);
  expect(findings(s,[]).some(x=>/1 symbols stopped updating/.test(x))).toBe(true);
 });
 it('only reads: every query is a SELECT, and a missing CoinGecko table is reported, not guessed',async()=>{
  vi.mocked(q).mockImplementation(async(sql:string)=>{if(/cg_hist_daily/.test(sql))throw Error('relation does not exist');return [];});
  const r=await scannerDataAudit(true);
  for(const [sql] of vi.mocked(q).mock.calls)expect(String(sql).trim()).toMatch(/^SELECT/i);
  expect(r.cryptoHistory).toEqual({unavailable:expect.stringMatching(/not created/)});
  expect(r.source).toMatch(/ohlcv_bars/);expect(r.generatedAt).toBeTruthy();
 });
 it('universe query aliases the no-bars count as without_bars (bare "without" is a Postgres syntax error) and maps it',async()=>{
  vi.mocked(q).mockReset();
  vi.mocked(q).mockImplementation((async(sql:string)=>/FROM symbol_universe u WHERE u.enabled/.test(sql)?[{asset:'equity',enabled:'50',without_bars:'7'}]:[]) as any);
  const r=await scannerDataAudit(true);
  const uniSql=vi.mocked(q).mock.calls.map(([sql])=>String(sql)).find(sql=>/FROM symbol_universe u WHERE u.enabled/.test(sql))!;
  expect(uniSql).toMatch(/\) AS without_bars FROM/);
  for(const [sql] of vi.mocked(q).mock.calls)expect(String(sql)).not.toMatch(/\)\s+without\s+FROM/i);
  expect(r.universe).toEqual([{asset:'equity',enabled:50,withoutBars:7}]);
  expect(r.findings).toContain('equity: 7 of 50 enabled scanner symbols have no stored daily bars.');
  vi.mocked(q).mockReset();vi.mocked(q).mockImplementation((async()=>[]) as any);
 });
 it('GET is allowed while admin discovery-only mode is on; POST is not',()=>{
  expect(discoveryOnlyAction('/api/admin/scanner-data-audit','GET')).toBe('allow');
  expect(discoveryOnlyAction('/api/admin/scanner-data-audit','POST')).toBe('pause_api');
 });
});
