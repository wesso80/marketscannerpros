'use client';

import UpgradeMoment, { useUpgradeMoment } from '@/components/free/UpgradeMoment';

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ToolsPageHeader } from "@/components/ToolsPageHeader";
import { avgRetriggerInterval, pushBadgeState, triggersLast24h, type PushBadgeState } from '@/lib/alerts/summaryStats';
import { getNotificationPermission, isPushSupported, isSubscribedToPush } from '@/lib/push';
import AlertsWidget from "@/components/AlertsWidget";
import { useUserTier } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import ComplianceDisclaimer from "@/components/ComplianceDisclaimer";
import { useAIPageContext } from "@/lib/ai/pageContext";
import { useRiskPermission } from "@/components/risk/RiskPermissionContext";
import { alertConditionLabel, alertHistoryLabel } from '@/lib/alertPresentation';
import { isDiscordWebhookUrl } from '@/lib/notifications/discordWebhook';
import { checkedActiveAlerts, consoleAlertType, deriveStatus, legacyMultiAlerts, opensSmartTabFirst, smartAlertShare } from '@/lib/alerts/consoleStatus';
import { ALERT_LIMITS, publishAlertCapNotice } from '@/lib/alerts/planLimits';
import { isPriceAlertWithoutLevel } from '@/lib/alerts/priceOrphan';
import AlertCapNotice from '@/components/alerts/AlertCapNotice';
import RegimeBanner from '@/components/RegimeBanner';
import StatTile from '@/components/visual/StatTile';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import TabBar from '@/components/visual/TabBar';
import AlertRowActions from '@/components/alerts/AlertRowActions';
import { useSearchParams } from 'next/navigation';
import { buildAlertEdit, canEditLevel, consoleListAlerts, consoleRowLabel, symbolFromQuery } from '@/lib/alerts/consoleList';

type AlertItem = {
  id: string;
  symbol: string;
  condition_type: string;
  condition_value: number;
  is_active: boolean;
  trigger_count: number;
  name?: string | null;
  is_recurring?: boolean | null;
  triggered_at?: string;
  is_smart_alert?: boolean;
  is_multi_condition?: boolean;
  cooldown_minutes?: number | null;
};

type AlertHistoryItem = {
  id: string;
  alert_id?: string | null;
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

function StatusBadge({ label, state }: { label: string; state: string }) {
  const good = ['enabled', 'connected', 'active'].includes(state.toLowerCase());
  return (
    <div className={`rounded-xl border px-3 py-1.5 text-xs ${good ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
      <span className="text-slate-300">{label}: </span>{state}
    </div>
  );
}



function fmtDateTime(value?: string) {
  if (!value) return 'Not triggered yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Trigger time not recorded';
  return d.toLocaleString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' });
}

// Avg interval between re-triggers of the same alert (not across all alerts/symbols): see lib/alerts/summaryStats.
const avgTriggerInterval = avgRetriggerInterval;
/** Rows shown in the Alerts Console before "Show all". */
const CONSOLE_ROW_LIMIT = 5;

export function AlertsContent({ embeddedInWorkspace = false }: { embeddedInWorkspace?: boolean } = {}) {
  const upgrade = useUpgradeMoment();
  const { tier, isLoading } = useUserTier();
  const { isLocked: riskLocked } = useRiskPermission();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  // Server's rolling 24h trigger count (all history, not just the rows loaded here).
  const [serverLast24h, setServerLast24h] = useState<number | null>(null);
  // Real push status for this browser (permission + saved subscription).
  const [pushState, setPushState] = useState<PushBadgeState>('Checking');
  const [loadingData, setLoadingData] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | undefined>();
  const [consoleTab, setConsoleTab] = useState<'basic' | 'strategy' | 'smart' | 'triggered'>('basic');
  const [showAllRows, setShowAllRows] = useState(false);
  const [zone3Open, setZone3Open] = useState(false);
  const [zone4Open, setZone4Open] = useState(false);
  const [activeZone4Tab, setActiveZone4Tab] = useState<'basic' | 'strategy'>('basic');
  const [cleanupStatus, setCleanupStatus] = useState<'idle' | 'cleaning' | 'done'>('idle');
  const [cleanupCount, setCleanupCount] = useState(0);
  // Inline edit of one console row (name, and level for price / % alerts).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; level: string }>({ name: '', level: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  // Watchlist "Alert" button links here with ?symbol=X: prefill the new-alert form with it.
  const searchParams = useSearchParams();
  const prefillSymbol = symbolFromQuery(searchParams?.get('symbol'));

  // AI Page Context - share alerts page state with copilot
  const { setPageData } = useAIPageContext();

  const fetchAll = async () => {
    setLoadingData(true);
    setLoadWarning(null);

    const fetchJson = async (url: string) => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`${url} returned ${res.status}`);
        return await res.json().catch(() => ({}));
      } finally {
        window.clearTimeout(timer);
      }
    };

    try {
      const results = await Promise.allSettled([
        fetchJson('/api/alerts'),
        fetchJson('/api/alerts/history?limit=30'),
        fetchJson('/api/notifications/prefs'),
      ]);

      const alertsJson = results[0].status === 'fulfilled' ? results[0].value : {};
      const historyJson = results[1].status === 'fulfilled' ? results[1].value : {};
      const prefsJson = results[2].status === 'fulfilled' ? results[2].value : {};

      setAlerts(Array.isArray(alertsJson?.alerts) ? alertsJson.alerts : []);
      setHistory(Array.isArray(historyJson?.history) ? historyJson.history : []);
      setServerLast24h(typeof historyJson?.stats?.last24h === 'number' ? historyJson.stats.last24h : null);
      setPrefs(prefsJson?.prefs || null);
      setLoadedAt(new Date().toISOString());

      const failed = results
        .map((result, index) => result.status === 'rejected' ? ['alerts', 'history', 'delivery settings'][index] : null)
        .filter(Boolean);
      if (failed.length) {
        setLoadWarning(`Partial alert data: ${failed.join(', ')} could not be loaded. Retry before relying on this view.`);
      }
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supported = isPushSupported();
        const permission = getNotificationPermission();
        const subscribed = supported ? await isSubscribedToPush() : false;
        if (!cancelled) setPushState(pushBadgeState({ supported, permission, subscribed }));
      } catch {
        if (!cancelled) setPushState('Unsupported');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // "Active" = alerts a checker actually evaluates; legacy multi-condition alerts are never checked (TR-25).
  const activeAlerts = useMemo(() => checkedActiveAlerts(alerts), [alerts]);
  const multiAlerts = useMemo(() => legacyMultiAlerts(alerts), [alerts]);
  const triggeredToday = useMemo(() => {
    // Rolling last 24h, from the server's count over all history (TR-20).
    return triggersLast24h(history, serverLast24h);
  }, [history, serverLast24h]);

  // Smart/strategy share of checked active alerts (multi-condition alerts aren't checked, so not counted).
  const smartPct = useMemo(() => smartAlertShare(alerts), [alerts]);

  const mostActiveSymbol = useMemo(() => {
    if (history.length === 0) return 'Not triggered yet';
    const counts = new Map<string, number>();
    for (const row of history) {
      counts.set(row.symbol, (counts.get(row.symbol) || 0) + 1);
    }
    let topSymbol = 'Not triggered yet';
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
    // All alerts, active first: paused and fired one-time alerts stay visible so they can be re-armed or deleted.
    const filtered = consoleListAlerts(alerts).filter((alert) => {
      const isSmart = Boolean(alert.is_smart_alert || (alert.condition_type ?? '').startsWith('strategy_') || (alert.condition_type ?? '').startsWith('scanner_'));
      const isMulti = Boolean(alert.is_multi_condition);
      if (consoleTab === 'basic') return !isSmart && !isMulti;
      if (consoleTab === 'strategy') return isSmart && !isMulti;
      if (consoleTab === 'smart') return isSmart;
      return alert.trigger_count > 0;
    });
    // Legacy multi-condition alerts are listed under Basic with a "Not checked" status so they can be seen and removed.
    return consoleTab === 'basic' ? [...filtered, ...multiAlerts] : filtered;
  }, [alerts, multiAlerts, consoleTab]);

  // The console shows the first CONSOLE_ROW_LIMIT rows; "Show all" lists the rest instead of hiding them silently.
  useEffect(() => { setShowAllRows(false); }, [consoleTab]);
  const visibleAlertRows = showAllRows ? alertRows : alertRows.slice(0, CONSOLE_ROW_LIMIT);

  // If every alert is smart/strategy, an empty "Basic" default contradicts the "N active" header — open the tab that has rows.
  const autoTabbedRef = useRef(false);
  useEffect(() => {
    if (autoTabbedRef.current || activeAlerts.length === 0) return;
    autoTabbedRef.current = true;
    if (opensSmartTabFirst(activeAlerts, multiAlerts.length)) setConsoleTab('smart');
  }, [activeAlerts, multiAlerts]);

  const toggleAlert = async (alert: AlertItem) => {
    const res = await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alert.id, isActive: !alert.is_active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && typeof data?.message === 'string') publishAlertCapNotice(data.message);
    }
    await fetchAll();
  };

  const deleteAlert = async (id: string) => {
    await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
    await fetchAll();
  };

  // Edit opens an inline form filled with the alert's current values (it used to open a blank form).
  const editAlert = (alert: AlertItem) => {
    setEditingId(alert.id);
    setEditError(null);
    setEditForm({ name: alert.name ?? '', level: String(alert.condition_value ?? '') });
  };

  const saveEdit = async (alert: AlertItem) => {
    const result = buildAlertEdit(alert, editForm);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || 'Failed to save changes');
        return;
      }
      setEditingId(null);
      await fetchAll();
    } finally {
      setEditSaving(false);
    }
  };

  const orphanedCount = useMemo(
    () => alerts.filter((a) => isPriceAlertWithoutLevel(a.condition_type, a.condition_value)).length,
    [alerts],
  );

  useEffect(() => {
    // Opened from the Watchlist "Alert" button: show the new-alert form with the symbol filled in.
    if (prefillSymbol) {
      setActiveZone4Tab('basic');
      setZone4Open(true);
    }
  }, [prefillSymbol]);

  const cleanupOrphaned = async () => {
    setCleanupStatus('cleaning');
    try {
      const res = await fetch('/api/alerts?bulk=auto-orphaned', { method: 'DELETE' });
      const data = await res.json();
      setCleanupCount(data.deletedCount ?? 0);
      setCleanupStatus('done');
      await fetchAll();
    } catch {
      setCleanupStatus('idle');
    }
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
      summary: `Alert Radar Console: ${activeAlerts.length} active, ${triggeredToday} triggered in the last 24h`,
    });
  }, [tier, setPageData, activeAlerts, triggeredToday]);

  if (isLoading || loadingData) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <p className="text-sm text-slate-300">Loading alerts…</p>
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full max-w-none space-y-4 ${embeddedInWorkspace ? 'px-0 py-0' : 'px-4 py-6 md:px-6'}`}>
      {upgrade.moment && <UpgradeMoment kind={upgrade.moment} dismiss={upgrade.dismiss} />}
      <AlertCapNotice />
      <header className="rounded-lg border border-slate-700 p-3">
        <div className="flex items-center justify-between gap-2"><h2 className="!text-base font-semibold">Alerts</h2><button type="button" onClick={() => { if (tier === 'free' && alerts.filter(alert => alert.is_active).length >= ALERT_LIMITS.free) { upgrade.show('alerts'); return; } setActiveZone4Tab('basic'); setZone4Open(true); }} disabled={riskLocked} className="min-h-10 rounded border border-slate-600 px-3 text-sm disabled:opacity-50">New alert</button></div>
        <p data-alerts-verdict className="mt-1 text-sm text-slate-300">{loadWarning ? 'Alert data could not be fully loaded.' : `${activeAlerts.length} active user-defined notification${activeAlerts.length === 1 ? '' : 's'}.`}</p>
      </header>
      {loadWarning && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          {loadWarning}
          <button type="button" onClick={() => void fetchAll()} className="ml-2 underline underline-offset-2">Retry</button>
        </div>
      )}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
        Alerts are user-defined notifications only. Triggered alerts are not trading signals, financial advice, or recommendations to buy, sell, hold, short, or trade any asset.
      </div>
      {!embeddedInWorkspace && <ComplianceDisclaimer compact />}

      <section className="space-y-3">
        {!loadWarning && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 [&_[data-stat-card]]:p-2 [&_[data-stat-card]>p:first-child]:!text-xl">
          <StatTile label="Active" value={activeAlerts.length}/><StatTile label="Triggers · last 24h" value={triggeredToday}/><StatTile label="Smart / strategy share" value={`${smartPct}%`}/>
        </div>
        <div className="flex flex-wrap gap-2"><StatusBadge label="Push (this browser)" state={pushState}/><StatusBadge label="Webhook" state={prefs?.discord_enabled && isDiscordWebhookUrl(prefs?.discord_webhook_url) ? 'Connected' : prefs?.discord_enabled && prefs?.discord_webhook_url ? 'Not a Discord URL' : 'Not Set'}/></div>
        {alerts.length > 0 && <figure className="rounded-lg border border-slate-700 p-3 text-xs"><figcaption>{activeAlerts.length} checked active · {alerts.length-activeAlerts.length} other saved alerts</figcaption><svg className="mt-2 h-4 w-full" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="Checked active share of saved alerts"><rect width="100" height="8" fill="currentColor" opacity="0.2"/><rect width={100*activeAlerts.length/alerts.length} height="8" fill="currentColor"/></svg></figure>}
        </>}
        {riskLocked && (
          <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Tracking Lock active: alert automation remains notification-only until rule guard unlocks.
          </div>
        )}
        {orphanedCount > 0 && cleanupStatus !== 'done' && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <span>{orphanedCount} price alerts have no level and will not trigger.</span>
            <button type="button" onClick={cleanupOrphaned} disabled={cleanupStatus === 'cleaning'} className="ml-3 shrink-0 rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50">
              {cleanupStatus === 'cleaning' ? 'Cleaning…' : 'Clean Up'}
            </button>
          </div>
        )}
        {cleanupStatus === 'done' && (
          <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            Cleaned up {cleanupCount} orphaned alerts.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 md:p-4">
        <div className="mb-3 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TabBar label="Alert filter" activeId={consoleTab} items={[{id:'basic',label:'Basic'},{id:'strategy',label:'Strategy'},{id:'smart',label:'Smart'},{id:'triggered',label:'Triggered'}]} onChange={id=>setConsoleTab(id as typeof consoleTab)}/>
          <div className="text-xs text-slate-400">{visibleAlertRows.length < alertRows.length ? `${visibleAlertRows.length} of ${alertRows.length} shown` : `${alertRows.length} shown`}</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/25">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Alerts Console</div>
            {alertRows.length === 0 ? (
              <div className="px-4 py-5 text-sm text-slate-400">
                {loadWarning ? 'Alert rules could not be fully loaded. Use Retry above.' : activeAlerts.length === 0
                  ? 'No active alerts. Create a notification with New alert.'
                  : consoleTab === 'triggered'
                    ? 'No alerts have triggered yet.'
                    : `No ${consoleTab} alerts — ${activeAlerts.length} active alert${activeAlerts.length === 1 ? '' : 's'} are under the other filters.`}
              </div>
            ) : (
              <div className="min-w-0">
                {visibleAlertRows.map((alert) => {
                  const status = consoleRowLabel(alert, deriveStatus(alert));
                  const type = consoleAlertType(alert);
                  const isEditing = editingId === alert.id;
                  return (
                    <div data-alert-row key={alert.id} className="group border-b border-slate-800 px-3 py-2 sm:py-0">
                      <div className="flex items-center justify-between gap-2 min-h-14">
                        <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                          <span className="min-w-[56px] rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 text-xs font-semibold text-slate-100">{alert.symbol}</span>
                          <span className="break-words text-xs font-semibold text-slate-100 sm:text-sm">{alertConditionLabel(alert.condition_type ?? '', alert.condition_value)}</span>
                          <span className="hidden rounded bg-white/5 px-2 py-0.5 text-xs text-slate-400 sm:inline">{type}</span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                          <span className="hidden text-xs text-slate-400 sm:inline">Triggered {alert.trigger_count}x</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${status === 'Armed' ? 'bg-emerald-500/15 text-emerald-200' : status === 'Cooldown' || status === 'Not checked' ? 'bg-amber-500/15 text-amber-200' : 'bg-slate-700 text-slate-300'}`} title={status === 'Not checked' ? 'Multi-condition alerts are not evaluated by the alert checker, so this alert will not fire.' : undefined}>
                            {status}
                          </span>
                          <AlertRowActions label={`${alert.symbol} alert ${alert.id}`} active={alert.is_active} onEdit={()=>editAlert(alert)} onToggle={()=>void toggleAlert(alert)} onDelete={()=>void deleteAlert(alert.id)}/>

                        </div>
                      </div>
                      {isEditing && (
                        <form
                          className="mb-2 mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-2 text-xs"
                          onSubmit={(e) => { e.preventDefault(); void saveEdit(alert); }}
                        >
                          <label className="flex items-center gap-1 text-slate-400">
                            Name
                            <input type="text" value={editForm.name} maxLength={100} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="w-40 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100" />
                          </label>
                          {canEditLevel(alert) && (
                            <label className="flex items-center gap-1 text-slate-400">
                              {(alert.condition_type ?? '').startsWith('percent_') ? 'Move %' : 'Price'}
                              <input type="number" step="any" min="0" value={editForm.level} onChange={(e) => setEditForm((f) => ({ ...f, level: e.target.value }))} className="w-28 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100" />
                            </label>
                          )}
                          <button type="submit" disabled={editSaving} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white disabled:opacity-50">{editSaving ? 'Saving…' : 'Save'}</button>
                          <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-1 text-slate-300">Cancel</button>
                          {editError && <span className="text-rose-300">{editError}</span>}
                        </form>
                      )}
                    </div>
                  );
                })}
                {alertRows.length > CONSOLE_ROW_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllRows((v) => !v)}
                    className="w-full px-4 py-2 text-center text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
                    data-testid="console-show-all"
                  >
                    {showAllRows ? 'Show fewer' : `Show all ${alertRows.length} alerts`}
                  </button>
                )}
              </div>
            )}
          </div>

          <CollapsibleSection title="Trigger summary" summary={loadWarning ? "History not fully loaded" : fmtDateTime(history[0]?.triggered_at)}>

            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Last Trigger: <span className="text-slate-100">{loadWarning ? "History not fully loaded" : fmtDateTime(history[0]?.triggered_at)}</span></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Most Active Symbol: <span className="text-slate-100">{loadWarning ? "Not collected" : mostActiveSymbol}</span></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Avg Re-trigger Interval (same alert): <span className="text-slate-100">{avgTriggerInterval(history) === 'N/A' ? 'Needs two triggers for the same alert' : avgTriggerInterval(history)}</span></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">Pending Cooldowns: <span className="text-slate-100">{pendingCooldowns}</span></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href="/tools/scanner" className="rounded-xl border border-slate-800 bg-slate-200/5 px-3 py-2 text-center text-xs font-semibold text-slate-100">Scanner</a>
              <a href="/tools/workspace?tab=journal" className="rounded-xl border border-slate-800 bg-slate-200/5 px-3 py-2 text-center text-xs font-semibold text-slate-100">Journal</a>
            </div>
          </CollapsibleSection>
        </div>
      </section>

      <section className="space-y-3">
        <details className="rounded-xl border border-slate-800 bg-slate-900/25" open={zone3Open}>
          <summary onClick={(e) => { e.preventDefault(); setZone3Open((v) => !v); }} className="flex cursor-pointer list-none items-center justify-between px-4 py-3" aria-expanded={zone3Open}>
            <div>
              <div className="text-sm font-semibold text-slate-100">Trigger log</div>
              <div className="text-xs text-slate-400">{`${history.length} loaded records`}</div>
            </div>
            <span className="h-7 rounded-lg border border-slate-700 bg-slate-950/30 px-2 text-xs leading-7 text-slate-300">{zone3Open ? 'Collapse' : 'Expand'}</span>
          </summary>
          <div className="border-t border-slate-800 px-4 py-3">
            <div className="max-h-[420px] overflow-x-auto overflow-y-auto rounded-lg border border-slate-800">
              <table className="min-w-[540px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#0b1220]/95 text-slate-300 backdrop-blur">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Time</th>
                    <th scope="col" className="px-3 py-2 text-left">Symbol</th>
                    <th scope="col" className="px-3 py-2 text-left">Condition</th>
                    <th scope="col" className="px-3 py-2 text-left">Action Taken</th>
                    <th scope="col" className="px-3 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                      <td className="px-3 py-2 text-xs text-slate-300">{fmtDateTime(row.triggered_at)}</td>
                      <td className="px-3 py-2 font-semibold">{row.symbol}</td>
                      <td className="px-3 py-2">{alertHistoryLabel(row.condition_met || row.condition_type || row.alert_name)}</td>
                      <td className="px-3 py-2">{row.user_action || 'No action'}</td>
                      <td className="px-3 py-2">{row.user_action === 'traded' ? 'Opened Trade' : row.user_action ? 'Handled' : 'No response recorded'}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">{loadWarning ? "Trigger history could not be fully loaded." : "No triggers logged yet."}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details className="rounded-xl border border-slate-800 bg-slate-900/25" open={zone4Open}>
          <summary onClick={(e) => { e.preventDefault(); setZone4Open((v) => !v); }} className="flex cursor-pointer list-none items-center justify-between px-4 py-3" aria-expanded={zone4Open}>
            <div>
              <div className="text-sm font-semibold text-slate-100">Alert Capabilities</div>
              <div className="text-xs text-slate-400">Create alerts and view existing plan limits</div>
            </div>
            <span className="h-7 rounded-lg border border-slate-700 bg-slate-950/30 px-2 text-xs leading-7 text-slate-300">{zone4Open ? 'Collapse' : 'Expand'}</span>
          </summary>
          <div className="space-y-4 border-t border-slate-800 px-4 py-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Price Alerts</div>
                <div className="text-sm text-slate-300">Threshold, percent move, and volume spike conditions.</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Multi-Condition</div>
                <div className="text-sm text-slate-300">Not available yet: combined conditions are not checked, so they can&apos;t be created.</div>
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
                  <div className="font-semibold text-slate-100">{ALERT_LIMITS.free} active alerts</div>
                </div>
                <div className={`rounded-lg p-2 ${tier === 'pro' || tier === 'pro_trader' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/60'}`}>
                  <div className="text-slate-400">Pro</div>
                  <div className="font-semibold text-slate-100">{ALERT_LIMITS.pro} active alerts</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" aria-pressed={activeZone4Tab === 'basic'} onClick={() => setActiveZone4Tab('basic')} className={`rounded-lg px-3 py-1.5 text-xs ${activeZone4Tab === 'basic' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/10 text-slate-200'}`}>Basic</button>
                <button type="button" aria-pressed={activeZone4Tab === 'strategy'} onClick={() => setActiveZone4Tab('strategy')} className={`rounded-lg px-3 py-1.5 text-xs ${activeZone4Tab === 'strategy' ? 'bg-indigo-500/15 text-indigo-200' : 'bg-white/10 text-slate-200'}`}>Strategy</button>
              </div>
              <AlertsWidget compact={false} className="!border-slate-800 !bg-transparent" prefilledSymbol={prefillSymbol ?? undefined} />
            </div>

            {tier === 'free' && <UpgradeGate requiredTier="pro" feature="more price alerts" />}
          </div>
        </details>
      </section>
      <SourceLine source="Saved alert rules and trigger history" asOf={loadedAt} basis="Loaded for this view; delivery state shown for this browser"/>
      <p className="text-xs text-slate-400">General information only, not financial advice.</p>
    </div>
  );
}

export default function AlertsPage() {
  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader 
        badge="TOOLS"
        title="Alert Intelligence"
        subtitle="User-defined notifications and recorded triggers"
        icon="ALR"
      />
      <div className="max-w-none mx-auto px-4 pt-4">
        <RegimeBanner />
      </div>
      <Suspense fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }>
        <AlertsContent />
      </Suspense>
    </div>
  );
}
