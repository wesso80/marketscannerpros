/** Nearest listed strike; ties consistently choose the lower strike. Missing chains never invent a strike. */
export function atmStrike(strikes:number[],spot:number):number|null {
 if(!Number.isFinite(spot)||spot<=0)return null;
 return [...new Set(strikes)].filter(k=>Number.isFinite(k)&&k>0).sort((a,b)=>Math.abs(a-spot)-Math.abs(b-spot)||a-b)[0]??null;
}
