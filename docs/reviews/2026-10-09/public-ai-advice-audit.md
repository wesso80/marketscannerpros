# Public AI endpoints — trading-advice audit (read-only)

Date: 2026-10-09. Base: `admin-integration` @ `d98ef088`. Read-only: no code, prompt, config or data changed.
Question: can a public AI route produce output that reads as personal trading advice or an instruction to act?

## Correction (same day)

The first version of this report treated `/api/msp-analyst` and the tool-enabled `/api/ai/copilot` handler as
public. They are not: `/api/msp-analyst` is wrapped in `privateAnalystHandler` (`lib/ai/legacyAnalystAccess.ts`,
admin/operator only, others get `403 LEGACY_ANALYST_PRIVATE`), and `/api/ai/copilot` sends public users to
`lib/ai/publicCopilot.ts` (`routeCopilotRequest`), which has no V3 template, no trading tools and a strict JSON
schema; the legacy handler with tools runs only for admins/operators. `generate_trade_plan` and
`risk_position_size` are also refused for non-admins at execution (`/api/ai/actions`, `PUBLIC_TRADE_ACTION_RETIRED`).
So F1, F2 and F5 affect private admin output only (still worth fixing under the private risk-language rule), and the
copilot tools need no public fix. F3 and F4 are the public findings.

## Routes reviewed

Public routes that call an LLM: `/api/msp-analyst`, `/api/ai/copilot`, `/api/ai/analyst-context`, `/api/ai/explain`,
`/api/deep-analysis`, `/api/news-sentiment`, `/api/earnings-calendar`, `/api/portfolio/analyze`.
(`/api/env-check` and `/api/health/data` only report key presence / circuit state.)

| Route | Prompt guardrail | Output filter | Verdict |
|---|---|---|---|
| deep-analysis | `SUMMARY_SYSTEM` bans buy/sell/entry/target/stop/size | `sanitizeSummary` drops lines | OK |
| news-sentiment | `NEWS_BRIEF_SYSTEM_PROMPT` | `stripAdviceSentences` | OK |
| earnings-calendar | `EARNINGS_SUMMARY_SYSTEM_PROMPT` | `sanitizeEarningsSummary` (advice + directional) | OK |
| portfolio/analyze | descriptive-only prompt + banned list | falls back to deterministic text on any advice word | OK (see F6) |
| msp-analyst (admin/operator only) | `PUBLIC_AI_SAFETY_GUARDRAILS` + data binding | `appendPublicAISafetyCorrection` (appends a note, does not strip) | F1, F2, F5 (private) |
| ai/copilot — public path | `PUBLIC_COPILOT_INSTRUCTIONS`, strict JSON schema, verified page evidence only | `validateCopilotAnswer` | OK |
| ai/copilot — legacy handler (admin/operator only) | same as msp-analyst | same | F1, F2 (private) |
| ai/analyst-context | own prompt, no shared guardrail | none | **F3** |
| ai/explain | one-paragraph prompt | none; result cached and shared | **F4** |

## Findings (most severe first)

**F1 — Medium (private only; first rated High). The shared "scenario" template asks for a trade ticket.**
`lib/prompts/arcaV3Engine.ts:159-203` (`TRADE_CONSTRUCTION_PROMPT`), included by `buildV3EnginePrompt` in analyst mode
of `/api/msp-analyst` (route.ts:405) and `/api/ai/copilot` (route.ts:187). The template tells the model to output
`Direction: LONG/SHORT`, `Entry:` with a specific price, `Target 1/2`, `R:R`, and `Size Context: % of capital … "2% risk"`,
and for options specific strikes, DTE and a strategy. The same file bans those labels (lines 280-286) and so does
`mspAnalystV2.ts:222-228` — the model gets contradictory instructions, and the template is the concrete one.
The output check (`findPublicAdviceViolations`) does not catch any of it: it matches "you should buy", "place a limit
order", "allocate N% of your account", not `Entry:` / `Target 1:` / `2% risk`. Even when it matches, it only appends a
correction under the text.
*Fix:* #572 (admin/operator output only). rewrite the template with the already-agreed labels
(Level of Interest / Invalidation / Key Levels, no Direction LONG/SHORT, no size or % of capital, no specific strikes/DTE),
add `Entry:`/`Target`/`Size Context`/`% of capital` patterns to the output check, and add a test that the composed
analyst prompt contains none of the banned labels.

**F2 — Medium. Prescriptive strategy and bias tables in shared prompts.**
`lib/prompts/mspAnalystV2.ts:160-164` maps IV/direction to actions ("Sell premium", "Buy options",
"Short straddle/strangle with hedge", "position before/after guidance"). `lib/prompts/scannerExplainerRules.ts:27-40`
frames score bands as "Allowed Guidance: Long bias ONLY / Short bias ONLY" and "NEVER recommend a long/short when …",
which implies recommending is fine otherwise.
*Suggested fix:* restate as descriptive context ("elevated IV historically corresponds to richer option premiums")
and "Allowed framing" instead of guidance/recommend.

**F3 — Medium. `/api/ai/analyst-context` has no shared guardrail and no output filter.**
Prompt at route.ts:33-96. The "Act" tab is a numbered checklist with "Reference zone" and
"Position sizing context based on risk parameters" (line 83); rule 6 (line 45) forbids "always do your own research",
which suppresses the educational disclaimer the shared guardrail requires. Output is returned as parsed JSON with
no advice check (route.ts:296-310).
*Suggested fix:* prepend `PUBLIC_AI_SAFETY_GUARDRAILS`, drop position sizing from the Act tab (rename the tab to
"Review" or "Conditions"), remove rule 6, and run each tab through the advice check / sentence stripper.

**F4 — Low-Medium. `/api/ai/explain` asks for an "actionable insight" and caches it for everyone.**
Prompt route.ts:193-207: "Always include … one actionable insight", JSON field `actionableInsight: What this specific
value suggests`. No output filter; the answer is stored in `ai_explain_cache` keyed by metric/value bucket and served
to other users (route.ts:73, 130, 255).
*Suggested fix:* rename to an "interpretation" field ("what this value typically indicates"), add the advice check
before caching, and add the shared guardrail.

**F5 — Low. Server-appended text uses an instruction.**
`app/api/msp-analyst/route.ts:1018` appends "Server verdict: **NO_TRADE**. Stand aside." — a direct instruction
written by our own code, not the model. *Suggested fix:* "Conditions not met; the risk pipeline blocked this scenario."

**F6 — Low (not advice). Raw error text returned.**
`app/api/portfolio/analyze/route.ts:207` returns `error.message` to the client on a 500. Not advice, but it can leak
provider/DB detail. *Suggested fix:* generic message plus a logged reference, as done for admin in #555.

## What is already good

The shared guardrail (`lib/prompts/publicAiSafety.ts`) has an instruction hierarchy, prompt-injection rules,
missing-data binding (options/derivatives) and requires the disclaimer. News, earnings and deep-analysis strip
advice sentences server-side, and portfolio falls back to deterministic text on any advice word.

## Recommendation

F3 and F4 are the public fixes and come first. F1 (#572), F2 and F5 are private admin output. F6 is public but low.
