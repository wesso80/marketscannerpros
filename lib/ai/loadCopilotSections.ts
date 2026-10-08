export type CopilotSectionLoad = { tokens:Record<string,string>; unavailable:string[] };
/** Measurement endpoints only; never call the state-writing options-scan route. */
export async function loadCopilotSections(symbol:string,asset:'equity'|'crypto',signal:AbortSignal,fetcher:typeof fetch=fetch,selection:{timeframe?:string;expiry?:string|null}={}):Promise<CopilotSectionLoad>{
 const q=new URLSearchParams({symbol,type:asset});
 const requests:[string,string][]=[['chart',`/api/symbol-comparison?${q}&days=90`],['news',`/api/research/news?${q}`],
  asset==='equity'?['ownership',`/api/ownership?${new URLSearchParams({symbol})}`]:['crypto',`/api/crypto/breakdown?${new URLSearchParams({symbol})}`]];
 const selectionQuery=new URLSearchParams({symbol,type:asset,timeframe:selection.timeframe??'daily'});if(selection.expiry)selectionQuery.set('expiry',selection.expiry);
 requests.push(['dve',`/api/dve?${selectionQuery}`]);
 if(asset==='equity')requests.push(['options',`/api/research/options?${selectionQuery}`]);
 const results=await Promise.allSettled(requests.map(async([section,url])=>{
  const response=await fetcher(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)]),cache:'no-store'});if(!response.ok)throw Error(section);
  const data=await response.json();if(typeof data.copilotEvidenceToken!=='string'||!data.copilotEvidenceToken)throw Error(section);
  return {section,token:data.copilotEvidenceToken};
 }));
 const tokens:Record<string,string>={},unavailable:string[]=[];
 results.forEach((result,index)=>{if(result.status==='fulfilled')tokens[result.value.section]=result.value.token;else unavailable.push(requests[index][0]);});
 return {tokens,unavailable};
}
