'use client';

import { useState, useEffect, useCallback } from 'react';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites');
      if (!res.ok) return;
      const data = await res.json();
      setFavorites(data.favorites || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addFavorite = useCallback(async (pageKey: string) => {
    setFavorites(prev => prev.includes(pageKey) ? prev : [...prev, pageKey]);
    await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageKey }),
    });
  }, []);

  const removeFavorite = useCallback(async (pageKey: string) => {
    setFavorites(prev => prev.filter(k => k !== pageKey));
    await fetch('/api/favorites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageKey }),
    });
  }, []);

  const toggleFavorite = useCallback(async (pageKey: string) => {
    if (favorites.includes(pageKey)) {
      await removeFavorite(pageKey);
    } else {
      await addFavorite(pageKey);
    }
  }, [favorites, addFavorite, removeFavorite]);

  const isFavorite = useCallback((pageKey: string) => favorites.includes(pageKey), [favorites]);

  return { favorites, loading, addFavorite, removeFavorite, toggleFavorite, isFavorite, refresh };
}
