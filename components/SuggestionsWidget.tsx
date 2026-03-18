'use client';

import { useCallback, useEffect, useState } from 'react';
import TradeSuggestionCard, { type TradeSuggestion } from './TradeSuggestionCard';
import { useUserTier } from '@/lib/useUserTier';

/**
 * SuggestionsWidget — Renders pending trade suggestions for Pro Trader users.
 *
 * Drop into any dashboard or tools page:
 *   <SuggestionsWidget />
 */
export default function SuggestionsWidget() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const [suggestions, setSuggestions] = useState<TradeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPro = tier === 'pro' || tier === 'pro_trader';

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/suggestions?status=pending&limit=10', { credentials: 'include' });
      if (!res.ok) { setError('Failed to load'); return; }
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tierLoading || !isPro) { setLoading(false); return; }
    fetchSuggestions();
  }, [tierLoading, isPro, fetchSuggestions]);

  async function handleAccept(id: number) {
    const res = await fetch(`/api/suggestions/${id}/accept`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Accept failed');
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }

  async function handleReject(id: number) {
    const res = await fetch(`/api/suggestions/${id}/reject`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Reject failed');
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }

  // Not Pro tier — don't render
  if (!tierLoading && !isPro) return null;

  // Loading
  if (loading || tierLoading) return null;

  // No suggestions
  if (!suggestions.length) return null;

  if (error) return null; // silent fail

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.55rem',
      }}>
        <div style={{
          color: 'var(--msp-text-faint, #64748B)',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          fontWeight: 800,
          letterSpacing: '0.04em',
        }}>
          Trade Suggestions
        </div>
        <div style={{
          color: '#F59E0B',
          fontSize: '0.65rem',
          fontWeight: 700,
        }}>
          {suggestions.length} pending
        </div>
      </div>

      {suggestions.map(s => (
        <TradeSuggestionCard
          key={s.id}
          suggestion={s}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      ))}
    </div>
  );
}
