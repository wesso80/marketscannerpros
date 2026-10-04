import {formatMarketTime} from '@/lib/market/priceStamp';
import type {TopFacts} from '@/lib/crypto/breakdown/top';
import {COPY} from '../copy';
export default function SourceLine({stamp,zone}:{stamp:TopFacts['daily']|null;zone:string}){
 const time=formatMarketTime(stamp?.asOf,zone),warn=!time||!stamp||['Unknown','Degraded','Stale'].includes(stamp.status);
 return <p data-top-source className={`mt-1 break-words text-xs ${warn?'text-amber-300':'text-slate-400'}`}>{stamp?.source??COPY.top.sourceUnavailable} · {time??COPY.unknown}{stamp?.basis?` · ${stamp.basis}`:''}{stamp?.reason?` · ${stamp.reason}`:''}</p>;
}
