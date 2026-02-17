import { z } from 'zod';

export const FeedbackTagEnum = z.enum([
  'validated',
  'ignored',
  'wrong_context',
  'timing_issue',
]);
export type FeedbackTag = z.infer<typeof FeedbackTagEnum>;

export const FeedbackSourceEnum = z.enum([
  'consciousness_loop',
  'operator_presence_panel',
  'coach',
  'scanner',
  'alerts',
  'journal',
]);
export type FeedbackSource = z.infer<typeof FeedbackSourceEnum>;

export const ISODateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Expected ISO date-time string');

export const WorkflowFeedbackRequestV1Schema = z.object({
  contract: z.object({
    name: z.literal('msp_workflow_feedback'),
    version: z.literal('v1'),
  }),
  feedbackTag: FeedbackTagEnum,
  decisionPacketId: z.string().min(6),
  symbol: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  workflowId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  source: FeedbackSourceEnum.default('consciousness_loop'),
  correlationId: z.string().min(8).optional(),
  clientTs: ISODateTime.optional(),
});
export type WorkflowFeedbackRequestV1 = z.infer<typeof WorkflowFeedbackRequestV1Schema>;

export const WorkflowFeedbackResponseV1Schema = z.object({
  ok: z.boolean(),
  correlationId: z.string().min(8),
  persistedEventId: z.string().optional(),
  message: z.string().optional(),
});
export type WorkflowFeedbackResponseV1 = z.infer<typeof WorkflowFeedbackResponseV1Schema>;

export const PersistedWorkflowEventSchema = z.object({
  id: z.string(),
  event_type: z.literal('label.explicit.created'),
  created_at: ISODateTime,
  tenant_id: z.string().optional(),
  user_id: z.string().optional(),
  workflow_id: z.string().optional(),
  event_data: z.object({
    payload: z.object({
      source: FeedbackSourceEnum,
      feedback_tag: FeedbackTagEnum,
      decision_packet_id: z.string().min(6),
      symbol: z.string().optional(),
      confidence: z.number().min(0).max(100).optional(),
      notes: z.string().max(2000).optional(),
      correlation_id: z.string().min(8).optional(),
      client_ts: ISODateTime.optional(),
      server_ts: ISODateTime.optional(),
    }),
  }),
});
export type PersistedWorkflowEvent = z.infer<typeof PersistedWorkflowEventSchema>;

const LegacyWorkflowFeedbackRequestSchema = z.object({
  feedbackTag: FeedbackTagEnum,
  decisionPacketId: z.string().min(6),
  symbol: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  workflowId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  source: FeedbackSourceEnum.optional(),
  correlationId: z.string().min(8).optional(),
  clientTs: ISODateTime.optional(),
});

export function parseWorkflowFeedbackRequestV1(input: unknown): WorkflowFeedbackRequestV1 {
  return WorkflowFeedbackRequestV1Schema.parse(input);
}

export function safeParseWorkflowFeedbackRequestV1(input: unknown) {
  return WorkflowFeedbackRequestV1Schema.safeParse(input);
}

export function parseWorkflowFeedbackRequestV1WithLegacy(input: unknown): WorkflowFeedbackRequestV1 {
  const direct = WorkflowFeedbackRequestV1Schema.safeParse(input);
  if (direct.success) return direct.data;

  const legacy = LegacyWorkflowFeedbackRequestSchema.parse(input);
  return WorkflowFeedbackRequestV1Schema.parse({
    contract: { name: 'msp_workflow_feedback', version: 'v1' },
    feedbackTag: legacy.feedbackTag,
    decisionPacketId: legacy.decisionPacketId,
    symbol: legacy.symbol,
    confidence: legacy.confidence,
    workflowId: legacy.workflowId,
    notes: legacy.notes,
    source: legacy.source ?? 'consciousness_loop',
    correlationId: legacy.correlationId,
    clientTs: legacy.clientTs,
  });
}

export function buildPersistedEventFromFeedback(req: WorkflowFeedbackRequestV1, nowIso: string) {
  const payload = {
    source: req.source,
    feedback_tag: req.feedbackTag,
    decision_packet_id: req.decisionPacketId,
    symbol: req.symbol,
    confidence: req.confidence,
    notes: req.notes,
    correlation_id: req.correlationId,
    client_ts: req.clientTs,
    server_ts: nowIso,
  };

  return {
    event_type: 'label.explicit.created' as const,
    event_data: { payload },
  };
}