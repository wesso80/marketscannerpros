'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier } from '@/lib/useUserTier';

interface Alert {
  id: string;
  symbol: string;
  asset_type: string;
  condition_type: string;
  condition_value: number;
  condition_timeframe?: string;
  name: string;
  notes?: string;
  is_active: boolean;
  is_recurring: boolean;
  notify_email: boolean;
  notify_push: boolean;
  triggered_at?: string;
  trigger_count: number;
  last_price?: number;
  created_at: string;
}

interface AlertQuota {
  used: number;
  max: number;
  tier: string;
  triggersToday: number;
}

interface AlertHistory {
  id: string;
  alert_id: string;
  triggered_at: string;
  trigger_price: number;
  condition_met: string;
  symbol: string;
  alert_name: string;
  acknowledged_at?: string;
}

interface AlertsWidgetProps {
  className?: string;
  compact?: boolean;
  onCreateAlert?: (symbol: string, currentPrice: number) => void;
  prefilledSymbol?: string;
}

export default function AlertsWidget({
  className = '',
  compact = false,
  onCreateAlert,
  prefilledSymbol,
}: AlertsWidgetProps) {
  const { tier } = useUserTier();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [quota, setQuota] = useState<AlertQuota | null>(null);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  
  // New alert form state
  const [newAlert, setNewAlert] = useState({
    symbol: prefilledSymbol || '',
    assetType: 'crypto' as const,
    conditionType: 'price_above' as const,
    conditionValue: '',
    name: '',
    isRecurring: false,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (data.alerts) {
        setAlerts(data.alerts);
        setQuota(data.quota);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/history?limit=20');
      const data = await res.json();
      if (data.history) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    if (prefilledSymbol) {
      setNewAlert(prev => ({ ...prev, symbol: prefilledSymbol }));
      setShowCreate(true);
    }
  }, [prefilledSymbol]);

  const createAlert = async () => {
    if (!newAlert.symbol || !newAlert.conditionValue) {
      setError('Please enter symbol and price');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newAlert,
          conditionValue: parseFloat(newAlert.conditionValue),
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.message || data.error);
      } else {
        setShowCreate(false);
        setNewAlert({
          symbol: '',
          assetType: 'crypto',
          conditionType: 'price_above',
          conditionValue: '',
          name: '',
          isRecurring: false,
        });
        fetchAlerts();
      }
    } catch (err) {
      setError('Failed to create alert');
    } finally {
      setCreating(false);
    }
  };

  const toggleAlert = async (id: string, currentActive: boolean) => {
    try {
      await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !currentActive }),
      });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to toggle alert:', err);
    }
  };

  const deleteAlert = async (id: string) => {
    if (!confirm('Delete this alert?')) return;
    
    try {
      await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  const getConditionLabel = (type: string) => {
    switch (type) {
      case 'price_above': return '↗ Above';
      case 'price_below': return '↘ Below';
      case 'percent_change_up': return '📈 +%';
      case 'percent_change_down': return '📉 -%';
      case 'volume_spike': return '📊 Volume';
      default: return type;
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price == null || typeof price !== 'number' || isNaN(price)) return '—';
    if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(6);
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-xl p-4 ${className}`}>
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          <div className="h-10 bg-slate-700 rounded"></div>
          <div className="h-10 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  // Compact version
  if (compact) {
    const activeAlerts = alerts.filter(a => a.is_active);
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <span className="text-sm text-slate-400">Price Alerts</span>
          </div>
          <span className="text-xs text-slate-500">
            {quota?.used || 0}/{quota?.max || 3}
          </span>
        </div>
        
        {activeAlerts.length === 0 ? (
          <div className="text-xs text-slate-500">No active alerts</div>
        ) : (
          <div className="space-y-1">
            {activeAlerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="flex items-center justify-between text-xs">
                <span className="font-mono text-emerald-400">{alert.symbol}</span>
                <span className="text-slate-400">
                  {getConditionLabel(alert.condition_type)} ${formatPrice(alert.condition_value)}
                </span>
              </div>
            ))}
            {activeAlerts.length > 3 && (
              <div className="text-xs text-slate-500">+{activeAlerts.length - 3} more</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full version
  return (
    <div className={`bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔔</span>
            <h3 className="text-lg font-semibold text-white">Price Alerts</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">
              {quota?.used || 0}/{quota?.max || 3} alerts
            </span>
            <button
              onClick={() => setShowCreate(!showCreate)}
              disabled={(quota?.used || 0) >= (quota?.max || 3)}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              + New Alert
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mt-4">
          <button
            onClick={() => setActiveTab('active')}
            className={`text-sm pb-2 border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'text-emerald-400 border-emerald-400'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Active ({alerts.filter(a => a.is_active).length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`text-sm pb-2 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'text-emerald-400 border-emerald-400'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            History
          </button>
        </div>
      </div>

      {/* Create Alert Form */}
      {showCreate && (
        <div className="p-4 bg-slate-900/50 border-b border-slate-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input
              type="text"
              placeholder="Symbol (BTC, AAPL)"
              value={newAlert.symbol}
              onChange={e => setNewAlert(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={newAlert.conditionType}
              onChange={e => setNewAlert(prev => ({ ...prev, conditionType: e.target.value as any }))}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="price_above">Price Above</option>
              <option value="price_below">Price Below</option>
              <option value="percent_change_up">% Change Up</option>
              <option value="percent_change_down">% Change Down</option>
            </select>
            <input
              type="number"
              placeholder="Price / %"
              value={newAlert.conditionValue}
              onChange={e => setNewAlert(prev => ({ ...prev, conditionValue: e.target.value }))}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={newAlert.assetType}
              onChange={e => setNewAlert(prev => ({ ...prev, assetType: e.target.value as any }))}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="crypto">Crypto</option>
              <option value="equity">Stock</option>
              <option value="forex">Forex</option>
            </select>
          </div>
          
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={newAlert.isRecurring}
                onChange={e => setNewAlert(prev => ({ ...prev, isRecurring: e.target.checked }))}
                className="rounded bg-slate-700 border-slate-600"
              />
              Recurring (re-arm after trigger)
            </label>
            
            <div className="flex items-center gap-2">
              {error && <span className="text-red-400 text-sm">{error}</span>}
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={createAlert}
                disabled={creating}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {creating ? 'Creating...' : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'active' ? (
          alerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🔕</div>
              <p className="text-slate-400 mb-2">No alerts yet</p>
              <p className="text-sm text-slate-500">
                Create price alerts to get notified when markets move
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    alert.is_active
                      ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500'
                      : 'bg-slate-900/30 border-slate-700/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-bold text-emerald-400">
                        {alert.symbol}
                      </span>
                      <span className="text-sm text-slate-400">
                        {getConditionLabel(alert.condition_type)}
                      </span>
                      <span className="font-mono text-white">
                        ${formatPrice(alert.condition_value)}
                      </span>
                      {alert.is_recurring && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                          🔄 Recurring
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {alert.triggered_at && (
                        <span className="text-xs text-amber-400">
                          Triggered {alert.trigger_count}x
                        </span>
                      )}
                      <button
                        onClick={() => toggleAlert(alert.id, alert.is_active)}
                        className={`p-1.5 rounded transition-colors ${
                          alert.is_active
                            ? 'text-emerald-400 hover:bg-emerald-500/20'
                            : 'text-slate-500 hover:bg-slate-700'
                        }`}
                        title={alert.is_active ? 'Pause alert' : 'Activate alert'}
                      >
                        {alert.is_active ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => deleteAlert(alert.id)}
                        className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                        title="Delete alert"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  
                  {alert.notes && (
                    <p className="text-xs text-slate-500 mt-2">{alert.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          // History tab
          history.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📜</div>
              <p className="text-slate-400">No trigger history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div
                  key={h.id}
                  className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-emerald-400">{h.symbol}</span>
                      <span className="text-sm text-slate-400 ml-2">{h.condition_met}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(h.triggered_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Quota warning */}
      {quota && quota.used >= quota.max && (
        <div className="p-3 bg-amber-500/10 border-t border-amber-500/20">
          <p className="text-sm text-amber-400">
            ⚠️ Alert limit reached. Upgrade to {quota.tier === 'free' ? 'Pro' : 'Pro Trader'} for more alerts.
          </p>
        </div>
      )}
    </div>
  );
}
