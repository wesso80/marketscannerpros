import StatTile from '@/components/visual/StatTile';
import type {ReactNode} from 'react';
import {V1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {topNumber,type TopFacts} from '@/lib/crypto/breakdown/top';
import type {Metric} from '@/lib/crypto/breakdown/types';
import {COPY} from '../copy';
import SourceLine from './SourceLine';
const number=(m:Metric|null|undefined)=>typeof m?.value==='number'&&Number.isFinite(m.value)?m.value:null;
function Card({title,value,stamp,zone,children,accent=false,missing=false,showSource=true}:{title:string;value:string;stamp:TopFacts['daily']|null;zone:string;children?:ReactNode;accent?:boolean;missing?:boolean;showSource?:boolean}){
 return <div data-stat-card data-top-number className="min-w-0 rounded-lg border border-white/10 p-3">
  <h3 className="text-xs text-slate-400">{title}</h3><p className="mt-2 break-words text-lg font-semibold tabular-nums" style={{color:accent?'var(--msp-info)':'var(--msp-text)'}}>{value}</p>
  {missing&&<p className="text-xs text-slate-400">{stamp?.reason??COPY.top.missingReason}</p>}{children}{showSource&&<SourceLine stamp={stamp} zone={zone}/>}
 </div>;
}
export type DisplayStat={label:string;value:string|number|null;detail?:string};
export default function StatCards({top:t,zone='UTC',tiles,showSource=true}:{top?:TopFacts;zone?:string;tiles?:DisplayStat[];showSource?:boolean}){
 if(tiles)return <div data-symbol-stats className="grid grid-cols-2 gap-2 self-start">{tiles.filter(t=>t.value!=null).map(t=><div data-stat-card key={t.label}><StatTile label={t.label} value={t.value}/>{t.detail&&<p className="px-3 pb-2 text-xs text-[var(--msp-text-muted)]">{t.detail}</p>}</div>)}</div>;
 const c=COPY.top,unlisted=t?.perpetualListed?.value===false,funding=number(t?.funding),interval=number(t?.fundingInterval),oi=number(t?.openInterest),change=number(t?.oiChange24h),rank=number(t?.rank),volume=t?.rule.volumeRatio??null;
 return <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
  <Card showSource={showSource} title={c.fundingTitle} value={unlisted?c.noPerpetual:funding==null?c.valueUnavailable:c.fundingPercent(funding)} missing={!unlisted&&funding==null} stamp={unlisted?t!.perpetualListed:t?.funding??t?.derivatives??null} zone={zone}>
   {!unlisted&&interval!=null&&<div data-top-number><p className="text-xs text-slate-400">{c.fundingInterval(interval)}</p>{showSource&&<SourceLine stamp={t?.fundingInterval??null} zone={zone}/>}</div>}
  </Card>
  <Card showSource={showSource} title={c.oiTitle} value={unlisted?c.noPerpetual:oi==null?c.valueUnavailable:c.usd(oi)} missing={!unlisted&&oi==null} stamp={unlisted?t!.perpetualListed:t?.openInterest??t?.derivatives??null} zone={zone}>
   {!unlisted&&change!=null&&<div data-top-number><p className="text-xs text-slate-400">{c.oiChange(c.signedPercent(change))}</p>{showSource&&<SourceLine stamp={t?.oiChange24h??null} zone={zone}/>}</div>}
  </Card>
  <Card showSource={showSource} title={c.volumeTitle} value={volume==null?c.valueUnavailable:topNumber(volume,'multiple')} missing={volume==null} stamp={t?.daily??null} zone={zone} accent={volume!=null&&volume>=V1.volMultiple}><p className="text-xs text-slate-400">{c.volumeBasis(V1.baseDays)}</p></Card>
  <Card showSource={showSource} title={c.rankTitle} value={rank==null?c.valueUnavailable:c.rankValue(rank)} missing={rank==null} stamp={t?.rank??null} zone={zone}/>
 </div>;
}
