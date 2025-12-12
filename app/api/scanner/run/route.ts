import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Use Streamlit app in background to fetch data (yfinance works there)
const STREAMLIT_URL = process.env.STREAMLIT_URL || "https://marketscannerpros-vwx5.onrender.com";

interface ScanRequest {
  type: "crypto" | "equity";
  timeframe: string;
  minScore: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScanRequest;
    const { type, timeframe, minScore } = body;

    // Validate inputs
    if (!type || !["crypto", "equity"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'crypto' or 'equity'" },
        { status: 400 }
      );
    }

    // For now, return a message that scanning will be available soon
    // The Streamlit app needs an API endpoint added (working on it)
    return NextResponse.json({
      success: false,
      message: "Scanner is being migrated to use the working Streamlit data source. Check the main app for scanning functionality.",
      redirect: `${STREAMLIT_URL}`,
      results: [],
      errors: [],
      metadata: {
        timestamp: new Date().toISOString(),
        count: 0,
      },
    });

  } catch (error) {
    console.error("Scanner error:", error);
    
    return NextResponse.json(
      {
        error: "Scanner temporarily unavailable",
        details: error instanceof Error ? error.message : "Unknown error",
        hint: "Please use the main Streamlit app for scanning until migration is complete",
      },
      { status: 503 }
    );
  }
}
