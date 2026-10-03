import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {dedupeForwardByCoinDay,mergeForwardRows} from '@/lib/admin/cryptoForwardArchive';
import {forwardObservations} from '@/lib/admin/cryptoCalibration';
import type {ForwardRow} from '@/lib/admin/cryptoForwardScore';
const row=(over:Partial<ForwardRow>):ForwardRow=>({id:'bitcoin',symbol:'BTC',bucket:'VOLUME_WATCH',signalAt:'2026-10-01T01:00:00.000Z',signalPrice:1,next4h:{status:'waiting'},day:{status:'waiting'},...over});
const filled=(changePct:number)=>({status:'filled' as const,price:1,at:'2026-10-02T01:00:00.000Z',changePct});
it('keeps one forward row per coin per UTC day, preferring a filled 24h mark then the earlier signal',()=>{
 const early=row({signalAt:'2026-10-01T01:00:00.000Z',day:{status:'waiting'}});
 const later=row({signalAt:'2026-10-01T18:00:00.000Z',day:filled(4)});
 const nextDay=row({signalAt:'2026-10-02T01:00:00.000Z',day:filled(-2)});
 const other=row({id:'ethereum',symbol:'ETH',signalAt:'2026-10-01T05:00:00.000Z',day:filled(1)});
 const deduped=dedupeForwardByCoinDay([later,early,nextDay,other,row({signalAt:'not-a-date'})]);
 expect(deduped).toHaveLength(3);
 expect(deduped.find(r=>r.id==='bitcoin'&&r.signalAt.startsWith('2026-10-01'))?.day).toMatchObject({status:'filled',changePct:4});
 expect(deduped.filter(r=>r.id==='bitcoin').map(r=>r.signalAt.slice(0,10)).sort()).toEqual(['2026-10-01','2026-10-02']);
 expect(deduped.some(r=>r.id==='ethereum')).toBe(true);
 const bothWaiting=dedupeForwardByCoinDay([row({signalAt:'2026-10-03T09:00:00.000Z'}),row({signalAt:'2026-10-03T01:00:00.000Z'})]);
 expect(bothWaiting).toHaveLength(1);
 expect(bothWaiting[0].signalAt).toBe('2026-10-03T01:00:00.000Z');
});
it('ledger observations count the deduped filled rows, so two candles of one coin on one day are not two samples',()=>{
 const rows=[row({day:filled(3)}),row({signalAt:'2026-10-01T20:00:00.000Z',day:filled(9)}),row({id:'ethereum',symbol:'ETH',day:filled(1)})];
 expect(forwardObservations(rows)).toHaveLength(3);
 expect(forwardObservations(dedupeForwardByCoinDay(rows))).toHaveLength(2);
});
it('merges the archive with the live book without dropping a filled mark the cap would forget',()=>{
 const archived=row({day:filled(5),signalAt:'2026-09-01T00:00:00.000Z'});
 const liveNewer=row({day:filled(6)});
 const liveSame=row({signalAt:'2026-09-01T00:00:00.000Z',day:{status:'waiting'}});
 const merged=mergeForwardRows([archived],[liveNewer,liveSame]);
 expect(merged).toHaveLength(2);
 expect(merged.find(r=>r.signalAt.startsWith('2026-09-01'))?.day).toMatchObject({status:'filled',changePct:5});
 expect(merged.find(r=>r.signalAt.startsWith('2026-10-01'))?.day).toMatchObject({changePct:6});
});
it('the migration is additive, idempotent, and does not touch trading tables',()=>{
 const sql=readFileSync('migrations/112_crypto_forward_outcome_archive.sql','utf8');
 expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS crypto_forward_outcome_archive/);
 expect(sql).not.toMatch(/ALTER |DROP |arca_|crypto_paper|REFERENCES/i);
 const cal=readFileSync('lib/admin/cryptoCalibration.ts','utf8');
 expect(cal).toMatch(/dedupeForwardByCoinDay\(forwardRows\)/);
 expect(cal).toMatch(/loadArchivedForwardRows\(\)/);
 const book=readFileSync('lib/admin/cryptoForwardScore.ts','utf8');
 expect(book).toMatch(/slice\(0,1000\)/);
 expect(book).toMatch(/ex:21\*86400/);
 expect(book).toMatch(/archiveForwardRows/);
 expect(book).not.toMatch(/from '\.\/cryptoForwardArchive'/);
});
