import { parseTradingDay } from '@/lib/analysis/providerAsOf';

export type PriceStampInput = {
  symbol?: string; price?: number | null; assetType?: string; changePct?: number | null;
  changeBasis?: string | null; priceBasis?: string | null; priceBasisLabel?: string | null;
  observedAt?: string | number | null; fetchedAt?: string | number | null; latestDay?: string | null;
  dataTimestamp?: string | number | null; data_as_of?: string | null;
  ageSeconds?: number | null; barAge?: number | null; stale?: boolean; source?: string | null;
  spot?: { price?: number | null; latestDay?: string | null };
};
export type PriceStampOptions = { timeZone?: string; now?: number };
const validNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
function instant(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value as string | number);
  return Number.isFinite(d.getTime()) ? d : null;
}
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(`${day}T12:00:00Z`));
}
export function formatMarketTime(value: unknown, timeZone = 'UTC'): string | null {
  const d=instant(value); if(!d)return null;
  let f: Intl.DateTimeFormat;
  try { f=new Intl.DateTimeFormat('en-AU',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short',weekday:'short',day:'numeric',month:'short'}); }
  catch { return formatMarketTime(value,'UTC'); }
  const p=f.formatToParts(d), get=(key:string)=>p.find(part=>part.type===key)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('timeZoneName')} ${get('weekday')} ${get('day')} ${get('month')}`;
}
export function priceText(price: number | null | undefined): string {
  return validNumber(price) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:Math.abs(price)<1?8:2}).format(price) : 'price unavailable';
}
/** Observation time is evidence. fetchedAt alone never proves when a price was observed. */
export function formatPriceStamp(input: PriceStampInput, options: PriceStampOptions = {}) {
  const zone=options.timeZone ?? 'UTC', crypto=input.assetType==='crypto', option=input.assetType==='option';
  const basis=input.priceBasis ?? (crypto?'spot':'unknown');
  const bar=/bar|daily_scan/.test(basis), close=/close|previous_session|historical|eod/i.test(basis);
  const observed=input.observedAt ?? input.dataTimestamp ?? input.data_as_of;
  const d=instant(observed);
  const day=parseTradingDay(input.latestDay) ?? (typeof observed==='string'?parseTradingDay(observed):null);
  let timeLabel: string | null=null;
  let basisLabel=input.priceBasisLabel ?? (bar?'daily bar close':close?'last close':basis==='realtime'?'live':basis==='spot'?'spot':'basis unknown');
  if(option && close)basisLabel='quotes: last session';
  if(day && !crypto)timeLabel=`${dayLabel(day)}${option?' close':' (New York)'}`;
  else if(d && close && !crypto){
    const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    timeLabel=`${dayLabel(ny)} (New York)`;
  } else if(d)timeLabel=formatMarketTime(d.toISOString(),bar&&crypto?'UTC':zone);
  const missingTime=!timeLabel;timeLabel ??='time unknown';
  const age=validNumber(input.ageSeconds)?input.ageSeconds:d&&options.now!=null?Math.max(0,(options.now-d.getTime())/1000):null;
  const ageLabel=input.barAge!=null?`${input.barAge} bar${input.barAge===1?'':'s'} old`:age!=null?`${Math.floor(age/60)} min old`:null;
  const change=validNumber(input.changePct)?`${input.changePct>=0?'+':''}${input.changePct.toFixed(2)}% ${crypto?(bar?'vs prior daily bar':'vs 24h ago'):input.changeBasis==='rolling_24h'?'vs 24h ago':'vs prior close'}`:null;
  const parts=[`${input.symbol?`${input.symbol} `:''}${priceText(input.price)}`,basisLabel,`${timeLabel}${ageLabel?` (${ageLabel})`:''}`,change,input.source || 'source unknown'];
  if(input.spot)parts.push(`spot ${priceText(input.spot.price)} last close ${input.spot.latestDay?dayLabel(input.spot.latestDay):'time unknown'}`);
  return {text:parts.filter(Boolean).join(' · '),timeLabel,basisLabel,warning:missingTime || !!input.stale,missingTime};
}
