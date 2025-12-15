import { NextRequest, NextResponse } from "next/server";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "UI755FUUAM6FRRI9";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "";
    const horizon = searchParams.get("horizon") || "3month";

    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.append("function", "EARNINGS_CALENDAR");
    if (symbol) {
      url.searchParams.append("symbol", symbol);
    }
    url.searchParams.append("horizon", horizon);
    url.searchParams.append("apikey", ALPHA_VANTAGE_API_KEY);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "MarketScannerPros/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }

    const csvText = await response.text();

    // Check for API errors
    if (csvText.includes("Error Message") || csvText.includes("Invalid API call")) {
      return NextResponse.json({
        success: false,
        error: "Invalid API request or rate limit reached",
      });
    }

    // Parse CSV
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json({
        success: false,
        error: "No earnings data available",
      });
    }

    const headers = lines[0].split(",");
    const earnings = lines.slice(1).map((line) => {
      const values = line.split(",");
      return {
        symbol: values[0]?.trim() || "",
        name: values[1]?.trim() || "",
        reportDate: values[2]?.trim() || "",
        fiscalDateEnding: values[3]?.trim() || "",
        estimate: values[4] && values[4] !== "None" ? parseFloat(values[4]) : null,
        currency: values[5]?.trim() || "USD",
      };
    }).filter(e => e.symbol); // Remove empty rows

    return NextResponse.json({
      success: true,
      earnings,
      count: earnings.length,
    });
  } catch (error) {
    console.error("Earnings calendar error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch earnings calendar",
      },
      { status: 500 }
    );
  }
}
