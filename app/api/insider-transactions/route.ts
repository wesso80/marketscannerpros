import { NextRequest, NextResponse } from "next/server";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "UI755FUUAM6FRRI9";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: "Symbol parameter is required",
      }, { status: 400 });
    }

    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.append("function", "INSIDER_TRANSACTIONS");
    url.searchParams.append("symbol", symbol.toUpperCase());
    url.searchParams.append("apikey", ALPHA_VANTAGE_API_KEY);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "MarketScannerPros/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API errors
    if (data["Error Message"] || data["Note"]) {
      return NextResponse.json({
        success: false,
        error: data["Error Message"] || data["Note"] || "API error",
      });
    }

    if (!data.data || !Array.isArray(data.data)) {
      return NextResponse.json({
        success: true,
        transactions: [],
        count: 0,
      });
    }

    // Parse and format insider transactions
    const transactions = data.data.map((item: any) => ({
      symbol: symbol.toUpperCase(),
      transactionType: item.transaction_type || "",
      executiveTitle: item.executive_title || "Executive",
      transactionDate: item.transaction_date || "",
      sharesTraded: parseInt(item.shares_traded) || 0,
      pricePerShare: parseFloat(item.price_per_share) || 0,
      totalValue: (parseInt(item.shares_traded) || 0) * (parseFloat(item.price_per_share) || 0),
    })).filter((t: any) => t.sharesTraded > 0); // Remove invalid entries

    return NextResponse.json({
      success: true,
      transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error("Insider transactions error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch insider transactions",
      },
      { status: 500 }
    );
  }
}
