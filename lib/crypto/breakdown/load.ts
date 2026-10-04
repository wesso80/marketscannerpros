import {buildTop} from './top';
import {COINGECKO_ID_MAP,resolveSymbolToId,searchCoins,getSimplePrices,getCoinDetail,getCoinTickers,getMarketChartHistory,getGlobalMarketCapChart,type CoinTicker} from '@/lib/coingecko';
import {fetchCryptoSeries} from '@/lib/scanner/cryptoBars';
import {getQuote} from '@/lib/yahoo-finance';
import {buildNetworkContext} from '@/lib/goldenEgg/networkContext';
import {baseBreakoutV1} from './baseBreakoutV1';
import {earlyContext} from './earlyContext';
import {regimeContext} from './regimeContext';
import {levels} from './levels';
import {normalizeCryptoSymbol,chartPoints,completedBars} from './symbol';
import {sourcesAgree,type SourcePrice} from './sourcesAgree';
import {cachedPart,dayTtl,timebox} from './cache';
import {budgetStatus} from './budget';
import {loadOkx,okxSpot,metric,section,iso} from './okx';
import type {Breakdown,Metric,Section,FreshnessKind,DailyBar,Point,SectionKey} from './types';
import {SECTION_KEYS} from './types';
interface Identity {id:string;matches:number|null;name:string|null;rank:number|null}
interface Chart {prices:[number,number][];market_caps?:[number,number][];total_volumes?:[number,number][]}
const errorText=(e:unknown)=>e instanceof Error?e.message:'Source unavailable';
const unavailable=(reason:string):Section=>({value:null,source:'unavailable',asOf:null,basis:'unavailable',status:'Unknown',reason});
export async function resolveIdentity(symbol:string,id?:string):Promise<Identity>{
 if(id)return {id,matches:null,name:null,rank:null};
 if(COINGECKO_ID_MAP[symbol])return {id:(await resolveSymbolToId(symbol))!,matches:null,name:null,rank:null};
 return cachedPart(`identity:${symbol}`,86400,4,async()=>{
  // The legacy resolver strips bare USD and would misresolve CRVUSD. Exact-symbol search here retains identity.
  const search=await searchCoins(symbol);if(!search)throw Error('CoinGecko identity search unavailable');
  const exact=search.coins.filter(c=>c.symbol.toUpperCase()===symbol).sort((a,b)=>(a.market_cap_rank||Infinity)-(b.market_cap_rank||Infinity));
  if(!exact.length)throw Error('No exact CoinGecko symbol found');
  return {id:exact[0].id,matches:exact.length,name:exact[0].name,rank:exact[0].market_cap_rank};
 });
}
const longHistory=(id:string,ttl:number)=>cachedPart<Chart>(`history:${id}`,ttl,1,async()=>{const r=await getMarketChartHistory(id,'max',{retries:0,timeoutMs:7000});if(!r)throw Error('Long history unavailable');return r;});
async function marketSet(now:number){
 const ttl=dayTtl(now);
 const [g,b,e]=await Promise.allSettled([
  cachedPart('global-history',ttl,4,()=>getGlobalMarketCapChart(365)),longHistory('bitcoin',ttl),longHistory('ethereum',ttl),
 ]);
 const global=g.status==='fulfilled'?chartPoints(g.value?.market_cap_chart.market_cap,now):[];
 const btc=b.status==='fulfilled'?b.value:null,eth=e.status==='fulfilled'?e.value:null;
 return {context:regimeContext(global,chartPoints(btc?.market_caps,now),chartPoints(eth?.market_caps,now),chartPoints(btc?.prices,now)),errors:[g,b,e].flatMap((r,i)=>r.status==='rejected'?[`${['Global','BTC','ETH'][i]}: ${errorText(r.reason)}`]:[])};
}
export async function loadBreakdown(input:string,id?:string,now=Date.now()):Promise<Breakdown>{
 const symbol=normalizeCryptoSymbol(input),generatedAt=new Date(now).toISOString();
 const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,unavailable('Source unavailable')])) as Record<SectionKey,Section>;
 let identity:Identity;
 try{identity=await resolveIdentity(symbol,id);}catch(e){sections.price=unavailable(errorText(e));return {symbol,coinId:null,name:null,rank:null,identityMatches:null,generatedAt,sections,budget:await budgetStatus()};}
 const coinId=identity.id,ttl=dayTtl(now);
 const results=await Promise.allSettled([
  cachedPart(`spot:${coinId}`,60,4,()=>getSimplePrices([coinId],{include_24h_change:true,include_24h_vol:true,noStore:true})),
  cachedPart(`daily:${coinId}`,ttl,3,()=>fetchCryptoSeries(symbol,'daily',now,{coinId,requestOptions:{retries:0,timeoutMs:7000}})),
  longHistory(coinId,ttl),cachedPart(`detail:${coinId}`,21600,4,()=>getCoinDetail(coinId)),
  cachedPart(`tickers:${coinId}`,600,4,()=>getCoinTickers(coinId,{page:1,depth:true})),
  marketSet(now),timebox(loadOkx(symbol,now)),okxSpot(symbol),
  cachedPart(`yahoo:${symbol}`,60,0,async()=>{const q=await getQuote(`${symbol}-USD`);if(!q)throw Error('Yahoo unavailable');return {name:'Yahoo',price:q.price,asOf:null,basis:'USD; helper does not expose observation time'} satisfies SourcePrice;}),
 ]);
 // Results are independently fulfilled/rejected; no provider fallback changes a metric's source.
 const value=<T,>(i:number):T|null=>results[i].status==='fulfilled'?results[i].value as T:null;
 const fail=(i:number)=>results[i].status==='rejected'?errorText(results[i].reason):'Provider returned no data';
 const prices=value<Awaited<ReturnType<typeof getSimplePrices>>>(0),series=value<Awaited<ReturnType<typeof fetchCryptoSeries>>>(1),history=value<Chart>(2),detail=value<NonNullable<Awaited<ReturnType<typeof getCoinDetail>>>>(3),tickers=value<{tickers:CoinTicker[]}>(4),market=value<Awaited<ReturnType<typeof marketSet>>>(5);
 // An explicitly requested id must still denote the requested ticker; don't attach another asset's derivatives.
 if(detail?.symbol&&String(detail.symbol).toUpperCase()!==symbol){for(const key of SECTION_KEYS)sections[key]=unavailable('CoinGecko id and symbol do not match');return {symbol,coinId,name:detail.name??null,rank:detail.market_cap_rank??null,identityMatches:identity.matches,generatedAt,sections,budget:await budgetStatus()};}
 const spot=prices?.[coinId],bars=series?completedBars(series.bars,now):[],asOf=bars.at(-1)?.t??null;
 const dailySource='CoinGecko aggregate daily OHLC',dailyBasis='Completed UTC day (open-date label); daily rule';
 const dm=(label:string,v:Metric['value'],unit?:Metric['unit'])=>metric(label,v,dailySource,asOf,dailyBasis,'daily',unit,now);
 const detailAt=typeof detail?.last_updated==='string'?detail.last_updated:null;
 const sm=(label:string,v:Metric['value'],unit?:Metric['unit'])=>metric(label,v??null,'CoinGecko coin detail',detailAt,'Daily-updated coin detail','slow',unit,now);
 const rule=baseBreakoutV1(bars),network=detail?buildNetworkContext(detail,{symbolCloses:bars.map(b=>b.close)}):null;
 sections.price=section([
  metric('Spot',spot?.usd??null,'CoinGecko',iso(spot?.last_updated_at?spot.last_updated_at*1000:null),'spot','spot','price',now),
  metric('Change vs 24h ago',spot?.usd_24h_change??null,'CoinGecko',iso(spot?.last_updated_at?spot.last_updated_at*1000:null),'rolling 24h','spot','percent',now),
  sm('Change vs 7 days ago',network?.change7dPct??null,'percent'),sm('Change vs 30 days ago',network?.change30dPct??null,'percent'),
  dm('Last daily bar close',bars.at(-1)?.close??null,'price'),
 ],[!spot?`Price unavailable: ${fail(0)}`:'',!series?`Daily bars unavailable: ${fail(1)}`:''].filter(Boolean));
 sections.ruleCheck=section([
  dm('Base length (daily bars)',Math.min(60,Math.max(0,bars.length-1)),'count'),dm('Base high (highest close)',rule.baseHigh,'price'),dm('Base low (daily lows)',rule.baseLow,'price'),
  dm('Base range; limit 35%',rule.rangePct,'percent'),dm('Volume / base median; minimum 3x',rule.volumeRatio,'ratio'),dm('Distance to base high',rule.distancePct,'percent'),
  dm('Required daily close (high × 1.02)',rule.requiredClose,'price'),dm('Required volume (median × 3)',rule.requiredVolume,'usd'),dm('Extension; limit 3 ATR',rule.extension,'ratio'),dm('Base-only ATR(14)',rule.baseAtr,'price'),dm('30-day average volume; floor $5M',rule.adv30,'usd'),
 ],[...rule.why,'Core entry rules 1 to 4 only. The two market gates are in Market context. Exits are not evaluated.','Locked rule sha256 prefix 181d9024. Base low uses daily lows.','CoinGecko volume is a rolling 24h aggregate and can include wash trading.'],rule.stage);
 const context=market?.context;
 const early=earlyContext(bars,chartPoints(history?.prices,now),context?.btcPrice??[],context?.total3??[]);
 const hm=(label:string,v:Metric['value'],unit?:Metric['unit'])=>metric(label,v,'CoinGecko market_chart',chartPoints(history?.prices,now).at(-1)?.t??null,'Completed UTC day; close-only data','daily',unit,now);
 sections.earlyContext=section([
  dm('Base age (days)',early.capped?`${early.baseAge}+`:early.baseAge,'count'),
  dm('Average daily volume, 7d',early.volume7,'usd'),dm('Average daily volume, 30d',early.volume30,'usd'),dm('Average daily volume, 90d',early.volume90,'usd'),dm('Volume 7d / 30d',early.ratio7to30,'ratio'),dm('Volume 30d / 90d',early.ratio30to90,'ratio'),
  dm('Distance below base high',rule.distancePct!=null?-rule.distancePct:null,'percent'),dm('90-day highest close',early.high90,'price'),dm('Distance below 90-day high',early.high90&&bars.length?(1-bars.at(-1)!.close/early.high90)*100:null,'percent'),hm('365-day highest close',early.high365,'price'),hm('Distance below 365-day high',early.high365&&bars.length?(1-bars.at(-1)!.close/early.high365)*100:null,'percent'),sm('Distance below ATH',network?.distanceFromAthPct!=null?-network.distanceFromAthPct:null,'percent'),hm('1 Jan 2023 UTC close',early.jan2023?.value??null,'price'),hm('Change since 1 Jan 2023',early.changeSince2023,'percent'),hm('Highest close since 1 Jan 2023',early.highSince?.value??null,'price'),hm('Date of highest close since 1 Jan 2023',early.highSince?.t??null),
  ...early.relative.map(r=>dm(`Relative return vs ${r.benchmark}, ${r.days}d (${r.label})`,r.excessPct,'percent')),
 ],['A missing window is unavailable; no bars are filled.',`Daily OHLC history: ${bars.length} completed bars. A 90-day return needs 91 contiguous daily points.`,`Long-history price levels use close-only data. ${!history?fail(2):''}`]);
 const cm=(label:string,v:Metric['value']|undefined,points:Point[]|undefined,unit?:Metric['unit'])=>metric(label,v??null,'CoinGecko global + BTC + ETH',points?.at(-1)?.t??null,'Daily context; TOTAL3 includes stablecoins','daily',unit,now);
 sections.marketContext=section([
  cm('BTC close',context?.btc,context?.btcPrice,'price'),cm('BTC 50-day average',context?.btc50,context?.btcPrice,'price'),cm('BTC 200-day average',context?.btc200,context?.btcPrice,'price'),
  cm('BTC dominance',context?.dom,context?.dominance,'percent'),cm('BTC.D 20-day average',context?.dom20,context?.dominance,'percent'),cm('BTC.D 10 days earlier',context?.dom10,context?.dominance,'percent'),cm('BTC.D 20-day average, 10 days earlier',context?.dom20Prior,context?.dominance,'percent'),
  cm('TOTAL3',context?.total,context?.total3,'usd'),cm('TOTAL3 50-day average',context?.total50,context?.total3,'usd'),cm('TOTAL3 change, 30d',context?.totalChange30,context?.total3,'percent'),cm('Rule 6: BTC above 200-day average',context?.rule6,context?.btcPrice),cm('Rule 7: BTC.D below mean, mean below 10 days earlier',context?.rule7,context?.dominance),
 ],[...market?.errors??[],'Context only. Bull-gate test (BTC bull + breadth): REJECTED on 4 Oct 2026; random-entry p = 0.34. TOTAL3 above its 50-day average with falling BTC.D did not help in 2023–2024 (universe 20-day return: -5.1%). Do not read this as a signal.',"The 'Market regime' bar at the top of the site is the STOCK market (VIX, SPY, QQQ)."]);
 sections.derivatives=value<Section>(6)??unavailable(fail(6));
 const rows=tickers?.tickers??[],freshRows=rows.filter(t=>!t.is_stale&&!t.is_anomaly&&Date.parse(t.last_traded_at||t.timestamp)<=now&&now-Date.parse(t.last_traded_at||t.timestamp)<=15*60000);
 const freshVolume=freshRows.reduce((sum,t)=>sum+(t.converted_volume?.usd??0),0);
 const vm=(t:CoinTicker,label:string,v:Metric['value'],unit?:Metric['unit'])=>metric(`${t.market.name} ${t.base}/${t.target}: ${label}`,v,'CoinGecko tickers',t.last_traded_at||t.timestamp||null,'First page only; venue observation','venue',unit,now);
 const top=[...freshRows].sort((a,b)=>(b.converted_volume?.usd??0)-(a.converted_volume?.usd??0)).slice(0,5);
 const venues=[...new Set(freshRows.map(t=>t.market.name))];
 sections.liquidity=section([
  sm('Aggregate 24h volume',network?.spotVolume24h??null,'usd'),dm('30-day average volume',rule.adv30,'usd'),sm('Volume / market cap',network?.volumeToMcap??null,'ratio'),
  metric('Fresh venues on returned page',tickers?venues.length:null,'CoinGecko tickers',freshRows.map(t=>t.last_traded_at||t.timestamp).sort()[0]??null,'First page only; fresh, non-anomalous observations','venue','count',now),
  metric('Best reported fresh spread',freshRows.some(t=>t.bid_ask_spread_percentage!=null)?Math.min(...freshRows.flatMap(t=>t.bid_ask_spread_percentage!=null?[t.bid_ask_spread_percentage]:[])):null,'CoinGecko tickers',freshRows.map(t=>t.last_traded_at||t.timestamp).sort()[0]??null,'First page only; fresh non-anomalous tickers','venue','percent',now),
  ...['Binance','Coinbase','Kraken','KuCoin','OKX'].map(name=>metric(`${name} listing on returned page`,tickers?(rows.some(t=>t.market.name.toLowerCase().includes(name.toLowerCase()))?'Observed':'Not observed; list incomplete'):null,'CoinGecko tickers',rows.map(t=>t.last_traded_at||t.timestamp).filter(Boolean).sort()[0]??null,'First page only; no inference about unreturned listings','venue',undefined,now)),
  ...top.flatMap(t=>[vm(t,'USD volume',t.converted_volume?.usd??null,'usd'),vm(t,'share of fresh returned-page volume',freshVolume?(t.converted_volume?.usd??0)/freshVolume*100:null,'percent'),vm(t,'spread',t.bid_ask_spread_percentage,'percent'),vm(t,'2% depth up',t.cost_to_move_up_usd??null,'usd'),vm(t,'2% depth down',t.cost_to_move_down_usd??null,'usd'),vm(t,'provider trust',t.trust_score??null)]),
 ],[!tickers?`Venue list unavailable: ${fail(4)}`:'Only the first ticker page is available; absence here does not establish that a venue has no listing.',`Observed venues: ${venues.join(', ')||'unavailable'}.`,`Excluded by CoinGecko flags: ${rows.filter(t=>t.is_stale||t.is_anomaly).map(t=>`${t.market.name} ${t.base}/${t.target}`).join(', ')||'none in returned page'}.`,'Null depth is not reported. CoinGecko volume is an aggregate and can include wash trading.']);
 sections.supply=section([
  sm('Market cap',network?.marketCap??null,'usd'),sm('Market-cap rank',network?.marketCapRank??null,'count'),sm('FDV',network?.fdv??null,'usd'),sm('FDV basis',network?.fdvBasis??null),sm('FDV / market cap',network?.fdv!=null&&network.marketCap?network.fdv/network.marketCap:null,'ratio'),
  sm('Circulating supply',network?.circulatingSupply??null,'count'),sm('Total supply',network?.totalSupply??null,'count'),sm('Max supply',network?.maxSupply??null,'count'),sm('Max supply circulating',network?.supplyIssuedPct!=null?network.supplyIssuedPct*100:null,'percent'),sm('ATH',network?.ath??null,'price'),sm('ATH date',network?.athDate??null),sm('Distance from ATH',network?.distanceFromAthPct??null,'percent'),sm('Categories',network?.categories.join(', ')||null),sm('Genesis date',detail?.genesis_date??null),sm('Age since reported genesis (days)',detail?.genesis_date&&Number.isFinite(Date.parse(detail.genesis_date))?Math.max(0,Math.floor((now-Date.parse(detail.genesis_date))/86400000)):null,'count'),
 ],[...network?.notes??[],!detail?fail(3):'Unknown max supply can mean uncapped supply; no amount is inferred.','Unlock schedule: no data source.']);
 const l=levels(bars);
 sections.levels=section([
  dm('ATR(14), all completed bars',l.atr,'price'),dm('ATR / last close',l.atrPct,'percent'),dm('Rule 4 ATR(14), base bars only',l.baseAtr,'price'),
  ...l.distances.flatMap(d=>[dm(d.name,d.value,'price'),dm(`${d.name}: distance in USD`,d.dollars,'usd'),dm(`${d.name}: distance in %`,d.pct,'percent'),dm(`${d.name}: distance in ATR`,d.atr,'ratio')]),
 ],['ATR from CoinGecko aggregate daily OHLC; venue candles can differ.','Rule stop = max(base midpoint, 85% of last close). This is the rule definition, not a recommendation.','The v1 idea is invalid if a daily close is at or below that stop, or if, within 5 days after a breakout, a daily close falls back below the base high.','Existing Verdict levels below use a different model.']);
 const cg:SourcePrice={name:'CoinGecko',price:spot?.usd??null,asOf:iso(spot?.last_updated_at?spot.last_updated_at*1000:null),basis:'USD spot'};
 const yahoo=value<SourcePrice>(8),okx=value<SourcePrice>(7);const checkPrices=[cg,yahoo??{name:'Yahoo',price:null,asOf:null,basis:fail(8)},okx??{name:'OKX',price:null,asOf:null,basis:fail(7)}];
 const check=sourcesAgree(checkPrices,now);
 sections.sourcesCheck=section(checkPrices.map(p=>metric(p.name,p.price,p.name,p.asOf,p.basis,'spot',p.name==='OKX'?undefined:'price',now)),[check.label,`Fresh-source spread: ${check.spreadPct==null?'unavailable':check.spreadPct.toFixed(3)+'%'}; largest pair: ${check.pair??'unavailable'}.`,'OKX is a USDT pair, not USD. This compares raw displayed numbers, not FX-adjusted equivalents.','Yahoo helper omits observation time; its value is excluded from freshness agreement.']);
 if(check.label==='Sources differ')sections.sourcesCheck.status='Degraded';if(check.freshCount<2)sections.sourcesCheck.status='Unknown';
 const risks:Metric[]=[];
 for(const k of SECTION_KEYS.filter(k=>k!=='risks'))if(['Unknown','Degraded','Stale'].includes(sections[k].status))risks.push({label:k,value:sections[k].reason??sections[k].status,source:sections[k].source,asOf:sections[k].asOf,basis:sections[k].basis,status:sections[k].status});
 if(rule.adv30!=null&&rule.adv30<5e6)risks.push(dm('Liquidity','30-day volume is under the $5M rule floor.'));
 if(freshRows.length&&!freshRows.some(t=>(t.converted_volume?.usd??0)>=250000&&t.bid_ask_spread_percentage!=null&&t.bid_ask_spread_percentage<=.5))risks.push(dm('Venue liquidity','No returned fresh pair has $250k volume and spread at most 0.5%.'));
 for(const note of network?.notes??[])risks.push(sm('Supply / turnover',note));
 if((identity.matches??0)>1)risks.push(sm('Coin identity',`${identity.matches} coins share this symbol.`));
 if(history?.market_caps?.some(p=>p[1]===0))risks.push(hm('History','Market-cap history includes zero values; they are excluded from calculations.'));
 sections.risks=section(risks,['Price-discontinuity flag is unavailable in this endpoint; the existing Verdict data-trust panel remains separate.','No early-signal rule has a proven edge. See Rule status.']);
 return {top:buildTop({name:detail?.name??identity.name,symbol,rank:detail?.market_cap_rank??identity.rank,rule,levels:l,bars,sections}),symbol,coinId,name:detail?.name??identity.name,rank:detail?.market_cap_rank??identity.rank,identityMatches:identity.matches,generatedAt,sections,budget:await budgetStatus()};
}
