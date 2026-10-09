import type { PageEvidence } from './publicCopilotEvidence';
type Observation = PageEvidence['observations'][number];
type Label = { name: string; unit?: string; date?: string; dateLabel?: string; expiry?: string };
const labels: Record<string, Label> = {
  'symbol.canonical.price': {name:'Price',unit:'quote currency not supplied',date:'symbol.canonical.priceTs'},
  'symbol.meta.price': {name:'Price',unit:'quote currency not supplied',date:'symbol.meta.asOfTs'},
  'symbol.canonical.changePct': {name:'Price change',unit:'%'},
  'symbol.canonical.historyBars': {name:'Price history',unit:'bars'},
  'symbol.priceEvidence.quote.price': {name:'Latest quote',unit:'quote currency not supplied',date:'symbol.priceEvidence.quote.at'},
  'symbol.priceEvidence.close': {name:'Completed daily close',unit:'quote currency not supplied'},
  'symbol.priceEvidence.rsi14': {name:'Relative strength index (14 bars)',unit:'index points'},
  'symbol.priceEvidence.atr14': {name:'Average true range (14 bars)',unit:'quote currency not supplied'},
  'symbol.priceEvidence.atrPct': {name:'Average true range',unit:'%'},
  'symbol.priceEvidence.bbwp': {name:'Bollinger band width percentile',unit:'percentile points'},
  'symbol.priceEvidence.realisedVol20': {name:'Realised volatility (20 daily bars, annualised)',unit:'%'},
  'symbol.priceEvidence.volumeRatio': {name:'Volume / preceding 20-bar average',unit:'ratio'},
  'symbol.priceEvidence.adx.adx': {name:'Average directional index',unit:'index points'},
  'symbol.canonical.options.putCallOi': {name:'Put/call open-interest ratio',unit:'ratio'},
  'symbol.canonical.options.totalCallOi': {name:'Call open interest',unit:'contracts'},
  'symbol.canonical.options.totalPutOi': {name:'Put open interest',unit:'contracts'},
  'symbol.canonical.options.avgIvPct': {name:'Average implied volatility',unit:'%'},
  'options.openInterest.putCall': {name:'Put/call open-interest ratio',unit:'ratio'},
  'options.openInterest.calls': {name:'Call open interest',unit:'contracts'},
  'options.openInterest.puts': {name:'Put open interest',unit:'contracts'},
  'options.impliedVolatility.atmIvPct': {name:'At-the-money implied volatility',unit:'%'},
  'options.underlying.price': {name:'Underlying price',unit:'quote currency not supplied',date:'options.underlying.asOf'},
  'symbol.canonical.derivatives.fundingRatePercent': {name:'Funding rate',unit:'%'},
  'symbol.canonical.derivatives.openInterestUsd': {name:'Derivatives open interest',unit:'USD'},
  'dve.reading.volatility.bbwp': {name:'Bollinger band width percentile',unit:'percentile points'},
};
const indicatorNames: Record<string,string> = {rsi:'Relative strength index',adx:'Average directional index',atr:'Average true range',atrPct:'Average true range',ema20:'Exponential moving average (20 bars)',ema50:'Exponential moving average (50 bars)',ema200:'Exponential moving average (200 bars)',sma20:'Simple moving average (20 bars)',sma50:'Simple moving average (50 bars)',macd:'MACD',macdSignal:'MACD signal',macdHist:'MACD histogram',stochK:'Stochastic K'};
for (const [key,name] of Object.entries(indicatorNames)) labels[`symbol.canonical.indicators.${key}`] = {
  name, unit:key==='atrPct'?'%':['rsi','adx','stochK'].includes(key)?'index points':'quote currency not supplied',
  date:'symbol.canonical.lastCompletedBarAt',dateLabel:'Last completed bar',
};
function readablePath(field: string): string {
  return field.replace(/^symbol\./,'').replace(/\[(\d+)\]/g, ' item $1').split('.').map(part =>
    part.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ')).join(' / ');
}
/** Strict ISO date values only. Never turn arbitrary source strings into answer prose. */
function dateValue(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  // Reject calendar overflow rather than silently normalizing it.
  const day = value.slice(0,10);
  if (new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day) return null;
  return value;
}
export function renderCopilotObservation(observation: Observation, evidence: PageEvidence): string {
  const field = observation.field;
  const config: Label = {...(labels[field] ?? {name:readablePath(field)})};
  if(field.startsWith('symbol.priceEvidence.') && !config.date) {
    config.date='symbol.priceEvidence.basis.lastCompletedBar'; config.dateLabel='Completed daily bar';
  }
  if(field.startsWith('symbol.canonical.options.')) {
    config.date='symbol.canonical.options.snapshotTs';config.dateLabel='Options snapshot';config.expiry='symbol.canonical.options.expiry';
  }
  if(field.startsWith('options.') && !field.startsWith('options.underlying.')) {
    config.date='options.chain.lastUpdated';config.dateLabel='Chain last updated';config.expiry='options.chain.expiry';
  }
  const indexed=new Map(evidence.observations.map(o=>[o.field,o]));
  const citations=[observation.id];
  const context: string[]=[];
  const dated=config.date ? indexed.get(config.date):undefined;
  const date=dateValue(dated?.value);
  context.push(date?`${config.dateLabel ?? 'Observation time'}: ${date}`:'Observation time: not supplied');
  if(date && dated)citations.push(dated.id);
  if(config.expiry){
    const expiry=indexed.get(config.expiry), expiryDate=dateValue(expiry?.value);
    context.push(`Expiry: ${expiryDate ?? 'not supplied'}`);
    if(expiryDate && expiry)citations.push(expiry.id);
  }
  // Capture time describes collection, and must never fill a missing observation date.
  const section=field.split('.')[0];
  const captured=indexed.get(`${section}.capturedAt (not observation time)`);
  const captureDate=dateValue(section==='symbol'?evidence.capturedAt:captured?.value);
  if(captureDate){context.push(`Snapshot captured: ${captureDate}`);if(captured)citations.push(captured.id);}
  let value: string;
  if(observation.value===null) value='Not available (missing; not zero)';
  else if(typeof observation.value==='number') value=Number.isFinite(observation.value)
    ? `${observation.value}${config.unit==='%'?'%':config.unit?` ${config.unit}`:' (unit not specified)'}` : 'Not available';
  else if(typeof observation.value==='boolean') value=observation.value?'Yes':'No';
  else value='Text or structured data: see source evidence';
  return `OBSERVATION: ${evidence.symbol} · ${config.name}: ${value}\n${context.join(' · ')} [${[...new Set(citations)].join(', ')}]`;
}
