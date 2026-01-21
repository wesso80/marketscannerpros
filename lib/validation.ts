// lib/validation.ts
// Centralized validation schemas using Zod

import { z } from "zod";

// ============= Common Schemas =============

export const emailSchema = z.string().email("Invalid email address").toLowerCase();

export const symbolSchema = z
  .string()
  .min(1, "Symbol required")
  .max(10, "Symbol too long")
  .regex(/^[A-Z0-9.-]+$/i, "Invalid symbol format")
  .transform((s) => s.toUpperCase());

export const timeframeSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"]);

export const tierSchema = z.enum(["free", "pro", "pro_trader"]);

// ============= API Request Schemas =============

// MSP Analyst Chat
export const analystRequestSchema = z.object({
  query: z.string().min(1, "Query cannot be empty").max(2000, "Query too long (max 2000 characters)"),
  mode: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  context: z
    .object({
      symbol: z.string().optional(),
      timeframe: z.string().optional(),
      currentPrice: z.number().optional(),
      keyLevels: z.array(z.number()).optional(),
    })
    .optional(),
  scanner: z
    .object({
      source: z.string().optional(),
      signal: z.string().optional(),
      direction: z.string().optional(),
      score: z.number().optional(),
      // Full scan data for strict explainer rules
      scanData: z
        .object({
          symbol: z.string().optional(),
          price: z.number().optional(),
          score: z.number().optional(),
          rsi: z.number().optional(),
          cci: z.number().optional(),
          macd_hist: z.number().optional(),
          ema200: z.number().optional(),
          atr: z.number().optional(),
          adx: z.number().optional(),
          stoch_k: z.number().optional(),
          stoch_d: z.number().optional(),
          aroon_up: z.number().optional(),
          aroon_down: z.number().optional(),
          obv: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type AnalystRequest = z.infer<typeof analystRequestSchema>;

// Scanner Request
export const scannerRequestSchema = z.object({
  symbols: z.array(symbolSchema).min(1).max(100),
  timeframe: timeframeSchema,
  minScore: z.number().min(0).max(100).optional(),
});

export type ScannerRequest = z.infer<typeof scannerRequestSchema>;

// Backtest Request
export const backtestTimeframeSchema = z.enum(["1min", "5min", "15min", "30min", "60min", "daily"]);

export const backtestRequestSchema = z.object({
  symbol: symbolSchema,
  strategy: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  initialCapital: z.number().positive().max(10000000),
  timeframe: backtestTimeframeSchema.optional().default("daily"),
  riskPercent: z.number().min(0.1).max(10).optional(),
});

export type BacktestRequest = z.infer<typeof backtestRequestSchema>;
export type BacktestTimeframe = z.infer<typeof backtestTimeframeSchema>;

// Portfolio Position
export const positionSchema = z.object({
  symbol: symbolSchema,
  quantity: z.number().positive(),
  entryPrice: z.number().positive(),
  side: z.enum(["long", "short"]),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});

export type Position = z.infer<typeof positionSchema>;

// Trade Journal Entry
export const journalEntrySchema = z.object({
  symbol: symbolSchema,
  side: z.enum(["long", "short"]),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional(),
  quantity: z.number().positive(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export type JournalEntry = z.infer<typeof journalEntrySchema>;

// ============= Validation Helper Functions =============

/**
 * Safely validate data against a schema
 * Returns parsed data or throws descriptive error
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Validation failed: ${messages.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate data and return result with success flag
 * Useful for non-throwing validation
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
      return { success: false, error: messages.join(', ') };
    }
    return { success: false, error: "Validation failed" };
  }
}
