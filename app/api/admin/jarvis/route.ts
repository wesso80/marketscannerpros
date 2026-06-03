/**
 * Admin Jarvis — private operator-grade assistant with tool-calling.
 *
 * @route POST /api/admin/jarvis
 * @auth  requireAdmin (ms_admin cookie / app admin session / ADMIN_SECRET header)
 *
 * Capabilities:
 *  - OBSERVE: pulls live admin data via internal read-only admin APIs.
 *  - ANALYZE: reasons over the data with the strongest available model.
 *  - DECIDE:  ranks / summarises / flags. Never executes.
 *
 * Hard rules (enforced in prompt + tool registry):
 *  - Read-only. No order routing, no broker connection, no destructive writes.
 *  - Admin-gated. Tool fetches forward the operator's cookies so each
 *    internal call is itself admin-authenticated.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Admin gets the strongest model. Override via ADMIN_JARVIS_MODEL.
const MODEL = process.env.ADMIN_JARVIS_MODEL || "gpt-4.1";
const MAX_HISTORY = 20;
const MAX_TOOL_LOOPS = 6;
const TOOL_RESULT_CHAR_LIMIT = 12000;

const SYSTEM_PROMPT = `You are ARCA — the private operator assistant inside MarketScanner Pros' admin desk.
You are the operator's analyst and co-pilot. You are NOT public-facing.

Identity & tone:
- Direct, calm, operator-grade. Concise. No emojis. No hype.

Hard prohibitions (never violate):
- Never place, route, or simulate live orders. No broker execution. Ever.
- Never expose admin internals to public surfaces.
- If asked to execute a trade, redirect to research / monitoring / simulation.

How you work (Observe -> Analyze -> Decide -> Explain):
- You have TOOLS that read the operator's live admin systems: opportunities,
  signals, morning brief, data/engine health, macro pulse, risk state,
  portfolio lab, AI usage/costs, change tape, symbol research, and more.
- BEFORE answering questions about current market state, opportunities, health,
  or specific symbols, CALL THE RELEVANT TOOL. Do not guess. Do not invent numbers.
- You may call multiple tools in sequence to triangulate.
- After tools return, synthesise: what is observed, what it implies, what
  confirms it, what invalidates it, main risk, and any data quality flags
  (stale / missing / degraded).
- If a tool fails or returns missing/stale data, say so explicitly. Do not
  fabricate.

Output:
- Default to short, structured answers. Bullets when listing.
- Numeric values: keep precision honest; don't invent decimals you didn't see.
- When asked "what should I look at right now?" — pull opportunities +
  priority desk + risk state, then rank top 3 with one-line rationale and
  one-line invalidation each.

You are running inside the admin terminal.`;

interface JarvisMessage {
  role: "user" | "assistant";
  content: string;
}

function sanitizeMessages(input: unknown): JarvisMessage[] {
  if (!Array.isArray(input)) return [];
  const out: JarvisMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const role = (m as any).role;
    const content = (m as any).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.slice(0, 8000) });
    }
  }
  return out.slice(-MAX_HISTORY);
}

// ---------------------------------------------------------------------------
// Tool registry — read-only admin reads. Each forwards the operator cookies
// so the underlying admin API enforces auth.
// ---------------------------------------------------------------------------

interface ToolCtx { origin: string; cookie: string; }
type ToolHandler = (args: any, ctx: ToolCtx) => Promise<any>;
interface ToolDef {
  name: string;
  description: string;
  parameters: any;
  handler: ToolHandler;
}

async function adminGet(path: string, ctx: ToolCtx): Promise<any> {
  const url = `${ctx.origin}${path}`;
  const res = await fetch(url, {
    headers: { cookie: ctx.cookie, accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep as text */ }
  if (!res.ok) {
    return { __error: true, status: res.status, body: parsed };
  }
  return parsed;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_opportunities",
    description:
      "Read-only. Returns the current ranked opportunity board (top setups across equities/crypto with scores, regime, and component breakdown). Use when the operator asks 'what's hot', 'top opportunities', or wants to triage the day.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/opportunities", ctx),
  },
  {
    name: "get_priority_desk",
    description:
      "Read-only. Returns the priority desk — symbols flagged for active research focus, with priority scores and reasons.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/priority-desk", ctx),
  },
  {
    name: "get_recent_signals",
    description:
      "Read-only. Returns recent generated signals with score, regime, and outcome status.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "Max rows (default 25, cap 100)." } },
      additionalProperties: false,
    },
    handler: ({ limit }, ctx) => {
      const n = Math.min(Math.max(Number(limit) || 25, 1), 100);
      return adminGet(`/api/admin/signals?limit=${n}`, ctx);
    },
  },
  {
    name: "get_signal_scorecard",
    description:
      "Read-only. Aggregate signal performance scorecard (hit rates, expectancy, regime breakdown).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/signals/scorecard", ctx),
  },
  {
    name: "get_morning_brief",
    description:
      "Read-only. Today's morning brief: macro tone, regime, key levels, curated focus list.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/morning-brief", ctx),
  },
  {
    name: "get_macro_pulse",
    description:
      "Read-only. Macro pulse — VIX/DXY/yields/risk-on-off, sector rotation tone, fear/greed.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/macro-pulse", ctx),
  },
  {
    name: "get_data_health",
    description:
      "Read-only. Provider data health: freshness, latency, error rates, stale snapshots. Always check before drawing strong conclusions from market data.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/data-health", ctx),
  },
  {
    name: "get_engine_health",
    description:
      "Read-only. Engine health: brain status, queue depth, recent failures, model diagnostics.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/brain/engine-health", ctx),
  },
  {
    name: "get_risk_state",
    description:
      "Read-only. Current risk governor state — limits, drawdown, kill-switch flags.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/risk/state", ctx),
  },
  {
    name: "get_portfolio_summary",
    description:
      "Read-only. ARCA portfolio lab summary — open positions, P&L, exposure. Simulation only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/portfolio-lab/summary", ctx),
  },
  {
    name: "get_change_tape",
    description:
      "Read-only. The change tape — recent material changes across watched symbols/regime.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/change-tape", ctx),
  },
  {
    name: "get_symbol_research",
    description:
      "Read-only. Full admin research bundle for one symbol (regime, components, levels, options, news). Use when asked about a specific ticker.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, e.g. AAPL, BTC-USD, ADA." },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: ({ symbol }, ctx) => {
      const s = String(symbol || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
      if (!s) return Promise.resolve({ __error: true, status: 400, body: "symbol required" });
      return adminGet(`/api/admin/symbol/${encodeURIComponent(s)}`, ctx);
    },
  },
  {
    name: "get_research_alerts",
    description: "Read-only. Recent research alerts queued by the engine.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/research-alerts", ctx),
  },
  {
    name: "get_ai_costs",
    description: "Read-only. AI cost / token usage breakdown across routes.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/costs", ctx),
  },
  {
    name: "get_ai_usage",
    description: "Read-only. AI usage metrics by tier and route.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/ai-usage", ctx),
  },
  {
    name: "get_kill_switch",
    description: "Read-only. Kill-switch state.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/kill-switch", ctx),
  },
  {
    name: "get_regime_matrix",
    description:
      "Read-only. Cross-asset regime matrix — bull/bear/chop classification per asset class.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/regime-matrix", ctx),
  },
  {
    name: "get_no_trade_alpha",
    description: "Read-only. Windows where standing aside is the edge.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/no-trade-alpha", ctx),
  },
  {
    name: "get_system_health",
    description: "Read-only. Top-level system health summary across all subsystems.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: (_a, ctx) => adminGet("/api/admin/health", ctx),
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

function toolsForOpenAI() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n…[truncated ${s.length - n} chars]`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const userMessages = sanitizeMessages(body?.messages);
  if (userMessages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const page = body?.page && typeof body.page === "object" ? body.page : null;
  const pageContext = page
    ? `\n\nOperator is currently on: ${String(page.path || "").slice(0, 200)}${
        page.title ? ` (${String(page.title).slice(0, 200)})` : ""
      }`
    : "";

  const ctx: ToolCtx = {
    origin: req.nextUrl.origin,
    cookie: req.headers.get("cookie") || "",
  };

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const chat: any[] = [
    { role: "system", content: SYSTEM_PROMPT + pageContext },
    ...userMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolTrace: { name: string; args: any; ok: boolean; status?: number }[] = [];

  try {
    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 2000,
        tools: toolsForOpenAI(),
        tool_choice: "auto",
        messages: chat,
      });

      const choice = completion.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls || [];

      if (toolCalls.length === 0) {
        const content = msg.content?.trim() || "";
        return NextResponse.json({
          content,
          model: completion.model,
          usage: completion.usage,
          tools: toolTrace,
        });
      }

      // Push assistant turn (with tool_calls) so OpenAI can match results
      chat.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        const fnName = call.function?.name || "";
        let args: any = {};
        try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; }
        catch { args = {}; }

        const tool = TOOL_MAP.get(fnName);
        let resultPayload: any;
        let ok = false;
        let status: number | undefined;

        if (!tool) {
          resultPayload = { __error: true, message: `Unknown tool: ${fnName}` };
        } else {
          try {
            resultPayload = await tool.handler(args, ctx);
            ok = !(resultPayload && resultPayload.__error);
            status = resultPayload?.status;
          } catch (e: any) {
            resultPayload = { __error: true, message: e?.message || "tool failed" };
          }
        }

        toolTrace.push({ name: fnName, args, ok, status });

        const serialized = clip(
          typeof resultPayload === "string" ? resultPayload : JSON.stringify(resultPayload),
          TOOL_RESULT_CHAR_LIMIT,
        );

        chat.push({
          role: "tool",
          tool_call_id: call.id,
          content: serialized,
        });
      }
    }

    // Loop budget exhausted — final synthesis without further tools
    const final = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 1500,
      messages: [
        ...chat,
        { role: "system", content: "Tool budget reached. Synthesise a final answer using only the data already gathered. Flag any gaps." },
      ],
    });
    const content = final.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      content,
      model: final.model,
      usage: final.usage,
      tools: toolTrace,
      truncated: true,
    });
  } catch (err: any) {
    const msg = err?.message || "Jarvis request failed";
    return NextResponse.json({ error: msg, tools: toolTrace }, { status: 502 });
  }
}
