import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Call the Streamlit app which has working yfinance
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

    // Call Streamlit app scanner API endpoint via query params
    const scanUrl = `${STREAMLIT_URL}/?api=scan&type=${type}&timeframe=${timeframe}&minScore=${minScore}`;
    
    console.log(`Calling Streamlit scanner: ${scanUrl}`);
    
    const scannerResponse = await fetch(scanUrl, {
      method: "GET",
      signal: AbortSignal.timeout(60000), // 60 second timeout for scanning
    });

    if (!scannerResponse.ok) {
      throw new Error(`Streamlit scanner returned ${scannerResponse.status}`);
    }

    const responseText = await scannerResponse.text();
    const data = JSON.parse(responseText);

    return NextResponse.json({
      success: true,
      results: data.results || [],
      errors: data.errors || [],
      metadata: {
        timestamp: data.timestamp || new Date().toISOString(),
        count: data.count || 0,
      },
    });
  } catch (error) {
    console.error("Scanner error:", error);
    
    // Return helpful error with status
    return NextResponse.json(
      {
        error: "Scanner service unavailable",
        details: error instanceof Error ? error.message : "Unknown error",
        hint: "The Streamlit app scanner endpoint is being called",
      },
      { status: 503 }
    );
  }
}
