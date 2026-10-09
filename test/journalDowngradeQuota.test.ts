import {expect,it} from 'vitest';
import {assertJournalReplacementQuota} from '@/lib/free/journalQuota';
const existing=Array.from({length:8},(_,i)=>({id:i+1,is_open:true}));
const incoming=existing.map(e=>({id:e.id,isOpen:true}));
it('allows existing above-limit entries to remain or close',()=>{
 expect(()=>assertJournalReplacementQuota(incoming,existing)).not.toThrow();
 expect(()=>assertJournalReplacementQuota(incoming.map((e,i)=>({...e,isOpen:i<6})),existing)).not.toThrow();
});
it('refuses new, foreign, duplicate or reopened entries above the cap',()=>{
 for(const id of [undefined,99,1,'not-an-id']) {
  expect(()=>assertJournalReplacementQuota([...incoming.slice(0,6),{id,isOpen:true}],existing)).toThrow();
 }
 expect(()=>assertJournalReplacementQuota(incoming,existing.map(e=>({...e,is_open:e.id!==8})))).toThrow();
});
it('allows new entries within five and does not count closed history',()=>{
 expect(()=>assertJournalReplacementQuota([{id:99,isOpen:true},...incoming.map(e=>({...e,isOpen:false}))],existing)).not.toThrow();
});
