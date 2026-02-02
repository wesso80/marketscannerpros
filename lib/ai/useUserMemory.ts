// =====================================================
// USE USER MEMORY HOOK - Access and update AI memory
// Use: const { memory, updateMemory } = useUserMemory();
// =====================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserMemory } from '@/lib/ai/types';

interface UseUserMemoryReturn {
  memory: UserMemory | null;
  isLoading: boolean;
  error: string | null;
  updateMemory: (updates: Partial<UserMemory>) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const DEFAULT_MEMORY: UserMemory = {
  preferredTimeframes: ['1H', '4H', '1D'],
  preferredAssets: [],
  riskProfile: 'medium',
  maxRiskPerTrade: 2.0,
  favoredSetups: [],
  tradingStyle: 'swing',
  typicalHoldTime: '1-5 days',
  responseVerbosity: 'balanced',
  showEducationalContent: true,
  autoSuggestActions: true,
  mostUsedFeatures: [],
  commonScanFilters: {},
  downvotedTopics: [],
};

export function useUserMemory(): UseUserMemoryReturn {
  const [memory, setMemory] = useState<UserMemory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/memory');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch memory');
      }

      setMemory(data.memory || DEFAULT_MEMORY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
      setMemory(DEFAULT_MEMORY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateMemory = useCallback(async (updates: Partial<UserMemory>): Promise<boolean> => {
    try {
      const response = await fetch('/api/ai/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update memory');
      }

      // Optimistic update
      setMemory(prev => prev ? { ...prev, ...updates } : { ...DEFAULT_MEMORY, ...updates });
      return true;
    } catch (err) {
      console.error('Failed to update memory:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  return {
    memory,
    isLoading,
    error,
    updateMemory,
    refetch: fetchMemory,
  };
}

export default useUserMemory;
