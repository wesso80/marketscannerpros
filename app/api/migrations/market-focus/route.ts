import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';

export async function POST(req: NextRequest) {
  // Allow running migration with setup key or in FREE_FOR_ALL_MODE
  const { searchParams } = new URL(req.url);
  const setupKey = searchParams.get('key');
  const secret = process.env.CRON_SECRET || process.env.APP_SIGNING_SECRET;
  const freeForAll = process.env.FREE_FOR_ALL_MODE === 'true';
  
  // Allow if: FREE_FOR_ALL_MODE, valid key, or valid auth header
  const authHeader = req.headers.get('authorization');
  const isAuthorized = freeForAll || 
    setupKey === secret || 
    authHeader === `Bearer ${secret}`;
  
  if (process.env.NODE_ENV === 'production' && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Create daily_market_focus table
    await q(`
      CREATE TABLE IF NOT EXISTS daily_market_focus (
        id SERIAL PRIMARY KEY,
        focus_date DATE NOT NULL UNIQUE,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        model_version VARCHAR(50) DEFAULT 'v1.0',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create daily_market_focus_items table
    await q(`
      CREATE TABLE IF NOT EXISTS daily_market_focus_items (
        id SERIAL PRIMARY KEY,
        focus_id INTEGER NOT NULL REFERENCES daily_market_focus(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        asset_class VARCHAR(20) NOT NULL,
        score DECIMAL(5,2) NOT NULL,
        phase VARCHAR(50),
        structure VARCHAR(50),
        risk_level VARCHAR(20),
        price DECIMAL(18,8),
        change_percent DECIMAL(8,4),
        rsi DECIMAL(6,2),
        macd_histogram DECIMAL(18,8),
        atr DECIMAL(18,8),
        ai_explanation TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create index for faster lookups
    await q(`
      CREATE INDEX IF NOT EXISTS idx_market_focus_date ON daily_market_focus(focus_date DESC)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_market_focus_items_focus_id ON daily_market_focus_items(focus_id)
    `);

    return NextResponse.json({ 
      success: true, 
      message: 'Migration completed - daily_market_focus tables created' 
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ 
      error: 'Migration failed', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'POST to this endpoint to run the market focus migration' 
  });
}
