import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Launch plan §10 — unfinished public engines return a typed UNDER_CONSTRUCTION
// response instead of mock values.
export async function GET() {
  return NextResponse.json(
    {
      status: 'UNDER_CONSTRUCTION',
      available: false,
      module: 'auction',
      message: 'NQ Auction is being converted to the native engine. Live output paused during validation.',
    },
    { status: 503 },
  );
}
