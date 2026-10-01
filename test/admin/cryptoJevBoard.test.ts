import {expect,it} from 'vitest';
import {buildJevBoard} from '@/lib/admin/cryptoJevBoard';
import type {MomentumScan,MomentumScanRow} from '@/lib/admin/cryptoVolumeMomentum';
import type {ForwardBook} from '@/lib/admin/cryptoForwardScore';
import type {CalibrationLedger} from '@/lib/admin/cryptoCalibration';
const jev=(status:'scored'|'unavailable',extra:Record<string,unknown>={})=>({rule:'jev-shadow-v2',status,chase:status==='scored'?0.72:null,flowAgrees:status==='scored'?0.2:null,btcHeadwind:status==='scored'?0.61:null,btcTrend:'UP',flowStamp:'aggressive buying',model:status==='scored'?'typesafe-ai/jev':null,checkedAt:'2026-10-02T00:00:00Z',...extra});
const scan=(rows:Partial<MomentumScanRow>[]):MomentumScan=>({version:1,startedAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T01:00:00Z',discoveryAt:'2026-10-02T00:00:00Z',rows:rows.map((row,i)=>({stage:'PENDING',reason:'',asOf:null,relativeVolume:null,changePct:null,trigger:null,close:null,atr:null,kind:null,id:`c${i}`,symbol:`C${i}`,pair:null,...row})) as MomentumScanRow[]});
it('keeps named setups, drops pending rows, and puts an unavailable stamp ahead of a scored one',()=>{
 const board=buildJevBoard({four:scan([{symbol:'AAA',stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',asOf:'2026-10-02T00:00:00Z',jev:jev('scored') as never},{symbol:'ZZZ',stage:'PENDING'},{symbol:'BBB',stage:'VOLUME_WATCH',asOf:'2026-10-02T00:00:00Z',jev:jev('unavailable',{reason:'parse'}) as never}]),early:null,book:null,ledger:null});
 expect(board.rows.map(r=>r.symbol)).toEqual(['BBB','AAA']);
 expect(board.rows[0].jev.reason).toBe('parse');
 expect(board.coverage.jev).toMatchObject({scored:1,unavailable:1,unstamped:0});
 expect(board.rows[1].chart.status).toBe('unstamped');
});
it('keeps a forward row only when a stamp was saved',()=>{
 const book:ForwardBook={version:1,updatedAt:'2026-10-02T02:00:00Z',rows:[
  {id:'sol',symbol:'SOL',bucket:'VOLUME_WATCH',signalAt:'2026-10-01T00:00:00Z',signalPrice:1,next4h:{status:'waiting'},day:{status:'waiting'},jev:jev('scored') as never},
  {id:'blank',symbol:'BLANK',bucket:'EXTENDED',signalAt:'2026-10-01T04:00:00Z',signalPrice:1,next4h:{status:'waiting'},day:{status:'waiting'}},
 ]};
 const board=buildJevBoard({four:null,early:null,book,ledger:null});
 expect(board.rows.map(r=>r.symbol)).toEqual(['SOL']);
 expect(board.rows[0].source).toBe('forward');
 expect(board.coverage.jev.scored).toBe(0);
});
it('lists ledger lines for Jev reads and keeps chase and volume expansion informational',()=>{
 const side=(status:string,informational:boolean)=>({side:'yes',n:40,mean:1,lift:0.4,se:0.1,halfA:{n:20,lift:0.4},halfB:{n:20,lift:0.4},status,informational});
 const field=(id:string,label:string,informational:boolean)=>({id,label,file:'x',ruleVersion:'v',outcome:'backtestR' as const,unit:'R' as const,observations:40,sides:[side(informational?'collecting':'directional',informational)]});
 const ledger={version:1,checkedAt:'2026-10-02T03:00:00Z',source:{closedTrades:0,withR:0,forwardRows:0,forwardFilled24h:0,splitAt:{paper:null,forward:null}},fields:[field('chart.volumeExpansion','Chart volume expansion at 0.50 · implied by the 1.5× volume rule, not graded',true),field('jev.chase','Jev chase at 0.50 · implied by the entry chase cap, not graded',true),field('signal.kind','Setup kind',false),field('chart.cleanBase','Chart clean base at 0.50',false)],note:''} as CalibrationLedger;
 const lines=buildJevBoard({four:null,early:null,book:null,ledger}).ledger;
 expect(lines.map(l=>l.field)).toEqual(['chart.cleanBase','chart.volumeExpansion','jev.chase']);
 expect(lines.find(l=>l.field==='chart.volumeExpansion')).toMatchObject({informational:true,status:'collecting'});
 expect(lines.find(l=>l.field==='jev.chase')?.informational).toBe(true);
 expect(lines.find(l=>l.field==='chart.cleanBase')?.status).toBe('directional');
});
