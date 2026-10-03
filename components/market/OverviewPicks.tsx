import Link from 'next/link';
import PriceStamp from './PriceStamp';
import TrustBadge from './TrustBadge';
import {pickStamp,pickTrust,type MarketPick} from '@/lib/market/overview';
import {symbolHref} from '@/lib/market/links';
export function OverviewPicks({rows,asset}:{rows:MarketPick[];asset:'crypto'|'equity'}){
 return <ul className="divide-y divide-white/10">{rows.map(row=><li key={row.symbol} className="py-3">
  <Link href={symbolHref(row.symbol,asset,'daily')} className="block"><strong>{row.symbol}</strong> · {row.grade??'Grade unavailable'} · {row.permission??'Permission unavailable'} <span className="text-xs text-slate-500">Scan {row.scan_date?.slice(0,10)??'date unknown'}</span><div><PriceStamp compact {...pickStamp(row)}/></div></Link>
  <TrustBadge compact status={pickTrust(row)} reason={row.trust?.reasons?.join(' · ')}/>
 </li>)}</ul>;
}
