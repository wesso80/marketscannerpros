import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PYTHON_SCANNER_URL = process.env.PYTHON_SCANNER_URL || "http://localhost:8000";

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

    // Call Python scanner service
    const scannerResponse = await fetch(`${PYTHON_SCANNER_URL}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        timeframe,
        minScore: minScore || 0,
      }),
    });

    if (!scannerResponse.ok) {
      const errorData = await scannerResponse.json();
      throw new Error(errorData.detail || "Scanner service failed");
    }

    const data = await scannerResponse.json();

    return NextResponse.json({
      success: true,
      results: data.results || [],
      errors: data.errors || [],
      metadata: {
        ...data.metadata,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Scanner error:", error);
    
    // Return friendly error
    return NextResponse.json(
      {
        error: "Scanner failed",
        details: error instanceof Error ? error.message : "Unknown error",
        hint: "Make sure the Python scanner service is running on port 8000"
      },
      { status: 500 }
    );
  }
}
