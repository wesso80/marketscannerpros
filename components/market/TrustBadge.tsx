import DataFreshnessBadge, { providerStatusColor } from './DataFreshnessBadge';
import type { MarketDataProviderStatus } from '@/lib/scanner/providerStatus';
export type TrustStatus='Live'|'Last close'|'Stale'|'Degraded'|'Unknown';
type Props={status?:TrustStatus;providerStatus?:MarketDataProviderStatus|null;reason?:string;compact?:boolean};
export function trustBadgeState({status,providerStatus,reason}:Props) {
  const label:TrustStatus=providerStatus?.stale?'Stale':providerStatus&&(providerStatus.degraded||providerStatus.simulated||providerStatus.productionDemoEnabled)?'Degraded':status ?? (providerStatus?.live?'Live':'Unknown');
  const warnings=[reason,...providerStatus?.warnings ?? []].filter(Boolean) as string[];
  const normalized:MarketDataProviderStatus|undefined=label==='Unknown'?undefined:{source:'trust',provider:'unknown',live:label==='Live',simulated:false,stale:label==='Stale',degraded:label==='Degraded',productionDemoEnabled:false,alertLevel:label==='Live'?'none':'warning',...providerStatus,warnings};
  if(normalized && label!=='Live')normalized.alertLevel='warning';
  return {label,normalized,color:providerStatusColor(normalized),reason:warnings.join(' · ')||label};
}
export default function TrustBadge(props:Props) {
  const state=trustBadgeState(props);
  return <details className="inline-block align-middle"><summary aria-label={`${state.label}: ${state.reason}`} className="cursor-help list-none"><DataFreshnessBadge status={state.normalized} label={state.label} compact={props.compact} className="normal-case" /></summary><span className="block max-w-sm rounded border p-2 text-xs">{state.reason}</span></details>;
}
