'use client';

import { useEffect, useState } from 'react';
import {
  computeCryptoTimeConfluence,
  formatTimeRemaining,
  type CryptoTimeConfluenceResult,
  type CryptoTimeNode,
} from '@/lib/time/cryptoTimeConfluence';

interface CryptoTimeConfluenceWidgetProps {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  className?: string;
}

export default function CryptoTimeConfluenceWidget({
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute default
  className = '',
}: CryptoTimeConfluenceWidgetProps) {
  const [confluence, setConfluence] = useState<CryptoTimeConfluenceResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initial calculation
    const calculate = () => {
      try {
        const result = computeCryptoTimeConfluence();
        setConfluence(result);
        setIsLoading(false);
      } catch (error) {
        console.error('Error calculating crypto time confluence:', error);
        setIsLoading(false);
      }
    };

    calculate();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      const interval = setInterval(calculate, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  if (isLoading || !confluence) {
    return (
      <div className={`bg-gray-900 border border-gray-800 rounded-lg p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4">⏰ Crypto Time Confluence</h3>
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  const getConfluenceLevelColor = (level: string) => {
    switch (level) {
      case 'extreme':
        return 'text-red-400 bg-red-900/20 border-red-500';
      case 'high':
        return 'text-orange-400 bg-orange-900/20 border-orange-500';
      case 'medium':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-500';
      default:
        return 'text-gray-400 bg-gray-800/20 border-gray-600';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 10) return 'text-red-400';
    if (score >= 6) return 'text-orange-400';
    if (score >= 3) return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">⏰ Crypto Time Confluence</h3>
        <div className="text-xs text-gray-500">
          UTC: {new Date().toISOString().slice(11, 19)}
        </div>
      </div>

      {/* Alert Banner */}
      {confluence.alert && (
        <div className="mb-4 p-3 bg-orange-900/30 border border-orange-500/50 rounded-lg">
          <p className="text-sm text-orange-300">{confluence.alert}</p>
        </div>
      )}

      {/* Confluence Score */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Confluence Score</span>
          <span className={`text-2xl font-bold ${getScoreColor(confluence.confluenceScore)}`}>
            {confluence.confluenceScore}
          </span>
        </div>
        <div className={`px-3 py-2 rounded-lg border text-center text-sm font-medium ${getConfluenceLevelColor(confluence.confluenceLevel)}`}>
          {confluence.confluenceLevel.toUpperCase()} CONFLUENCE
        </div>
      </div>

      {/* Description */}
      <div className="mb-6 p-3 bg-gray-800/50 rounded-lg">
        <p className="text-sm text-gray-300">{confluence.description}</p>
      </div>

      {/* Next Daily Close */}
      <div className="mb-6 pb-6 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">Next Daily Close (00:00 UTC)</div>
            <div className="text-sm text-gray-300">
              {confluence.nextDailyClose.toISOString().slice(0, 16).replace('T', ' ')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1">Time Remaining</div>
            <div className="text-lg font-semibold text-blue-400">
              {formatTimeRemaining(confluence.hoursToNextDaily)}
            </div>
          </div>
        </div>
      </div>

      {/* Active Cycles (Next 48h) */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-3">
          Active Cycles (Next 48h)
          <span className="ml-2 text-xs text-gray-500">
            ({confluence.activeCycles.length})
          </span>
        </h4>
        {confluence.activeCycles.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            No major cycles closing in next 48 hours
          </div>
        ) : (
          <div className="space-y-2">
            {confluence.activeCycles.map((cycle) => (
              <CycleRow key={cycle.cycle} cycle={cycle} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <div className="text-xs text-gray-500 text-center">
          🌏 Sydney Time: Daily close at 11:00 AM (UTC+11)
        </div>
      </div>
    </div>
  );
}

function CycleRow({ cycle }: { cycle: CryptoTimeNode }) {
  const getScoreBadgeColor = (score: number) => {
    if (score >= 4) return 'bg-red-900/30 text-red-400 border-red-500/50';
    if (score >= 2) return 'bg-orange-900/30 text-orange-400 border-orange-500/50';
    if (score >= 1) return 'bg-yellow-900/30 text-yellow-400 border-yellow-500/50';
    return 'bg-gray-800 text-gray-500 border-gray-700';
  };

  return (
    <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold text-white min-w-[50px]">
          {cycle.cycle}
        </div>
        {cycle.isHighPriority && (
          <span className="text-xs">⭐</span>
        )}
        <div className={`px-2 py-0.5 rounded border text-xs font-medium ${getScoreBadgeColor(cycle.score)}`}>
          +{cycle.score}
        </div>
      </div>
      <div className="text-sm text-gray-400">
        {formatTimeRemaining(cycle.hoursToClose)}
      </div>
    </div>
  );
}

/**
 * Compact version for dashboard
 */
export function CryptoTimeConfluenceCompact({ className = '' }: { className?: string }) {
  const [confluence, setConfluence] = useState<CryptoTimeConfluenceResult | null>(null);

  useEffect(() => {
    const calculate = () => {
      const result = computeCryptoTimeConfluence();
      setConfluence(result);
    };
    calculate();
    const interval = setInterval(calculate, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!confluence) return null;

  const getScoreColor = (score: number) => {
    if (score >= 10) return 'text-red-400';
    if (score >= 6) return 'text-orange-400';
    if (score >= 3) return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">Time Confluence</span>
        <span className={`text-xl font-bold ${getScoreColor(confluence.confluenceScore)}`}>
          {confluence.confluenceScore}
        </span>
      </div>
      <div className="text-xs text-gray-500 mb-2">
        {confluence.activeCycles.length} cycles closing in 48h
      </div>
      {confluence.isHighConfluence && (
        <div className="text-xs text-orange-400 font-medium">
          ⚠️ High confluence window
        </div>
      )}
    </div>
  );
}
