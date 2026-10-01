import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {setupRead} from '@/lib/admin/cryptoJevEvidence';

vi.mock('@/lib/adminAuth',()=>({requireAdmin:vi.fn(async()=>({ok:false}))}));

const root=process.cwd();
function walk(dir:string):string[]{
 return readdirSync(dir).flatMap(name=>{
  if(name==='node_modules'||name==='.next')return [];
  const path=join(dir,name);
  if(statSync(path).isDirectory())return walk(path);
  return path.endsWith('.ts')||path.endsWith('.tsx')?[path]:[];
 });
}

it('rejects every crypto-markets route before any saved read',async()=>{
 const names=readdirSync(join(root,'app/api/admin/crypto-markets')).filter(name=>statSync(join(root,'app/api/admin/crypto-markets',name)).isDirectory());
 expect(names.length).toBeGreaterThanOrEqual(17);
 for(const name of names){
  const mod=await import(`@/app/api/admin/crypto-markets/${name}/route`);
  for(const method of ['GET','POST','DELETE'] as const){
   const handler=mod[method] as ((req:Request)=>Promise<Response>)|undefined;
   if(typeof handler!=='function')continue;
   const response=await handler(new Request('https://test.local/',{method,headers:{'content-type':'application/json'},body:method==='GET'?undefined:'{}'}));
   expect(response.status,{name,method}).toBe(403);
  }
 }
});

it('admin crypto modules stay off public pages, and the CoinGecko webhook does not echo an admin key',()=>{
 const allowed=new Set(['app/api/webhooks/coingecko/route.ts']);
 const offenders:string[]=[];
 for(const file of [...walk(join(root,'app')),...walk(join(root,'components'))]){
  const rel=file.slice(root.length+1).replaceAll('\\','/');
  if(rel.startsWith('app/api/admin/')||rel.startsWith('app/api/cron/')||rel.startsWith('app/admin/')||rel.startsWith('components/admin/'))continue;
  const src=readFileSync(file,'utf8');
  if(allowed.has(rel)){expect(src).not.toMatch(/admin:crypto-markets/);continue;}
  if(/@\/lib\/admin\/crypto|admin:crypto-markets/.test(src))offenders.push(rel);
 }
 expect(offenders).toEqual([]);
});

it('steps confidence down when a Jev input is missing',()=>{
 const full=setupRead({jev:{rule:'jev-shadow-v2',status:'scored',chase:.2,flowAgrees:.2,btcHeadwind:.2,btcTrend:'UP',flowStamp:'x',model:'m',checkedAt:'x'},chart:{rule:'jev-chart-v1',status:'scored',cleanBase:.8,strongClose:.8,volumeExpansion:.8,overheadSupply:.2,bars:25,model:'m',checkedAt:'x'},catalyst:{rule:'jev-catalyst-v2',status:'no-headlines',source:'coingecko',windowHours:48,headlines:0,newestAt:null,listingNews:null,supplyEvent:null,exploitOrOutage:null,regulatoryNegative:null,narrativeOnly:null,model:null,checkedAt:'x'}});
 expect(full.confidence).toMatch(/not a win rate/);
 expect(full.evidenceQuality).toMatch(/^high/);
 const missing=setupRead({stale:true});
 expect(missing.confidence).toMatch(/not established/);
 expect(missing.evidenceQuality).toMatch(/^low/);
 expect(missing.exposure).toMatch(/No order/);
 const book=setupRead({book:{scored:12,unavailable:0,unscored:0}});
 expect(book.confidence).toMatch(/not a win rate/);
 expect(book.evidenceQuality).toMatch(/^high/);
 const gaps=setupRead({book:{scored:4,unavailable:1,unscored:2}});
 expect(gaps.confidence).toMatch(/not established/);
 expect(gaps.evidenceQuality).toMatch(/^low/);
});
