import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

const COOKIE_NAME = 'msp_risk_guard';
const MAX_DISABLE_HOURS = 24; // Auto re-enable after 24 hours
const COOLDOWN_MINUTES = 10; // 10-minute cooldown before disable takes effect
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

/**
 * Cookie value format:
 *   'on'                           — guard enabled
 *   'off:<disabledAt>'             — guard disabled (past cooldown)
 *   'pending:<requestedAt>'        — disable requested, cooldown in progress
 */
function parseGuardState(req: NextRequest): {
  enabled: boolean;
  pendingDisable: boolean;
  pendingDisableAt: number | null;
  disabledAt: number | null;
  cooldownRemainingMs: number;
  rBudgetHalved: boolean;
} {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue || cookieValue === 'on') {
    return { enabled: true, pendingDisable: false, pendingDisableAt: null, disabledAt: null, cooldownRemainingMs: 0, rBudgetHalved: false };
  }

  // Pending disable (cooldown in progress)
  if (cookieValue.startsWith('pending:')) {
    const requestedAt = Number(cookieValue.split(':')[1]);
    if (Number.isFinite(requestedAt)) {
      const elapsed = Date.now() - requestedAt;
      if (elapsed >= COOLDOWN_MS) {
        // Cooldown expired — now effectively disabled
        return { enabled: false, pendingDisable: false, pendingDisableAt: null, disabledAt: requestedAt + COOLDOWN_MS, cooldownRemainingMs: 0, rBudgetHalved: true };
      }
      // Still in cooldown — guard is ON but pending disable
      return { enabled: true, pendingDisable: true, pendingDisableAt: requestedAt, disabledAt: null, cooldownRemainingMs: COOLDOWN_MS - elapsed, rBudgetHalved: false };
    }
  }

  // Guard disabled
  if (cookieValue.startsWith('off:')) {
    const disabledAt = Number(cookieValue.split(':')[1]);
    if (Number.isFinite(disabledAt)) {
      const hoursElapsed = (Date.now() - disabledAt) / (1000 * 60 * 60);
      if (hoursElapsed >= MAX_DISABLE_HOURS) {
        return { enabled: true, pendingDisable: false, pendingDisableAt: null, disabledAt: null, cooldownRemainingMs: 0, rBudgetHalved: false }; // Auto re-enable
      }
      return { enabled: false, pendingDisable: false, pendingDisableAt: null, disabledAt, cooldownRemainingMs: 0, rBudgetHalved: true };
    }
  }

  return cookieValue === 'off'
    ? { enabled: false, pendingDisable: false, pendingDisableAt: null, disabledAt: null, cooldownRemainingMs: 0, rBudgetHalved: true }
    : { enabled: true, pendingDisable: false, pendingDisableAt: null, disabledAt: null, cooldownRemainingMs: 0, rBudgetHalved: false };
}

export async function GET(req: NextRequest) {
  const state = parseGuardState(req);
  return NextResponse.json({
    enabled: state.enabled,
    pendingDisable: state.pendingDisable,
    pendingDisableAt: state.pendingDisableAt,
    cooldownRemainingMs: state.cooldownRemainingMs,
    rBudgetHalved: state.rBudgetHalved,
    cooldownMinutes: COOLDOWN_MINUTES,
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const wantEnabled = body?.enabled !== false;
    const cancelPending = body?.cancelPending === true;
    const currentState = parseGuardState(req);

    const session = await getSessionFromCookie().catch(() => null);

    // Cancel a pending disable request
    if (cancelPending && currentState.pendingDisable) {
      const auditAction = 'CANCEL_PENDING_DISABLE';
      if (session?.workspaceId) {
        try {
          await q(
            `INSERT INTO guard_audit_log (workspace_id, action, timestamp, source)
             VALUES ($1, $2, NOW(), 'preferences_api')
             ON CONFLICT DO NOTHING`,
            [session.workspaceId, auditAction]
          );
        } catch {
          console.warn(`[risk-governor] Guard toggle audit: workspace=${session.workspaceId} action=${auditAction} at=${new Date().toISOString()}`);
        }
      }
      console.info(`[risk-governor] Guard CANCEL_PENDING_DISABLE for workspace ${session?.workspaceId ?? 'unknown'}`);
      const res = NextResponse.json({ enabled: true, pendingDisable: false, cooldownRemainingMs: 0, rBudgetHalved: false });
      res.cookies.set({ name: COOKIE_NAME, value: 'on', path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 });
      return res;
    }

    // Enable guard (immediate)
    if (wantEnabled) {
      if (session?.workspaceId) {
        try {
          await q(
            `INSERT INTO guard_audit_log (workspace_id, action, timestamp, source)
             VALUES ($1, $2, NOW(), 'preferences_api')
             ON CONFLICT DO NOTHING`,
            [session.workspaceId, 'ENABLE']
          );
        } catch {
          console.warn(`[risk-governor] Guard toggle audit: workspace=${session.workspaceId} action=ENABLE at=${new Date().toISOString()}`);
        }
      }
      console.info(`[risk-governor] Guard ENABLED for workspace ${session?.workspaceId ?? 'unknown'}`);
      const res = NextResponse.json({ enabled: true, pendingDisable: false, cooldownRemainingMs: 0, rBudgetHalved: false });
      res.cookies.set({ name: COOKIE_NAME, value: 'on', path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 });
      return res;
    }

    // Disable guard — enforce 10-minute cooldown
    // If already pending, return current state
    if (currentState.pendingDisable) {
      return NextResponse.json({
        enabled: true,
        pendingDisable: true,
        pendingDisableAt: currentState.pendingDisableAt,
        cooldownRemainingMs: currentState.cooldownRemainingMs,
        rBudgetHalved: false,
        cooldownMinutes: COOLDOWN_MINUTES,
      });
    }

    // If cooldown already passed (pending → off transition), mark as disabled
    if (!currentState.enabled && !currentState.pendingDisable) {
      return NextResponse.json({
        enabled: false,
        pendingDisable: false,
        cooldownRemainingMs: 0,
        rBudgetHalved: true,
      });
    }

    // Start cooldown: set cookie to pending:<timestamp>
    const now = Date.now();
    if (session?.workspaceId) {
      try {
        await q(
          `INSERT INTO guard_audit_log (workspace_id, action, timestamp, source)
           VALUES ($1, $2, NOW(), 'preferences_api')
           ON CONFLICT DO NOTHING`,
          [session.workspaceId, 'DISABLE_REQUESTED']
        );
      } catch {
        console.warn(`[risk-governor] Guard toggle audit: workspace=${session.workspaceId} action=DISABLE_REQUESTED at=${new Date().toISOString()}`);
      }
    }
    console.info(`[risk-governor] Guard DISABLE_REQUESTED (${COOLDOWN_MINUTES}min cooldown) for workspace ${session?.workspaceId ?? 'unknown'}`);

    const res = NextResponse.json({
      enabled: true, // Still enabled during cooldown
      pendingDisable: true,
      pendingDisableAt: now,
      cooldownRemainingMs: COOLDOWN_MS,
      rBudgetHalved: false,
      cooldownMinutes: COOLDOWN_MINUTES,
    });
    res.cookies.set({
      name: COOKIE_NAME,
      value: `pending:${now}`,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * MAX_DISABLE_HOURS, // Full window including cooldown + disable period
    });
    return res;
  } catch (error) {
    console.error('risk governor preferences update error:', error);
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }
}
