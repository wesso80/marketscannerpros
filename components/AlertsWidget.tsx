'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import PushNotificationSettings from './PushNotificationSettings';
import MultiConditionAlertBuilder from './MultiConditionAlertBuilder';

interface AlertCondition {
  id: string;
  condition_type: string;
  condition_value: number;
  condition_timeframe?: string;
  condition_indicator?: string;
  condition_period?: number;
  is_met?: boolean;
  last_value?: number;
}

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
  // Smart alert fields
  is_smart_alert?: boolean;
  smart_alert_context?: Record<string, any>;
  last_derivative_value?: number;
  cooldown_minutes?: number;
  // Multi-condition fields
  is_multi_condition?: boolean;
  condition_logic?: 'AND' | 'OR';
  conditions?: AlertCondition[];
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
  const [activeTab, setActiveTab] = useState<'active' | 'smart' | 'multi' | 'history'>('active');
  const [showSmartCreate, setShowSmartCreate] = useState(false);
  const [showMultiCreate, setShowMultiCreate] = useState(false);
  
  // New alert form state
  const [newAlert, setNewAlert] = useState({
    symbol: prefilledSymbol || '',
    assetType: 'crypto' as const,
    conditionType: 'price_above' as const,
    conditionValue: '',
    name: '',
    isRecurring: false,
    notifyEmail: true,  // Enable email notifications by default
  });

  // Smart alert form state
  const [newSmartAlert, setNewSmartAlert] = useState({
    symbol: 'BTC',
    conditionType: 'oi_surge' as const,
    conditionValue: '5', // 5% default threshold
    name: '',
    cooldownMinutes: 60,
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
          notifyEmail: true,  // Keep email enabled by default
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
      // Smart alert types
      case 'oi_surge': return '📈 OI Surge';
      case 'oi_drop': return '📉 OI Drop';
      case 'funding_extreme_pos': return '🔴 High Funding';
      case 'funding_extreme_neg': return '🟢 Neg Funding';
      case 'ls_ratio_high': return '⚠️ Crowded Long';
      case 'ls_ratio_low': return '⚠️ Crowded Short';
      case 'fear_extreme': return '😱 Extreme Fear';
      case 'greed_extreme': return '🤑 Extreme Greed';
      case 'oi_divergence_bull': return '🐂 Bull Divergence';
      case 'oi_divergence_bear': return '🐻 Bear Divergence';
      // Scanner signal alerts
      case 'scanner_buy_signal': return '🟢 Buy Signal';
      case 'scanner_sell_signal': return '🔴 Sell Signal';
      case 'scanner_score_above': return '📈 Score Above';
      case 'scanner_score_below': return '📉 Score Below';
      case 'scanner_bullish_flip': return '🐂 Bullish Flip';
      case 'scanner_bearish_flip': return '🐻 Bearish Flip';
      // Strategy alerts
      case 'strategy_buy_signal': return '📊 Strategy Buy';
      case 'strategy_sell_signal': return '📊 Strategy Sell';
      case 'strategy_entry': return '🎯 Strategy Entry';
      case 'strategy_exit': return '🚪 Strategy Exit';
      default: return type;
    }
  };

  const getSmartAlertDescription = (type: string) => {
    switch (type) {
      case 'oi_surge': return 'Open Interest spikes above threshold (new positions flooding in)';
      case 'oi_drop': return 'Open Interest drops below threshold (mass liquidations/closures)';
      case 'funding_extreme_pos': return 'Funding rate too high (overleveraged longs - bearish signal)';
      case 'funding_extreme_neg': return 'Funding rate too negative (overleveraged shorts - bullish signal)';
      case 'ls_ratio_high': return 'Long/Short ratio too high (crowded longs - squeeze risk)';
      case 'ls_ratio_low': return 'Long/Short ratio too low (crowded shorts - squeeze up risk)';
      case 'fear_extreme': return 'Fear & Greed below threshold (contrarian buy opportunity)';
      case 'greed_extreme': return 'Fear & Greed above threshold (consider taking profits)';
      case 'oi_divergence_bull': return 'OI rising while price down (smart money accumulating)';
      case 'oi_divergence_bear': return 'OI falling while price up (distribution/deleveraging)';
      // Scanner signal descriptions
      case 'scanner_buy_signal': return 'Scanner detects bullish setup with score above threshold (BUY signal)';
      case 'scanner_sell_signal': return 'Scanner detects bearish setup with score below threshold (SELL signal)';
      case 'scanner_score_above': return 'Scanner score rises above threshold (momentum building)';
      case 'scanner_score_below': return 'Scanner score drops below threshold (momentum fading)';
      case 'scanner_bullish_flip': return 'Direction flips from bearish/neutral to bullish (trend change)';
      case 'scanner_bearish_flip': return 'Direction flips from bullish/neutral to bearish (trend change)';
      // Strategy signal descriptions
      case 'strategy_buy_signal': return 'Backtest strategy generates a BUY entry signal on this symbol';
      case 'strategy_sell_signal': return 'Backtest strategy generates a SELL/exit signal on this symbol';
      case 'strategy_entry': return 'Backtest strategy signals new position entry opportunity';
      case 'strategy_exit': return 'Backtest strategy signals position exit (take profit/stop loss)';
      default: return '';
    }
  };

  const getSmartAlertDefaultValue = (type: string) => {
    switch (type) {
      case 'oi_surge': return '5'; // 5% OI increase
      case 'oi_drop': return '5'; // 5% OI decrease
      case 'funding_extreme_pos': return '0.05'; // 0.05% funding
      case 'funding_extreme_neg': return '0.05'; // -0.05% funding
      case 'ls_ratio_high': return '1.5'; // 1.5 L/S ratio
      case 'ls_ratio_low': return '0.7'; // 0.7 L/S ratio
      case 'fear_extreme': return '25'; // F&G < 25
      case 'greed_extreme': return '75'; // F&G > 75
      case 'oi_divergence_bull': return '3'; // 3% OI increase
      case 'oi_divergence_bear': return '3'; // 3% OI decrease
      // Scanner signal defaults
      case 'scanner_buy_signal': return '65'; // Score >= 65 = buy
      case 'scanner_sell_signal': return '35'; // Score <= 35 = sell
      case 'scanner_score_above': return '70'; // Score threshold
      case 'scanner_score_below': return '30'; // Score threshold
      case 'scanner_bullish_flip': return '0'; // No threshold needed
      case 'scanner_bearish_flip': return '0'; // No threshold needed
      // Strategy signal defaults
      case 'strategy_buy_signal': return '0'; // No threshold needed
      case 'strategy_sell_signal': return '0'; // No threshold needed
      case 'strategy_entry': return '0'; // No threshold needed
      case 'strategy_exit': return '0'; // No threshold needed
      default: return '5';
    }
  };

  const createSmartAlert = async () => {
    if (!newSmartAlert.conditionValue && !newSmartAlert.conditionType?.startsWith('strategy_')) {
      setError('Please enter a threshold value');
      return;
    }

    // Validate strategy alerts have a symbol
    if (newSmartAlert.conditionType?.startsWith('strategy_') && !newSmartAlert.symbol) {
      setError('Strategy alerts require a symbol (e.g., BTC, ETH, AAPL)');
      return;
    }

    setCreating(true);
    setError('');

    try {
      // Build smart_alert_context for strategy alerts
      const smartAlertContext = newSmartAlert.conditionType?.startsWith('strategy_') 
        ? {
            strategy: (newSmartAlert as any).strategy || 'ema_crossover',
            timeframe: (newSmartAlert as any).timeframe || 'daily'
          }
        : undefined;

      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newSmartAlert.symbol || 'MARKET',
          assetType: 'crypto',
          conditionType: newSmartAlert.conditionType,
          conditionValue: parseFloat(newSmartAlert.conditionValue) || 0,
          name: newSmartAlert.name || `${newSmartAlert.conditionType.replace(/_/g, ' ')} Alert`,
          isRecurring: true,
          notifyEmail: true,
          isSmartAlert: true,
          cooldownMinutes: newSmartAlert.cooldownMinutes,
          smartAlertContext,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.message || data.error);
      } else {
        setShowSmartCreate(false);
        setNewSmartAlert({
          symbol: 'BTC',
          conditionType: 'oi_surge',
          conditionValue: '5',
          name: '',
          cooldownMinutes: 60,
        });
        fetchAlerts();
      }
    } catch (err) {
      setError('Failed to create smart alert');
    } finally {
      setCreating(false);
    }
  };

  const formatPrice = (price: number | string | null | undefined) => {
    if (price == null) return '—';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return '—';
    if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (num >= 1) return num.toFixed(2);
    return num.toFixed(6);
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
            Price ({alerts.filter(a => a.is_active && !a.is_smart_alert && !a.is_multi_condition).length})
          </button>
          <button
            onClick={() => setActiveTab('multi')}
            className={`text-sm pb-2 border-b-2 transition-colors ${
              activeTab === 'multi'
                ? 'text-purple-400 border-purple-400'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🔗 Multi ({alerts.filter(a => a.is_active && a.is_multi_condition).length})
          </button>
          <button
            onClick={() => setActiveTab('smart')}
            className={`text-sm pb-2 border-b-2 transition-colors ${
              activeTab === 'smart'
                ? 'text-emerald-400 border-emerald-400'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🧠 Smart ({alerts.filter(a => a.is_active && a.is_smart_alert).length})
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
          {/* Quick Template Dropdown */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 block mb-1">⚡ Quick Template</label>
            <select
              onChange={e => {
                const templates: Record<string, any> = {
                  '': {},
                  'btc_dip': { symbol: 'BTC', conditionType: 'price_below', conditionValue: '90000', name: 'BTC under $90K', assetType: 'crypto' },
                  'btc_ath': { symbol: 'BTC', conditionType: 'price_above', conditionValue: '110000', name: 'BTC new ATH zone', assetType: 'crypto' },
                  'eth_dip': { symbol: 'ETH', conditionType: 'price_below', conditionValue: '3000', name: 'ETH under $3K', assetType: 'crypto' },
                  'sol_breakout': { symbol: 'SOL', conditionType: 'price_above', conditionValue: '250', name: 'SOL breakout', assetType: 'crypto' },
                  'spy_correction': { symbol: 'SPY', conditionType: 'percent_change_down', conditionValue: '2', name: 'SPY 2% drop', assetType: 'equity' },
                  'spy_rally': { symbol: 'SPY', conditionType: 'percent_change_up', conditionValue: '1.5', name: 'SPY rally day', assetType: 'equity' },
                  'nvda_dip': { symbol: 'NVDA', conditionType: 'price_below', conditionValue: '130', name: 'NVDA dip buy', assetType: 'equity' },
                  'aapl_breakout': { symbol: 'AAPL', conditionType: 'price_above', conditionValue: '260', name: 'AAPL breakout', assetType: 'equity' },
                };
                const t = templates[e.target.value];
                if (t && Object.keys(t).length > 0) {
                  setNewAlert(prev => ({ ...prev, ...t }));
                }
              }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="">-- Select a template or create custom --</option>
              <optgroup label="🪙 Crypto">
                <option value="btc_dip">BTC Dip Alert ($90K)</option>
                <option value="btc_ath">BTC ATH Zone ($110K)</option>
                <option value="eth_dip">ETH Dip Alert ($3K)</option>
                <option value="sol_breakout">SOL Breakout ($250)</option>
              </optgroup>
              <optgroup label="📈 Stocks">
                <option value="spy_correction">SPY Correction (2% drop)</option>
                <option value="spy_rally">SPY Rally Day (1.5% up)</option>
                <option value="nvda_dip">NVDA Dip Buy ($130)</option>
                <option value="aapl_breakout">AAPL Breakout ($260)</option>
              </optgroup>
            </select>
          </div>

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
          // Price Alerts Tab
          (() => {
            const priceAlerts = alerts.filter(a => !a.is_smart_alert && !a.is_multi_condition);
            return priceAlerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🔕</div>
              <p className="text-slate-400 mb-2">No price alerts yet</p>
              <p className="text-sm text-slate-500">
                Create price alerts to get notified when markets move
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {priceAlerts.map(alert => (
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
          );
          })()
        ) : activeTab === 'smart' ? (
          // Smart Alerts Tab
          <div>
            {/* Smart Alert Create Form */}
            {tier === 'pro_trader' ? (
              <>
                {!showSmartCreate ? (
                  <button
                    onClick={() => setShowSmartCreate(true)}
                    className="w-full p-4 border-2 border-dashed border-slate-600 hover:border-emerald-500/50 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors mb-4"
                  >
                    + Create Smart Alert (AI-Powered)
                  </button>
                ) : (
                  <div className="p-4 bg-slate-900/70 rounded-lg border border-emerald-500/30 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">🧠</span>
                      <h4 className="font-semibold text-white">New Smart Alert</h4>
                    </div>

                    {/* Quick Smart Alert Templates */}
                    <div className="mb-4">
                      <label className="text-xs text-slate-400 block mb-1">⚡ Quick Template (or create custom below)</label>
                      <select
                        onChange={e => {
                          const templates: Record<string, any> = {
                            '': {},
                            // Custom Strategy Alert - starts with strategy type selected
                            'custom_strategy': { symbol: '', conditionType: 'strategy_buy_signal', conditionValue: '0', name: '', cooldownMinutes: 60, strategy: 'ema_crossover', timeframe: 'daily' },
                            // Scanner Signal Alerts
                            'btc_buy_signal': { symbol: 'BTCUSDT', conditionType: 'scanner_buy_signal', conditionValue: '65', name: 'BTC Buy Signal', cooldownMinutes: 60 },
                            'btc_sell_signal': { symbol: 'BTCUSDT', conditionType: 'scanner_sell_signal', conditionValue: '35', name: 'BTC Sell Signal', cooldownMinutes: 60 },
                            // Open Interest Alerts
                            'btc_oi_surge': { symbol: 'BTC', conditionType: 'oi_surge', conditionValue: '5', name: 'BTC OI Spike', cooldownMinutes: 60 },
                            'extreme_fear': { symbol: '', conditionType: 'fear_extreme', conditionValue: '25', name: 'Extreme Fear Buy Signal', cooldownMinutes: 1440 },
                            'extreme_greed': { symbol: '', conditionType: 'greed_extreme', conditionValue: '75', name: 'Extreme Greed Sell Signal', cooldownMinutes: 1440 },
                          };
                          const t = templates[e.target.value];
                          if (t && Object.keys(t).length > 0) {
                            setNewSmartAlert(prev => ({ ...prev, ...t }));
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="">-- Select a template or create custom --</option>
                        <optgroup label="📊 Strategy Alerts (Pick Any Ticker!)">
                          <option value="custom_strategy">🎯 Custom Strategy Alert (Any Ticker + Strategy)</option>
                        </optgroup>
                        <optgroup label="🎯 Scanner Signals">
                          <option value="btc_buy_signal">BTC Scanner Buy Signal</option>
                          <option value="btc_sell_signal">BTC Scanner Sell Signal</option>
                        </optgroup>
                        <optgroup label="📊 Market Sentiment">
                          <option value="btc_oi_surge">BTC OI Spike</option>
                          <option value="extreme_fear">Extreme Fear (Buy Opportunity)</option>
                          <option value="extreme_greed">Extreme Greed (Sell Signal)</option>
                        </optgroup>
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Alert Type</label>
                        <select
                          value={newSmartAlert.conditionType}
                          onChange={e => {
                            const type = e.target.value;
                            setNewSmartAlert(prev => ({ 
                              ...prev, 
                              conditionType: type as any,
                              conditionValue: getSmartAlertDefaultValue(type)
                            }));
                          }}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <optgroup label="📊 Strategy Alerts (Backtest)">
                            <option value="strategy_buy_signal">📈 Strategy Buy Signal</option>
                            <option value="strategy_sell_signal">📉 Strategy Sell Signal</option>
                            <option value="strategy_entry">🎯 Strategy Entry</option>
                            <option value="strategy_exit">🚪 Strategy Exit</option>
                          </optgroup>
                          <optgroup label="🎯 Scanner Signals">
                            <option value="scanner_buy_signal">🟢 Buy Signal (Score Above)</option>
                            <option value="scanner_sell_signal">🔴 Sell Signal (Score Below)</option>
                            <option value="scanner_bullish_flip">🐂 Bullish Flip (Direction Change)</option>
                            <option value="scanner_bearish_flip">🐻 Bearish Flip (Direction Change)</option>
                            <option value="scanner_score_above">📈 Score Above Threshold</option>
                            <option value="scanner_score_below">📉 Score Below Threshold</option>
                          </optgroup>
                          <optgroup label="Open Interest">
                            <option value="oi_surge">📈 OI Surge</option>
                            <option value="oi_drop">📉 OI Drop</option>
                            <option value="oi_divergence_bull">🐂 Bullish Divergence</option>
                            <option value="oi_divergence_bear">🐻 Bearish Divergence</option>
                          </optgroup>
                          <optgroup label="Funding Rates">
                            <option value="funding_extreme_pos">🔴 High Funding (Bearish)</option>
                            <option value="funding_extreme_neg">🟢 Negative Funding (Bullish)</option>
                          </optgroup>
                          <optgroup label="Long/Short Ratio">
                            <option value="ls_ratio_high">⚠️ Crowded Longs</option>
                            <option value="ls_ratio_low">⚠️ Crowded Shorts</option>
                          </optgroup>
                          <optgroup label="Fear & Greed">
                            <option value="fear_extreme">😱 Extreme Fear</option>
                            <option value="greed_extreme">🤑 Extreme Greed</option>
                          </optgroup>
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Threshold</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newSmartAlert.conditionValue}
                          onChange={e => setNewSmartAlert(prev => ({ ...prev, conditionValue: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 mb-3 p-2 bg-slate-800/50 rounded">
                      💡 {getSmartAlertDescription(newSmartAlert.conditionType)}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Symbol (optional)</label>
                        <input
                          type="text"
                          placeholder="BTC, ETH, or leave for market-wide"
                          value={newSmartAlert.symbol}
                          onChange={e => setNewSmartAlert(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Cooldown (min)</label>
                        <select
                          value={newSmartAlert.cooldownMinutes}
                          onChange={e => setNewSmartAlert(prev => ({ ...prev, cooldownMinutes: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value={30}>30 min</option>
                          <option value={60}>1 hour</option>
                          <option value={240}>4 hours</option>
                          <option value={1440}>24 hours</option>
                        </select>
                      </div>
                    </div>

                    {/* Strategy-specific options - show ticker + strategy + timeframe */}
                    {newSmartAlert.conditionType?.startsWith('strategy_') && (
                      <div className="mb-3 p-3 bg-slate-800/50 rounded-lg border border-emerald-500/20">
                        <p className="text-xs text-emerald-400 mb-2">📊 Configure your strategy alert:</p>
                        
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="text-xs text-white block mb-1">🎯 Ticker *</label>
                            <input
                              type="text"
                              placeholder="BTC, AAPL, TSLA..."
                              value={newSmartAlert.symbol}
                              onChange={e => setNewSmartAlert(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                              className="w-full px-3 py-2 bg-slate-900 border border-emerald-500/50 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white block mb-1">📈 Strategy</label>
                            <select
                              value={(newSmartAlert as any).strategy || 'ema_crossover'}
                              onChange={e => setNewSmartAlert(prev => ({ ...prev, strategy: e.target.value } as any))}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                            >
                              <optgroup label="🔥 MSP Elite">
                                <option value="msp_day_trader">MSP Day Trader</option>
                                <option value="msp_day_trader_v3">Day Trader v3 Optimized</option>
                                <option value="msp_day_trader_v3_aggressive">Day Trader v3 Aggressive</option>
                                <option value="msp_trend_pullback">MSP Trend Pullback</option>
                                <option value="msp_liquidity_reversal">Liquidity Reversal</option>
                              </optgroup>
                              <optgroup label="⚡ Scalping">
                                <option value="scalp_vwap_bounce">VWAP Bounce</option>
                                <option value="scalp_orb_15">Opening Range Breakout</option>
                                <option value="scalp_momentum_burst">Momentum Burst</option>
                                <option value="scalp_mean_revert">Mean Reversion</option>
                              </optgroup>
                              <optgroup label="🎯 Swing">
                                <option value="swing_pullback_buy">Pullback Buy</option>
                                <option value="swing_breakout">Breakout Swing</option>
                                <option value="swing_earnings_drift">Post-Earnings Drift</option>
                              </optgroup>
                              <optgroup label="Moving Averages">
                                <option value="ema_crossover">EMA Crossover (9/21)</option>
                                <option value="sma_crossover">SMA Crossover (50/200)</option>
                                <option value="triple_ema">Triple EMA Ribbon</option>
                              </optgroup>
                              <optgroup label="Momentum">
                                <option value="rsi_reversal">RSI Mean Reversion</option>
                                <option value="rsi_trend">RSI Trend Following</option>
                                <option value="macd_crossover">MACD Crossover</option>
                                <option value="macd_momentum">MACD Momentum</option>
                              </optgroup>
                              <optgroup label="Volatility">
                                <option value="bbands_squeeze">Bollinger Squeeze</option>
                                <option value="bbands_breakout">Bollinger Breakout</option>
                                <option value="supertrend">SuperTrend</option>
                              </optgroup>
                              <optgroup label="Multi-Indicator">
                                <option value="multi_ema_rsi">EMA + RSI</option>
                                <option value="multi_macd_adx">MACD + ADX</option>
                                <option value="multi_bb_stoch">BB + Stochastic</option>
                                <option value="multi_confluence_5">5-Indicator Confluence</option>
                              </optgroup>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-white block mb-1">⏱️ Timeframe</label>
                            <select
                              value={(newSmartAlert as any).timeframe || 'daily'}
                              onChange={e => setNewSmartAlert(prev => ({ ...prev, timeframe: e.target.value } as any))}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 focus:outline-none"
                            >
                              <option value="1min">1 Minute</option>
                              <option value="5min">5 Minutes</option>
                              <option value="15min">15 Minutes</option>
                              <option value="30min">30 Minutes</option>
                              <option value="60min">1 Hour</option>
                              <option value="daily">Daily</option>
                            </select>
                          </div>
                        </div>
                        
                        <p className="text-xs text-slate-500">
                          💡 Crypto uses Binance data • Stocks use Alpha Vantage • Check every 15 min
                        </p>
                      </div>
                    )}

                    {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowSmartCreate(false)}
                        className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createSmartAlert}
                        disabled={creating}
                        className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {creating ? 'Creating...' : 'Create Smart Alert'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">🧠</span>
                  <div>
                    <h4 className="font-semibold text-white">Smart Alerts - Pro Trader Only</h4>
                    <p className="text-sm text-slate-400">
                      Get AI-powered alerts on OI spikes, funding extremes, and sentiment shifts
                    </p>
                  </div>
                </div>
                <a 
                  href="/pricing" 
                  className="inline-block mt-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Upgrade to Pro Trader
                </a>
              </div>
            )}

            {/* Smart Alerts List */}
            {(() => {
              const smartAlerts = alerts.filter(a => a.is_smart_alert);
              return smartAlerts.length === 0 ? (
                tier === 'pro_trader' ? (
                  <div className="text-center py-6">
                    <p className="text-slate-500 text-sm">No smart alerts yet. Create one above!</p>
                  </div>
                ) : null
              ) : (
                <div className="space-y-2">
                  {smartAlerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        alert.is_active
                          ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50'
                          : 'bg-slate-900/30 border-slate-700/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🧠</span>
                          <span className="font-semibold text-purple-300">
                            {getConditionLabel(alert.condition_type)}
                          </span>
                          <span className="font-mono text-white text-sm">
                            {alert.condition_value}
                            {['fear_extreme', 'greed_extreme'].includes(alert.condition_type) ? '' : 
                             ['ls_ratio_high', 'ls_ratio_low'].includes(alert.condition_type) ? ' ratio' : '%'}
                          </span>
                          {alert.symbol && alert.symbol !== 'MARKET' && (
                            <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                              {alert.symbol}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {alert.triggered_at && (
                            <span className="text-xs text-amber-400">
                              {alert.trigger_count}x
                            </span>
                          )}
                          <button
                            onClick={() => toggleAlert(alert.id, alert.is_active)}
                            className={`p-1.5 rounded transition-colors ${
                              alert.is_active
                                ? 'text-purple-400 hover:bg-purple-500/20'
                                : 'text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            {alert.is_active ? '⏸' : '▶'}
                          </button>
                          <button
                            onClick={() => deleteAlert(alert.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Cooldown: {alert.cooldown_minutes || 60}min • {alert.is_recurring ? 'Recurring' : 'One-time'}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : activeTab === 'multi' ? (
          // Multi-Condition Alerts Tab
          <div>
            {/* Multi-Condition Alert Create Form */}
            {tier !== 'free' ? (
              <>
                {!showMultiCreate ? (
                  <button
                    onClick={() => setShowMultiCreate(true)}
                    className="w-full p-4 border-2 border-dashed border-purple-500/30 hover:border-purple-500/50 rounded-lg text-slate-400 hover:text-purple-400 transition-colors mb-4"
                  >
                    + Create Multi-Condition Alert
                  </button>
                ) : (
                  <div className="mb-4">
                    <MultiConditionAlertBuilder
                      symbol={newAlert.symbol || 'BTC'}
                      assetType={newAlert.assetType}
                      onCancel={() => setShowMultiCreate(false)}
                      creating={creating}
                      onSave={async (alertData) => {
                        setCreating(true);
                        setError('');
                        try {
                          const res = await fetch('/api/alerts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              symbol: alertData.symbol,
                              assetType: alertData.assetType,
                              conditionType: 'multi',
                              conditionValue: 0,
                              name: alertData.name,
                              isMultiCondition: true,
                              conditionLogic: alertData.conditionLogic,
                              conditions: alertData.conditions.map(c => ({
                                conditionType: c.conditionType,
                                conditionValue: parseFloat(c.conditionValue),
                                conditionTimeframe: c.conditionTimeframe,
                                conditionIndicator: c.conditionIndicator,
                                conditionPeriod: c.conditionPeriod,
                              })),
                              isRecurring: alertData.isRecurring,
                              notifyEmail: alertData.notifyEmail,
                              notifyPush: true,
                            }),
                          });
                          const data = await res.json();
                          if (data.error) {
                            setError(data.message || data.error);
                          } else {
                            setShowMultiCreate(false);
                            fetchAlerts();
                          }
                        } catch (err) {
                          setError('Failed to create alert');
                        } finally {
                          setCreating(false);
                        }
                      }}
                    />
                    {error && (
                      <p className="text-red-400 text-sm mt-2">{error}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <h4 className="font-semibold text-white">Multi-Condition Alerts - Pro Required</h4>
                    <p className="text-sm text-slate-400">
                      Create alerts with multiple conditions (e.g., Price above $50K AND RSI below 30)
                    </p>
                  </div>
                </div>
                <a 
                  href="/pricing" 
                  className="inline-block mt-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Upgrade to Pro
                </a>
              </div>
            )}

            {/* Multi-Condition Alerts List */}
            {(() => {
              const multiAlerts = alerts.filter(a => a.is_multi_condition);
              return multiAlerts.length === 0 ? (
                tier !== 'free' ? (
                  <div className="text-center py-6">
                    <p className="text-slate-500 text-sm">No multi-condition alerts yet. Create one above!</p>
                  </div>
                ) : null
              ) : (
                <div className="space-y-2">
                  {multiAlerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        alert.is_active
                          ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50'
                          : 'bg-slate-900/30 border-slate-700/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🔗</span>
                          <span className="font-mono text-lg font-bold text-purple-400">
                            {alert.symbol}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            alert.condition_logic === 'AND' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {alert.condition_logic}
                          </span>
                          {alert.is_recurring && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                              🔄
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAlert(alert.id, alert.is_active)}
                            className={`p-1.5 rounded transition-colors ${
                              alert.is_active
                                ? 'text-emerald-400 hover:bg-emerald-500/20'
                                : 'text-slate-500 hover:bg-slate-700'
                            }`}
                          >
                            {alert.is_active ? '⏸' : '▶'}
                          </button>
                          <button
                            onClick={() => deleteAlert(alert.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      {/* Conditions Display */}
                      {alert.conditions && alert.conditions.length > 0 && (
                        <div className="space-y-1 pl-7">
                          {alert.conditions.map((cond, idx) => (
                            <div key={cond.id} className="flex items-center gap-2 text-sm">
                              {idx > 0 && (
                                <span className={`text-xs ${
                                  alert.condition_logic === 'AND' ? 'text-emerald-500' : 'text-amber-500'
                                }`}>
                                  {alert.condition_logic}
                                </span>
                              )}
                              <span className={`w-2 h-2 rounded-full ${cond.is_met ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                              <span className="text-slate-400">
                                {getConditionLabel(cond.condition_type)}
                              </span>
                              <span className="font-mono text-white">
                                {cond.condition_value}
                                {cond.condition_period && <span className="text-slate-500"> ({cond.condition_period})</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-500 mt-2 pl-7">
                        {alert.name}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : activeTab === 'history' ? (
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
        ) : null}
      </div>

      {/* Quota warning */}
      {quota && quota.used >= quota.max && (
        <div className="p-3 bg-amber-500/10 border-t border-amber-500/20">
          <p className="text-sm text-amber-400">
            ⚠️ Alert limit reached. Upgrade to {quota.tier === 'free' ? 'Pro' : 'Pro Trader'} for more alerts.
          </p>
        </div>
      )}

      {/* Push Notification Settings */}
      <div className="p-4 border-t border-slate-700">
        <PushNotificationSettings compact />
      </div>
    </div>
  );
}
