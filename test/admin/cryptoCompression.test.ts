import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ExchangeBar} from '../../lib/admin/cryptoExchangeVolume';
import {assessDailyBase,fetchDailyBase,type BaseScanRow} from '../../lib/admin/cryptoBaseScan';
import {compressionFetchDays,dailyCandleCap,dailyVenueUrl,type DailyPair} from '../../lib/admin/cryptoDailyVenues';
import {compressionBoard,compressionPoints,isQuietWindow,scoreCompression,sortCompressionRows,windowVolumeRatio,type CompressionRow} from '../../lib/admin/cryptoCompression';
const D=86400000,end=Date.UTC(2026,8,28),now=end+4*3600000;
const stub:BaseScanRow={id:'test',symbol:'TEST',product:'TEST-USD',exchange:'gdax',quote:'USD',volumeUnit:'TEST',stage:'PENDING',reason:'',asOf:null,high:null,low:null,widthPct:null,gapPct:null,slopePct:null,contraction:null};
const bar=(i:number,n:number,over:Partial<ExchangeBar>={}):ExchangeBar=>({t:end-(n-1-i)*D,o:100,h:102,l:98,c:100,v:100,...over});
function series(n:number,shape:(i:number,n:number)=>Partial<ExchangeBar>=()=>({})):ExchangeBar[]{
  return Array.from({length:n},(_,i)=>bar(i,n,shape(i,n)));
}
/** Prior window wide, current window tight, volume dries up in the latest third of the current window. */
function compressed(days:21|45|90,volume=40):ExchangeBar[]{
  const n=days*2;
  return series(n,i=>{
    const current=i>=days,recent=i>=n-days/3;
    return current?{h:102,l:98,v:recent?volume:100}:{h:110,l:90,v:200};
  });
}
const w=(flag:ReturnType<typeof scoreCompression>,days:21|45|90)=>flag.windows.find(x=>x.days===days)!;
afterEach(()=>vi.unstubAllGlobals());
describe('compression score',()=>{
  it('scores the formula from width, shrink, ATR, volume and length',()=>{
    expect(compressionPoints({widthPct:0,rangeRatio:0,atrRatio:0,volumeRatio:0,days:90})).toBe(100);
    expect(compressionPoints({widthPct:15,rangeRatio:1,atrRatio:1,volumeRatio:0.7,days:21})).toBe(2.3);
    expect(compressionPoints({widthPct:40,rangeRatio:2,atrRatio:3,volumeRatio:1.5,days:45})).toBe(5);
    expect(isQuietWindow({widthPct:15,rangeRatio:0.99,atrRatio:0.99,volumeRatio:0.7})).toBe(true);
    expect(isQuietWindow({widthPct:15.01,rangeRatio:0.5,atrRatio:0.5,volumeRatio:0.4})).toBe(false);
    expect(isQuietWindow({widthPct:10,rangeRatio:1,atrRatio:0.5,volumeRatio:0.4})).toBe(false);
    expect(isQuietWindow({widthPct:10,rangeRatio:0.5,atrRatio:1,volumeRatio:0.4})).toBe(false);
    expect(isQuietWindow({widthPct:10,rangeRatio:0.5,atrRatio:0.5,volumeRatio:0.71})).toBe(false);
  });
  it('measures shrinking daily range and ATR against the prior window',()=>{
    const bars=series(42,i=>{
      const current=i>=21;
      return current?{h:103,l:101,c:102,o:102,v:i>=35?40:100}:{h:110,l:90,c:100,o:100,v:100};
    });
    const flag=scoreCompression(bars,now),day=w(flag,21);
    expect(day.rangeRatio).toBeCloseTo(0.1,6);
    expect(day.atrRatio).toBeCloseTo((3+2*20)/21/20,6);
    expect(day.rangeRatio).not.toBeCloseTo(day.atrRatio!,6);
    expect(day.widthPct).toBeCloseTo((103/101-1)*100,6);
    expect(day.volumeRatio).toBeCloseTo(0.4,6);
    expect(day.score).toBe(compressionPoints({widthPct:day.widthPct!,rangeRatio:day.rangeRatio!,atrRatio:day.atrRatio!,volumeRatio:day.volumeRatio!,days:21}));
    expect(day.status).toBe('quiet');
    expect(flag.strong).toBe(true);
    expect(flag.window).toBe(21);
  });
  it('uses the base scan 7-versus-14 volume split for 21 days and still scores a coin that fails that scan',()=>{
    const quiet=compressed(21);
    const assessed=assessDailyBase(stub,quiet.slice(-24),now);
    expect(assessed.stage).toBe('BASE');
    expect(w(scoreCompression(quiet,now),21).volumeRatio).toBeCloseTo(assessed.contraction!,8);
    expect(w(scoreCompression(quiet,now),21).widthPct).toBeCloseTo(assessed.widthPct!,8);
    expect(windowVolumeRatio(quiet.slice(-21))).toBeCloseTo(assessed.contraction!,8);
    const flat=series(42,i=>i>=21?{h:102,l:98,v:100}:{h:110,l:90,v:100});
    expect(assessDailyBase(stub,flat.slice(-24),now).stage).toBe('NOT_BASE');
    const failed=scoreCompression(flat,now);
    expect(failed.score).not.toBeNull();
    expect(failed.status).toBe('not quiet');
    expect(w(failed,21).volumeRatio).toBeCloseTo(1,8);
  });
  it('flags the longest quiet window and leaves longer windows unscored without the candles',()=>{
    const d21=scoreCompression(compressed(21),now);
    expect(d21.window).toBe(21);
    expect(w(d21,21).status).toBe('quiet');
    expect(w(d21,45).status).toBe('not enough data');
    expect(w(d21,90).status).toBe('not enough data');
    const d45=scoreCompression(compressed(45),now);
    expect(d45.window).toBe(45);
    expect(w(d45,45).status).toBe('quiet');
    expect(w(d45,21).status).toBe('not quiet');
    expect(w(d45,90).status).toBe('not enough data');
    const d90=scoreCompression(compressed(90),now);
    expect(d90.window).toBe(90);
    expect(w(d90,90).status).toBe('quiet');
    expect(w(d90,45).status).toBe('not quiet');
    expect(w(d90,21).status).toBe('not quiet');
    const body=compressed(45);
    const padded=[...series(10,()=>({h:120,l:80,v:300})).map((b,i)=>({...b,t:body[0].t-(10-i)*D})),...body];
    const mid=scoreCompression(padded,now);
    expect(mid.availableDays).toBe(100);
    expect(mid.window).toBe(45);
    expect(w(mid,90).status).toBe('not enough data');
  });
  it('treats zero volume, gaps, stale bars and short history as not enough data',()=>{
    expect(scoreCompression(compressed(21).map(b=>({...b,v:0})),now)).toMatchObject({status:'not enough data',score:null});
    expect(scoreCompression(series(10),now).status).toBe('not enough data');
    expect(scoreCompression([],now).status).toBe('not enough data');
    expect(scoreCompression(compressed(21),end+3*D).status).toBe('not enough data');
    const wild=series(10,()=>({h:500,l:100,v:100}));
    const suffix=compressed(21);
    const gapped=[...wild.map((b,i)=>({...b,t:suffix[0].t-(wild.length-i)*D})),...suffix.slice(1)];
    const gap=scoreCompression(gapped,now);
    expect(gap.availableDays).toBe(41);
    expect(gap.status).toBe('not enough data');
    expect(gap.windows.every(x=>x.score==null)).toBe(true);
    const kept=[...wild.map((b,i)=>({...b,t:suffix[0].t-(wild.length-i+1)*D})),...suffix];
    const after=scoreCompression(kept,now);
    expect(after.availableDays).toBe(42);
    expect(w(after,21).widthPct).toBeCloseTo(w(scoreCompression(suffix,now),21).widthPct!,6);
    expect(w(after,21).widthPct!).toBeLessThan(20);
  });
  it('ranks by compression score, with longer windows breaking ties and missing data last',()=>{
    const rows:CompressionRow[]=[
      {...scoreCompression([],now),id:'c',symbol:'C',exchange:null,product:null},
      {...scoreCompression([],now),id:'b',symbol:'B',exchange:null,product:'B-USD',score:40,window:90,status:'quiet',strong:false},
      {...scoreCompression([],now),id:'d',symbol:'D',exchange:null,product:'D-USD',score:70,window:21,status:'quiet',strong:true},
      {...scoreCompression([],now),id:'a',symbol:'A',exchange:null,product:'A-USD',score:70,window:21,status:'quiet',strong:true},
      {...scoreCompression([],now),id:'l',symbol:'L',exchange:null,product:'L-USD',score:50,window:90,status:'quiet',strong:false},
      {...scoreCompression([],now),id:'s',symbol:'S',exchange:null,product:'S-USD',score:50,window:21,status:'quiet',strong:false},
    ];
    expect(sortCompressionRows(rows).map(r=>r.id)).toEqual(['a','d','l','s','b','c']);
    expect(sortCompressionRows(rows,false).map(r=>r.id)).toEqual(['b','l','s','a','d','c']);
    const fromBars=sortCompressionRows([
      {id:'short',symbol:'SHORT',...scoreCompression(series(5),now),exchange:null,product:'SHORT-USD'},
      {id:'flat',symbol:'FLAT',...scoreCompression(series(42,i=>i>=21?{h:102,l:98,v:100}:{h:110,l:90,v:100}),now),exchange:'gdax',product:'FLAT-USD'},
      {id:'quiet',symbol:'QUIET',...scoreCompression(compressed(21),now),exchange:'gdax',product:'QUIET-USD'},
    ]);
    expect(fromBars.at(-1)!.id).toBe('short');
    expect(fromBars[0].score!).toBeGreaterThanOrEqual(fromBars[1].score!);
    expect(fromBars[0].status).not.toBe('not enough data');
    const board=compressionBoard([
      {id:'peg',symbol:'USD1',product:null,stage:'EXCLUDED'},
      {id:'wait',symbol:'WAIT',product:'WAIT-USD',exchange:'gdax',stage:'PENDING'},
      {id:'fail',symbol:'FAIL',product:'FAIL-USD',exchange:'gdax',stage:'NOT_BASE',compression:scoreCompression(series(42,i=>i>=21?{v:100}:{h:110,l:90,v:100}),now)},
      {id:'base',symbol:'BASE',product:'BASE-USD',exchange:'gdax',stage:'BASE',compression:scoreCompression(compressed(90),now)},
    ]);
    expect(board.map(r=>r.id)).toEqual(['base','fail','peg','wait']);
    expect(board.find(r=>r.id==='fail')!.score).not.toBeNull();
    expect(board.find(r=>r.id==='peg')!.status).toBe('not enough data');
    expect(board.find(r=>r.id==='peg')!.reason).toMatch(/pair/i);
    expect(board.find(r=>r.id==='wait')!.reason).toMatch(/Waiting/);
  });
});
describe('compression candle fetch',()=>{
  const pair=(exchange:DailyPair['exchange']):DailyPair=>({exchange,product:exchange==='gdax'?'QNT-USD':'QNT-USDT',quote:exchange==='gdax'?'USD':'USDT',volumeUnit:'QNT'});
  it('keeps the 30-day request unless a longer single call is asked for, and refuses spans past the venue cap',()=>{
    expect(dailyVenueUrl(pair('binance'),end)).toContain('limit=30');
    expect(dailyVenueUrl(pair('okex'),end)).toContain('limit=30');
    expect(compressionFetchDays('gdax')).toBe(180);
    expect(compressionFetchDays('binance')).toBe(180);
    expect(compressionFetchDays('kucoin')).toBe(180);
    expect(compressionFetchDays('okex')).toBe(100);
    expect(dailyCandleCap('gdax')).toBe(300);
    expect(dailyCandleCap('okex')).toBe(100);
    expect(new URL(dailyVenueUrl(pair('gdax'),end,180)).searchParams.get('start')).toBe(new Date(end-180*D).toISOString());
    expect(dailyVenueUrl(pair('okex'),end,100)).toContain('limit=100');
    expect(()=>dailyVenueUrl(pair('okex'),end,180)).toThrow();
    expect(()=>dailyVenueUrl(pair('gdax'),end,301)).toThrow();
  });
  function binance(n:number,shape:(i:number)=>Partial<ExchangeBar>,drop=new Set<number>(),bad=new Set<number>()){
    const rows=[];
    for(let i=0;i<n;i++){
      if(drop.has(i))continue;
      const open=end-(n-i)*D,s=shape(i);
      const o=s.o??100,h=bad.has(i)?1:(s.h??102),l=s.l??98,c=s.c??100,v=s.v??100;
      rows.push([open,String(o),String(h),String(l),String(c),String(v),open+D-1,'0',0,'0','0','0']);
    }
    return rows;
  }
  const baseShape=(n:number)=>(i:number):Partial<ExchangeBar>=>{
    const local=i-(n-30);
    if(local<0)return {h:120,l:80,v:200};
    return {h:102,l:98,v:local>=23?50:100};
  };
  it('scores from one longer response and still judges the 21-day base on the original 30 days',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>binance(180,baseShape(180))});
    vi.stubGlobal('fetch',fetch);
    const row={...stub,id:'quant-network',symbol:'QNT',product:'QNT-USDT',exchange:'binance' as const,quote:'USDT',volumeUnit:'QNT'};
    const got=await fetchDailyBase(row,now);
    expect(fetch).toHaveBeenCalledTimes(1);
    const url=String(fetch.mock.calls[0][0]);
    expect(url).toContain('limit=180');
    expect(url).toContain(`startTime=${end-180*D}`);
    expect(got.stage).toBe('BASE');
    expect(got.compression.availableDays).toBe(180);
    expect(got.compression.windows.find(x=>x.days===90)!.status).not.toBe('not enough data');
    expect(w(got.compression,21).volumeRatio).toBeCloseTo(got.contraction!,8);
    fetch.mockResolvedValueOnce({ok:true,json:async()=>binance(180,()=>({h:102,l:98,v:100}))});
    const notBase=await fetchDailyBase(row,now);
    expect(notBase.stage).toBe('NOT_BASE');
    expect(notBase.compression.score).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not let an older gap or a bad older candle change the base, and does not invent the missing day',async()=>{
    const fetch=vi.fn();
    vi.stubGlobal('fetch',fetch);
    const row={...stub,product:'QNT-USDT',exchange:'binance' as const,quote:'USDT',volumeUnit:'QNT'};
    fetch.mockResolvedValueOnce({ok:true,json:async()=>binance(180,baseShape(180),new Set([80]))});
    const gapped=await fetchDailyBase(row,now);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(gapped.stage).toBe('BASE');
    expect(gapped.compression.availableDays).toBe(99);
    expect(w(gapped.compression,90).status).toBe('not enough data');
    expect(w(gapped.compression,21).status).not.toBe('not enough data');
    fetch.mockResolvedValueOnce({ok:true,json:async()=>binance(180,baseShape(180),new Set(),new Set([80]))});
    const bad=await fetchDailyBase(row,now);
    expect(bad.stage).toBe('BASE');
    expect(bad.compression.status).toBe('not enough data');
    fetch.mockResolvedValueOnce({ok:true,json:async()=>binance(180,baseShape(180),new Set([170]))});
    const recentGap=await fetchDailyBase(row,now);
    expect(recentGap.stage).toBe('UNAVAILABLE');
    expect(recentGap.compression.status).toBe('not enough data');
    fetch.mockResolvedValueOnce({ok:false,json:async()=>({})});
    await expect(fetchDailyBase(row,now)).rejects.toThrow();
  });
  it('asks OKX for 100 rows in one call and leaves the 90-day window unscored',async()=>{
    const n=100,rows=[];
    for(let i=0;i<n;i++){
      const open=end-(n-i)*D,local=i-(n-30),h=local<0?120:102,l=local<0?80:98,v=local>=23?50:100;
      rows.push([String(open),String(100),String(h),String(l),String(100),String(v),'0','0','1']);
    }
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({code:'0',data:rows})});
    vi.stubGlobal('fetch',fetch);
    const got=await fetchDailyBase({...stub,product:'QNT-USDT',exchange:'okex',quote:'USDT',volumeUnit:'QNT'},now);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('limit=100');
    expect(got.stage).toBe('BASE');
    expect(got.compression.fetchedDays).toBe(100);
    expect(w(got.compression,90).status).toBe('not enough data');
    expect(w(got.compression,45).status).not.toBe('not enough data');
    expect(got.compression.fetchedDays).toBe(100);
  });
});
