/** Stable readable key; never store an option under the underlying stock's key. */
export function optionWatchlistKey(symbol:string, option:{expiration?:unknown;strike?:unknown;type?:unknown}):string|null {
 const root=symbol.toUpperCase().trim(),strike=Number(option.strike),type=String(option.type).toLowerCase();
 if(!/^[A-Z0-9.\-]{1,12}$/.test(root)||!/^\d{4}-\d{2}-\d{2}$/.test(String(option.expiration))||!Number.isFinite(strike)||strike<=0||!['call','put'].includes(type)) return null;
 return `${root} ${option.expiration} ${strike}${type==='call'?'C':'P'}`;
}
