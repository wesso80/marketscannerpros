import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

type FocusRow = {
  id: string;
  focus_date: string; // YYYY-MM-DD
};

type ItemRow = {
  asset_class: string; // equity|crypto|commodity
  symbol: string;
  score: number | null;
  phase: string | null;
  structure: string | null;
  risk_level: string | null;
  price: number | null;
  change_percent: number | null;
  rsi: number | null;
  macd_histogram: number | null;
  atr: number | null;
  ai_explanation: string | null;
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function readLatestDailyFocus(): Promise<null | { date: string; picks: any[] }> {
  const focus = await q<FocusRow>(
    `
    SELECT id, focus_date::text as focus_date
    FROM daily_market_focus
    ORDER BY focus_date DESC
    LIMIT 1
    `
  );

  if (!focus[0]) return null;

  const items = await q<ItemRow>(
    `
    SELECT asset_class, symbol, score, phase, structure, risk_level, 
           price, change_percent, rsi, macd_histogram, atr, ai_explanation
    FROM daily_market_focus_items
    WHERE focus_id = $1
    ORDER BY
      CASE asset_class
        WHEN 'equity' THEN 1
        WHEN 'crypto' THEN 2
        WHEN 'commodity' THEN 3
        ELSE 99
      END ASC
    `,
    [focus[0].id]
  );

  return {
    date: focus[0].focus_date,
    picks: items.map((it) => {
      return {
        assetClass: titleCase(it.asset_class), // Equity/Crypto/Commodity
        asset: it.symbol,
        score: it.score,
        phase: it.phase ?? "—",
        structure: it.structure ?? "—",
        risk: it.risk_level ?? "—",
        price: it.price,
        changePercent: it.change_percent,
        rsi: it.rsi,
        macdHistogram: it.macd_histogram,
        atr: it.atr,
        explanation: it.ai_explanation,
      };
    }),
  };
}

function blurExplanations(data: { date: string; picks: any[] }, message: string) {
  data.picks = data.picks.map((p) => ({
    ...p,
    explanation: message,
  }));
  return data;
}

export async function GET(_req: NextRequest) {
  // 1) Pull latest daily set from DB (global set)
  const latest = await readLatestDailyFocus();

  // If nothing generated yet, return a stable shape for UI
  if (!latest) {
    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      picks: [
        { assetClass: "Equity", asset: "—", phase: "—", structure: "—", risk: "—", explanation: null },
        { assetClass: "Crypto", asset: "—", phase: "—", structure: "—", risk: "—", explanation: null },
        { assetClass: "Commodity", asset: "—", phase: "—", structure: "—", risk: "—", explanation: null },
      ],
      status: "empty",
      message: "Daily Market Focus has not been generated yet.",
    });
  }

  // 2) FREE_FOR_ALL_MODE: show panel to everyone but blur explanations
  if (process.env.FREE_FOR_ALL_MODE === "true") {
    return NextResponse.json(
      blurExplanations(latest, "Upgrade to Pro to see today’s AI explanations.")
    );
  }

  // 3) Standard entitlement flow
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tier } = session;
  const isPro = tier === "pro" || tier === "pro_trader";

  if (!isPro) {
    return NextResponse.json(
      blurExplanations(latest, "Upgrade to Pro to see today’s AI explanations.")
    );
  }

  // Pro users see real explanation text from DB
  return NextResponse.json(latest);
}
