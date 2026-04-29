'use client';

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
  const showFavoriteButton = pageKey !== 'dashboard' && pathname !== '/tools/terminal' && pathname !== '/tools/scanner';
  const wrappedChildren = layoutMode === 'terminal'
    ? <TerminalLayout containerVariant={containerVariant}>{children}</TerminalLayout>
    : <CommandLayout>{children}</CommandLayout>;

  return (
    <DisclosureGate>
    <RegimeProvider>
    <RiskPermissionProvider>
    <V2Provider>
      <AIPageProvider>
        <ErrorBoundary fallback={null}>
          <RegimeBar />
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
