/**
 * Alert radar console status (app/tools/alerts). TR-25.
 *
 * Multi-condition alerts are not evaluated by any alert checker (PR #64), so the
 * console shows them as "Not checked", never "Armed", and doesn't count them as
 * active alerts.
 */
import { alertThreshold } from '../alertPresentation';

export interface ConsoleAlert {
  condition_type: string;
  condition_value: number;
  is_active: boolean;
  triggered_at?: string;
  is_multi_condition?: boolean;
  cooldown_minutes?: number | null;
}

export type ConsoleStatus = 'Armed' | 'Cooldown' | 'Disabled' | 'Incomplete' | 'Not checked';

export function deriveStatus(alert: ConsoleAlert, nowMs = Date.now()): ConsoleStatus {
  if (alert.is_multi_condition) return 'Not checked';
  if (!alert.is_active) return 'Disabled';
  if (alert.condition_type.startsWith('price_') && (alertThreshold(alert.condition_value) ?? 0) <= 0) return 'Incomplete';
  if (!alert.triggered_at || !alert.cooldown_minutes) return 'Armed';
  const ms = nowMs - new Date(alert.triggered_at).getTime();
  return ms < alert.cooldown_minutes * 60_000 ? 'Cooldown' : 'Armed';
}

/** Active alerts that a checker actually evaluates (multi-condition excluded). */
export function checkedActiveAlerts<T extends ConsoleAlert>(alerts: T[]): T[] {
  return alerts.filter((a) => a.is_active && !a.is_multi_condition);
}

/** Smart/strategy/scanner alert (the console's "Smart" group). */
export function isSmartConsoleAlert(alert: { is_smart_alert?: boolean; condition_type?: string | null }): boolean {
  const ct = alert.condition_type ?? '';
  return Boolean(alert.is_smart_alert || ct.startsWith('strategy_') || ct.startsWith('scanner_'));
}

/**
 * "Smart %": smart/strategy alerts as a share of checked active alerts. Multi-condition
 * alerts are left out of both counts because no checker evaluates them. 0 when none.
 */
export function smartAlertShare<T extends ConsoleAlert & { is_smart_alert?: boolean }>(alerts: T[]): number {
  const checked = checkedActiveAlerts(alerts);
  if (checked.length === 0) return 0;
  return Math.round((checked.filter(isSmartConsoleAlert).length / checked.length) * 100);
}

/** Legacy multi-condition alerts, listed under Basic as "Not checked" so they can be seen and deleted. */
export function legacyMultiAlerts<T extends ConsoleAlert>(alerts: T[]): T[] {
  return alerts.filter((a) => Boolean(a.is_multi_condition));
}
