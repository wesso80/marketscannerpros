import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

type FocusRow = {
  id: string;
  date_key: string; // YYYY-MM-DD
  status: string;
};

type ItemRow = {
  asset_class: string; // equity|crypto|commodity
  symbol: string;
  name: string | null;
  venue: string | null;
  score: number | null;
  explanation: string | null;
  scanner_payload: any;
  key_levels: any;
  risks: any;
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function readLatestDailyFocus(): Promise<null | { date: string; picks: any[] }> {
  const focus = await q<FocusRow>(
    `
    select id, date_key::text as date_key, status
    from daily_market_focus
    where status = 'ready'
    order by date_key desc
    limit 1
    `
  );

  if (!focus[0]) return null;

  const items = await q<ItemRow>(
    `
    select asset_class, symbol, name, venue, score, explanation, scanner_payload, key_levels, risks
    from daily_market_focus_items
    where focus_id = $1
    order by
      case asset_class
        when 'equity' then 1
        when 'crypto' then 2
        when 'commodity' then 3
        else 99
      end asc
    `,
    [focus[0].id]
  );

  return {
    date: focus[0].date_key,
    picks: items.map((it) => {
      // Map DB fields to your UI-friendly structure.
      // Keep "phase/structure/risk" either from scanner_payload (recommended) or fallback.
      const phase =
        it.scanner_payload?.phase ??
        it.scanner_payload?.phaseLabel ??
        "—";

      const structure =
        it.scanner_payload?.structure ??
        it.scanner_payload?.structureLabel ??
        "—";

      const risk =
        ((Array.isArray(it.risks) && it.risks[0]) || it.scanner_payload?.risk) ??
        "—";

      return {
        assetClass: titleCase(it.asset_class), // Equity/Crypto/Commodity
        asset: it.symbol,
        name: it.name,
        venue: it.venue,
        score: it.score,
        phase,
        structure,
        risk,
        explanation: it.explanation, // will be blurred for free users below
        // Optional: expose raw payload for debugging (remove later)
        // scanner: it.scanner_payload,
        // keyLevels: it.key_levels,
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
