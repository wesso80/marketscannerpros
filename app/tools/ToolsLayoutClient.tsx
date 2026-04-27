'use client';

import { Suspense } from 'react';
import MSPCopilot from '@/components/MSPCopilot';
import AdaptiveTraderPersonalityBar from '@/components/AdaptiveTraderPersonalityBar';
import OperatorCommandStrip from '@/components/OperatorCommandStrip';
import RegimeBar from '@/app/v2/_components/RegimeBar';
import { V2Provider } from '@/app/v2/_lib/V2Context';
import { usePathname } from 'next/navigation';
import { AIPageProvider, useAIPageContext } from '@/lib/ai/pageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { PageSkill } from '@/lib/ai/types';
import { CommandLayout, TerminalLayout, getToolsLayoutMode, getToolsContainerVariant } from './LayoutContracts';
import { RiskPermissionProvider } from '@/components/risk/RiskPermissionContext';
import { RegimeProvider } from '@/lib/useRegime';
import CapitalControlStrip from '@/components/risk/CapitalControlStrip';
import GlobalSessionBar from '@/components/GlobalSessionBar';
import FavoriteButton from '@/components/FavoriteButton';
import DisclosureGate from '@/components/DisclosureGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

const GLOBAL_COMPLIANCE_ROUTES = new Set([
  '/tools/company-overview',
  '/tools/confluence-scanner',
  '/tools/crypto-heatmap',
  '/tools/crypto-terminal',
  '/tools/crypto-time-confluence',
  '/tools/crypto',
  '/tools/economic-calendar',
  '/tools/explorer',
  '/tools/heatmap',
  '/tools/intraday-charts',
  '/tools/liquidity-sweep',
  '/tools/macro',
  '/tools/research',
  '/tools/scanner/backtest',
  '/tools/settings',
  '/tools/time-scanner',
  '/tools/volatility-engine',
  '/tools/watchlists',
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

        {/* ── LEGAL_HOLD: Operator HUD hidden pending legal review (may appear advisory) ── */}
        {/* To restore: remove the {false && ...} wrapper below */}
        {false && (
        <details className="group mx-auto w-full max-w-none">
          <summary
            className="sticky top-[48px] z-40 flex cursor-pointer items-center gap-2 border-b border-slate-700/40 bg-slate-900/90 px-3 py-1.5 text-[11px] font-semibold text-slate-400 backdrop-blur select-none list-none [&::-webkit-details-marker]:hidden"
          >
            <span className="text-cyan-400">&#9654;</span>
            <span className="uppercase tracking-wider">Operator HUD</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500 font-normal">Personality &middot; Flow &middot; Risk &middot; Session</span>
            <span className="ml-auto text-[11px] text-slate-600 group-open:hidden">Click to expand</span>
            <span className="ml-auto text-[11px] text-slate-600 hidden group-open:inline">Click to collapse</span>
          </summary>

          <div className="border-b border-slate-700/30 pb-2">
            <ErrorBoundary fallback={null}>
              <AdaptiveTraderPersonalityBar skill={skill} />
            </ErrorBoundary>
            <ErrorBoundary fallback={null}>
              <div className="mx-auto w-full max-w-none px-3 md:px-4">
                <Suspense fallback={null}>
                  <OperatorCommandStrip />
                </Suspense>
              </div>
            </ErrorBoundary>
            <ErrorBoundary fallback={null}>
              <div className="mx-auto w-full max-w-none px-3 pb-2 md:px-4">
                <CapitalControlStrip />
                <div className="mt-1">
                  <GlobalSessionBar />
                </div>
              </div>
            </ErrorBoundary>
          </div>
        </details>
        )}

        <ErrorBoundary>
          {/* Favourite toggle — lets users pin this page to My Pages */}
          {pageKey !== 'dashboard' && (
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
