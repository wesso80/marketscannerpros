'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface AppNotification {
  id: number;
  title: string;
  body: string;
  href: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationPrefs {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  emailTo: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
}

interface NotificationBellProps {
  compact?: boolean;
}

export default function NotificationBell({ compact = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    inAppEnabled: true,
    emailEnabled: false,
    emailTo: '',
    discordEnabled: false,
    discordWebhookUrl: '',
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSuccess, setPrefsSuccess] = useState<string | null>(null);

  const knownIdsRef = useRef<Set<number>>(new Set());
  const firstLoadRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!authenticated) return;

    try {
      const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
      if (!res.ok) return;

      const data = await res.json();
      const nextItems: AppNotification[] = Array.isArray(data?.items) ? data.items : [];
      const nextUnread = Number(data?.unreadCount || 0);

      if (!firstLoadRef.current) {
        const newOnes = nextItems.filter((item) => !knownIdsRef.current.has(item.id));
        const unreadNew = newOnes.filter((item) => !item.is_read);
        if (unreadNew.length > 0) {
          setToasts((prev) => [...unreadNew.slice(0, 3), ...prev].slice(0, 4));
        }
      }

      setItems(nextItems);
      setUnreadCount(nextUnread);
      knownIdsRef.current = new Set(nextItems.map((item) => item.id));
      firstLoadRef.current = false;
    } catch {
      // silent by design
    }
  }, [authenticated]);

  const fetchPrefs = useCallback(async () => {
    if (!authenticated) return;

    try {
      const res = await fetch('/api/notifications/prefs', { cache: 'no-store' });
      if (!res.ok) {
        setPrefsError('Unable to load delivery settings');
        return;
      }

      const data = await res.json();
      const next = data?.prefs || {};
      setPrefs({
        inAppEnabled: next.in_app_enabled !== false,
        emailEnabled: next.email_enabled === true,
        emailTo: typeof next.email_to === 'string' ? next.email_to : '',
        discordEnabled: next.discord_enabled === true,
        discordWebhookUrl: typeof next.discord_webhook_url === 'string' ? next.discord_webhook_url : '',
      });
      setPrefsLoaded(true);
      setPrefsError(null);
    } catch {
      setPrefsError('Unable to load delivery settings');
    }
  }, [authenticated]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!res.ok) {
          setAuthenticated(false);
          return;
        }
        const data = await res.json();
        setAuthenticated(Boolean(data?.authenticated && data?.workspaceId));
      } catch {
        setAuthenticated(false);
      }
    };

    void checkAuth();
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    void fetchNotifications();
    void fetchPrefs();
    const interval = setInterval(() => void fetchNotifications(), 30000);
    return () => clearInterval(interval);
  }, [authenticated, fetchNotifications, fetchPrefs]);

  useEffect(() => {
    if (!toasts.length) return;
    const timeout = setTimeout(() => {
      setToasts((prev) => prev.slice(0, -1));
    }, 6000);
    return () => clearTimeout(timeout);
  }, [toasts]);

  const visibleItems = useMemo(() => items.slice(0, 8), [items]);

  const markRead = useCallback(async (id: number) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, is_read: true } : item));
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id }),
      });
    } catch {
      // silent
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
    } catch {
      // silent
    }
  }, []);

  const savePrefs = useCallback(async () => {
    setPrefsSaving(true);
    setPrefsError(null);
    setPrefsSuccess(null);

    try {
      const res = await fetch('/api/notifications/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inAppEnabled: prefs.inAppEnabled,
          emailEnabled: prefs.emailEnabled,
          emailTo: prefs.emailTo,
          discordEnabled: prefs.discordEnabled,
          discordWebhookUrl: prefs.discordWebhookUrl,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefsError(data?.error || 'Failed to save delivery settings');
        return;
      }

      setPrefsSuccess('Delivery settings saved');
      setTimeout(() => setPrefsSuccess(null), 2500);
    } catch {
      setPrefsError('Failed to save delivery settings');
    } finally {
      setPrefsSaving(false);
    }
  }, [prefs]);

  if (!authenticated) return null;

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className={`relative flex items-center justify-center hover:text-teal-300 transition-colors ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
          aria-label="Notifications"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-teal-500 text-[10px] text-slate-900 font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-[120]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <span className="text-sm font-semibold text-slate-100">Notifications</span>
              <button
                onClick={markAllRead}
                className="text-xs text-teal-300 hover:text-teal-200 transition-colors"
              >
                Mark all read
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {visibleItems.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400">No notifications yet.</div>
              ) : (
                visibleItems.map((item) => (
                  <div key={item.id} className={`px-4 py-3 border-b border-slate-800 last:border-b-0 ${item.is_read ? 'bg-slate-900' : 'bg-teal-500/5'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${item.is_read ? 'text-slate-200' : 'text-teal-200'}`}>{item.title}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.body}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{new Date(item.created_at).toLocaleString()}</p>
                      </div>
                      {!item.is_read && (
                        <button
                          onClick={() => void markRead(item.id)}
                          className="text-[11px] text-teal-300 hover:text-teal-200 transition-colors whitespace-nowrap"
                        >
                          Mark read
                        </button>
                      )}
                    </div>

                    {item.href && (
                      <Link
                        href={item.href}
                        onClick={() => {
                          void markRead(item.id);
                          setIsOpen(false);
                        }}
                        className="inline-block mt-2 text-xs text-teal-300 hover:text-teal-200 transition-colors"
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                ))
              )}

              <div className="px-4 py-3 border-t border-slate-700 bg-slate-950/30">
                <div className="text-xs font-semibold text-slate-300 mb-2">Delivery Settings</div>

                {!prefsLoaded ? (
                  <div className="text-xs text-slate-500">Loading settings...</div>
                ) : (
                  <>
                    <label className="flex items-center justify-between text-xs text-slate-300 mb-2">
                      <span>In-app</span>
                      <input
                        type="checkbox"
                        checked={prefs.inAppEnabled}
                        onChange={(e) => setPrefs((prev) => ({ ...prev, inAppEnabled: e.target.checked }))}
                        className="accent-teal-400"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs text-slate-300 mb-2">
                      <span>Email</span>
                      <input
                        type="checkbox"
                        checked={prefs.emailEnabled}
                        onChange={(e) => setPrefs((prev) => ({ ...prev, emailEnabled: e.target.checked }))}
                        className="accent-teal-400"
                      />
                    </label>
                    <input
                      type="email"
                      value={prefs.emailTo}
                      onChange={(e) => setPrefs((prev) => ({ ...prev, emailTo: e.target.value }))}
                      placeholder="you@example.com"
                      className="w-full mb-2 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder:text-slate-500"
                    />

                    <label className="flex items-center justify-between text-xs text-slate-300 mb-2">
                      <span>Discord</span>
                      <input
                        type="checkbox"
                        checked={prefs.discordEnabled}
                        onChange={(e) => setPrefs((prev) => ({ ...prev, discordEnabled: e.target.checked }))}
                        className="accent-teal-400"
                      />
                    </label>
                    <input
                      type="url"
                      value={prefs.discordWebhookUrl}
                      onChange={(e) => setPrefs((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
                      placeholder="https://discord.com/api/webhooks/..."
                      className="w-full mb-2 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder:text-slate-500"
                    />

                    {prefsError && <div className="text-[11px] text-red-300 mb-2">{prefsError}</div>}
                    {prefsSuccess && <div className="text-[11px] text-teal-300 mb-2">{prefsSuccess}</div>}

                    <button
                      onClick={() => void savePrefs()}
                      disabled={prefsSaving}
                      className="w-full px-2 py-1.5 text-xs rounded border border-teal-400/60 text-teal-200 hover:bg-teal-400/10 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {prefsSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => (
            <div key={toast.id} className="border border-slate-700 bg-slate-900/95 rounded-lg px-4 py-3 shadow-xl">
              <p className="text-sm font-medium text-teal-200">{toast.title}</p>
              <p className="text-xs text-slate-300 mt-1">{toast.body}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
