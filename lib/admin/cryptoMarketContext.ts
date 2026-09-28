export type MarketContext={fetchedAt:string;requestAttempts:number;failures:string[];news:{title:string;url:string;source:string;postedAt:string}[];trending:{id:string;name:string;symbol:string}[];global:null|{btcDominance:number|null;capChange24h:number|null;updatedAt:string|null}};
const record=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'?v as Record<string,unknown>:{};
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function normalizeMarketContext(results:PromiseSettledResult<unknown>[],now=Date.now()):MarketContext {
  const out:MarketContext={fetchedAt:new Date(now).toISOString(),requestAttempts:3,failures:[],news:[],trending:[],global:null};
  const parts=['news','trending','global'];
  results.forEach((r,i)=>{
    if(r.status==='rejected'){out.failures.push(parts[i]);return;}
    const data=record(r.value);
    if(i===0){
      if(!Array.isArray(r.value)){out.failures.push('news');return;}
      for(const raw of r.value.slice(0,10)){
        const n=record(raw);let url:URL;try{url=new URL(String(n.url));if(url.protocol!=='https:'||url.username||url.password)continue;}catch{continue;}
        const t=Date.parse(String(n.posted_at));if(typeof n.title!=='string'||!Number.isFinite(t)||t>now)continue;
        out.news.push({title:n.title.slice(0,300),url:url.href,source:typeof n.source_name==='string'?n.source_name:'Unknown source',postedAt:new Date(t).toISOString()});
      }
    }else if(i===1){
      if(!Array.isArray(data.coins)){out.failures.push('trending');return;}
      out.trending=data.coins.slice(0,15).flatMap(raw=>{const c=record(record(raw).item);return typeof c.id==='string'&&typeof c.name==='string'&&typeof c.symbol==='string'?[{id:c.id,name:c.name,symbol:c.symbol}]:[];});
    }else{
      const g=record(data.data),btc=number(record(g.market_cap_percentage).btc),change=number(g.market_cap_change_percentage_24h_usd),time=number(g.updated_at);
      if(btc===null&&change===null){out.failures.push('global');return;}
      out.global={btcDominance:btc!==null&&btc>=0&&btc<=100?btc:null,capChange24h:change,updatedAt:time!==null&&time>0&&time*1000<=now?new Date(time*1000).toISOString():null};
    }
  });return out;
}
