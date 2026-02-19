import { z } from 'zod';
import { backtestTimeframeSchema, symbolSchema } from '@/lib/validation';

export const brainSignalBiasSchema = z.enum(['bullish', 'bearish', 'neutral']);
export const brainSignalStatusSchema = z.enum(['candidate', 'planned', 'alerted', 'executed', 'closed']);

export const brainSignalSnapshotSchema = z.object({
  packetId: z.string().min(1),
  symbol: symbolSchema,
  signalSource: z.string().nullable(),
  signalScore: z.number().nullable(),
  bias: brainSignalBiasSchema,
  status: brainSignalStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  entryZone: z.number().nullable(),
  invalidation: z.number().nullable(),
  targets: z.array(z.number()),
});

export const brainBacktestRequestSchema = z.object({
  symbol: symbolSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  initialCapital: z.number().positive().max(10000000),
  timeframe: backtestTimeframeSchema.optional().default('daily'),
  minSignalScore: z.number().min(0).max(100).optional().default(60),
});

export type BrainSignalSnapshot = z.infer<typeof brainSignalSnapshotSchema>;
export type BrainBacktestRequest = z.infer<typeof brainBacktestRequestSchema>;