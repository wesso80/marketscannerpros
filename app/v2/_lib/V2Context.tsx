'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Shared State Context
   Provides selected symbol and navigation across all surfaces.
   Surfaces own their data via api.ts hooks — no mock data here.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Surface } from './types';

interface V2ContextValue {
  selectedSymbol: string | null;
  selectSymbol: (sym: string) => void;
  navigateTo: (surface: Surface, symbol?: string) => void;
  activeSurface: Surface;
}

const V2Context = createContext<V2ContextValue | null>(null);

export function useV2() {
  const ctx = useContext(V2Context);
  if (!ctx) throw new Error('useV2 must be used within V2Provider');
  return ctx;
}

const SURFACE_MAP: Record<string, Surface> = {
  '/tools': 'dashboard',
  '/tools/dashboard': 'dashboard',
  '/tools/scanner': 'scanner',
  '/tools/golden-egg': 'golden-egg',
  '/tools/terminal': 'terminal',
  '/tools/explorer': 'explorer',
  '/tools/research': 'research',
  '/tools/workspace': 'workspace',
  '/v2': 'dashboard',
  '/v2/dashboard': 'dashboard',
  '/v2/scanner': 'scanner',
  '/v2/golden-egg': 'golden-egg',
  '/v2/terminal': 'terminal',
  '/v2/explorer': 'explorer',
  '/v2/research': 'research',
  '/v2/workspace': 'workspace',
  '/v2/backtest': 'backtest',
  '/v2/pricing': 'dashboard',
};

export function V2Provider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Selected symbol from URL search params or internal state
  const urlSymbol = searchParams.get('symbol');
  const [internalSymbol, setInternalSymbol] = useState<string | null>(null);
  const selectedSymbol = urlSymbol || internalSymbol;

  const activeSurface: Surface = SURFACE_MAP[pathname] || 'dashboard';

  const selectSymbol = useCallback((sym: string) => {
    setInternalSymbol(sym);
    // Clear URL ?symbol= param so internalSymbol takes priority
    if (searchParams.get('symbol')) {
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const navigateTo = useCallback((surface: Surface, symbol?: string) => {
    const surfaceRoutes: Record<Surface, string> = {
      dashboard: '/tools/dashboard',
      scanner: '/tools/scanner',
      'golden-egg': '/tools/golden-egg',
      terminal: '/tools/terminal',
      explorer: '/tools/explorer',
      research: '/tools/research',
      workspace: '/tools/workspace',
      backtest: '/tools/workspace',
    };

    const route = surfaceRoutes[surface];
    if (symbol) {
      setInternalSymbol(symbol);
      router.push(`${route}?symbol=${encodeURIComponent(symbol)}`);
    } else if (internalSymbol && (surface === 'golden-egg' || surface === 'terminal')) {
      router.push(`${route}?symbol=${encodeURIComponent(internalSymbol)}`);
    } else {
      router.push(route);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [router, internalSymbol]);

  return (
    <V2Context.Provider value={{
      selectedSymbol,
      selectSymbol,
      navigateTo,
      activeSurface,
    }}>
      {children}
    </V2Context.Provider>
  );
}
