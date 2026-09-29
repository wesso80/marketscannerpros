import {it,expect,vi,afterEach} from 'vitest';
import {classifyFunding,assessDerivatives,fetchDerivatives,priceChange24h} from '@/lib/admin/cryptoDerivatives';
const H=3600000,now=Date.UTC(2026,8,29,8),inst='SOL-USDT-SWAP';
const funding=(rate:string,ts=now-60000,instId=inst)=>({code:'0',data:[{instType:'SWAP',instId,fundingRate:rate,ts:String(ts)}]});
const oi=(dayAgoUsd:number,latestUsd:number)=>({code:'0',data:[[String(now-H),'1','1',String(latestUsd)],[String(now-25*H),'1','1',String(dayAgoUsd)]]});
afterEach(()=>{vi.unstubAllGlobals();});
it('labels funding pressure from the 8h rate',()=>{
 expect(classifyFunding(.0001)).toBe('NEUTRAL');expect(classifyFunding(.0003)).toBe('ELEVATED_LONG');
 expect(classifyFunding(.0008)).toBe('CROWDED_LONG');expect(classifyFunding(-.0002)).toBe('SHORT_SKEW');expect(classifyFunding(null)).toBe('UNAVAILABLE');
});
it('flags leverage-driven rallies, short covering and crowded funding with source and timestamps',()=>{
 const lev=assessDerivatives(inst,funding('0.0008'),oi(100e6,120e6),5,now);
 expect(lev).toMatchObject({status:'OK',source:'okx:USDT-SWAP',fundingState:'CROWDED_LONG',oiUsd:120e6,flags:['CROWDED_FUNDING','LEVERAGE_DRIVEN'],fundingAt:new Date(now-60000).toISOString()});
 expect(lev.oiChange24hPct).toBeCloseTo(20,6);
 expect(assessDerivatives(inst,funding('0.0001'),oi(100e6,85e6),3,now).flags).toEqual(['SHORT_COVERING']);
 expect(assessDerivatives(inst,funding('0.0001'),oi(100e6,130e6),-2,now).flags).toEqual([]);
});
it('never infers missing, stale or mismatched derivatives data',()=>{
 expect(assessDerivatives(inst,{code:'51001',data:[]},null,1,now)).toMatchObject({status:'UNAVAILABLE',fundingState:'UNAVAILABLE',fundingRate:null});
 expect(assessDerivatives(inst,funding('0.0001',now-10*H),null,1,now).status).toBe('UNAVAILABLE');
 expect(assessDerivatives(inst,funding('0.0001',now,'BTC-USDT-SWAP'),null,1,now).status).toBe('UNAVAILABLE');
 expect(assessDerivatives(inst,funding('0.0001'),null,1,now)).toMatchObject({status:'OK',oiUsd:null,oiChange24hPct:null,reason:expect.stringContaining('funding only')});
});
it('records provider failure as UNAVAILABLE instead of throwing',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:500})));
 expect(await fetchDerivatives('SOL',[],now)).toMatchObject({status:'UNAVAILABLE',reason:expect.stringContaining('HTTP 500')});
});
it('computes 24h price change only from six completed 4h bars',()=>{
 const bars=Array.from({length:7},(_,k)=>({t:k*4*H,o:1,h:1,l:1,c:k===6?110:100,v:1}));
 expect(priceChange24h(bars)).toBeCloseTo(10,6);expect(priceChange24h(bars.slice(2))).toBeNull();
});
