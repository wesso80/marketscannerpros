'use client';

import { useState, useEffect, useCallback } from 'react';

interface TriggeredAlert {
  id: string;
  symbol: string;
  condition: string;
  target_price: number;
  triggered_price: number;
  triggered_at: string;
}

export default function AlertToast() {
  const [toasts, setToasts] = useState<TriggeredAlert[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setIsAuthenticated(!!data.workspaceId);
        }
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Poll for new triggered alerts
  const checkForAlerts = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const url = lastCheck 
        ? `/api/alerts/recent?since=${encodeURIComponent(lastCheck)}`
        : '/api/alerts/recent';
      
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      
      if (data.alerts && data.alerts.length > 0) {
        // Add new alerts to toasts
        setToasts(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newAlerts = data.alerts.filter((a: TriggeredAlert) => !existingIds.has(a.id));
          return [...newAlerts, ...prev].slice(0, 5); // Keep max 5 toasts
        });
      }

      // Update last check time
      setLastCheck(new Date().toISOString());
    } catch (error) {
      console.error('Error checking alerts:', error);
    }
  }, [isAuthenticated, lastCheck]);

  // Poll every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial check
    checkForAlerts();

    // Set up polling
    const interval = setInterval(checkForAlerts, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkForAlerts]);

  // Auto-dismiss toasts after 10 seconds
  useEffect(() => {
    if (toasts.length === 0) return;

    const timeout = setTimeout(() => {
      setToasts(prev => prev.slice(0, -1)); // Remove oldest
    }, 10000);

    return () => clearTimeout(timeout);
  }, [toasts]);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const formatCondition = (condition: string) => {
    switch (condition) {
      case 'above': return '↑ Above';
      case 'below': return '↓ Below';
      case 'percent_up': return '📈 Up %';
      case 'percent_down': return '📉 Down %';
      default: return condition;
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(6);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-gradient-to-r from-emerald-900/95 to-emerald-800/95 backdrop-blur-sm border border-emerald-500/50 rounded-lg p-4 shadow-2xl animate-slide-in"
          style={{
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🔔</span>
                <span className="font-bold text-emerald-400 text-lg">{toast.symbol}</span>
              </div>
              <p className="text-sm text-neutral-200">
                {formatCondition(toast.condition)} ${formatPrice(toast.target_price)}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Triggered at ${formatPrice(toast.triggered_price)}
              </p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-neutral-400 hover:text-white transition-colors p-1"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <a
            href="/tools/alerts"
            className="mt-2 block text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View all alerts →
          </a>
        </div>
      ))}
      
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
