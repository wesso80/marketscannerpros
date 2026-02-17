export type RiskGovernorThresholds = {
  maxAutoAlertsPerHour: number;
  maxAutoAlertsPerDay: number;
  maxPlanRiskScoreForAutoAlert: number;
  maxCognitiveLoadForAutoActions: number;
  blockWhenOverloaded: boolean;
  allowSystemExecutionAutomation: boolean;
};

export type AutoAlertPolicyInput = {
  riskEnvironment: string | null;
  cognitiveLoad: number | null;
  autoAlertsLastHour: number;
  autoAlertsToday: number;
  planRiskScore: number | null;
};

export type SystemExecutionPolicyInput = {
  isSystemActor: boolean;
  executionOptIn: boolean;
};

export type RiskGovernorDecision = {
  allowed: boolean;
  reasonCode: string | null;
  reason: string | null;
};

export function getRiskGovernorThresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): RiskGovernorThresholds {
  const toSafeInt = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const toSafeFloat = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseFloat(String(value || ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    maxAutoAlertsPerHour: toSafeInt(env.MSP_MAX_AUTO_ALERTS_PER_HOUR, 4),
    maxAutoAlertsPerDay: toSafeInt(env.MSP_MAX_AUTO_ALERTS_PER_DAY, 14),
    maxPlanRiskScoreForAutoAlert: toSafeFloat(env.MSP_MAX_PLAN_RISK_SCORE_FOR_AUTO_ALERT, 72),
    maxCognitiveLoadForAutoActions: toSafeFloat(env.MSP_MAX_COGNITIVE_LOAD_FOR_AUTO_ACTIONS, 85),
    blockWhenOverloaded: env.MSP_BLOCK_AUTO_ACTIONS_WHEN_OVERLOADED !== 'false',
    allowSystemExecutionAutomation: env.MSP_ALLOW_SYSTEM_EXECUTION_AUTOMATION === 'true',
  };
}

export function evaluateAutoAlertPolicy(
  input: AutoAlertPolicyInput,
  thresholds: RiskGovernorThresholds
): RiskGovernorDecision {
  const normalizedRiskEnvironment = String(input.riskEnvironment || '').trim().toLowerCase();

  if (thresholds.blockWhenOverloaded && normalizedRiskEnvironment === 'overloaded') {
    return {
      allowed: false,
      reasonCode: 'risk_environment_overloaded',
      reason: 'Auto-alert blocked while operator risk environment is overloaded.',
    };
  }

  if (
    typeof input.cognitiveLoad === 'number'
    && Number.isFinite(input.cognitiveLoad)
    && input.cognitiveLoad > thresholds.maxCognitiveLoadForAutoActions
  ) {
    return {
      allowed: false,
      reasonCode: 'cognitive_load_high',
      reason: 'Auto-alert blocked due to elevated cognitive load.',
    };
  }

  if (
    typeof input.planRiskScore === 'number'
    && Number.isFinite(input.planRiskScore)
    && input.planRiskScore > thresholds.maxPlanRiskScoreForAutoAlert
  ) {
    return {
      allowed: false,
      reasonCode: 'plan_risk_score_high',
      reason: 'Auto-alert blocked because plan risk score exceeds policy limit.',
    };
  }

  if (input.autoAlertsLastHour >= thresholds.maxAutoAlertsPerHour) {
    return {
      allowed: false,
      reasonCode: 'auto_alert_hourly_throttle',
      reason: 'Auto-alert blocked by hourly creation throttle.',
    };
  }

  if (input.autoAlertsToday >= thresholds.maxAutoAlertsPerDay) {
    return {
      allowed: false,
      reasonCode: 'auto_alert_daily_throttle',
      reason: 'Auto-alert blocked by daily creation throttle.',
    };
  }

  return { allowed: true, reasonCode: null, reason: null };
}

export function evaluateSystemExecutionPolicy(
  input: SystemExecutionPolicyInput,
  thresholds: RiskGovernorThresholds
): RiskGovernorDecision {
  if (!input.isSystemActor) {
    return { allowed: true, reasonCode: null, reason: null };
  }

  if (thresholds.allowSystemExecutionAutomation) {
    return { allowed: true, reasonCode: null, reason: null };
  }

  if (input.executionOptIn) {
    return { allowed: true, reasonCode: null, reason: null };
  }

  return {
    allowed: false,
    reasonCode: 'execution_automation_opt_in_required',
    reason: 'System execution automation is disabled until explicit workspace opt-in is enabled.',
  };
}