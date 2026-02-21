import type { ReactNode } from 'react';

export type ToolsLayoutMode = 'command' | 'terminal';
export type ToolsContainerVariant = 'standard' | 'wide' | 'full';

export function isTerminalModePath(pathname: string): boolean {
  const terminalPrefixes = [
    '/tools/options-confluence',
    '/tools/scanner',
    '/tools/deep-analysis',
    '/tools/portfolio',
    '/tools/ai-analyst',
    '/tools/journal',
    '/tools/backtest',
    '/tools/confluence-scanner',
  ];

  return terminalPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function getToolsLayoutMode(pathname: string): ToolsLayoutMode {
  return isTerminalModePath(pathname) ? 'terminal' : 'command';
}

export function getToolsContainerVariant(pathname: string): ToolsContainerVariant {
  const fullWidthPaths = [
    '/tools/portfolio',
    '/tools/backtest',
    '/tools/scanner',
    '/tools/journal',
    '/tools/confluence-scanner',
  ];
  if (fullWidthPaths.some((p) => pathname.startsWith(p))) {
    return 'full';
  }

  if (pathname.startsWith('/tools/ai-analyst') || pathname.startsWith('/tools/deep-analysis')) {
    return 'wide';
  }

  return 'standard';
}

export function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div className="msp-layout-command mx-auto w-full max-w-none px-4 md:px-4">
      {children}
    </div>
  );
}

export function TerminalLayout({
  children,
  containerVariant = 'standard',
}: {
  children: ReactNode;
  containerVariant?: ToolsContainerVariant;
}) {
  const containerClass = containerVariant === 'full'
    ? 'max-w-none'
    : containerVariant === 'wide'
      ? 'mx-auto max-w-[1360px]'
      : 'mx-auto max-w-[1120px]';

  return (
    <div className={`msp-layout-terminal w-full px-3 md:px-4 ${containerClass}`}>
      {children}
    </div>
  );
}
