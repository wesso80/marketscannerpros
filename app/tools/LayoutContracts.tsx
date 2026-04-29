import type { ReactNode } from 'react';

export type ToolsLayoutMode = 'command' | 'terminal';
export type ToolsContainerVariant = 'standard' | 'wide' | 'full';

export function isTerminalModePath(pathname: string): boolean {
  const terminalPrefixes = [
    '/tools/scanner',
    '/tools/dashboard',
    '/tools/terminal',
    '/tools/explorer',
    '/tools/research',
    '/tools/workspace',
    '/tools/signal-accuracy',
    '/tools/golden-egg',
  ];

  return terminalPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function getToolsLayoutMode(pathname: string): ToolsLayoutMode {
  return isTerminalModePath(pathname) ? 'terminal' : 'command';
}

export function getToolsContainerVariant(pathname: string): ToolsContainerVariant {
  const fullWidthPaths = [
    '/tools/scanner',
    '/tools/dashboard',
    '/tools/terminal',
    '/tools/explorer',
    '/tools/research',
    '/tools/workspace',
    '/tools/signal-accuracy',
    '/tools/golden-egg',
  ];
  if (fullWidthPaths.some((p) => pathname.startsWith(p))) {
    return 'full';
  }

  return 'standard';
}

export function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div className="msp-layout-command mx-auto w-full min-w-0 max-w-[1280px] px-4 md:px-5">
      {children}
    </div>
  );
}

const terminalContainerClasses: Record<ToolsContainerVariant, string> = {
  standard: 'mx-auto max-w-[1280px]',
  wide: 'mx-auto max-w-[1560px]',
  full: 'max-w-none',
};

export function TerminalLayout({
  children,
  containerVariant = 'standard',
}: {
  children: ReactNode;
  containerVariant?: ToolsContainerVariant;
}) {
  const containerClass = terminalContainerClasses[containerVariant] ?? terminalContainerClasses.standard;

  return (
    <div data-container-variant={containerVariant} className={`msp-layout-terminal w-full min-w-0 px-3 md:px-4 ${containerClass}`}>
      {children}
    </div>
  );
}
