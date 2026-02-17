import { describe, expect, it } from 'vitest';
import {
  evaluateAutoAlertPolicy,
  evaluateSystemExecutionPolicy,
  type RiskGovernorThresholds,
} from '../lib/operator/riskGovernor';

const thresholds: RiskGovernorThresholds = {
  maxAutoAlertsPerHour: 3,
  maxAutoAlertsPerDay: 8,
  maxPlanRiskScoreForAutoAlert: 70,
  maxCognitiveLoadForAutoActions: 85,
  blockWhenOverloaded: true,
  allowSystemExecutionAutomation: false,
};

describe('risk governor', () => {
  it('blocks auto alerts in overloaded mode', () => {
    const decision = evaluateAutoAlertPolicy(
      {
        riskEnvironment: 'overloaded',
        cognitiveLoad: 40,
        autoAlertsLastHour: 0,
        autoAlertsToday: 0,
        planRiskScore: 50,
      },
      thresholds
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('risk_environment_overloaded');
  });

  it('blocks by throttles and risk score', () => {
    const highRisk = evaluateAutoAlertPolicy(
      {
        riskEnvironment: 'normal',
        cognitiveLoad: 40,
        autoAlertsLastHour: 0,
        autoAlertsToday: 0,
        planRiskScore: 92,
      },
      thresholds
    );

    const hourly = evaluateAutoAlertPolicy(
      {
        riskEnvironment: 'normal',
        cognitiveLoad: 40,
        autoAlertsLastHour: 3,
        autoAlertsToday: 3,
        planRiskScore: 60,
      },
      thresholds
    );

    expect(highRisk.allowed).toBe(false);
    expect(highRisk.reasonCode).toBe('plan_risk_score_high');
    expect(hourly.allowed).toBe(false);
    expect(hourly.reasonCode).toBe('auto_alert_hourly_throttle');
  });

  it('requires explicit opt-in for system execution automation', () => {
    const blocked = evaluateSystemExecutionPolicy(
      { isSystemActor: true, executionOptIn: false },
      thresholds
    );

    const allowedWithOptIn = evaluateSystemExecutionPolicy(
      { isSystemActor: true, executionOptIn: true },
      thresholds
    );

    const allowedUserActor = evaluateSystemExecutionPolicy(
      { isSystemActor: false, executionOptIn: false },
      thresholds
    );

    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonCode).toBe('execution_automation_opt_in_required');
    expect(allowedWithOptIn.allowed).toBe(true);
    expect(allowedUserActor.allowed).toBe(true);
  });
});