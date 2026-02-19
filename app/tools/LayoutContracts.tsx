import type { ReactNode } from 'react';

export type ToolsLayoutMode = 'command' | 'terminal';

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

export function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div className="msp-layout-command mx-auto w-full max-w-none px-4 md:px-4">
      {children}
    </div>
  );
}

export function TerminalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="msp-layout-terminal w-full px-3 md:px-4">
      {children}
    </div>
  );
}
