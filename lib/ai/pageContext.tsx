// =====================================================
// AI PAGE CONTEXT - Global context for page data sharing
// Allows pages to share their state with MSPCopilot
// =====================================================

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { PageSkill } from '@/lib/ai/types';

interface PageDataContext {
  skill: PageSkill;
  data: Record<string, unknown>;
  symbols: string[];
  summary?: string; // Plain text summary of current state
}

interface AIPageContextType {
  pageData: PageDataContext | null;
  setPageData: (context: PageDataContext) => void;
  updatePageData: (data: Record<string, unknown>) => void;
  clearPageData: () => void;
}

const AIPageContext = createContext<AIPageContextType | null>(null);

export function AIPageProvider({ children }: { children: React.ReactNode }) {
  const [pageData, setPageDataState] = useState<PageDataContext | null>(null);

  const setPageData = useCallback((context: PageDataContext) => {
    setPageDataState(context);
  }, []);

  const updatePageData = useCallback((data: Record<string, unknown>) => {
    setPageDataState(prev => prev ? { ...prev, data: { ...prev.data, ...data } } : null);
  }, []);

  const clearPageData = useCallback(() => {
    setPageDataState(null);
  }, []);

  return (
    <AIPageContext.Provider value={{ pageData, setPageData, updatePageData, clearPageData }}>
      {children}
    </AIPageContext.Provider>
  );
}

export function useAIPageContext() {
  const context = useContext(AIPageContext);
  if (!context) {
    // Return a dummy context if provider not found (for pages without AI)
    return {
      pageData: null,
      setPageData: () => {},
      updatePageData: () => {},
      clearPageData: () => {},
    };
  }
  return context;
}

// Helper hook for pages to register their data
export function useRegisterPageData(
  skill: PageSkill,
  data: Record<string, unknown>,
  symbols: string[] = [],
  summary?: string
) {
  const { setPageData } = useAIPageContext();
  
  React.useEffect(() => {
    setPageData({ skill, data, symbols, summary });
  }, [skill, JSON.stringify(data), symbols.join(','), summary, setPageData]);
}
