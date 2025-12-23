'use client';

import { useState } from 'react';

interface Condition {
  id: string;
  conditionType: string;
  conditionValue: string;
  conditionTimeframe?: string;
  conditionIndicator?: string;
  conditionPeriod?: number;
}

interface MultiConditionAlertBuilderProps {
  symbol: string;
  assetType: 'crypto' | 'equity' | 'forex' | 'commodity';
  onCancel: () => void;
  onSave: (alert: {
    symbol: string;
    assetType: string;
    name: string;
    conditionLogic: 'AND' | 'OR';
    conditions: Condition[];
    isRecurring: boolean;
    notifyEmail: boolean;
  }) => void;
  creating?: boolean;
}

// Base condition type
interface BaseConditionConfig {
  value: string;
  label: string;
  unit: string;
  placeholder: string;
}

// Technical condition type with indicator info
interface TechnicalConditionConfig extends BaseConditionConfig {
  indicator: string;
  defaultPeriod?: number;
}

type ConditionConfig = BaseConditionConfig | TechnicalConditionConfig;

// Type guard for technical conditions
function isTechnicalCondition(config: ConditionConfig): config is TechnicalConditionConfig {
  return 'indicator' in config;
}

// Condition type definitions with categories
const CONDITION_CATEGORIES: Record<string, { label: string; conditions: ConditionConfig[] }> = {
  price: {
    label: '💰 Price',
    conditions: [
      { value: 'price_above', label: 'Price Above', unit: '$', placeholder: 'e.g., 50000' },
      { value: 'price_below', label: 'Price Below', unit: '$', placeholder: 'e.g., 45000' },
      { value: 'percent_change_up', label: 'Price Up %', unit: '%', placeholder: 'e.g., 5' },
      { value: 'percent_change_down', label: 'Price Down %', unit: '%', placeholder: 'e.g., 5' },
    ],
  },
  volume: {
    label: '📊 Volume',
    conditions: [
      { value: 'volume_above', label: 'Volume Above', unit: '', placeholder: 'e.g., 1000000' },
      { value: 'volume_below', label: 'Volume Below', unit: '', placeholder: 'e.g., 500000' },
      { value: 'volume_spike', label: 'Volume Spike %', unit: '%', placeholder: 'e.g., 200' },
    ],
  },
  technical: {
    label: '📈 Technical',
    conditions: [
      { value: 'rsi_above', label: 'RSI Above', unit: '', placeholder: 'e.g., 70', indicator: 'RSI', defaultPeriod: 14 },
      { value: 'rsi_below', label: 'RSI Below', unit: '', placeholder: 'e.g., 30', indicator: 'RSI', defaultPeriod: 14 },
      { value: 'macd_cross_up', label: 'MACD Cross Up', unit: '', placeholder: '0', indicator: 'MACD' },
      { value: 'macd_cross_down', label: 'MACD Cross Down', unit: '', placeholder: '0', indicator: 'MACD' },
      { value: 'sma_cross_above', label: 'Price > SMA', unit: '', placeholder: 'SMA value', indicator: 'SMA', defaultPeriod: 50 },
      { value: 'sma_cross_below', label: 'Price < SMA', unit: '', placeholder: 'SMA value', indicator: 'SMA', defaultPeriod: 50 },
      { value: 'ema_cross_above', label: 'Price > EMA', unit: '', placeholder: 'EMA value', indicator: 'EMA', defaultPeriod: 21 },
      { value: 'ema_cross_below', label: 'Price < EMA', unit: '', placeholder: 'EMA value', indicator: 'EMA', defaultPeriod: 21 },
    ],
  },
  derivatives: {
    label: '🔮 Derivatives',
    conditions: [
      { value: 'oi_above', label: 'OI Above', unit: '', placeholder: 'e.g., 500000000' },
      { value: 'oi_below', label: 'OI Below', unit: '', placeholder: 'e.g., 200000000' },
      { value: 'oi_change_up', label: 'OI Change Up %', unit: '%', placeholder: 'e.g., 5' },
      { value: 'oi_change_down', label: 'OI Change Down %', unit: '%', placeholder: 'e.g., 5' },
      { value: 'funding_above', label: 'Funding Above', unit: '%', placeholder: 'e.g., 0.05' },
      { value: 'funding_below', label: 'Funding Below', unit: '%', placeholder: 'e.g., -0.05' },
    ],
  },
};

// Flatten conditions for lookup
const ALL_CONDITIONS = Object.values(CONDITION_CATEGORIES).flatMap(cat => cat.conditions);

function getConditionConfig(type: string) {
  return ALL_CONDITIONS.find(c => c.value === type) || ALL_CONDITIONS[0];
}

export default function MultiConditionAlertBuilder({
  symbol,
  assetType,
  onCancel,
  onSave,
  creating = false,
}: MultiConditionAlertBuilderProps) {
  const [name, setName] = useState('');
  const [conditionLogic, setConditionLogic] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<Condition[]>([
    { id: '1', conditionType: 'price_above', conditionValue: '' },
    { id: '2', conditionType: 'rsi_above', conditionValue: '70', conditionIndicator: 'RSI', conditionPeriod: 14 },
  ]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);

  const addCondition = () => {
    const newId = String(Date.now());
    setConditions([...conditions, { id: newId, conditionType: 'price_above', conditionValue: '' }]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 2) {
      setConditions(conditions.filter(c => c.id !== id));
    }
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setConditions(conditions.map(c => {
      if (c.id === id) {
        const updated = { ...c, ...updates };
        // Auto-populate indicator info when condition type changes
        if (updates.conditionType) {
          const config = getConditionConfig(updates.conditionType);
          if (isTechnicalCondition(config)) {
            updated.conditionIndicator = config.indicator;
            updated.conditionPeriod = config.defaultPeriod;
          } else {
            updated.conditionIndicator = undefined;
            updated.conditionPeriod = undefined;
          }
        }
        return updated;
      }
      return c;
    }));
  };

  const handleSave = () => {
    // Validate all conditions have values
    const validConditions = conditions.filter(c => c.conditionValue);
    if (validConditions.length < 2) {
      alert('Please add at least 2 conditions with values');
      return;
    }

    onSave({
      symbol,
      assetType,
      name: name || `${symbol} ${validConditions.length} conditions (${conditionLogic})`,
      conditionLogic,
      conditions: validConditions,
      isRecurring,
      notifyEmail,
    });
  };

  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <span>🔗</span> Multi-Condition Alert
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Pro</span>
        </h3>
        <button
          onClick={onCancel}
          className="text-slate-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Alert Name */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-1">Alert Name (optional)</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={`${symbol} custom alert`}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Symbol Display */}
      <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-400 mb-1">Symbol</div>
        <div className="text-lg font-bold text-white">{symbol}</div>
        <div className="text-xs text-slate-500">{assetType.toUpperCase()}</div>
      </div>

      {/* Logic Toggle */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-2">Trigger when...</label>
        <div className="flex gap-2">
          <button
            onClick={() => setConditionLogic('AND')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              conditionLogic === 'AND'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 border'
                : 'bg-slate-800 border-slate-600 text-slate-400 border hover:border-slate-500'
            }`}
          >
            ALL conditions met (AND)
          </button>
          <button
            onClick={() => setConditionLogic('OR')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              conditionLogic === 'OR'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 border'
                : 'bg-slate-800 border-slate-600 text-slate-400 border hover:border-slate-500'
            }`}
          >
            ANY condition met (OR)
          </button>
        </div>
      </div>

      {/* Conditions List */}
      <div className="space-y-3 mb-4">
        {conditions.map((condition, index) => {
          const config = getConditionConfig(condition.conditionType);
          return (
            <div key={condition.id} className="relative">
              {/* Logic connector */}
              {index > 0 && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    conditionLogic === 'AND' 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {conditionLogic}
                  </span>
                </div>
              )}

              <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-3 pt-4">
                <div className="flex items-start gap-2">
                  {/* Condition Type Select */}
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Condition {index + 1}</label>
                    <select
                      value={condition.conditionType}
                      onChange={e => updateCondition(condition.id, { conditionType: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                    >
                      {Object.entries(CONDITION_CATEGORIES).map(([key, cat]) => (
                        <optgroup key={key} label={cat.label}>
                          {cat.conditions.map(cond => (
                            <option key={cond.value} value={cond.value}>
                              {cond.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Value Input */}
                  <div className="w-28">
                    <label className="block text-xs text-slate-500 mb-1">Value</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={condition.conditionValue}
                        onChange={e => updateCondition(condition.id, { conditionValue: e.target.value })}
                        placeholder={config.placeholder}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:border-purple-500 focus:outline-none pr-6"
                      />
                      {config.unit && (
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-500 text-xs">
                          {config.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Period Input (for technical indicators) */}
                  {isTechnicalCondition(config) && (
                    <div className="w-16">
                      <label className="block text-xs text-slate-500 mb-1">Period</label>
                      <input
                        type="number"
                        value={condition.conditionPeriod || config.defaultPeriod || 14}
                        onChange={e => updateCondition(condition.id, { conditionPeriod: parseInt(e.target.value) })}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Remove Button */}
                  {conditions.length > 2 && (
                    <button
                      onClick={() => removeCondition(condition.id)}
                      className="mt-5 p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                      title="Remove condition"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Condition Button */}
      {conditions.length < 5 && (
        <button
          onClick={addCondition}
          className="w-full py-2 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-purple-500 hover:text-purple-400 transition-colors text-sm mb-4"
        >
          + Add Condition
        </button>
      )}

      {/* Options */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={e => setIsRecurring(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
          />
          <span className="text-slate-300">Re-arm after trigger</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyEmail}
            onChange={e => setNotifyEmail(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
          />
          <span className="text-slate-300">Email notification</span>
        </label>
      </div>

      {/* Preview */}
      <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-500 mb-1">Alert will trigger when:</div>
        <div className="text-sm text-slate-300">
          {conditions.filter(c => c.conditionValue).map((c, i, arr) => {
            const config = getConditionConfig(c.conditionType);
            return (
              <span key={c.id}>
                <span className="text-white">{config.label}</span>
                {' '}{c.conditionValue}{config.unit}
                {c.conditionPeriod && <span className="text-slate-500"> ({c.conditionPeriod})</span>}
                {i < arr.length - 1 && (
                  <span className={`mx-1 ${conditionLogic === 'AND' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {' '}{conditionLogic}{' '}
                  </span>
                )}
              </span>
            );
          })}
          {conditions.filter(c => c.conditionValue).length === 0 && (
            <span className="text-slate-500 italic">Add conditions above...</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={creating || conditions.filter(c => c.conditionValue).length < 2}
          className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-white font-medium transition-colors"
        >
          {creating ? 'Creating...' : 'Create Alert'}
        </button>
      </div>
    </div>
  );
}
