'use client';

import { useState, useEffect } from 'react';
import { 
  isPushSupported, 
  getNotificationPermission, 
  subscribeToPush, 
  unsubscribeFromPush,
  isSubscribedToPush,
  sendTestNotification
} from '@/lib/push';

interface PushNotificationSettingsProps {
  compact?: boolean;
}

export default function PushNotificationSettings({ compact = false }: PushNotificationSettingsProps) {
  const [supported, setSupported] = useState<boolean | null>(null); // null = checking
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const isSupported = isPushSupported();
      setSupported(isSupported);
      setPermission(getNotificationPermission());
      
      if (isSupported) {
        const isSubbed = await isSubscribedToPush();
        setSubscribed(isSubbed);
      }
    } catch (err) {
      console.error('[Push] checkStatus error:', err);
      setSupported(false);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');
    console.log('[Push UI] Starting subscription...');
    
    try {
      const subscription = await subscribeToPush();
      console.log('[Push UI] subscribeToPush result:', subscription);
      
      if (subscription) {
        // Save to server
        console.log('[Push UI] Saving to server...');
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription)
        });
        
        console.log('[Push UI] Server response status:', res.status);
        
        if (res.ok) {
          setSubscribed(true);
          setPermission('granted');
          console.log('[Push UI] Subscription saved successfully!');
        } else {
          const data = await res.json();
          console.error('[Push UI] Server error:', data);
          setError(data.error || 'Failed to save subscription');
        }
      } else {
        console.error('[Push UI] No subscription returned');
        setError('Could not create subscription. Check browser console for details.');
      }
    } catch (err: any) {
      console.error('[Push UI] Exception:', err);
      setError(err.message || 'Failed to subscribe');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    setError('');
    
    try {
      await unsubscribeFromPush();
      await fetch('/api/push/subscribe', { method: 'DELETE' });
      setSubscribed(false);
    } catch (err: any) {
      setError(err.message || 'Failed to unsubscribe');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to send test');
      }
    } catch (err: any) {
      // Fallback to local notification
      sendTestNotification();
    } finally {
      setLoading(false);
    }
  };

  // Still checking support
  if (supported === null) {
    return (
      <div className={`p-4 rounded-lg bg-slate-800/50 border border-slate-700 ${compact ? 'text-sm' : ''}`}>
        <div className="flex items-center gap-2 text-slate-400">
          <span>🔔</span>
          <span>Checking notification support...</span>
        </div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className={`p-4 rounded-lg bg-slate-800/50 border border-slate-700 ${compact ? 'text-sm' : ''}`}>
        <div className="flex items-center gap-2 text-slate-400">
          <span>🔕</span>
          <span>Push notifications not supported in this browser</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{subscribed ? '🔔' : '🔕'}</span>
            <span className="text-sm text-slate-300">Push Notifications</span>
          </div>
          <div className="flex items-center gap-2">
            {subscribed && (
              <button
                onClick={handleTest}
                disabled={loading}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
              >
                Test
              </button>
            )}
            <button
              onClick={subscribed ? handleUnsubscribe : handleSubscribe}
              disabled={loading}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                subscribed
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-slate-600 text-white hover:bg-slate-500'
              }`}
            >
              {loading ? '...' : subscribed ? 'Enabled' : 'Enable'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
            ⚠️ {error}
          </div>
        )}
        {permission === 'denied' && (
          <div className="mt-2 text-xs text-amber-400">
            ⚠️ Blocked in browser settings
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{subscribed ? '🔔' : '🔕'}</span>
          <div>
            <h3 className="font-semibold text-white">Push Notifications</h3>
            <p className="text-sm text-slate-400">
              {subscribed 
                ? 'You will receive alerts on this device' 
                : 'Get instant alerts when your conditions are met'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        {!subscribed ? (
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Enabling...' : 'Enable Push Notifications'}
          </button>
        ) : (
          <>
            <button
              onClick={handleTest}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Send Test
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={loading}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Disabling...' : 'Disable'}
            </button>
          </>
        )}
      </div>

      {permission === 'denied' && (
        <p className="mt-3 text-sm text-amber-400">
          ⚠️ Notifications are blocked. Please enable them in your browser settings.
        </p>
      )}
    </div>
  );
}
