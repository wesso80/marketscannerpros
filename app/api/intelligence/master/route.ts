import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Launch plan §6/§10 — Master public composite is paused while three of five
// engine inputs remain non-native. Do not expose the mixed native/mock
// aggregate publicly. Internal computeMaster + masterLiquidityIntegration
// tests remain intact for development.
export async function GET() {
  return NextResponse.json(
    {
      status: 'UNDER_CONSTRUCTION',
      available: false,
      module: 'master',
      message:
        'Master Command Centre public composite is paused while Lead/Lag, Pressure and Auction engines are being converted to native. Global M2, Fragility and Liquidity remain independently live.',
    },
    { status: 503 },
  );
}
