import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareOi,observedInteger,inAcceptanceWindow,liveQuoteBasisAccepted} from '@/scripts/options-validation/evidence';
const fixture=JSON.parse(readFileSync('scripts/options-validation/fixture.json','utf8'));
const rows=fixture.responses['AAPL:REALTIME_OPTIONS'].data.filter((r:any)=>r.expiration==='2026-10-09');
const compare=(r=rows,ref=fixture.exchange)=>compareOi(r,'2026-10-09',ref,'2026-10-05',fixture.now);
describe('Options live evidence checks (no network)',()=>{
 it('preserves a real zero but rejects absent or malformed OI',()=>{
  expect(observedInteger('0')).toBe(0);for(const v of [null,undefined,'',false,'None',-1,1.5])expect(observedInteger(v)).toBeNull();
 });
 it('compares only the requested same-expiry 330C and 325P values',()=>{
  expect(compare().every(c=>c.pass)).toBe(true);
  const changed=structuredClone(fixture.exchange);changed.contracts[0].expiry='2026-10-16';
  expect(compare(rows,changed).find(c=>c.id==='AAPL_330C_EXCHANGE_COMPARISON')?.pass).toBe(false);
 });
 it('reports a roughly 9x discrepancy as FAIL, not fixed',()=>{
  const changed=structuredClone(rows);changed.find((r:any)=>r.strike==='330'&&r.type==='call').open_interest='90';
  const result=compare(changed).find(c=>c.id==='AAPL_330C_EXCHANGE_COMPARISON')!;
  expect(result.pass).toBe(false);expect((result.evidence as any).ratio).toBe(9);
 });
 it('does not turn missing or duplicated provider contracts into successful zero OI',()=>{
  expect(compare(rows.filter((r:any)=>!(r.strike==='330'&&r.type==='call'))).find(c=>c.id==='AAPL_330C_PROVIDER_VALUE')?.pass).toBe(false);
  const row=rows.find((r:any)=>r.strike==='330'&&r.type==='call');
  expect(compare([...rows,row]).find(c=>c.id==='AAPL_330C_PROVIDER_VALUE')?.pass).toBe(false);
 });
 it('requires independent reference evidence, matching date basis, and a valid observation time',()=>{
  for(const edit of [(r:any)=>r.contracts[0].oiAsOfDate='2026-10-02',(r:any)=>r.observedAt=null,(r:any)=>r.observedAt='2026-10-06T00:00:00Z',(r:any)=>r.source='REPLACE with evidence']){
   const ref=structuredClone(fixture.exchange);edit(ref);
   expect(compare(rows,ref).find(c=>c.id==='AAPL_330C_EXCHANGE_COMPARISON')?.pass).toBe(false);
  }
  expect(compare(rows,null).filter(c=>c.id.includes('EXCHANGE')).every(c=>!c.pass)).toBe(true);
 });
 it('accepts an FMV chain dated today, including marks-only, and rejects the historical fallback',()=>{
  expect(liveQuoteBasisAccepted({provider:'REALTIME_OPTIONS_FMV',quoteBasis:'marks_only',asOfDate:'2026-10-05'},'2026-10-05')).toBe(true);
  expect(liveQuoteBasisAccepted({provider:'REALTIME_OPTIONS_FMV',quoteBasis:'realtime',asOfDate:'2026-10-05'},'2026-10-05')).toBe(true);
  expect(liveQuoteBasisAccepted({provider:'REALTIME_OPTIONS',quoteBasis:'realtime',asOfDate:'2026-10-05'},'2026-10-05')).toBe(true);
  expect(liveQuoteBasisAccepted({provider:'REALTIME_OPTIONS_FMV',quoteBasis:'marks_only',asOfDate:'2026-10-02'},'2026-10-05')).toBe(false);
  expect(liveQuoteBasisAccepted({provider:'HISTORICAL_OPTIONS',quoteBasis:'previous_session',asOfDate:'2026-10-05'},'2026-10-05')).toBe(false);
  expect(liveQuoteBasisAccepted({provider:'HISTORICAL_OPTIONS',quoteBasis:'marks_only',asOfDate:'2026-10-02'},'2026-10-05')).toBe(false);
  expect(liveQuoteBasisAccepted(null,'2026-10-05')).toBe(false);
 });
 it('uses the exact scheduled AEDT/UTC window',()=>{
  expect(inAcceptanceWindow('2026-10-06T00:30:00+11:00')).toBe(true);
  expect(inAcceptanceWindow('2026-10-06T02:00:00+11:00')).toBe(true);
  expect(inAcceptanceWindow('2026-10-06T00:29:59+11:00')).toBe(false);
  expect(inAcceptanceWindow('2026-10-06T02:00:01+11:00')).toBe(false);
 });
 it('help and missing live credentials never start a capture',()=>{
  const help=spawnSync(process.execPath,['scripts/options-live-validation.mjs','--help'],{encoding:'utf8'});
  expect(help.status).toBe(0);expect(help.stdout).toContain('No provider request');
  const env={...process.env};delete env.ALPHA_VANTAGE_API_KEY;
  const fail=spawnSync(process.execPath,['scripts/options-live-validation.mjs','--live'],{encoding:'utf8',env});
  expect(fail.status).toBe(2);expect(fail.stderr).toContain('no requests made');
 });
 it('explicit fixture run exercises existing helpers and writes auditable no-network evidence',()=>{
  const temp=mkdtempSync(join(tmpdir(),'options-validation-'));
  try{
   const result=spawnSync(process.execPath,['scripts/options-live-validation.mjs','--fixture','scripts/options-validation/fixture.json','--out',join(temp,'capture')],{encoding:'utf8',timeout:30000});
   const report=JSON.parse(readFileSync(join(temp,'capture/report.json'),'utf8'));
   expect(result.status,result.stdout+result.stderr).toBe(0);
   expect(report.liveAcceptance).toBe(false);expect(report.discrepancyFixedClaim).toBe(false);
   expect(report.checks.every((c:any)=>c.pass)).toBe(true);
   const boundary=report.checks.find((c:any)=>c.id==='READ_ONLY_BOUNDARY').evidence;
   expect(boundary.networkRequests).toBe(0);expect(boundary.databaseAttempts).toBe(0);expect(boundary.recorderAttempts).toBe(0);
   const missing=JSON.parse(readFileSync(join(temp,'capture/missing-history.json'),'utf8'));
   expect(missing.controlled.atr).toBeNull();expect(missing.controlled.upsideLevels).toBeNull();expect(missing.controlled.downsideLevels).toBeNull();
   expect(missing.natural.symbolPayload).toEqual({atr:null,invalidation:null,scenarioInvalidation:null,reactionZones:[]});
   expect(report.providerOrder).toEqual(['REALTIME_OPTIONS_FMV','HISTORICAL_OPTIONS']);
   expect(report.requests.map((r:any)=>r.function)).toEqual(['REALTIME_OPTIONS_FMV','GLOBAL_QUOTE','TIME_SERIES_DAILY','GLOBAL_QUOTE','TIME_SERIES_DAILY']);
   expect(report.requests.every((r:any)=>!String(r.url).includes('function=REALTIME_OPTIONS&'))).toBe(true);
   const basis=report.checks.find((c:any)=>c.id==='LIVE_QUOTE_BASIS');
   expect(basis.pass).toBe(true);
   expect(basis.evidence).toMatchObject({provider:'REALTIME_OPTIONS_FMV',quoteBasis:'marks_only',asOfDate:'2026-10-05'});
   expect(report.checks.find((c:any)=>c.id==='AAPL_330C_PROVIDER_VALUE').evidence.openInterest).toBe(10);
   expect(report.requests.every((r:any)=>r.startedAt&&r.finishedAt&&r.method==='GET')).toBe(true);
  }finally{rmSync(temp,{recursive:true,force:true});}
 },30000);
 it('CLI returns nonzero and preserves evidence for 9x fixture failure',()=>{
  const temp=mkdtempSync(join(tmpdir(),'options-validation-fail-'));
  try{
   const changed=structuredClone(fixture);changed.responses['AAPL:REALTIME_OPTIONS_FMV'].data.find((r:any)=>r.expiration==='2026-10-09'&&r.strike==='330'&&r.type==='call').open_interest='90';
   writeFileSync(join(temp,'fixture.json'),JSON.stringify(changed));
   const result=spawnSync(process.execPath,['scripts/options-live-validation.mjs','--fixture',join(temp,'fixture.json'),'--out',join(temp,'capture')],{encoding:'utf8',timeout:30000});
   expect(result.status).toBe(1);
   const report=JSON.parse(readFileSync(join(temp,'capture/report.json'),'utf8'));
   expect(report.checks.find((c:any)=>c.id==='AAPL_330C_EXCHANGE_COMPARISON').evidence.ratio).toBe(9);
   expect(report.liveAcceptance).toBe(false);
  }finally{rmSync(temp,{recursive:true,force:true});}
 },30000);
 it('not-entitled FMV falls back to historical and does not invent open interest',()=>{
  const temp=mkdtempSync(join(tmpdir(),'options-validation-fmv-fallback-'));
  try{
   const changed=structuredClone(fixture);
   changed.responses['AAPL:REALTIME_OPTIONS_FMV']={message:'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL AND FOR ILLUSTRATION PURPOSES ONLY***.',data:[{symbol:'XXYYZZ',contractID:'XXYYZZ999999C00020000',expiration:'2099-99-99',strike:'20',type:'call',open_interest:'999',date:'2099-99-99',bid:'1',ask:'1.1'}]};
   for(const row of changed.responses['AAPL:HISTORICAL_OPTIONS'].data){
    row.date='2026-10-02';
    if(row.expiration==='2026-10-09'&&row.strike==='330'&&row.type==='call')row.open_interest='4';
   }
   writeFileSync(join(temp,'fixture.json'),JSON.stringify(changed));
   const result=spawnSync(process.execPath,['scripts/options-live-validation.mjs','--fixture',join(temp,'fixture.json'),'--out',join(temp,'capture')],{encoding:'utf8',timeout:30000});
   expect(result.status).toBe(1);
   const report=JSON.parse(readFileSync(join(temp,'capture/report.json'),'utf8'));
   expect(report.requests.map((r:any)=>r.function).slice(0,2)).toEqual(['REALTIME_OPTIONS_FMV','HISTORICAL_OPTIONS']);
   expect(report.requests.length).toBeLessThanOrEqual(6);
   expect(report.requests.some((r:any)=>r.function==='REALTIME_OPTIONS')).toBe(false);
   const basis=report.checks.find((c:any)=>c.id==='LIVE_QUOTE_BASIS');
   expect(basis.pass).toBe(false);
   expect(basis.evidence).toMatchObject({provider:'HISTORICAL_OPTIONS',quoteBasis:'previous_session',asOfDate:'2026-10-02'});
   const oi=report.checks.find((c:any)=>c.id==='AAPL_330C_PROVIDER_VALUE').evidence;
   expect(oi.openInterest).toBe(4);
   expect(oi.rawOpenInterest).toBe('4');
   expect(report.checks.find((c:any)=>c.id==='AAPL_330C_EXCHANGE_COMPARISON').pass).toBe(false);
  }finally{rmSync(temp,{recursive:true,force:true});}
 },30000);
 it('a fair-value row with no open interest stays missing',()=>{
  const temp=mkdtempSync(join(tmpdir(),'options-validation-fmv-missing-oi-'));
  try{
   const changed=structuredClone(fixture);
   const row=changed.responses['AAPL:REALTIME_OPTIONS_FMV'].data.find((r:any)=>r.expiration==='2026-10-09'&&r.strike==='330'&&r.type==='call');
   delete row.open_interest;
   writeFileSync(join(temp,'fixture.json'),JSON.stringify(changed));
   const result=spawnSync(process.execPath,['scripts/options-live-validation.mjs','--fixture',join(temp,'fixture.json'),'--out',join(temp,'capture')],{encoding:'utf8',timeout:30000});
   expect(result.status).toBe(1);
   const report=JSON.parse(readFileSync(join(temp,'capture/report.json'),'utf8'));
   const oi=report.checks.find((c:any)=>c.id==='AAPL_330C_PROVIDER_VALUE');
   expect(oi.pass).toBe(false);
   expect(oi.evidence.openInterest).toBeNull();
   expect(oi.evidence.rawOpenInterest).toBeNull();
   expect(report.checks.find((c:any)=>c.id==='LIVE_QUOTE_BASIS').pass).toBe(true);
  }finally{rmSync(temp,{recursive:true,force:true});}
 },30000);
});
