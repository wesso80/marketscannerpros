import {describe,it,expect} from 'vitest';
import {publicLeaks,assertPublicSpecialist,assertPrivatePublicResponse,checkWarmCacheSequence,PRIVATE_MARKER} from './support/specialistPublicContract';
import {specialistBoundaryProbes} from './fixtures/specialistBoundaryProbes';
import {buildPayload} from '@/lib/goldenEgg/engine';
import {toPublicSymbolPacket} from '@/lib/research/publicSymbolPacket';
import {now,price,ind} from './fixtures/goldenEggTiming';
describe('reusable specialist boundary probes (not specialist route acceptance)',()=>{
 it.each(Object.keys(specialistBoundaryProbes()))('detects internal %s fields recursively',kind=>{
  const probe=specialistBoundaryProbes()[kind as keyof ReturnType<typeof specialistBoundaryProbes>];
  expect(publicLeaks({data:probe,cached:true}).length).toBeGreaterThan(0);
  expect(()=>assertPublicSpecialist({data:probe})).toThrow('Public specialist leaks');
 });
 it('finds renamed private values in envelope arrays and leaves null/zero trust data alone',()=>{
  expect(publicLeaks({warnings:[{text:PRIVATE_MARKER}]})).toEqual(['$.warnings[0].text:private-value']);
  expect(publicLeaks({metrics:[{value:0,source:'fixture',asOf:null,reason:'No date'},{value:null,reason:'Missing'}]})).toEqual([]);
 });
 it('checks full response and private cache directives',async()=>{
  for(const header of ['', 'private,max-age=300','public,no-store'])await expect(assertPrivatePublicResponse(Response.json({value:0},{headers:{'Cache-Control':header}}))).rejects.toThrow('private, no-store');
  await expect(assertPrivatePublicResponse(Response.json({data:{value:0},debug:{score:99}},{headers:{'Cache-Control':'private, no-store'}}))).rejects.toThrow('$.debug.score');
 });
 it('detects a public response contaminated by an earlier admin cache read',async()=>{
  const order:string[]=[];
  await expect(checkWarmCacheSequence(async audience=>{
   order.push(audience);return Response.json(audience==='admin'?{score:99}:{data:{value:0},metadata:[{text:PRIVATE_MARKER}]},{headers:{'Cache-Control':'private, no-store'}});
  })).rejects.toThrow('private-value');expect(order).toEqual(['admin','pro']);
 });
 it('runs the complete audience sequence when responses are clean',async()=>{
  const order:string[]=[];
  await checkWarmCacheSequence(async audience=>{order.push(audience);return Response.json(audience==='admin'?{score:99}:{value:0,missing:null},{headers:{'Cache-Control':'private, no-store'}});});
  expect(order).toEqual(['admin','pro','free-a','free-b','pro','free-a']);
 });
 it('checks the real Symbol projector and preserves its internal input',()=>{
  const packet=buildPayload('AAPL','equity',price,ind,null,null,'1D',null,null,null,{nowMs:now});
  Object.assign(packet,{privateNewField:{text:PRIVATE_MARKER},budget:{appToday:42}});
  const before=JSON.stringify(packet);
  const projected=toPublicSymbolPacket(packet);
  expect(publicLeaks({success:true,data:projected})).toEqual([]);
  expect(projected.meta.symbol).toBe('AAPL');expect(JSON.stringify(packet)).toBe(before);
 });
});
