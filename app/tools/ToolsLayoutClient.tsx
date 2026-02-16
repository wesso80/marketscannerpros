'use client';

import MSPCopilot from '@/components/MSPCopilot';
import AdaptiveTraderPersonalityBar from '@/components/AdaptiveTraderPersonalityBar';
import OperatorCommandStrip from '@/components/OperatorCommandStrip';
import { usePathname } from 'next/navigation';
import { AIPageProvider, useAIPageContext } from '@/lib/ai/pageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { PageSkill } from '@/lib/ai/types';
import { CommandLayout, TerminalLayout, getToolsLayoutMode } from './LayoutContracts';

function getSkillFromPath(pathname: string): PageSkill {
  if (pathname.includes('/scanner')) return 'scanner';
  if (pathname.includes('/crypto-dashboard') || pathname.includes('/open-interest')) return 'derivatives';
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
  const wrappedChildren = layoutMode === 'terminal'
    ? <TerminalLayout>{children}</TerminalLayout>
    : <CommandLayout>{children}</CommandLayout>;

  return (
    <AIPageProvider>
      <ErrorBoundary fallback={null}>
        <AdaptiveTraderPersonalityBar skill={skill} />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-4">
          <OperatorCommandStrip />
        </div>
      </ErrorBoundary>
      <ErrorBoundary>{wrappedChildren}</ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <CopilotWithContext fallbackSkill={skill} />
      </ErrorBoundary>
    </AIPageProvider>
  );
}
