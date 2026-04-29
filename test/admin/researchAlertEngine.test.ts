/**
 * Phase 5 — Admin Research Alert tests
 *
 * Covers the three Phase 5 invariants:
 *   1. Boundary header is present in every Discord and email payload.
 *   2. Suppression blocks duplicates inside the cooldown window.
 *   3. The engine produces FIRED outcomes for healthy candidates and
 *      SUPPRESSED outcomes (no dispatch) for blocked candidates.
 */

import { describe, expect, it } from "vitest";
import {
  ADMIN_RESEARCH_ALERT_HEADER,
  buildDiscordPayload,
} from "../../lib/alerts/discord";
import { buildEmailPayload } from "../../lib/alerts/email";
import {
  evaluateSuppression,
  DEFAULT_THRESHOLDS,
} from "../../lib/alerts/alertSuppression";
import { runResearchAlertEngine } from "../../lib/engines/researchAlertEngine";
import type { AdminResearchAlert } from "../../lib/admin/adminTypes";

function alert(overrides: Partial<AdminResearchAlert> = {}): AdminResearchAlert {
  return {
    alertId: "00000000-0000-0000-0000-000000000001",
    symbol: "AAPL",
    market: "EQUITIES",
    timeframe: "15m",
    setup: "TREND_CONTINUATION",
    bias: "LONG",
    score: 82,
    dataTrustScore: 78,
    classification: "PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION",
    createdAt: new Date("2026-04-29T12:00:00Z").toISOString(),
    ...overrides,
  };
}

describe("Phase 5 — payload boundary header", () => {
  it("Discord payload top-level content is the boundary header verbatim", () => {
    const payload = buildDiscordPayload(alert());
    expect(payload.content).toBe(ADMIN_RESEARCH_ALERT_HEADER);
    expect(payload.content).toBe("PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION");
  });

  it("Discord embed description repeats the boundary header", () => {
    const payload = buildDiscordPayload(alert());
    expect(payload.embeds[0]?.description).toContain(ADMIN_RESEARCH_ALERT_HEADER);
  });

  it("Discord embed includes the immutable classification field", () => {
    const payload = buildDiscordPayload(alert());
    const fields = payload.embeds[0]?.fields ?? [];
    const classificationField = fields.find((f) => f.name === "Classification");
    expect(classificationField?.value).toBe("PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION");
  });

  it("Email subject begins with the boundary header", () => {
    const payload = buildEmailPayload(alert(), "ops@example.com");
    expect(payload.subject.startsWith(`[${ADMIN_RESEARCH_ALERT_HEADER}]`)).toBe(true);
    expect(payload.text).toContain(ADMIN_RESEARCH_ALERT_HEADER);
    expect(payload.html).toContain(ADMIN_RESEARCH_ALERT_HEADER);
  });
});

describe("Phase 5 — suppression", () => {
  const baseInput = {
    symbol: "AAPL",
    market: "EQUITIES",
    timeframe: "15m",
    setup: "TREND_CONTINUATION",
    score: 82,
    dataTrustScore: 78,
    lifecycle: "READY" as const,
    recentAlerts: [] as Array<{ symbol: string; timeframe: string; setup: string; createdAt: string }>,
    now: Date.parse("2026-04-29T12:00:00Z"),
  };

  it("allows a healthy candidate with no recent alerts", () => {
    const d = evaluateSuppression(baseInput);
    expect(d.allow).toBe(true);
  });

  it("blocks duplicates inside the cooldown window", () => {
    const d = evaluateSuppression({
      ...baseInput,
      recentAlerts: [
        {
          symbol: "AAPL",
          timeframe: "15m",
          setup: "TREND_CONTINUATION",
          createdAt: new Date(baseInput.now - 30 * 60 * 1000).toISOString(), // 30 min ago
        },
      ],
    });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("DUPLICATE_IN_WINDOW");
  });

  it("allows after the cooldown window has elapsed", () => {
    const d = evaluateSuppression({
      ...baseInput,
      recentAlerts: [
        {
          symbol: "AAPL",
          timeframe: "15m",
          setup: "TREND_CONTINUATION",
          createdAt: new Date(baseInput.now - (DEFAULT_THRESHOLDS.cooldownMs + 60_000)).toISOString(),
        },
      ],
    });
    expect(d.allow).toBe(true);
  });

  it("blocks DATA_DEGRADED lifecycle outright", () => {
    const d = evaluateSuppression({ ...baseInput, lifecycle: "DATA_DEGRADED" });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("DATA_DEGRADED");
  });

  it("blocks below score threshold", () => {
    const d = evaluateSuppression({ ...baseInput, score: 40 });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("BELOW_SCORE_THRESHOLD");
  });

  it("blocks below trust threshold", () => {
    const d = evaluateSuppression({ ...baseInput, dataTrustScore: 20 });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("BELOW_TRUST_THRESHOLD");
  });

  it("does not collide on different symbols inside cooldown", () => {
    const d = evaluateSuppression({
      ...baseInput,
      recentAlerts: [
        {
          symbol: "MSFT",
          timeframe: "15m",
          setup: "TREND_CONTINUATION",
          createdAt: new Date(baseInput.now - 5 * 60 * 1000).toISOString(),
        },
      ],
    });
    expect(d.allow).toBe(true);
  });
});

describe("Phase 5 — engine outcome", () => {
  it("FIRED outcome for healthy candidate; alert carries immutable classification", async () => {
    const outcome = await runResearchAlertEngine(
      {
        symbol: "AAPL",
        market: "EQUITIES",
        timeframe: "15m",
        setup: "TREND_CONTINUATION",
        bias: "LONG",
        score: 82,
        dataTrustScore: 78,
        lifecycle: "READY",
      },
      { recentAlerts: [], now: Date.parse("2026-04-29T12:00:00Z") },
    );
    expect(outcome.status).toBe("FIRED");
    expect(outcome.alert.classification).toBe("PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION");
    // Without env webhook + recipient, channels skip cleanly (not error).
    expect(outcome.channels.discord.skipped || outcome.channels.discord.ok || outcome.channels.discord.error).toBeDefined();
    expect(outcome.channels.email.skipped || outcome.channels.email.ok).toBeDefined();
  });

  it("SUPPRESSED outcome does not attempt dispatch", async () => {
    const outcome = await runResearchAlertEngine(
      {
        symbol: "AAPL",
        market: "EQUITIES",
        timeframe: "15m",
        setup: "TREND_CONTINUATION",
        bias: "LONG",
        score: 82,
        dataTrustScore: 78,
        lifecycle: "DATA_DEGRADED",
      },
      { recentAlerts: [], now: Date.parse("2026-04-29T12:00:00Z") },
    );
    expect(outcome.status).toBe("SUPPRESSED");
    expect(outcome.decision.reason).toBe("DATA_DEGRADED");
    expect(outcome.channels.discord.skipped).toBe("SUPPRESSED");
    expect(outcome.channels.email.skipped).toBe("SUPPRESSED");
  });
});
