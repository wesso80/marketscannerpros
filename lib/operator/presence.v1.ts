import { z } from 'zod';

const feedbackTagSchema = z.enum(['validated', 'ignored', 'wrong_context', 'timing_issue']);

const controlAxisSchema = z.object({
  mode: z.string(),
  score: z.number(),
});

const controlOutputSchema = z.object({
  mode: z.enum(['hunt', 'focus', 'risk_control', 'learning', 'passive_scan']),
  label: z.string(),
  reason: z.string(),
  priorityWidgets: z.array(z.string()),
  hiddenWidgets: z.array(z.string()),
  actionFriction: z.number(),
  alertIntensity: z.number(),
});

export const controlMatrixSchema = z.object({
  axes: z.object({
    market: controlAxisSchema,
    operator: controlAxisSchema,
    risk: controlAxisSchema,
    intent: controlAxisSchema,
  }),
  matrixScore: z.number(),
  output: controlOutputSchema,
});

export const operatorBrainSchema = z.object({
  state: z.enum(['FLOW', 'FOCUSED', 'STRESSED', 'OVERLOADED']),
  executionMode: z.enum(['flow', 'hesitant', 'aggressive']),
  fatigueScore: z.number(),
  riskToleranceScore: z.number(),
  riskCapacity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  thresholdShift: z.number(),
  aggressionBias: z.enum(['reduced', 'balanced', 'elevated']),
  guidance: z.string(),
});

export const consciousnessLoopSchema = z.object({
  observe: z.object({
    symbol: z.string(),
    market: z.object({ mode: z.string(), score: z.number(), volatilityState: z.string() }),
    operator: z.object({ mode: z.string(), score: z.number() }),
    risk: z.object({ mode: z.string(), score: z.number() }),
    intent: z.object({ mode: z.string(), score: z.number() }),
    setup: z.object({ signalScore: z.number(), operatorFit: z.number(), confidence: z.number() }),
    behavior: z.object({
      quality: z.number(),
      lateEntryPct: z.number(),
      earlyExitPct: z.number(),
      ignoredSetupPct: z.number(),
    }),
    automation: z.object({ hasPendingTask: z.boolean(), hasTopAttention: z.boolean() }),
  }),
  interpret: z.object({
    decisionContext: z.string(),
    suitability: z.enum(['high', 'moderate', 'low']),
  }),
  decide: z.object({
    confidence: z.number(),
    suggestedActions: z.array(z.string()),
    decisionPacket: z.object({
      id: z.string(),
      symbol: z.string(),
      signalScore: z.number(),
      riskScore: z.number(),
      operatorFit: z.number().optional(),
      status: z.enum(['candidate', 'planned', 'alerted', 'executed', 'closed']),
    }),
  }),
  act: z.object({ autoActions: z.array(z.string()) }),
  learn: z.object({
    feedbackTag: feedbackTagSchema,
    rationale: z.string(),
  }),
  adapt: z.object({ adjustments: z.array(z.string()) }),
});

export const learningFeedbackTrendSchema = z.object({
  total7d: z.number(),
  validatedPct: z.number(),
  ignoredPct: z.number(),
  wrongContextPct: z.number(),
  timingIssuePct: z.number(),
  penalty: z.number(),
  bonus: z.number(),
});

export const presenceV1Schema = z.object({
  marketState: z.object({
    marketBias: z.string(),
    volatilityState: z.string(),
    userMode: z.string(),
    updatedAt: z.string().nullable(),
  }),
  riskLoad: z.object({
    userRiskLoad: z.number(),
    environment: z.string(),
  }),
  adaptiveInputs: z.object({
    marketReality: z.object({
      mode: z.string(),
      volatilityState: z.string(),
      signalDensity: z.number(),
      confluenceDensity: z.number(),
    }),
    operatorReality: z.object({
      mode: z.string(),
      actions8h: z.number(),
      executions8h: z.number(),
      closed8h: z.number(),
      behaviorQuality: z.number(),
    }),
    operatorBrain: operatorBrainSchema,
    learningFeedback: learningFeedbackTrendSchema,
    cognitiveLoad: z.object({
      level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      value: z.number(),
      openAlerts: z.number(),
      unresolvedPlans: z.number(),
      simultaneousSetups: z.number(),
    }),
    intentDirection: z.string(),
  }),
  controlMatrix: controlMatrixSchema,
  consciousnessLoop: consciousnessLoopSchema,
  experienceMode: z.object({
    key: z.enum(['hunt', 'focus', 'risk_control', 'learning', 'passive_scan']),
    label: z.string(),
    rationale: z.string(),
    directives: z.object({
      showScanner: z.boolean(),
      emphasizeRisk: z.boolean(),
      reduceAlerts: z.boolean(),
      highlightLearning: z.boolean(),
      minimalSurface: z.boolean(),
      quickActions: z.boolean(),
      frictionLevel: z.enum(['low', 'medium', 'high']),
    }),
    priorityWidgets: z.array(z.string()),
    hiddenWidgets: z.array(z.string()),
    actionFriction: z.number(),
    alertIntensity: z.number(),
  }),
  behavior: z.object({
    lateEntryPct: z.number(),
    earlyExitPct: z.number(),
    ignoredSetupPct: z.number(),
    behaviorQuality: z.number(),
    sample: z.object({
      executionsWithPlan: z.number(),
      closedWithExecution: z.number(),
      passCandidates: z.number(),
    }).optional(),
  }).optional(),
  topAttention: z.array(z.object({
    symbol: z.string(),
    confidence: z.number(),
    hits: z.number(),
    personalEdge: z.number(),
    operatorFit: z.number(),
    sampleSize: z.number(),
    avgPl: z.number(),
    behaviorQuality: z.number().optional(),
    decisionPacketId: z.string().optional(),
  })),
  symbolExperienceModes: z.array(z.object({
    symbol: z.string(),
    operatorFit: z.number(),
    confidence: z.number(),
    personalEdge: z.number(),
    mode: z.object({
      key: z.enum(['hunt', 'focus', 'risk_control', 'learning', 'passive_scan']),
      label: z.string(),
      directives: z.object({
        showScanner: z.boolean(),
        emphasizeRisk: z.boolean(),
        reduceAlerts: z.boolean(),
        highlightLearning: z.boolean(),
        minimalSurface: z.boolean(),
        quickActions: z.boolean(),
        frictionLevel: z.enum(['low', 'medium', 'high']),
      }),
    }),
    reason: z.string(),
  })).optional().default([]),
  suggestedActions: z.array(z.object({
    key: z.string(),
    label: z.string(),
    reason: z.string(),
  })),
  pendingTaskCount: z.number(),
}).superRefine((value, ctx) => {
  if (value.experienceMode.key !== value.controlMatrix.output.mode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['experienceMode', 'key'],
      message: 'Invariant failed: experienceMode.key must equal controlMatrix.output.mode',
    });
  }

  const loopSymbol = value.consciousnessLoop.observe.symbol;
  const loopPacketId = value.consciousnessLoop.decide.decisionPacket.id;
  const top = value.topAttention.find((item) => item.symbol === loopSymbol);
  if (top?.decisionPacketId && top.decisionPacketId !== loopPacketId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['topAttention'],
      message: 'Invariant failed: topAttention decisionPacketId must match loop decision packet for matching symbol',
    });
  }
});

export const presenceV1EnvelopeSchema = z.object({
  contract: z.literal('operator_presence'),
  version: z.literal('v1'),
  generatedAt: z.string(),
  presence: presenceV1Schema,
});

export type PresenceV1 = z.infer<typeof presenceV1Schema>;
export type PresenceV1Envelope = z.infer<typeof presenceV1EnvelopeSchema>;

export type PresenceEnvelopeV1Parsed = PresenceV1Envelope & { data: PresenceV1 };

export function buildPresenceV1Envelope(input: unknown): PresenceV1Envelope {
  const canonicalPresence = presenceV1Schema.parse(input);
  return presenceV1EnvelopeSchema.parse({
    contract: 'operator_presence',
    version: 'v1',
    generatedAt: new Date().toISOString(),
    presence: canonicalPresence,
  });
}

export function parsePresenceEnvelopeV1(input: unknown): PresenceEnvelopeV1Parsed {
  const envelope = presenceV1EnvelopeSchema.parse(input);
  return {
    ...envelope,
    data: envelope.presence,
  };
}