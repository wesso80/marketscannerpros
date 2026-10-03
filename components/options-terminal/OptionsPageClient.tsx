'use client';
import OptionsTerminalView from './OptionsTerminalView';
import {useUserTier,canAccessOptionsTerminal} from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
export default function OptionsPageClient({symbol,expiry}:{symbol:string;expiry?:string}){
 const {tier,isLoading}=useUserTier();
 if(isLoading)return <p role="status">Loading access…</p>;
 if(!canAccessOptionsTerminal(tier))return <UpgradeGate requiredTier="pro" feature="Options"/>;
 return <><ComplianceDisclaimer compact variant="options"/><OptionsTerminalView symbol={symbol} expiry={expiry}/></>;
}
