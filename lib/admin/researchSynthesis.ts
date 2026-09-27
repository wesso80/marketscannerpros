import type { EquityResearchNote } from "./equityResearchNote";
import type { TechnicalNote } from "./technicalNote";

export function composeSynthesis(
  f: EquityResearchNote | null,
  t: TechnicalNote | null,
): {
  alignment: "aligned-bullish" | "aligned-bearish" | "conflicting" | "mixed" | "insufficient-data";
  summary: string;
} {
  if (!f && !t) {
    return { alignment: "insufficient-data", summary: "No notes produced." };
  }
  if (!f) {
    return {
      alignment: "insufficient-data",
      summary: `Technical only: ${t?.tradePlanSummary.bias} bias, setup quality ${t?.tradePlanSummary.setupQuality}/5.`,
    };
  }
  if (!t) {
    return {
      alignment: "insufficient-data",
      summary: `Fundamental only: ${f.rating.verdict} verdict, conviction ${f.rating.conviction}/5.`,
    };
  }
  const fBull = f.rating.verdict === "buy";
  const fBear = f.rating.verdict === "avoid";
  const tBull = t.tradePlanSummary.bias === "bullish";
  const tBear = t.tradePlanSummary.bias === "bearish";
  if (fBull && tBull) {
    return {
      alignment: "aligned-bullish",
      summary: `Fundamentals (${f.rating.verdict}/${f.rating.conviction}) and technicals (${t.tradePlanSummary.bias}/${t.tradePlanSummary.setupQuality}) align bullish.`,
    };
  }
  if (fBear && tBear) {
    return {
      alignment: "aligned-bearish",
      summary: `Fundamentals (${f.rating.verdict}/${f.rating.conviction}) and technicals (${t.tradePlanSummary.bias}/${t.tradePlanSummary.setupQuality}) align bearish.`,
    };
  }
  if ((fBull && tBear) || (fBear && tBull)) {
    return {
      alignment: "conflicting",
      summary: `Fundamentals (${f.rating.verdict}) and technicals (${t.tradePlanSummary.bias}) conflict — main risk: ${f.mainRisk}`,
    };
  }
  return {
    alignment: "mixed",
    summary: `Mixed: fundamentals ${f.rating.verdict}, technicals ${t.tradePlanSummary.bias}.`,
  };
}
