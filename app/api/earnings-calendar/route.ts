import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Fetch recent earnings results for a symbol (with actual vs estimate)
async function fetchEarningsResults(symbol: string): Promise<{
  quarterlyEarnings: Array<{
    fiscalDateEnding: string;
    reportedDate: string;
    reportedEPS: number | null;
    estimatedEPS: number | null;
    surprise: number | null;
    surprisePercentage: number | null;
  }>;
} | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    await avTakeToken();
    const res = await fetch(url);
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data.quarterlyEarnings) return null;
    
    return {
      quarterlyEarnings: data.quarterlyEarnings.slice(0, 4).map((q: any) => ({
        fiscalDateEnding: q.fiscalDateEnding,
        reportedDate: q.reportedDate,
        reportedEPS: q.reportedEPS ? parseFloat(q.reportedEPS) : null,
        estimatedEPS: q.estimatedEPS ? parseFloat(q.estimatedEPS) : null,
        surprise: q.surprise ? parseFloat(q.surprise) : null,
        surprisePercentage: q.surprisePercentage ? parseFloat(q.surprisePercentage) : null,
      }))
    };
  } catch (err) {
    console.error(`Error fetching earnings for ${symbol}:`, err);
    return null;
  }
}

// Generate AI analysis of recent earnings
async function generateEarningsAIAnalysis(recentResults: Array<{
  symbol: string;
  name: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprisePercentage: number | null;
  reportedDate: string;
}>): Promise<string | null> {
  if (!OPENAI_API_KEY || recentResults.length === 0) return null;
  
  try {
    const earningsSummary = recentResults.map(r => {
      const beat = r.surprisePercentage !== null && r.surprisePercentage > 0;
      const status = r.surprisePercentage !== null 
        ? (beat ? `BEAT by ${r.surprisePercentage.toFixed(1)}%` : `MISSED by ${Math.abs(r.surprisePercentage).toFixed(1)}%`)
        : 'N/A';
      return `${r.symbol} (${r.name}): ${status} - Reported $${r.reportedEPS?.toFixed(2) || 'N/A'} vs Est $${r.estimatedEPS?.toFixed(2) || 'N/A'}`;
    }).join('\n');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst. Give a brief 2-3 sentence summary of recent earnings results. Be concise and highlight key trends (beats vs misses, sector patterns). Use professional but accessible language.'
          },
          {
            role: 'user',
            content: `Summarize these recent earnings results:\n${earningsSummary}`
          }
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('AI earnings analysis error:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ success: false, error: 'Please log in to access earnings data' }, { status: 401 });
  }

  // Rate limit: expensive endpoint (AV + OpenAI)
  const ip = getClientIP(request);
  const rateCheck = deepAnalysisLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "";
    const horizon = searchParams.get("horizon") || "3month";
    const includeResults = searchParams.get("includeResults") === "true";
    const includeAI = searchParams.get("includeAI") === "true";

    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.append("function", "EARNINGS_CALENDAR");
    if (symbol) {
      url.searchParams.append("symbol", symbol);
    }
    url.searchParams.append("horizon", horizon);
    url.searchParams.append("apikey", ALPHA_VANTAGE_API_KEY);

    await avTakeToken();
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

    // Optionally fetch recent earnings results for top symbols
    let recentResults: any[] = [];
    let aiAnalysis: string | null = null;
    
    if (includeResults && earnings.length > 0) {
      // Fetch results for first 5 unique symbols (rate limit consideration)
      const uniqueSymbols = [...new Set(earnings.slice(0, 10).map(e => e.symbol))].slice(0, 5);
      
      const resultsPromises = uniqueSymbols.map(async (sym) => {
        const result = await fetchEarningsResults(sym);
        const earningsInfo = earnings.find(e => e.symbol === sym);
        if (result && result.quarterlyEarnings.length > 0) {
          const latest = result.quarterlyEarnings[0];
          return {
            symbol: sym,
            name: earningsInfo?.name || sym,
            reportedDate: latest.reportedDate,
            reportedEPS: latest.reportedEPS,
            estimatedEPS: latest.estimatedEPS,
            surprise: latest.surprise,
            surprisePercentage: latest.surprisePercentage,
            beat: latest.surprisePercentage !== null && latest.surprisePercentage > 0,
            history: result.quarterlyEarnings,
          };
        }
        return null;
      });
      
      const results = await Promise.all(resultsPromises);
      recentResults = results.filter(r => r !== null);
      
      // Generate AI analysis if requested
      if (includeAI && recentResults.length > 0) {
        aiAnalysis = await generateEarningsAIAnalysis(recentResults);
      }
    }

    return NextResponse.json({
      success: true,
      earnings,
      count: earnings.length,
      recentResults,
      aiAnalysis,
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
