import Link from 'next/link';
import PriceStamp from './PriceStamp';
import { friendlyStatus } from '@/lib/free/friendlyStatus';
import {pickStamp,pickTrust,type MarketPick} from '@/lib/market/overview';
import {symbolHref} from '@/lib/market/links';
export function OverviewPicks({rows,asset}:{rows:MarketPick[];asset:'crypto'|'equity'}){
 return <ul data-overview-picks className="divide-y divide-white/10">{rows.map((row, index)=><li key={row.symbol} className={`py-3 ${index >= 3 ? 'msp-pick-desktop' : ''}`}>
  <Link href={symbolHref(row.symbol,asset,'daily')} className="block"><strong>{row.symbol}</strong> <span className="text-xs text-slate-500">Scan {row.scan_date?.slice(0,10)??'date not supplied'}</span><div><PriceStamp compact plain {...pickStamp(row)}/></div></Link>
  <p className="text-xs text-slate-400">{pickTrust(row) === 'Unknown' ? 'Observation quality not collected' : friendlyStatus(pickTrust(row))}</p>
 </li>)}</ul>;
}
