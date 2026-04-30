import { q } from "@/lib/db";

export type ResearchEventType =
  | "SCORE_CHANGE"
  | "LIFECYCLE_CHANGE"
  | "NEW_HIGH_PRIORITY"
  | "ALERT_FIRED"
  | "ALERT_SUPPRESSED"
  | "DISCORD_STATUS"
  | "EMAIL_STATUS"
  | "DATA_HEALTH"
  | "STALE_DATA_WARNING"
  | "ARCA_FINDING"
  | "JOURNAL_PATTERN_MATCH"
  | "VOLATILITY_PHASE"
  | "TIME_CONFLUENCE_WINDOW"
  | "EARNINGS_RISK"
  | "MACRO_REGIME"
  | "NEWS_IMPACT";

export interface ResearchEventInput {
  workspaceId: string;
  symbol?: string | null;
  market?: string | null;
  eventType: ResearchEventType;
  severity?: "INFO" | "WATCH" | "HIGH" | "CRITICAL";
  message: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export interface ResearchEventRow {
  id: string;
  workspace_id: string;
  symbol: string | null;
  market: string | null;
  event_type: ResearchEventType;
  severity: "INFO" | "WATCH" | "HIGH" | "CRITICAL";
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
}

let schemaReady = false;

export async function ensureResearchEventTapeTable(): Promise<void> {
  if (schemaReady) return;
  await q(`
    CREATE TABLE IF NOT EXISTS admin_research_event_tape (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      symbol VARCHAR(40),
      market VARCHAR(20),
      event_type VARCHAR(60) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
      message TEXT NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_research_event_tape_workspace ON admin_research_event_tape (workspace_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_research_event_tape_symbol ON admin_research_event_tape (workspace_id, symbol, created_at DESC)`);
  schemaReady = true;
}

export async function appendResearchEvent(event: ResearchEventInput): Promise<void> {
  await ensureResearchEventTapeTable();
  await q(
    `INSERT INTO admin_research_event_tape (workspace_id, symbol, market, event_type, severity, message, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.workspaceId,
      event.symbol ?? null,
      event.market ?? null,
      event.eventType,
      event.severity ?? "INFO",
      event.message,
      JSON.stringify(event.payload ?? {}),
      event.createdAt ?? new Date().toISOString(),
    ],
  );
}

export async function listResearchEvents(params: {
  workspaceId: string;
  limit?: number;
  symbol?: string;
  eventType?: ResearchEventType;
}): Promise<ResearchEventRow[]> {
  await ensureResearchEventTapeTable();
  const limit = Math.max(1, Math.min(500, Number(params.limit || 100)));
  const clauses: string[] = ["workspace_id = $1"];
  const values: Array<string | number> = [params.workspaceId];

  if (params.symbol) {
    values.push(params.symbol.toUpperCase());
    clauses.push(`symbol = $${values.length}`);
  }
  if (params.eventType) {
    values.push(params.eventType);
    clauses.push(`event_type = $${values.length}`);
  }

  values.push(limit);

  return q<ResearchEventRow>(
    `SELECT id::text, workspace_id, symbol, market, event_type, severity, message, payload, created_at
       FROM admin_research_event_tape
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${values.length}`,
    values,
  );
}
