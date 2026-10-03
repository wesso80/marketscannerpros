export function symbolHref(symbol:string,type:string,timeframe?:string):string {
 const params=new URLSearchParams({symbol:symbol.trim().toUpperCase(),type:type==='crypto'?'crypto':'equity'});
 if(timeframe)params.set('timeframe',timeframe);
 return `/tools/golden-egg?${params}`;
}
