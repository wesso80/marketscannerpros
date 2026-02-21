'use client';

import { Suspense, useEffect, useMemo, useState } from "react";
import { ToolsPageHeader } from "@/components/ToolsPageHeader";
import AlertsWidget from "@/components/AlertsWidget";
import { useUserTier } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { useAIPageContext } from "@/lib/ai/pageContext";
import { useRiskPermission } from "@/components/risk/RiskPermissionContext";
import RegimeBanner from '@/components/RegimeBanner';

type AlertItem = {
  id: string;
  symbol: string;
  condition_type: string;
  condition_value: number;
  is_active: boolean;
  trigger_count: number;
  triggered_at?: string;
  is_smart_alert?: boolean;
  is_multi_condition?: boolean;
  cooldown_minutes?: number | null;
};

type AlertHistoryItem = {
  id: string;
  symbol: string;
  triggered_at: string;
  condition_met: string;
  condition_type?: string;
  user_action?: string | null;
  alert_name: string;
};

type NotificationPrefs = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  discord_enabled: boolean;
  discord_webhook_url: string | null;
};

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[80px] flex-1 rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function StatusBadge({ label, state }: { label: string; state: string }) {
  const good = ['enabled', 'connected', 'active'].includes(state.toLowerCase());
  return (
    <div className={`rounded-xl border px-3 py-1.5 text-xs ${good ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
      <span className="text-slate-300">{label}: </span>{state}
    </div>
  );
}

function classifyAlertType(alert: AlertItem): 'Basic' | 'Strategy' | 'Multi' {
  if (alert.is_multi_condition) return 'Multi';
  if (alert.is_smart_alert || alert.condition_type.startsWith('strategy_') || alert.condition_type.startsWith('scanner_')) {
    return 'Strategy';
  }
  return 'Basic';
}

function deriveStatus(alert: AlertItem): 'Armed' | 'Cooldown' | 'Disabled' {
  if (!alert.is_active) return 'Disabled';
  if (!alert.triggered_at || !alert.cooldown_minutes) return 'Armed';
  const ms = Date.now() - new Date(alert.triggered_at).getTime();
  return ms < alert.cooldown_minutes * 60_000 ? 'Cooldown' : 'Armed';
}

function fmtDateTime(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function avgTriggerInterval(history: AlertHistoryItem[]) {
  if (history.length < 2) return 'N/A';
  const sorted = [...history]
    .map((h) => new Date(h.triggered_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (sorted.length < 2) return 'N/A';
  let total = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    total += Math.abs(sorted[i] - sorted[i + 1]);
  }
  const avgMin = Math.round(total / (sorted.length - 1) / 60000);
  if (avgMin < 60) return `${avgMin}m`;
  const hours = (avgMin / 60).toFixed(1);
  return `${hours}h`;
}

function AlertsContent() {
  const { tier, isLoading } = useUserTier();
  const { isLocked: riskLocked } = useRiskPermission();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [consoleTab, setConsoleTab] = useState<'basic' | 'strategy' | 'smart' | 'triggered'>('basic');
  const [zone3Open, setZone3Open] = useState(true);
  const [zone4Open, setZone4Open] = useState(false);
  const [activeZone4Tab, setActiveZone4Tab] = useState<'basic' | 'strategy' | 'multi'>('basic');

  // AI Page Context - share alerts page state with copilot
  const { setPageData } = useAIPageContext();

  const fetchAll = async () => {
    setLoadingData(true);
    try {
      const [alertsRes, historyRes, prefsRes] = await Promise.all([
        fetch('/api/alerts', { cache: 'no-store' }),
        fetch('/api/alerts/history?limit=30', { cache: 'no-store' }),
        fetch('/api/notifications/prefs', { cache: 'no-store' }),
      ]);

      const alertsJson = await alertsRes.json().catch(() => ({}));
      const historyJson = await historyRes.json().catch(() => ({}));
      const prefsJson = await prefsRes.json().catch(() => ({}));

      setAlerts(Array.isArray(alertsJson?.alerts) ? alertsJson.alerts : []);
      setHistory(Array.isArray(historyJson?.history) ? historyJson.history : []);
      setPrefs(prefsJson?.prefs || null);
    } catch {
      setAlerts([]);
      setHistory([]);
      setPrefs(null);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const activeAlerts = useMemo(() => alerts.filter((a) => a.is_active), [alerts]);
  const triggeredToday = useMemo(() => {
    const today = new Date();
    return history.filter((h) => {
      const d = new Date(h.triggered_at);
      return d.toDateString() === today.toDateString();
    }).length;
  }, [history]);

  const smartPct = useMemo(() => {
    if (activeAlerts.length === 0) return 0;
    const smart = activeAlerts.filter((a) => a.is_smart_alert || a.condition_type.startsWith('strategy_') || a.condition_type.startsWith('scanner_')).length;
    return Math.round((smart / activeAlerts.length) * 100);
  }, [activeAlerts]);

  const mostActiveSymbol = useMemo(() => {
    if (history.length === 0) return 'N/A';
    const counts = new Map<string, number>();
    for (const row of history) {
      counts.set(row.symbol, (counts.get(row.symbol) || 0) + 1);
    }
    let topSymbol = 'N/A';
    let topCount = -1;
    for (const [symbol, count] of counts.entries()) {
      if (count > topCount) {
        topSymbol = symbol;
        topCount = count;
      }
    }
    return topSymbol;
  }, [history]);

  const pendingCooldowns = useMemo(() => activeAlerts.filter((a) => deriveStatus(a) === 'Cooldown').length, [activeAlerts]);

  const alertRows = useMemo(() => {
    const filtered = activeAlerts.filter((alert) => {
      const isSmart = Boolean(alert.is_smart_alert || alert.condition_type.startsWith('strategy_') || alert.condition_type.startsWith('scanner_'));
      const isMulti = Boolean(alert.is_multi_condition);
      if (consoleTab === 'basic') return !isSmart && !isMulti;
      if (consoleTab === 'strategy') return isSmart && !isMulti;
      if (consoleTab === 'smart') return isSmart;
      return alert.trigger_count > 0;
    });
    return filtered.slice(0, 12);
  }, [activeAlerts, consoleTab]);

  const toggleAlert = async (alert: AlertItem) => {
    await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alert.id, isActive: !alert.is_active }),
    });
    await fetchAll();
  };

  const deleteAlert = async (id: string) => {
    await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
    await fetchAll();
  };

  const editAlert = (alert: AlertItem) => {
    const type = classifyAlertType(alert);
    setActiveZone4Tab(type === 'Multi' ? 'multi' : type === 'Strategy' ? 'strategy' : 'basic');
    setZone4Open(true);
  };

  useEffect(() => {
    setPageData({
      skill: 'watchlist',
      symbols: activeAlerts.map((a) => a.symbol),
      data: {
        pageType: 'alerts',
        tier,
        activeAlerts: activeAlerts.length,
        triggeredToday,
      },
      summary: `Alert Radar Console: ${activeAlerts.length} active, ${triggeredToday} triggered today`,
    });
  }, [tier, setPageData, activeAlerts, triggeredToday]);

  if (isLoading || loadingData) {
    return (
      <div className="max-w-none mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-4 py-6 md:px-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-3 md:h-[88px] md:px-6">
        <div className="grid h-full grid-cols-1 items-center gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="flex gap-2 lg:gap-3">
            <MetricPill label="Active" value={`${activeAlerts.length}`} />
            <MetricPill label="Triggered Today" value={`${triggeredToday}`} />
            <MetricPill label="Smart %" value={`${smartPct}%`} />
          </div>

          <div className="flex justify-start gap-2 lg:justify-center">
            <StatusBadge label="Push" state={prefs?.in_app_enabled ? 'Enabled' : 'Disabled'} />
            <StatusBadge label="Webhook" state={prefs?.discord_enabled && prefs?.discord_webhook_url ? 'Connected' : 'Not Set'} />
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/30 p-1">
              <button onClick={() => { setActiveZone4Tab('basic'); setZone4Open(true); }} className={`h-7 rounded-md px-2 text-[11px] font-semibold ${activeZone4Tab === 'basic' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>
                Basic
              </button>
              <button onClick={() => { setActiveZone4Tab('strategy'); setZone4Open(true); }} className={`h-7 rounded-md px-2 text-[11px] font-semibold ${activeZone4Tab === 'strategy' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>
                Strategy
              </button>
              <button onClick={() => { setActiveZone4Tab('multi'); setZone4Open(true); }} className={`h-7 rounded-md px-2 text-[11px] font-semibold ${activeZone4Tab === 'multi' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>
                Multi
              </button>
            </div>
            <button onClick={() => { setActiveZone4Tab('basic'); setZone4Open(true); }} disabled={riskLocked} className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-100 disabled:opacity-50">
              Quick Alert
            </button>
            <button onClick={() => { setActiveZone4Tab('multi'); setZone4Open(true); }} disabled={riskLocked} className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50">
              + New Alert
            </button>
          </div>
        </div>
        {riskLocked && (
          <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Tracking Lock active: alert automation remains notification-only until rule guard unlocks.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 md:p-4">
        <div className="mb-3 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex h-9 rounded-lg border border-slate-700 bg-slate-950/30 p-1">
            <button onClick={() => setConsoleTab('basic')} className={`h-7 rounded-md px-3 text-xs font-semibold ${consoleTab === 'basic' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>Basic</button>
            <button onClick={() => setConsoleTab('strategy')} className={`h-7 rounded-md px-3 text-xs font-semibold ${consoleTab === 'strategy' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>Strategy</button>
            <button onClick={() => setConsoleTab('smart')} className={`h-7 rounded-md px-3 text-xs font-semibold ${consoleTab === 'smart' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>Smart</button>
            <button onClick={() => setConsoleTab('triggered')} className={`h-7 rounded-md px-3 text-xs font-semibold ${consoleTab === 'triggered' ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'}`}>Triggered</button>
          </div>
          <div className="text-xs text-slate-400">{alertRows.length} shown</div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:gap-6">
          <div className="rounded-xl border border-slate-800 bg-slate-950/25">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Active Alerts Console</div>
            {alertRows.length === 0 ? (
              <div className="px-4 py-5 text-sm text-slate-400">No active alerts. Use Quick Alert or New Alert to arm your radar.</div>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                {alertRows.map((alert) => {
                  const status = deriveStatus(alert);
                  const type = classifyAlertType(alert);
                  return (
                    <div key={alert.id} className="group border-b border-slate-800 px-3 py-2 sm:h-[60px] sm:py-0">
                      <div className="flex h-full flex-col justify-center gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex items-center gap-2 overflow-hidden sm:gap-3">
                          <span className="min-w-[56px] rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 text-xs font-semibold text-slate-100">{alert.symbol}</span>
                          <span className="truncate text-sm font-semibold text-slate-100">{alert.condition_type.replaceAll('_', ' ')} {alert.condition_value}</span>
                          <span className="hidden rounded bg-white/5 px-2 py-0.5 text-xs text-slate-400 sm:inline">{type}</span>
                        </div>

                        <div className="flex items-center gap-2 sm:ml-auto sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                          <span className="hidden text-xs text-slate-400 sm:inline">Triggered {alert.trigger_count}x</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${status === 'Armed' ? 'bg-emerald-500/15 text-emerald-200' : status === 'Cooldown' ? 'bg-amber-500/15 text-amber-200' : 'bg-slate-700 text-slate-300'}`}>
                            {status}
                          </span>
                          <button onClick={() => editAlert(alert)} className="rounded bg-indigo-500/15 px-2 py-1 text-[11px] text-indigo-200">Edit</button>
                          <button onClick={() => void toggleAlert(alert)} className="rounded bg-white/10 px-2 py-1 text-[11px] text-slate-100">{alert.is_active ? 'Pause' : 'Arm'}</button>
                          <button onClick={() => void deleteAlert(alert.id)} className="rounded bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/35 p-3">
            <div className="text-sm font-semibold text-slate-100">Trigger Summary</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Last Trigger: <span className="text-slate-100">{fmtDateTime(history[0]?.triggered_at)}</span></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Most Active Symbol: <span className="text-slate-100">{mostActiveSymbol}</span></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Avg Trigger Interval: <span className="text-slate-100">{avgTriggerInterval(history)}</span></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Pending Cooldowns: <span className="text-slate-100">{pendingCooldowns}</span></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href="/tools/scanner" className="rounded-xl border border-slate-800 bg-slate-200/5 px-3 py-2 text-center text-xs font-semibold text-slate-100">Scanner</a>
              <a href="/tools/journal" className="rounded-xl border border-slate-800 bg-slate-200/5 px-3 py-2 text-center text-xs font-semibold text-slate-100">Journal</a>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <details className="rounded-xl border border-slate-800 bg-slate-900/25" open={zone3Open}>
          <summary onClick={(e) => { e.preventDefault(); setZone3Open((v) => !v); }} className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Trigger Log + Intelligence</div>
              <div className="text-xs text-slate-400">Live educational tracking outcomes and response behavior</div>
            </div>
            <button className="h-7 rounded-lg border border-slate-700 bg-slate-950/30 px-2 text-xs text-slate-300">{zone3Open ? 'Collapse' : 'Expand'}</button>
          </summary>
          <div className="border-t border-slate-800 px-4 py-3">
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-800">
              <table className="min-w-[540px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#0b1220]/95 text-slate-300 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-left">Condition</th>
                    <th className="px-3 py-2 text-left">Action Taken</th>
                    <th className="px-3 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                      <td className="px-3 py-2 text-xs text-slate-300">{fmtDateTime(row.triggered_at)}</td>
                      <td className="px-3 py-2 font-semibold">{row.symbol}</td>
                      <td className="px-3 py-2">{row.condition_met || row.condition_type || row.alert_name}</td>
                      <td className="px-3 py-2">{row.user_action || 'No action'}</td>
                      <td className="px-3 py-2">{row.user_action === 'traded' ? 'Opened Trade' : row.user_action ? 'Handled' : 'Ignored'}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">No triggers logged yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details className="rounded-xl border border-slate-800 bg-slate-900/25" open={zone4Open}>
          <summary onClick={(e) => { e.preventDefault(); setZone4Open((v) => !v); }} className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Alert Capabilities</div>
              <div className="text-xs text-slate-400">Feature set and plan limits (collapsed by default)</div>
            </div>
            <button className="h-7 rounded-lg border border-slate-700 bg-slate-950/30 px-2 text-xs text-slate-300">{zone4Open ? 'Collapse' : 'Expand'}</button>
          </summary>
          <div className="space-y-4 border-t border-slate-800 px-4 py-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Price Alerts</div>
                <div className="text-sm text-slate-300">Threshold, percent move, and volume spike conditions.</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Multi-Condition</div>
                <div className="text-sm text-slate-300">AND/OR condition chains with up to 5 combined rules.</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Smart Alerts</div>
                <div className="text-sm text-slate-300">Strategy/scanner-linked triggers with cooldown intelligence.</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Plan & Limits</div>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className={`rounded-lg p-2 ${tier === 'free' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/60'}`}>
                  <div className="text-slate-400">Free</div>
                  <div className="font-semibold text-slate-100">3</div>
                </div>
                <div className={`rounded-lg p-2 ${tier === 'pro' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/60'}`}>
                  <div className="text-slate-400">Pro</div>
                  <div className="font-semibold text-slate-100">25</div>
                </div>
                <div className={`rounded-lg p-2 ${tier === 'pro_trader' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/60'}`}>
                  <div className="text-slate-400">Pro Trader</div>
                  <div className="font-semibold text-slate-100">∞</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                <button onClick={() => setActiveZone4Tab('basic')} className={`rounded-lg px-3 py-1.5 text-xs ${activeZone4Tab === 'basic' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/10 text-slate-200'}`}>Basic</button>
                <button onClick={() => setActiveZone4Tab('strategy')} className={`rounded-lg px-3 py-1.5 text-xs ${activeZone4Tab === 'strategy' ? 'bg-indigo-500/15 text-indigo-200' : 'bg-white/10 text-slate-200'}`}>Strategy</button>
                <button onClick={() => setActiveZone4Tab('multi')} className={`rounded-lg px-3 py-1.5 text-xs ${activeZone4Tab === 'multi' ? 'bg-purple-500/15 text-purple-200' : 'bg-white/10 text-slate-200'}`}>Multi</button>
              </div>
              <AlertsWidget compact={false} className="!border-slate-800 !bg-transparent" />
            </div>

            {tier === 'free' && <UpgradeGate requiredTier="pro" feature="more price alerts" />}
          </div>
        </details>
      </section>

    </div>
  );
}

export default function AlertsPage() {
  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader 
        badge="TOOLS"
        title="Alert Intelligence"
        subtitle="Detect, validate, execute, and learn from triggered market events"
        icon="🔔"
      />
      <div className="max-w-none mx-auto px-4 pt-4">
        <RegimeBanner />
      </div>
      <Suspense fallback={
        <div className="max-w-none mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-slate-800 rounded"></div>
          </div>
        </div>
      }>
        <AlertsContent />
      </Suspense>
    </div>
  );
}
