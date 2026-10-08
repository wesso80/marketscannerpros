/** Test-only boundary probes. Not a production sanitizer or a complete public schema. */
export const PRIVATE_MARKER = 'PRIVATE_SPECIALIST_FIXTURE_7B9';
const forbidden = new Set([
 'score','scores','confidence','regimeConfidence','squeezeStrength','grade','verdict','assessment',
 'permission','playbook','doctrine','directionalVolatility','breakout','trap','exhaustion','transition',
 'continuationProbability','exitProbability','projectionQualityScore','ruleStop','budget',
 'breakdownToday','appToday','analystTarget','analystTargetPrice','analystRatings','analystCount',
 'sentimentScore','maxRelevance','workspaceId',
]);
export function publicLeaks(value: unknown): string[] {
 const leaks:string[]=[];
 const visit=(v:unknown,path:string)=>{
  if(typeof v==='string' && v.includes(PRIVATE_MARKER))leaks.push(path+':private-value');
  if(Array.isArray(v)){v.forEach((item,i)=>visit(item,`${path}[${i}]`));return;}
  if(v && typeof v==='object')for(const [key,item] of Object.entries(v)){
   const next=`${path}.${key}`;if(forbidden.has(key))leaks.push(next);visit(item,next);
  }
 };
 // Test exactly the JSON wire representation, including envelopes, arrays and cache metadata.
 visit(JSON.parse(JSON.stringify(value)),'$');return leaks;
}
export function assertPublicSpecialist(value:unknown):void {
 const leaks=publicLeaks(value);if(leaks.length)throw Error('Public specialist leaks: '+leaks.join(', '));
}
/** Call with the complete response, not only response.data. */
export async function assertPrivatePublicResponse(response:Response):Promise<unknown>{
 if(!response.ok)throw Error(`Expected available public fixture; HTTP ${response.status}`);
 const directives=(response.headers.get('cache-control')??'').toLowerCase().split(',').map(s=>s.trim());
 if(!directives.includes('private')||!directives.includes('no-store')||directives.includes('public'))throw Error('Expected private, no-store response');
 const body:unknown=await response.json();assertPublicSpecialist(body);return body;
}
export type Audience='free-a'|'free-b'|'pro'|'admin';
/** The caller owns auth/cache/provider mocks. This helper does not simulate or prove cache isolation itself. */
export async function checkWarmCacheSequence(request:(audience:Audience)=>Promise<Response>):Promise<void>{
 for(const audience of ['admin','pro','free-a','free-b','pro','free-a'] as const){
  const response=await request(audience);
  if(audience==='admin'){if(!response.ok)throw Error('Admin fixture unavailable');continue;}
  await assertPrivatePublicResponse(response);
 }
}
