import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { parsePresenceEnvelopeV1 } from '../lib/operator/presence.v1';
import {
  WorkflowFeedbackRequestV1Schema,
  PersistedWorkflowEventSchema,
  buildPersistedEventFromFeedback,
} from '../lib/operator/feedback.v1';

describe('MSP contracts v1', () => {
  it('presence fixture validates and invariants hold', () => {
    const fixturePath = path.resolve(process.cwd(), 'lib/operator/presence.fixture.v1.json');
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const env = parsePresenceEnvelopeV1(raw);

    expect(env.data.controlMatrix.output.mode).toBeDefined();
    expect(env.data.experienceMode.key).toBe(env.data.controlMatrix.output.mode);

    const loopSymbol = env.data.consciousnessLoop.observe.symbol;
    const loopPacketId = env.data.consciousnessLoop.decide.decisionPacket.id;

    const top = env.data.topAttention.find((item) => item.symbol === loopSymbol);
    if (top?.decisionPacketId) {
      expect(top.decisionPacketId).toBe(loopPacketId);
    }
  });

  it('feedback request validates and produces a persisted event shape', () => {
    const req = {
      contract: { name: 'msp_workflow_feedback', version: 'v1' },
      feedbackTag: 'validated',
      decisionPacketId: 'dp_8c1f2a',
      symbol: 'SPY',
      confidence: 72,
      workflowId: 'wf_123',
      notes: 'Matched regime and timing window.',
      source: 'consciousness_loop',
      correlationId: 'corr_9f3b2c1a',
      clientTs: '2026-02-17T09:02:00.000Z',
    } as const;

    const parsed = WorkflowFeedbackRequestV1Schema.parse(req);
    expect(parsed.feedbackTag).toBe('validated');

    const nowIso = '2026-02-17T09:03:00.000Z';
    const built = buildPersistedEventFromFeedback(parsed, nowIso);

    const persisted = {
      id: 'evt_1',
      event_type: 'label.explicit.created',
      created_at: nowIso,
      workflow_id: parsed.workflowId,
      event_data: built.event_data,
    };

    PersistedWorkflowEventSchema.parse(persisted);

    expect(persisted.event_data.payload.feedback_tag).toBe(req.feedbackTag);
    expect(persisted.event_data.payload.decision_packet_id).toBe(req.decisionPacketId);
  });
});
