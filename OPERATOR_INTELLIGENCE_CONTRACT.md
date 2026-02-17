# MSP Operator Intelligence Contract (v1)

Purpose: define one shared payload contract for the adaptive operator system so all modules consume the same state model.

## 1) Canonical Objects

### 1.1 Adaptive Reality (ARCM)

```ts
interface ControlMatrix {
  axes: {
    market: { mode: string; score: number };
    operator: { mode: string; score: number };
    risk: { mode: string; score: number };
    intent: { mode: string; score: number };
  };
  matrixScore: number;
  output: {
    mode: 'hunt' | 'focus' | 'risk_control' | 'learning' | 'passive_scan';
    label: string;
    reason: string;
    priorityWidgets: string[];
    hiddenWidgets: string[];
    actionFriction: number;   // 0..1
    alertIntensity: number;   // 0..1
  };
}
```

### 1.2 Operator Brain State (4-state foundation)

```ts
interface OperatorBrain {
  state: 'FLOW' | 'FOCUSED' | 'STRESSED' | 'OVERLOADED';
  executionMode: 'flow' | 'hesitant' | 'aggressive';
  fatigueScore: number;         // 0..100
  riskToleranceScore: number;   // 0..100
  riskCapacity: 'HIGH' | 'MEDIUM' | 'LOW';
  thresholdShift: number;       // signal threshold adjustment points
  aggressionBias: 'reduced' | 'balanced' | 'elevated';
  guidance: string;
}
```

### 1.3 Consciousness Loop

```ts
interface ConsciousnessLoop {
  observe: {
    symbol: string;
    market: { mode: string; score: number; volatilityState: string };
    operator: { mode: string; score: number };
    risk: { mode: string; score: number };
    intent: { mode: string; score: number };
    setup: { signalScore: number; operatorFit: number; confidence: number };
    behavior: {
      quality: number;
      lateEntryPct: number;
      earlyExitPct: number;
      ignoredSetupPct: number;
    };
    automation: { hasPendingTask: boolean; hasTopAttention: boolean };
  };
  interpret: {
    decisionContext: string;
    suitability: 'high' | 'moderate' | 'low';
  };
  decide: {
    confidence: number;
    suggestedActions: string[];
    decisionPacket: {
      id: string;
      symbol: string;
      signalScore: number;
      riskScore: number;
      operatorFit?: number;
      status: 'candidate' | 'planned' | 'alerted' | 'executed' | 'closed';
    };
  };
  act: {
    autoActions: string[];
  };
  learn: {
    feedbackTag: 'validated' | 'ignored' | 'wrong_context' | 'timing_issue';
    rationale: string;
  };
  adapt: {
    adjustments: string[];
  };
}
```

### 1.4 Feedback Trend Input (rolling 7d)

```ts
interface LearningFeedbackTrend {
  total7d: number;
  validatedPct: number;
  ignoredPct: number;
  wrongContextPct: number;
  timingIssuePct: number;
  penalty: number;
  bonus: number;
}
```

## 2) Presence API Contract

Source endpoint: `GET /api/operator/presence`

### Required top-level keys
- `marketState`
- `riskLoad`
- `adaptiveInputs`
- `controlMatrix`
- `consciousnessLoop`
- `experienceMode`
- `behavior`
- `topAttention`
- `symbolExperienceModes`
- `suggestedActions`
- `pendingTaskCount`

### `adaptiveInputs` contract

```ts
adaptiveInputs: {
  marketReality: {
    mode: string;
    volatilityState: string;
    signalDensity: number;
    confluenceDensity: number;
  };
  operatorReality: {
    mode: string;
    actions8h: number;
    executions8h: number;
    closed8h: number;
    behaviorQuality: number;
  };
  operatorBrain: OperatorBrain;
  learningFeedback: LearningFeedbackTrend;
  cognitiveLoad: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    value: number;
    openAlerts: number;
    unresolvedPlans: number;
    simultaneousSetups: number;
  };
  intentDirection: string;
}
```

## 3) Event Contract (Learn layer persistence)

Source endpoint: `POST /api/workflow/feedback`

### Accepted payload

```ts
{
  feedbackTag: 'validated' | 'ignored' | 'wrong_context' | 'timing_issue';
  decisionPacketId: string;
  symbol?: string;
  confidence?: number;
  workflowId?: string;
  notes?: string;
}
```

### Persisted event
- `event_type`: `label.explicit.created`
- `event_data.payload.source`: `consciousness_loop`
- `event_data.payload.feedback_tag`: accepted tag

## 4) UI Consumption Rules

1. Never infer mode from local UI state if `controlMatrix.output.mode` exists.
2. Use `priorityWidgets` + `hiddenWidgets` as the single source for ordering and visibility.
3. Use `experienceMode.directives` for interaction policy (scanner visibility, alert throttling, friction).
4. Use `operatorBrain.state` for narrative/guidance language and risk posture labels.
5. Use `learningFeedback.penalty/bonus` as diagnostics only in UI; scoring authority remains server-side.

## 5) Scoring Authority

Only server APIs compute:
- ARCM axis scores and mode output
- Operator Brain state
- Consciousness loop suitability and learn tag fallback
- feedback trend penalty/bonus

Clients must treat these as read-only authoritative outputs.

## 6) Versioning

- Contract version: `v1`
- Backward-compatible additions are allowed.
- Breaking changes require:
  1) version bump (`v2`),
  2) parallel support window,
  3) migration note in release docs.
