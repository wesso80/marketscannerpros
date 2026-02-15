'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

interface AlertTrigger {
  id: string;
  symbol: string;
  condition_met: string;
  trigger_price: number;
  triggered_at: string;
}

interface ToastContextType {
  toasts: AlertTrigger[];
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  dismissToast: () => {},
  dismissAll: () => {},
});

export const useAlertToasts = () => useContext(ToastContext);

// Individual toast component
function AlertToast({ 
  alert, 
  onDismiss 
}: { 
  alert: AlertTrigger; 
  onDismiss: () => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 300);
  };

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border border-emerald-500/30 bg-slate-800/95 
        backdrop-blur-sm shadow-2xl shadow-emerald-500/20 p-4 min-w-[320px] max-w-[400px]
        transform transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
    >
      {/* Animated border glow */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-500/20 via-transparent to-emerald-500/20 animate-pulse" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide">
                Alert Triggered
              </p>
              <p className="text-lg font-bold text-white">{alert.symbol}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-300">{alert.condition_met}</p>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Trigger Price: <span className="text-emerald-400 font-mono">{formatPrice(alert.trigger_price)}</span></span>
            <span>{new Date(alert.triggered_at).toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <a
            href="/tools/alerts"
            className="flex-1 text-center text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded px-3 py-1.5 transition-colors"
          >
            View Alerts
          </a>
          <button
            onClick={handleDismiss}
            className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 transition-colors"
          >
            Dismiss
          </button>
        </div>

        {/* Progress bar for auto-dismiss */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-700 overflow-hidden rounded-b-lg">
          <div 
            className="h-full bg-emerald-500 animate-shrink"
            style={{ animation: 'shrink 10s linear forwards' }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export function AlertToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AlertTrigger[]>([]);
  const lastCheckRef = useRef<string | null>(null);

  // Fetch unacknowledged alerts
  const checkForNewAlerts = useCallback(async () => {
    try {
      const url = lastCheckRef.current
        ? `/api/alerts/unread?since=${encodeURIComponent(lastCheckRef.current)}`
        : '/api/alerts/unread';
      
      const res = await fetch(url);
      if (!res.ok) return;
      
      const data = await res.json();
      if (data.alerts && data.alerts.length > 0) {
        // Add new alerts to toasts (avoid duplicates)
        setToasts(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newAlerts = data.alerts.filter((a: AlertTrigger) => !existingIds.has(a.id));
          return [...prev, ...newAlerts];
        });
      }
      
      lastCheckRef.current = new Date().toISOString();
    } catch (err) {
      // Silently fail - user might not be logged in
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    checkForNewAlerts();
    const interval = setInterval(checkForNewAlerts, 30000);
    return () => clearInterval(interval);
  }, [checkForNewAlerts]);

  const dismissToast = useCallback(async (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    
    // Mark as acknowledged in backend
    try {
      await fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: id }),
      });
    } catch (err) {
      // Silently fail
    }
  }, []);

  const dismissAll = useCallback(() => {
    const ids = toasts.map(t => t.id);
    setToasts([]);
    
    // Mark all as acknowledged
    ids.forEach(id => {
      fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: id }),
      }).catch(() => {});
    });
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ toasts, dismissToast, dismissAll }}>
      {children}
      
      {/* Toast container - fixed position */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3">
        {toasts.map(alert => (
          <AlertToast
            key={alert.id}
            alert={alert}
            onDismiss={() => dismissToast(alert.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
