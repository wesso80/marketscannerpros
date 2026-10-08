'use client';

import { Suspense, useEffect, useState } from 'react';
import PublicMSPCopilot, { type CopilotUsage } from '@/components/PublicMSPCopilot';
import { COPILOT_SECTION_EVENT, type CopilotSectionEvent } from '@/lib/ai/useCopilotSection';
import SignedOutBanner from '@/components/free/SignedOutBanner';
import MSPCopilot from '@/components/MSPCopilot';
import RegimeBar from '@/app/v2/_components/RegimeBar';
import { V2Provider } from '@/app/v2/_lib/V2Context';
import { usePathname } from 'next/navigation';
import { AIPageProvider, useAIPageContext } from '@/lib/ai/pageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { PageSkill } from '@/lib/ai/types';
import { CommandLayout, TerminalLayout, getToolsLayoutMode, getToolsContainerVariant } from './LayoutContracts';
import { RiskPermissionProvider } from '@/components/risk/RiskPermissionContext';
import { RegimeProvider } from '@/lib/useRegime';
import FavoriteButton from '@/components/FavoriteButton';
import DisclosureGate from '@/components/DisclosureGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import WorkflowNavigation from '@/components/WorkflowNavigation';

const GLOBAL_COMPLIANCE_ROUTES = new Set([
  '/tools/company-overview',
  '/tools/crypto-heatmap',
  '/tools/explorer',
  '/tools/liquidity-sweep',
  '/tools/research',
  '/tools/settings',
  '/tools/volatility-engine',
  '/tools/workspace',
]);

function getSkillFromPath(pathname: string): PageSkill {
  if (pathname.includes('/scanner')) return 'scanner';
  if (pathname.includes('/crypto-dashboard') || pathname.includes('/open-interest')) return 'derivatives';
  if (pathname.includes('/crypto-intel')) return 'derivatives';
  if (pathname.includes('/options')) return 'options';
  if (pathname.includes('/confluence')) return 'time_confluence';
  if (pathname.includes('/portfolio')) return 'portfolio';
  if (pathname.includes('/journal')) return 'journal';
  if (pathname.includes('/deep-analysis')) return 'deep_analysis';
  if (pathname.includes('/watchlist')) return 'watchlist';
  if (pathname.includes('/backtest')) return 'backtest';
  if (pathname.includes('/ai-analyst')) return 'ai_analyst';
  if (pathname.includes('/market-movers') || pathname.includes('/gainers-losers')) return 'market_movers';
  if (pathname.includes('/markets')) return 'market_movers';
  if (pathname.includes('/macro')) return 'macro';
  if (pathname.includes('/earnings')) return 'earnings';
  if (pathname.includes('/commodities')) return 'commodities';
  return 'home';
}

function CopilotWithContext({ fallbackSkill }: { fallbackSkill: PageSkill }) {
  const { pageData } = useAIPageContext();
  const pathname = usePathname();
  const [sections,setSections]=useState<Record<string,CopilotSectionEvent>>({});
  useEffect(()=>{
    setSections({});
    const receive=(event:Event)=>{const detail=(event as CustomEvent<CopilotSectionEvent>).detail;
      if(!detail || !['news','chart','options','ownership','crypto','dve'].includes(detail.section))return;
      setSections(old=>({...old,[detail.section]:detail}));};
    window.addEventListener(COPILOT_SECTION_EVENT,receive);return()=>window.removeEventListener(COPILOT_SECTION_EVENT,receive);
  },[pathname]);
  const [usage,setUsage] = useState<CopilotUsage | null>(null);
  useEffect(()=>{const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;setUsage(null);
    const load=()=>{clearTimeout(timer);fetch('/api/public-usage',{signal:abort.signal,cache:'no-store'}).then(async r=>{
      if(!r.ok)throw Error('usage');const data=await r.json();if(abort.signal.aborted)return;setUsage(data);
      const delay=Date.parse(data.resetsAt)-Date.now()+1000;if(Number.isFinite(delay)&&delay>0)timer=setTimeout(load,Math.min(delay,2147483647));
    }).catch(()=>{});};
    window.addEventListener('public-usage-changed',load);window.addEventListener('focus',load);load();
    return ()=>{abort.abort();clearTimeout(timer);window.removeEventListener('public-usage-changed',load);window.removeEventListener('focus',load);};
  },[pathname]);
  // Fail closed while entitlement is loading; only the explicit legacy/admin response selects the old panel.
  if(!usage)return null;
  if(usage.enabled && !usage.bypass)return <PublicMSPCopilot usage={usage} pagePath={pathname} timeframe={typeof pageData?.data.timeframe==='string'?pageData.data.timeframe:undefined} expiry={typeof pageData?.data.expiry==='string'?pageData.data.expiry:null} assetType={pageData?.data.assetType==='equity'||pageData?.data.assetType==='crypto'?pageData.data.assetType:undefined} sectionTokensByName={Object.fromEntries(Object.values(sections).filter(s=>s.symbol===pageData?.symbols[0] && s.token).map(s=>[s.section,s.token!]))}
    symbol={pageData?.symbols[0]} evidenceToken={typeof pageData?.data.copilotEvidenceToken==='string' ? pageData.data.copilotEvidenceToken : null} />;

  return (
    <MSPCopilot
      skill={pageData?.skill || fallbackSkill}
      pageData={pageData?.data || {}}
      symbols={pageData?.symbols || []}
    />
  );
}

export default function ToolsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const skill = getSkillFromPath(pathname);
  const layoutMode = getToolsLayoutMode(pathname);
  const containerVariant = getToolsContainerVariant(pathname);
  // Extract page key from pathname for favorites (e.g. /tools/scanner → scanner)
  const pageKey = pathname.replace(/^\/tools\//, '').replace(/\/.*$/, '') || 'dashboard';
  const showFavoriteButton = pathname !== '/tools' && pageKey !== 'dashboard' && pathname !== '/tools/terminal' && pathname !== '/tools/scanner';
  const wrappedChildren = layoutMode === 'terminal'
    ? <TerminalLayout containerVariant={containerVariant}>{children}</TerminalLayout>
    : <CommandLayout>{children}</CommandLayout>;

  return (
    <DisclosureGate>
    <Suspense fallback={null}><SignedOutBanner /></Suspense>
    <RegimeProvider>
    <RiskPermissionProvider>
    <V2Provider>
      <AIPageProvider>
        <WorkflowNavigation />
        <ErrorBoundary fallback={null}>
          {pathname !== '/tools' && <RegimeBar hideIfMissing={pathname === '/tools/start' || pathname === '/tools/dashboard'} />}
        </ErrorBoundary>

        <ErrorBoundary>
          {/* Favourite toggle — lets users pin this page to My Pages */}
          {showFavoriteButton && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px 0' }}>
              <FavoriteButton pageKey={pageKey} />
            </div>
          )}
          {GLOBAL_COMPLIANCE_ROUTES.has(pathname) && (
            <div className="mx-auto w-full max-w-none px-3 pt-2 md:px-4">
              <ComplianceDisclaimer collapsible />
            </div>
          )}
          {wrappedChildren}
        </ErrorBoundary>
        <ErrorBoundary fallback={null}>
          <CopilotWithContext fallbackSkill={skill} />
        </ErrorBoundary>
      </AIPageProvider>
    </V2Provider>
    </RiskPermissionProvider>
    </RegimeProvider>
    </DisclosureGate>
  );
}
