import {readFileSync} from 'fs';
import {it,expect} from 'vitest';
import {createRecommendation,markRecommendation,type Recommendation} from '../../lib/admin/cryptoRecommendations';
const now=Date.parse('2026-10-01T00:00:00Z');
const draft={setup:'MOMENTUM_VOLUME',evidenceCount:'2',proposedRuleChange:'Keep the stop under the signal low.',file:'lib/admin/cryptoVolumeMomentum.ts'};
const files=['lib/admin/cryptoVolumeMomentum.ts','lib/admin/cryptoPaper.ts'];
it('keeps a recommendation unread, then read, without changing the rule files',()=>{
 const before=files.map(file=>readFileSync(file,'utf8'));
 const unread=createRecommendation([],draft,now);
 expect(unread).toHaveLength(1);
 expect(unread[0]).toMatchObject({...draft,status:'unread'});
 const read=markRecommendation(unread,unread[0].id,'read',now+1);
 expect(read[0].status).toBe('read');
 expect(read[0]).toMatchObject(draft);
 const accepted=markRecommendation(read,read[0].id,'accepted',now+2);
 expect(accepted[0]).toMatchObject({...draft,status:'accepted'});
 expect(JSON.stringify(accepted[0])).not.toMatch(/patch|diff|applied/);
 expect(files.map(file=>readFileSync(file,'utf8'))).toEqual(before);
});
it('refuses a code change and refuses any status other than read or accepted',()=>{
 expect(()=>createRecommendation([],{...draft,patch:'rewrite the playbook'},now)).toThrow(/cannot carry a code change/);
 expect(()=>createRecommendation([],{...draft,evidenceCount:{n:2}},now)).toThrow(/must be text/);
 expect(()=>markRecommendation([{...draft,id:'rec',status:'unread',createdAt:'',updatedAt:''} as Recommendation],'rec','applied',now)).toThrow(/Status must be read or accepted/);
});
it('no scheduled job applies a recommendation or a playbook change',()=>{
 const job=readFileSync('lib/admin/cryptoAutomation.ts','utf8');
 const list=readFileSync('lib/admin/cryptoRecommendations.ts','utf8');
 expect(job).not.toMatch(/cryptoRecommendations|applyRecommendation|playbook/);
 expect(list).not.toMatch(/writeFile|readFile|cryptoPaper|cryptoVolumeMomentum/);
});
